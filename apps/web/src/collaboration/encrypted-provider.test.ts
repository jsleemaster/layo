import { describe, expect, test, vi } from "vitest";
import {
  createCollaborativeDesignDocument,
  decryptYjsUpdate,
  createSharedKeyEncryptionConfig,
  deriveSharedKey,
  encryptYjsUpdate,
  type SharedKeyEncryptionConfig
} from "@layo/collaboration";
import type { RendererDocument } from "@layo/renderer";
import * as Y from "yjs";
import {
  createEncryptedProvider,
  encodeEncryptedSyncFrame,
  encodeEncryptedSyncQueryFrame
} from "./encrypted-provider";

type MockSocketEvent = Event | MessageEvent | CloseEvent;
type MockSocketListener = (event: MockSocketEvent) => void | Promise<void>;

class MockWebSocket {
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readonly listeners = new Map<string, Set<MockSocketListener>>();
  readonly sent: Uint8Array[] = [];
  binaryType: BinaryType = "arraybuffer";
  readyState = MockWebSocket.OPEN;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => void this.emit("open", new Event("open")));
  }

  addEventListener(type: string, listener: MockSocketListener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: MockSocketListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: ArrayBuffer | Uint8Array) {
    this.sent.push(data instanceof Uint8Array ? data : new Uint8Array(data));
  }

  close() {
    this.readyState = 3;
    void this.emit("close", { type: "close" } as CloseEvent);
  }

  async emitMessage(data: Uint8Array): Promise<void> {
    await this.emit("message", new MessageEvent("message", { data }));
  }

  async emit(type: string, event: MockSocketEvent): Promise<void> {
    for (const listener of this.listeners.get(type) ?? []) {
      await listener(event);
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
      receiver = createTestProvider({ ydoc: receiverDocument.ydoc, resetSockets: false });
      const receiverSocket = await waitForSocket(1);
      await waitForEncryptedFrame(receiverSocket);
      await flushEncryptedRelay(senderSocket, receiverSocket);

      const senderUpdateStart = senderSocket.sent.length;
      const receiverUpdateStart = receiverSocket.sent.length;
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

      await forwardEncryptedFramesBetweenUntil(
        senderSocket,
        receiverSocket,
        senderUpdateStart,
        receiverUpdateStart,
        () => {
          try {
            return receiverDocument
              .getDocument()
              .pages[0]?.children.some((node) => node.id === "text-2");
          } catch {
            return false;
          }
        }
      );
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

  test("serializes overlapping encrypted messages in websocket delivery order", async () => {
    const config = testEncryptionConfig();
    const ydoc = new Y.Doc();
    const firstRemote = new Y.Doc();
    firstRemote.getMap("design").set("documentJson", { name: "First" });
    const firstUpdate = Y.encodeStateAsUpdate(firstRemote);
    const secondRemote = new Y.Doc();
    Y.applyUpdate(secondRemote, firstUpdate);
    secondRemote.getMap("design").set("documentJson", { name: "Second" });
    const secondUpdate = Y.encodeStateAsUpdate(secondRemote);
    let releaseFirst!: () => void;
    const pendingFirst = new Promise<Uint8Array>((resolve) => {
      releaseFirst = () => resolve(firstUpdate);
    });
    const decryptUpdate = vi.fn<typeof decryptYjsUpdate>()
      .mockImplementationOnce(async () => pendingFirst)
      .mockImplementationOnce(async () => secondUpdate);
    const provider = createTestProvider({ ydoc, encryption: config, decryptUpdate });
    const socket = await waitForSocket();
    const frame = await placeholderEncryptedFrame(config);

    const firstDelivery = socket.emitMessage(frame);
    const secondDelivery = socket.emitMessage(frame);
    await waitFor(() => decryptUpdate.mock.calls.length === 1);
    releaseFirst();
    await Promise.all([firstDelivery, secondDelivery]);

    expect(decryptUpdate).toHaveBeenCalledTimes(2);
    expect(getDocumentName(ydoc)).toBe("Second");
    provider.destroy();
  });

  test("continues the inbound queue after one encrypted message fails", async () => {
    const config = testEncryptionConfig();
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    remote.getMap("design").set("documentJson", { name: "Recovered" });
    const decryptUpdate = vi.fn<typeof decryptYjsUpdate>()
      .mockRejectedValueOnce(new Error("invalid encrypted frame"))
      .mockResolvedValueOnce(Y.encodeStateAsUpdate(remote));
    const provider = createTestProvider({ ydoc, encryption: config, decryptUpdate });
    const statuses: string[] = [];
    provider.onStatus((status) => statuses.push(status));
    const socket = await waitForSocket();
    const frame = await placeholderEncryptedFrame(config);

    await Promise.all([socket.emitMessage(frame), socket.emitMessage(frame)]);

    expect(statuses).toContain("error");
    expect(decryptUpdate).toHaveBeenCalledTimes(2);
    expect(getDocumentName(ydoc)).toBe("Recovered");
    provider.destroy();
  });

  test("does not apply or answer an encrypted message after destroy", async () => {
    const config = testEncryptionConfig();
    const ydoc = new Y.Doc();
    const remote = new Y.Doc();
    remote.getMap("design").set("documentJson", { name: "Too Late" });
    const update = Y.encodeStateAsUpdate(remote);
    let releaseDecrypt!: () => void;
    const pendingDecrypt = new Promise<Uint8Array>((resolve) => {
      releaseDecrypt = () => resolve(update);
    });
    const decryptUpdate = vi.fn<typeof decryptYjsUpdate>(async () => pendingDecrypt);
    const provider = createTestProvider({ ydoc, encryption: config, decryptUpdate });
    const socket = await waitForSocket();
    const frame = await placeholderEncryptedFrame(config);

    const delivery = socket.emitMessage(frame);
    await waitFor(() => decryptUpdate.mock.calls.length === 1);
    const sentBeforeDestroy = socket.sent.length;
    provider.destroy();
    releaseDecrypt();
    await delivery;

    expect(getDocumentName(ydoc)).toBeUndefined();
    expect(socket.sent).toHaveLength(sentBeforeDestroy);
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

    const senderUpdateStart = senderSocket.sent.length;
    remote.getMap("design").set("documentJson", { name: "Remote Update" });
    await forwardEncryptedFramesUntil(
      senderSocket,
      receiverSocket,
      senderUpdateStart,
      () => getDocumentName(local) === "Remote Update"
    );
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
  decryptUpdate?: typeof decryptYjsUpdate;
}) {
  if (input.resetSockets ?? true) {
    MockWebSocket.instances = [];
  }
  return createEncryptedProvider({
    relayUrl: "ws://127.0.0.1:4327",
    roomId: "layo:team-1:sample-file",
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
  }, input.decryptUpdate ? { decryptUpdate: input.decryptUpdate } : {});
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
              value: "Layo",
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

async function placeholderEncryptedFrame(
  config: SharedKeyEncryptionConfig
): Promise<Uint8Array> {
  const key = await deriveSharedKey("shared-passphrase", config);
  return encodeEncryptedSyncFrame(
    await encryptYjsUpdate(new Uint8Array([1]), key)
  );
}

async function waitForSocket(index = 0): Promise<MockWebSocket> {
  await waitFor(() => MockWebSocket.instances.length > index);
  return MockWebSocket.instances[index];
}

async function waitForEncryptedFrame(socket: MockWebSocket, startIndex = 0): Promise<Uint8Array> {
  await waitFor(() => socket.sent.slice(startIndex).some((frame) => frame[0] === 10));
  return socket.sent.slice(startIndex).find((frame) => frame[0] === 10) as Uint8Array;
}

async function forwardEncryptedFramesUntil(
  source: MockWebSocket,
  target: MockWebSocket,
  startIndex: number,
  assertion: () => boolean
): Promise<void> {
  let nextIndex = startIndex;
  let forwarded = 0;
  const startedAt = Date.now();
  while (!assertion()) {
    const nextFrames = source.sent.slice(nextIndex);
    nextIndex = source.sent.length;
    for (const frame of nextFrames) {
      if (frame[0] === 10) {
        forwarded += 1;
        await target.emitMessage(frame);
      }
    }
    if (Date.now() - startedAt > 10_000) {
      throw new Error(
        `timed out waiting for condition (sourceFrames=${source.sent.length}, targetFrames=${target.sent.length}, forwarded=${forwarded})`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function forwardEncryptedFramesBetweenUntil(
  first: MockWebSocket,
  second: MockWebSocket,
  firstStartIndex: number,
  secondStartIndex: number,
  assertion: () => boolean
): Promise<void> {
  let firstIndex = firstStartIndex;
  let secondIndex = secondStartIndex;
  let firstForwarded = 0;
  let secondForwarded = 0;
  const startedAt = Date.now();
  while (!assertion()) {
    const nextFirstFrames = first.sent.slice(firstIndex);
    firstIndex = first.sent.length;
    for (const frame of nextFirstFrames) {
      if (frame[0] === 10) {
        firstForwarded += 1;
        await second.emitMessage(frame);
      }
    }

    const nextSecondFrames = second.sent.slice(secondIndex);
    secondIndex = second.sent.length;
    for (const frame of nextSecondFrames) {
      if (frame[0] === 10) {
        secondForwarded += 1;
        await first.emitMessage(frame);
      }
    }

    if (Date.now() - startedAt > 10_000) {
      throw new Error(
        `timed out waiting for condition (firstFrames=${first.sent.length}, secondFrames=${second.sent.length}, firstForwarded=${firstForwarded}, secondForwarded=${secondForwarded})`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function flushEncryptedRelay(first: MockWebSocket, second: MockWebSocket): Promise<void> {
  let firstIndex = 0;
  let secondIndex = 0;
  let idleTicks = 0;
  let firstForwarded = 0;
  let secondForwarded = 0;
  const startedAt = Date.now();
  while (idleTicks < 2) {
    let forwardedThisTick = 0;

    const nextFirstFrames = first.sent.slice(firstIndex);
    firstIndex = first.sent.length;
    for (const frame of nextFirstFrames) {
      if (frame[0] === 10) {
        forwardedThisTick += 1;
        firstForwarded += 1;
        await second.emitMessage(frame);
      }
    }

    const nextSecondFrames = second.sent.slice(secondIndex);
    secondIndex = second.sent.length;
    for (const frame of nextSecondFrames) {
      if (frame[0] === 10) {
        forwardedThisTick += 1;
        secondForwarded += 1;
        await first.emitMessage(frame);
      }
    }

    idleTicks = forwardedThisTick === 0 ? idleTicks + 1 : 0;
    if (Date.now() - startedAt > 10_000) {
      throw new Error(
        `timed out flushing relay (firstFrames=${first.sent.length}, secondFrames=${second.sent.length}, firstForwarded=${firstForwarded}, secondForwarded=${secondForwarded})`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitFor(assertion: () => boolean, timeoutMs = 10_000, describeTimeout?: () => string): Promise<void> {
  const startedAt = Date.now();
  while (!assertion()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for condition${describeTimeout ? ` (${describeTimeout()})` : ""}`);
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