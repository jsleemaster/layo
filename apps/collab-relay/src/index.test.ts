import { describe, expect, test } from "vitest";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import WebSocket, { type RawData } from "ws";
import {
  createCollabRelayServer,
  validateRelayConnection
} from "./index";

const messageSync = 0;
const messageEncryptedSync = 10;
const messageEncryptedSyncQuery = 11;

describe("collaboration relay", () => {
  test("serves health and accepts allowed websocket rooms", async () => {
    const relay = createCollabRelayServer({
      host: "127.0.0.1",
      port: 0,
      allowedRoomPrefix: "layo:"
    });
    await relay.listen();

    const health = await fetch(`${relay.httpUrl}/health`);
    expect(await health.json()).toEqual({
      ok: true,
      rooms: 0
    });

    const socket = new WebSocket(`${relay.wsUrl}/layo:team-1:sample-file`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });

    expect(relay.roomCount()).toBe(1);

    socket.close();
    await relay.close();
  });

  test("validates room prefix and token", () => {
    expect(
      validateRelayConnection({
        roomId: "layo:team-1:sample-file",
        allowedRoomPrefix: "layo:"
      })
    ).toEqual({ ok: true, canWriteDocument: true });

    expect(
      validateRelayConnection({
        roomId: "other:team-1:sample-file",
        allowedRoomPrefix: "layo:"
      })
    ).toEqual({ ok: false, reason: "room prefix is not allowed" });

    expect(
      validateRelayConnection({
        roomId: "layo:team-1:sample-file",
        allowedRoomPrefix: "layo:",
        expectedToken: "secret",
        token: "wrong"
      })
    ).toEqual({ ok: false, reason: "relay token is invalid" });
  });

  test("validates member identity and role-specific document permissions", () => {
    const memberTokens = [
      {
        userId: "owner-1",
        token: "owner-secret",
        role: "owner" as const
      },
      {
        userId: "viewer-1",
        token: "viewer-secret",
        role: "viewer" as const
      }
    ];

    expect(
      validateRelayConnection({
        roomId: "layo:team-1:sample-file",
        allowedRoomPrefix: "layo:",
        userId: "owner-1",
        memberToken: "owner-secret",
        requestedAccess: "sync",
        memberTokens
      })
    ).toEqual({ ok: true, role: "owner", canWriteDocument: true });

    expect(
      validateRelayConnection({
        roomId: "layo:team-1:sample-file",
        allowedRoomPrefix: "layo:",
        userId: "viewer-1",
        memberToken: "viewer-secret",
        requestedAccess: "sync",
        memberTokens
      })
    ).toEqual({
      ok: false,
      reason: "member is not allowed to edit document"
    });

    expect(
      validateRelayConnection({
        roomId: "layo:team-1:sample-file",
        allowedRoomPrefix: "layo:",
        userId: "viewer-1",
        memberToken: "viewer-secret",
        requestedAccess: "awareness",
        memberTokens
      })
    ).toEqual({ ok: true, role: "viewer", canWriteDocument: false });

    expect(
      validateRelayConnection({
        roomId: "layo:team-1:sample-file",
        allowedRoomPrefix: "layo:",
        userId: "unknown",
        memberToken: "viewer-secret",
        requestedAccess: "awareness",
        memberTokens
      })
    ).toEqual({ ok: false, reason: "member is not allowed" });
  });

  test("rejects invalid websocket members and accepts allowed websocket members", async () => {
    const relay = createCollabRelayServer({
      host: "127.0.0.1",
      port: 0,
      allowedRoomPrefix: "layo:",
      memberTokens: [
        {
          userId: "editor-1",
          token: "editor-secret",
          role: "editor"
        },
        {
          userId: "viewer-1",
          token: "viewer-secret",
          role: "viewer"
        }
      ]
    });
    await relay.listen();

    const editorSocket = new WebSocket(
      `${relay.wsUrl}/layo:team-1:sample-file?userId=editor-1&memberToken=editor-secret&access=sync`
    );
    await new Promise<void>((resolve, reject) => {
      editorSocket.once("open", resolve);
      editorSocket.once("error", reject);
    });
    expect(relay.roomCount()).toBe(1);

    const rejectedSocket = new WebSocket(
      `${relay.wsUrl}/layo:team-1:sample-file?userId=editor-1&memberToken=wrong&access=sync`
    );
    await new Promise<void>((resolve, reject) => {
      rejectedSocket.once("unexpected-response", (_request, response) => {
        expect(response.statusCode).toBe(401);
        resolve();
      });
      rejectedSocket.once("open", () => reject(new Error("invalid member connected")));
      rejectedSocket.once("error", reject);
    });

    const rejectedViewerSync = new WebSocket(
      `${relay.wsUrl}/layo:team-1:sample-file?userId=viewer-1&memberToken=viewer-secret&access=sync`
    );
    await new Promise<void>((resolve, reject) => {
      rejectedViewerSync.once("unexpected-response", (_request, response) => {
        expect(response.statusCode).toBe(401);
        resolve();
      });
      rejectedViewerSync.once("open", () => reject(new Error("viewer sync connected")));
      rejectedViewerSync.once("error", reject);
    });

    const viewerAwarenessSocket = new WebSocket(
      `${relay.wsUrl}/layo:team-1:sample-file?userId=viewer-1&memberToken=viewer-secret&access=awareness`
    );
    await new Promise<void>((resolve, reject) => {
      viewerAwarenessSocket.once("open", resolve);
      viewerAwarenessSocket.once("error", reject);
    });

    editorSocket.close();
    viewerAwarenessSocket.close();
    await relay.close();
  });

  test("broadcasts encrypted document frames opaquely without plain sync bootstrap", async () => {
    const relay = createCollabRelayServer({
      host: "127.0.0.1",
      port: 0,
      allowedRoomPrefix: "layo:"
    });
    await relay.listen();
    const first = new WebSocket(`${relay.wsUrl}/layo:team-e2ee:sample-file?e2ee=true`);
    const second = new WebSocket(`${relay.wsUrl}/layo:team-e2ee:sample-file?e2ee=true`);

    try {
      await Promise.all([waitForOpen(first), waitForOpen(second)]);
      await expectNoMessageType(first, messageSync);
      await expectNoMessageType(second, messageSync);

      first.send(encodeFrame(messageEncryptedSync, new Uint8Array([7, 8, 9])));
      expect(decodeFramePayload(await waitForMessageType(second, messageEncryptedSync))).toEqual(
        new Uint8Array([7, 8, 9])
      );

      second.send(encodeFrame(messageEncryptedSyncQuery));
      await waitForMessageType(first, messageEncryptedSyncQuery);
    } finally {
      first.close();
      second.close();
      await relay.close();
    }
  });

  test("rejects mixed encrypted and plain clients in the same room", async () => {
    const relay = createCollabRelayServer({
      host: "127.0.0.1",
      port: 0,
      allowedRoomPrefix: "layo:"
    });
    await relay.listen();
    const encrypted = new WebSocket(`${relay.wsUrl}/layo:team-mixed:sample-file?e2ee=true`);

    try {
      await waitForOpen(encrypted);
      const plain = new WebSocket(`${relay.wsUrl}/layo:team-mixed:sample-file`);
      await expectUnauthorized(plain, "plain client joined encrypted room");
    } finally {
      encrypted.close();
      await relay.close();
    }
  });

  test("does not broadcast encrypted document writes from awareness-only viewers", async () => {
    const relay = createCollabRelayServer({
      host: "127.0.0.1",
      port: 0,
      allowedRoomPrefix: "layo:",
      memberTokens: [
        {
          userId: "editor-1",
          token: "editor-secret",
          role: "editor"
        },
        {
          userId: "viewer-1",
          token: "viewer-secret",
          role: "viewer"
        }
      ]
    });
    await relay.listen();
    const editor = new WebSocket(
      `${relay.wsUrl}/layo:team-viewer:sample-file?e2ee=true&userId=editor-1&memberToken=editor-secret&access=sync`
    );
    const viewer = new WebSocket(
      `${relay.wsUrl}/layo:team-viewer:sample-file?e2ee=true&userId=viewer-1&memberToken=viewer-secret&access=awareness`
    );

    try {
      await Promise.all([waitForOpen(editor), waitForOpen(viewer)]);
      viewer.send(encodeFrame(messageEncryptedSync, new Uint8Array([1, 2, 3])));
      await expectNoMessageType(editor, messageEncryptedSync);
    } finally {
      editor.close();
      viewer.close();
      await relay.close();
    }
  });
});

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function expectUnauthorized(socket: WebSocket, openMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => {
      expect(response.statusCode).toBe(401);
      resolve();
    });
    socket.once("open", () => reject(new Error(openMessage)));
    socket.once("error", reject);
  });
}

function waitForMessageType(socket: WebSocket, expectedType: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for message type ${expectedType}`));
    }, 500);
    const onMessage = (data: RawData) => {
      const bytes = toUint8Array(data);
      if (decodeFrameType(bytes) === expectedType) {
        cleanup();
        resolve(bytes);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

async function expectNoMessageType(socket: WebSocket, expectedType: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 75);
    const onMessage = (data: RawData) => {
      if (decodeFrameType(toUint8Array(data)) === expectedType) {
        cleanup();
        reject(new Error(`received unexpected message type ${expectedType}`));
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
    };

    socket.on("message", onMessage);
  });
}

function encodeFrame(type: number, payload?: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  if (payload) {
    encoding.writeVarUint8Array(encoder, payload);
  }
  return encoding.toUint8Array(encoder);
}

function decodeFrameType(data: Uint8Array): number {
  return decoding.readVarUint(decoding.createDecoder(data));
}

function decodeFramePayload(data: Uint8Array): Uint8Array {
  const decoder = decoding.createDecoder(data);
  decoding.readVarUint(decoder);
  return decoding.readVarUint8Array(decoder);
}

function toUint8Array(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(data);
}
