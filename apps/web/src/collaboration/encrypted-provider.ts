import {
  decryptYjsUpdate,
  deriveSharedKey,
  encryptYjsUpdate,
  summarizeAwarenessStates,
  type CollaborationPresence,
  type EncryptedYjsUpdate,
  type SharedKeyEncryptionConfig
} from "@layo/collaboration";
import * as syncDecoding from "lib0/decoding";
import * as syncEncoding from "lib0/encoding";
import { Awareness } from "y-protocols/awareness";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type {
  CollabConnectionStatus,
  CollaborationProvider,
  CollaborationProviderInput
} from "./collab-session";

export interface EncryptedProviderInput extends CollaborationProviderInput {
  passphrase: string;
  encryption: SharedKeyEncryptionConfig;
  WebSocketCtor?: typeof WebSocket;
}

const messageAwareness = 1;
const messageQueryAwareness = 3;
const messageEncryptedSync = 10;
const messageEncryptedSyncQuery = 11;
const remoteEncryptedOrigin = Symbol("remote-encrypted-update");
const documentMapName = "design";
const documentJsonKey = "documentJson";

interface EncryptedDocumentSnapshot {
  version: 1;
  kind: "document-snapshot";
  document: unknown;
}

interface EncryptedYjsSyncMessage {
  version: 1;
  kind: "yjs-sync-message";
  message: string;
}

export function createEncryptedProvider(input: EncryptedProviderInput): CollaborationProvider {
  const statusListeners = new Set<(status: CollabConnectionStatus) => void>();
  const presenceListeners = new Set<() => void>();
  const awareness = new Awareness(input.ydoc);
  awareness.setLocalState(input.initialPresence);
  const WebSocketCtor = input.WebSocketCtor ?? WebSocket;
  const outboundQueue: Uint8Array[] = [];
  let socket: WebSocket | null = null;
  let key: CryptoKey | null = null;
  let destroyed = false;
  let pendingFullStateSync = false;

  const emitStatus = (status: CollabConnectionStatus) => {
    for (const listener of statusListeners) {
      listener(status);
    }
  };
  const emitPresence = () => {
    for (const listener of presenceListeners) {
      listener();
    }
  };
  const sendFrame = (frame: Uint8Array) => {
    if (socket?.readyState === WebSocketCtor.OPEN) {
      socket.send(frame);
      return;
    }
    outboundQueue.push(frame);
  };
  const sendEncryptedPayload = async (payload: Uint8Array) => {
    if (input.access !== "sync") {
      return;
    }
    if (!key) {
      pendingFullStateSync = true;
      return;
    }
    sendFrame(encodeEncryptedSyncFrame(await encryptYjsUpdate(payload, key)));
  };
  const sendEncryptedSyncMessage = async (message: Uint8Array) => {
    await sendEncryptedPayload(encodeYjsSyncMessage(message));
  };
  const sendEncryptedSyncStep1 = async () => {
    const encoder = syncEncoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, input.ydoc);
    await sendEncryptedSyncMessage(syncEncoding.toUint8Array(encoder));
  };
  const sendEncryptedFullState = async () => {
    const legacyDocument = getLegacyDocumentSnapshot(input.ydoc);
    if (legacyDocument) {
      await sendEncryptedPayload(encodeLegacyDocumentSnapshot(legacyDocument));
      return;
    }
    const encoder = syncEncoding.createEncoder();
    syncProtocol.writeSyncStep2(encoder, input.ydoc);
    await sendEncryptedSyncMessage(syncEncoding.toUint8Array(encoder));
  };
  const onDocumentUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin === remoteEncryptedOrigin) {
      return;
    }
    void sendEncryptedFullState().catch(() => emitStatus("error"));
  };
  const sendAwarenessUpdate = () => {
    sendFrame(
      encodeAwarenessFrame(
        awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()))
      )
    );
  };
  const onSocketOpen = () => {
    if (destroyed) {
      return;
    }
    emitStatus("synced");
    sendAwarenessUpdate();
    if (input.access === "sync") {
      void sendEncryptedSyncStep1().catch(() => emitStatus("error"));
    }
    while (outboundQueue.length && socket?.readyState === WebSocketCtor.OPEN) {
      socket.send(outboundQueue.shift() as Uint8Array);
    }
  };
  const onSocketMessage = (event: MessageEvent) => {
    void handleIncomingMessage(toUint8Array(event.data)).catch(() => emitStatus("error"));
  };
  const onSocketClose = () => emitStatus("offline");
  const onSocketError = () => emitStatus("error");
  const connect = async () => {
    try {
      key = await deriveSharedKey(input.passphrase, input.encryption);
      if (destroyed) {
        return;
      }
      socket = new WebSocketCtor(createEncryptedWebSocketUrl(input));
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", onSocketOpen);
      socket.addEventListener("message", onSocketMessage);
      socket.addEventListener("close", onSocketClose);
      socket.addEventListener("error", onSocketError);
      if (pendingFullStateSync) {
        pendingFullStateSync = false;
        void sendEncryptedFullState().catch(() => emitStatus("error"));
      }
    } catch {
      emitStatus("error");
    }
  };
  const handleIncomingMessage = async (bytes: Uint8Array) => {
    const frame = decodeFrame(bytes);
    if (frame.type === messageEncryptedSync) {
      if (!key || input.access !== "sync" || !frame.payload) {
        return;
      }
      const encrypted = JSON.parse(new TextDecoder().decode(frame.payload)) as EncryptedYjsUpdate;
      const update = await decryptYjsUpdate(encrypted, key);
      if (applyDocumentSnapshot(input.ydoc, update)) {
        return;
      }
      if (await applyYjsSyncMessage(input.ydoc, update, sendEncryptedSyncMessage)) {
        return;
      }
      Y.applyUpdate(input.ydoc, update, remoteEncryptedOrigin);
      return;
    }

    if (frame.type === messageEncryptedSyncQuery) {
      await sendEncryptedFullState();
      return;
    }

    if (frame.type === messageAwareness && frame.payload) {
      awarenessProtocol.applyAwarenessUpdate(awareness, frame.payload, "remote-awareness");
      emitPresence();
      if (input.access === "sync") {
        void sendEncryptedSyncStep1().catch(() => emitStatus("error"));
      }
      return;
    }

    if (frame.type === messageQueryAwareness) {
      sendAwarenessUpdate();
    }
  };

  input.ydoc.on("update", onDocumentUpdate);
  awareness.on("change", emitPresence);
  void connect();

  return {
    onStatus(listener) {
      statusListeners.add(listener);
    },
    onPresence(listener) {
      presenceListeners.add(listener);
      return () => {
        presenceListeners.delete(listener);
      };
    },
    updatePresence(presence: CollaborationPresence) {
      awareness.setLocalState(presence);
      sendAwarenessUpdate();
    },
    getPresence() {
      return summarizeAwarenessStates(Array.from(awareness.getStates().values()));
    },
    destroy() {
      destroyed = true;
      statusListeners.clear();
      presenceListeners.clear();
      input.ydoc.off("update", onDocumentUpdate);
      awareness.off("change", emitPresence);
      socket?.removeEventListener("open", onSocketOpen);
      socket?.removeEventListener("message", onSocketMessage);
      socket?.removeEventListener("close", onSocketClose);
      socket?.removeEventListener("error", onSocketError);
      socket?.close();
      awareness.destroy();
    }
  };
}

export function encodeEncryptedSyncFrame(update: EncryptedYjsUpdate): Uint8Array {
  return encodePayloadFrame(messageEncryptedSync, new TextEncoder().encode(JSON.stringify(update)));
}

export function encodeEncryptedSyncQueryFrame(): Uint8Array {
  return encodeTypeFrame(messageEncryptedSyncQuery);
}

function applyDocumentSnapshot(ydoc: Y.Doc, bytes: Uint8Array): boolean {
  let snapshot: EncryptedDocumentSnapshot;
  try {
    snapshot = JSON.parse(new TextDecoder().decode(bytes)) as EncryptedDocumentSnapshot;
  } catch {
    return false;
  }

  if (snapshot.version !== 1 || snapshot.kind !== "document-snapshot") {
    return false;
  }

  ydoc.transact(() => {
    ydoc.getMap(documentMapName).set(documentJsonKey, structuredClone(snapshot.document));
  }, remoteEncryptedOrigin);
  return true;
}

function getLegacyDocumentSnapshot(ydoc: Y.Doc): unknown | null {
  const document = ydoc.getMap(documentMapName).get(documentJsonKey);
  return document === undefined ? null : structuredClone(document);
}

function encodeLegacyDocumentSnapshot(document: unknown): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      kind: "document-snapshot",
      document
    } satisfies EncryptedDocumentSnapshot)
  );
}

function encodeYjsSyncMessage(message: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      kind: "yjs-sync-message",
      message: base64UrlEncode(message)
    } satisfies EncryptedYjsSyncMessage)
  );
}

async function applyYjsSyncMessage(
  ydoc: Y.Doc,
  bytes: Uint8Array,
  sendReply: (message: Uint8Array) => Promise<void>
): Promise<boolean> {
  let payload: EncryptedYjsSyncMessage;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as EncryptedYjsSyncMessage;
  } catch {
    return false;
  }

  if (payload.version !== 1 || payload.kind !== "yjs-sync-message") {
    return false;
  }

  const decoder = syncDecoding.createDecoder(base64UrlDecode(payload.message));
  const encoder = syncEncoding.createEncoder();
  let syncError: Error | null = null;
  syncProtocol.readSyncMessage(decoder, encoder, ydoc, remoteEncryptedOrigin, (error) => {
    syncError = error;
  });
  if (syncError) {
    throw syncError;
  }
  if (syncEncoding.length(encoder) > 0) {
    await sendReply(syncEncoding.toUint8Array(encoder));
  }
  return true;
}

function encodeAwarenessFrame(update: Uint8Array): Uint8Array {
  return encodePayloadFrame(messageAwareness, update);
}

function createEncryptedWebSocketUrl(input: EncryptedProviderInput): string {
  const base = input.relayUrl.endsWith("/") ? input.relayUrl : `${input.relayUrl}/`;
  const url = new URL(`${base}${encodeURIComponent(input.roomId)}`);
  if (input.token) {
    url.searchParams.set("token", input.token);
  }
  url.searchParams.set("userId", input.userId);
  if (input.memberToken) {
    url.searchParams.set("memberToken", input.memberToken);
  }
  url.searchParams.set("access", input.access);
  url.searchParams.set("e2ee", "true");
  return url.toString();
}

function encodeTypeFrame(type: number): Uint8Array {
  return encodeVarUint(type);
}

function encodePayloadFrame(type: number, payload: Uint8Array): Uint8Array {
  return concat(encodeVarUint(type), encodeVarUint(payload.byteLength), payload);
}

function decodeFrame(bytes: Uint8Array): { type: number; payload?: Uint8Array } {
  const cursor = { offset: 0 };
  const type = decodeVarUint(bytes, cursor);
  if (cursor.offset >= bytes.byteLength) {
    return { type };
  }
  const payloadLength = decodeVarUint(bytes, cursor);
  return {
    type,
    payload: bytes.slice(cursor.offset, cursor.offset + payloadLength)
  };
}

function encodeVarUint(value: number): Uint8Array {
  const bytes: number[] = [];
  let nextValue = value;
  while (nextValue > 0x7f) {
    bytes.push((nextValue & 0x7f) | 0x80);
    nextValue = Math.floor(nextValue / 128);
  }
  bytes.push(nextValue);
  return new Uint8Array(bytes);
}

function decodeVarUint(bytes: Uint8Array, cursor: { offset: number }): number {
  let num = 0;
  let multiplier = 1;
  while (cursor.offset < bytes.byteLength) {
    const byte = bytes[cursor.offset];
    cursor.offset += 1;
    num += (byte & 0x7f) * multiplier;
    if (byte < 0x80) {
      return num;
    }
    multiplier *= 128;
  }
  throw new Error("invalid collaboration frame");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  throw new Error("unsupported collaboration frame payload");
}
