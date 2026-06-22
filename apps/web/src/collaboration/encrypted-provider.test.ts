import { describe, expect, test } from "vitest";
import {
  createCollaborativeDesignDocument,
  createSharedKeyEncryptionConfig,
  deriveSharedKey,
  encryptYjsUpdate,
  type SharedKeyEncryptionConfig
} from "@canvas-mcp-editor/collaboration";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import * as Y from "yjs";
import {
  createEncryptedProvider,
  encodeEncryptedSyncFrame,
  encodeEncryptedSyncQueryFrame
} from "./encrypted-provider";

class MockWebSocket {
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, Set<(event: Event | MessageEvent | CloseEvent) => void>>();
  readonly sent: Uint8Array[] = [];
  binaryType: BinaryType = "arraybuffer";
  readyState = MockWebSocket.OPEN;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.emit("open", new Event("open")));
  }

  addEventListener(type: string, listener: (event: Event | MessageEvent | CloseEvent) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event | MessageEvent | CloseEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: ArrayBuffer | Uint8Array) {
    this.sent.push(data instanceof Uint8Array ? data : new Uint8Array(data));
  }

  close() {
    this.readyState = 3;
    this.emit("close", new CloseEvent("close"));
  }

  emitMessage(data: Uint8Array) {
    this.emit("message", new MessageEvent("message", { data }));
  }

  emit(type: string, event: Event | MessageEvent | CloseEvent) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("encrypted collaboration provider", () => {
  test("sends encrypted granular Yjs updates between seeded collaborators", async () => {
    MockWebSocket.instances = [];
    const senderDocument = createCollaborativeDesignDocument({
      document: sampleDocument(),
      ydoc: new Y.Doc()
    });
    const receiverDocument = createCollaborativeDesignDocument({
      document: sampleDocument(),
      ydoc: new Y.Doc()
    });
    const sender = createTestProvider({ ydoc: senderDocument.ydoc, resetSockets: false });
    let receiver: ReturnType<typeof createTestProvider> | null = null;
    try {
      const senderSocket = await waitForSocket(0);
      await waitForEncryptedFrame(senderSocket);
      senderSocket.sent.length = 0;
      receiver = createTestProvider({ ydoc: receiverDocument.ydoc, resetSockets: false });
      const receiverSocket = await waitForSocket(1);
      await waitForEncryptedFrame(receiverSocket);
      receiverSocket.sent.length = 0;

      senderDocument.transact("create-text", (current) => {
        const next = structuredClone(current);
        next.pages[0]?.children.push({
          id: "text-2",
          kind: "text",
          name: "Text 2",
          transform: { x: 80, y: 120, rotation: 0 },
          size: { width: 180, height: 40 },
          style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
          content: {
            type: "text",
            value: "Synced text",
            font_size: 20,
            font_family: "Inter"
          },
          children: []
        });
        return next;
      });

      receiverSocket.emitMessage(await waitForEncryptedFrame(senderSocket));
      await waitFor(() => {
        try {
          return receiverDocument
            .getDocument()
            .pages[0]?.children.some((node) => node.id === "text-2");
        } catch {
          return false;
        }
      });
      expect(receiverDocument.getDocument().pages.map((page) => page.id)).toEqual(["page-1"]);
      expect(receiverDocument.getDocument().pages[0]?.children.map((node) => node.id)).toEqual([
        "text-1",
        "text-2"
      ]);
    } finally {
      sender.destroy();
      receiver?.destroy();
      senderDocument.destroy();
      receiverDocument.destroy();
    }
  }, 15_000);

  test("connects with e2ee query params and sends encrypted document updates", async () => {
    const ydoc = new Y.Doc();
    const provider = createTestProvider({ ydoc });
    const socket = await waitForSocket();

    ydoc.getMap("design").set("documentJson", { name: "Secret Document" });
    await waitFor(() => socket.sent.some((frame) => frame[0] === 10));

    const bytes = new TextDecoder().decode(concat(socket.sent));
    expect(socket.url).toContain("e2ee=true");
    expect(socket.url).toContain("access=sync");
    expect(bytes).not.toContain("Secret Document");
    provider.destroy();
  });

  test("decrypts incoming encrypted updates into the local Y.Doc", async () => {
    const config = testEncryptionConfig();
    const ydoc = new Y.Doc();
    const provider = createTestProvider({ ydoc, encryption: config });
    const socket = await waitForSocket();
    const remote = new Y.Doc();
    remote.getMap("design").set("documentJson", { name: "Remote Secret" });
    const key = await deriveSharedKey("shared-passphrase", config);
    const encrypted = await encryptYjsUpdate(Y.encodeStateAsUpdate(remote), key);

    socket.emitMessage(encodeEncryptedSyncFrame(encrypted));

    await waitFor(() => ydoc.getMap("design").get("documentJson") !== undefined);
    expect(ydoc.getMap("design").get("documentJson")).toEqual({ name: "Remote Secret" });
    provider.destroy();
  });

  test("applies encrypted document snapshots over competing local seed documents", async () => {
    MockWebSocket.instances = [];
    const local = new Y.Doc();
    setClientId(local, 2);
    local.getMap("design").set("documentJson", { name: "Local Seed" });
    const receiver = createTestProvider({ ydoc: local, resetSockets: false });
    const receiverSocket = await waitForSocket(0);

    const remote = new Y.Doc();
    setClientId(remote, 1);
    remote.getMap("design").set("documentJson", { name: "Remote Seed" });
    const sender = createTestProvider({ ydoc: remote, resetSockets: false });
    const senderSocket = await waitForSocket(1);
    await waitFor(() => senderSocket.sent.length > 0);
    senderSocket.sent.length = 0;

    remote.getMap("design").set("documentJson", { name: "Remote Update" });
    await waitFor(() => senderSocket.sent.some((frame) => frame[0] === 10));
    receiverSocket.emitMessage(senderSocket.sent.find((frame) => frame[0] === 10) as Uint8Array);

    await waitFor(() => getDocumentName(local) === "Remote Update");
    expect(getDocumentName(local)).toBe("Remote Update");
    receiver.destroy();
    sender.destroy();
  });

  test("responds to encrypted sync queries with encrypted full state", async () => {
    const ydoc = new Y.Doc();
    ydoc.getMap("design").set("documentJson", { name: "Full State Secret" });
    const provider = createTestProvider({ ydoc });
    const socket = await waitForSocket();
    socket.sent.length = 0;

    socket.emitMessage(encodeEncryptedSyncQueryFrame());

    await waitFor(() => socket.sent.some((frame) => frame[0] === 10));
    const bytes = new TextDecoder().decode(concat(socket.sent));
    expect(bytes).not.toContain("Full State Secret");
    provider.destroy();
  });

  test("reports an error when encrypted updates cannot be decrypted", async () => {
    const config = testEncryptionConfig();
    const ydoc = new Y.Doc();
    const provider = createTestProvider({ ydoc, encryption: config, passphrase: "wrong-passphrase" });
    const statuses: string[] = [];
    provider.onStatus((status) => statuses.push(status));
    const socket = await waitForSocket();
    const remote = new Y.Doc();
    remote.getMap("design").set("documentJson", { name: "Unreadable" });
    const key = await deriveSharedKey("shared-passphrase", config);
    const encrypted = await encryptYjsUpdate(Y.encodeStateAsUpdate(remote), key);

    socket.emitMessage(encodeEncryptedSyncFrame(encrypted));

    await waitFor(() => statuses.includes("error"));
    provider.destroy();
  });
});

function createTestProvider(input: {
  ydoc: Y.Doc;
  encryption?: SharedKeyEncryptionConfig;
  passphrase?: string;
  resetSockets?: boolean;
}) {
  if (input.resetSockets ?? true) {
    MockWebSocket.instances = [];
  }
  return createEncryptedProvider({
    relayUrl: "ws://127.0.0.1:4327",
    roomId: "canvas-mcp-editor:team-1:sample-file",
    userId: "user-1",
    access: "sync",
    ydoc: input.ydoc,
    initialPresence: {
      sessionId: "session-1",
      userId: "user-1",
      displayName: "Lee",
      color: "#2563eb",
      selectedNodeId: null,
      editingNodeId: null,
      editingMode: null,
      selectedNodeBounds: null,
      cursor: null,
      viewport: null,
      updatedAtMs: null,
      activeTool: "select"
    },
    passphrase: input.passphrase ?? "shared-passphrase",
    encryption: input.encryption ?? testEncryptionConfig(),
    WebSocketCtor: MockWebSocket as unknown as typeof WebSocket
  });
}

function setClientId(ydoc: Y.Doc, clientId: number) {
  (ydoc as Y.Doc & { clientID: number }).clientID = clientId;
}

function getDocumentName(ydoc: Y.Doc): string | undefined {
  return (ydoc.getMap("design").get("documentJson") as { name?: string } | undefined)?.name;
}

function sampleDocument(): RendererDocument {
  return {
    id: "sample-file",
    name: "Sample File",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "text-1",
            kind: "text",
            name: "Headline",
            transform: { x: 32, y: 40, rotation: 0 },
            size: { width: 260, height: 48 },
            style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
            content: {
              type: "text",
              value: "Canvas MCP Editor",
              font_size: 28,
              font_family: "Inter"
            },
            children: []
          }
        ]
      }
    ]
  };
}

function testEncryptionConfig(): SharedKeyEncryptionConfig {
  return createSharedKeyEncryptionConfig({
    salt: "fixed-test-salt",
    iterations: 1000
  });
}

async function waitForSocket(index = 0): Promise<MockWebSocket> {
  await waitFor(() => MockWebSocket.instances.length > index);
  return MockWebSocket.instances[index];
}

async function waitForEncryptedFrame(socket: MockWebSocket, startIndex = 0): Promise<Uint8Array> {
  await waitFor(() => socket.sent.slice(startIndex).some((frame) => frame[0] === 10));
  return socket.sent.slice(startIndex).find((frame) => frame[0] === 10) as Uint8Array;
}

async function waitFor(assertion: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (!assertion()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function concat(frames: Uint8Array[]): Uint8Array {
  const size = frames.reduce((total, frame) => total + frame.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const frame of frames) {
    output.set(frame, offset);
    offset += frame.byteLength;
  }
  return output;
}
