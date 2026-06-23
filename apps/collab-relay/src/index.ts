import { createServer, type IncomingMessage, type Server } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";

export interface CollabRelayConfig {
  host: string;
  port: number;
  allowedRoomPrefix: string;
  token?: string;
  memberTokens?: RelayMemberToken[];
}

export type RelayMemberRole = "owner" | "editor" | "viewer";

export interface RelayMemberToken {
  userId: string;
  role: RelayMemberRole;
  token?: string;
  tokenHash?: string;
}

export interface RelayValidationInput {
  roomId: string;
  allowedRoomPrefix: string;
  expectedToken?: string;
  token?: string | null;
  userId?: string | null;
  memberToken?: string | null;
  requestedAccess?: "sync" | "awareness";
  memberTokens?: RelayMemberToken[];
}

export type RelayValidationResult =
  | { ok: true; role?: RelayMemberRole; canWriteDocument: boolean }
  | {
      ok: false;
      reason:
        | "room prefix is not allowed"
        | "relay token is invalid"
        | "member is required"
        | "member is not allowed"
        | "member token is invalid"
        | "member is not allowed to edit document";
    };

export interface CollabRelayServer {
  readonly httpUrl: string;
  readonly wsUrl: string;
  listen(): Promise<void>;
  close(): Promise<void>;
  roomCount(): number;
}

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;
const messageEncryptedSync = 10;
const messageEncryptedSyncQuery = 11;

interface RelayConnection {
  socket: WebSocket;
  awarenessClientIds: Set<number>;
  canWriteDocument: boolean;
}

interface RelayRoom {
  id: string;
  mode: "plain" | "encrypted";
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<RelayConnection>;
  destroy(): void;
}

export function validateRelayConnection(input: RelayValidationInput): RelayValidationResult {
  if (!input.roomId.startsWith(input.allowedRoomPrefix)) {
    return { ok: false, reason: "room prefix is not allowed" };
  }

  if (input.expectedToken && input.token !== input.expectedToken) {
    return { ok: false, reason: "relay token is invalid" };
  }

  if (!input.memberTokens?.length) {
    return { ok: true, canWriteDocument: true };
  }

  if (!input.userId || !input.memberToken) {
    return { ok: false, reason: "member is required" };
  }

  const member = input.memberTokens.find((candidate) => candidate.userId === input.userId);
  if (!member) {
    return { ok: false, reason: "member is not allowed" };
  }

  if (!matchesMemberToken(member, input.memberToken)) {
    return { ok: false, reason: "member token is invalid" };
  }

  const canWriteDocument = member.role === "owner" || member.role === "editor";
  if ((input.requestedAccess ?? "sync") === "sync" && !canWriteDocument) {
    return { ok: false, reason: "member is not allowed to edit document" };
  }

  return { ok: true, role: member.role, canWriteDocument };
}

export function createCollabRelayServer(config: CollabRelayConfig): CollabRelayServer {
  const rooms = new Map<string, RelayRoom>();
  let httpUrl = "";
  let wsUrl = "";
  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
  });
  const websocketServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const target = parseUpgradeRequest(request, config.host);
    const validation = validateRelayConnection({
      roomId: target.roomId,
      allowedRoomPrefix: config.allowedRoomPrefix,
      expectedToken: config.token,
      token: target.token,
      userId: target.userId,
      memberToken: target.memberToken,
      requestedAccess: target.access,
      memberTokens: config.memberTokens
    });

    if (!validation.ok) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const roomMode = target.encrypted ? "encrypted" : "plain";
    const existingRoom = rooms.get(target.roomId);
    if (existingRoom && existingRoom.mode !== roomMode) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      const room = getRoom(rooms, target.roomId, roomMode);
      connectToRoom(room, websocket, validation.canWriteDocument);
    });
  });

  return {
    get httpUrl() {
      return httpUrl;
    },
    get wsUrl() {
      return wsUrl;
    },
    async listen() {
      await new Promise<void>((resolve) => {
        httpServer.listen({ host: config.host, port: config.port }, resolve);
      });
      const address = httpServer.address() as AddressInfo;
      httpUrl = `http://${config.host}:${address.port}`;
      wsUrl = `ws://${config.host}:${address.port}`;
    },
    async close() {
      for (const room of rooms.values()) {
        room.destroy();
      }
      rooms.clear();
      await new Promise<void>((resolve, reject) => {
        websocketServer.close((websocketError) => {
          if (websocketError) {
            reject(websocketError);
            return;
          }
          httpServer.close((httpError) => {
            if (httpError) {
              reject(httpError);
              return;
            }
            resolve();
          });
        });
      });
    },
    roomCount() {
      return rooms.size;
    }
  };
}

function parseUpgradeRequest(request: IncomingMessage, host: string): {
  roomId: string;
  token: string | null;
  userId: string | null;
  memberToken: string | null;
  access: "sync" | "awareness";
  encrypted: boolean;
} {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const roomId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const header = request.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const access = url.searchParams.get("access") === "awareness" ? "awareness" : "sync";
  return {
    roomId,
    token: bearerToken ?? url.searchParams.get("token"),
    userId: url.searchParams.get("userId"),
    memberToken: url.searchParams.get("memberToken"),
    access,
    encrypted: url.searchParams.get("e2ee") === "true"
  };
}

function getRoom(
  rooms: Map<string, RelayRoom>,
  roomId: string,
  mode: RelayRoom["mode"]
): RelayRoom {
  const existing = rooms.get(roomId);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const room: RelayRoom = {
    id: roomId,
    mode,
    doc,
    awareness,
    connections: new Set(),
    destroy() {
      for (const connection of room.connections) {
        connection.socket.close();
      }
      room.connections.clear();
      awareness.destroy();
      doc.destroy();
    }
  };

  if (mode === "plain") {
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      broadcast(room, encoding.toUint8Array(encoder), origin);
    });
  }
  rooms.set(roomId, room);
  return room;
}

function connectToRoom(room: RelayRoom, socket: WebSocket, canWriteDocument: boolean) {
  const connection: RelayConnection = {
    socket,
    awarenessClientIds: new Set(),
    canWriteDocument
  };
  room.connections.add(connection);

  socket.binaryType = "arraybuffer";
  socket.on("message", (data) => {
    handleMessage(room, connection, toUint8Array(data));
  });
  socket.on("close", () => {
    room.connections.delete(connection);
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(connection.awarenessClientIds),
      connection
    );
  });

  if (room.mode === "plain") {
    sendSyncStep1(room, socket);
  }
  sendAwareness(room, socket);
}

function handleMessage(room: RelayRoom, connection: RelayConnection, data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    if (room.mode === "encrypted") {
      return;
    }
    if (!connection.canWriteDocument) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, connection);
    if (encoding.length(encoder) > 1) {
      send(connection.socket, encoding.toUint8Array(encoder));
    }
    return;
  }

  if (messageType === messageEncryptedSync) {
    if (room.mode !== "encrypted" || !connection.canWriteDocument) {
      return;
    }
    const encryptedUpdate = decoding.readVarUint8Array(decoder);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageEncryptedSync);
    encoding.writeVarUint8Array(encoder, encryptedUpdate);
    broadcast(room, encoding.toUint8Array(encoder), connection);
    return;
  }

  if (messageType === messageEncryptedSyncQuery) {
    if (room.mode !== "encrypted" || !connection.canWriteDocument) {
      return;
    }
    broadcast(room, data, connection);
    return;
  }

  if (messageType === messageAwareness) {
    const update = decoding.readVarUint8Array(decoder);
    const before = new Set(room.awareness.getStates().keys());
    awarenessProtocol.applyAwarenessUpdate(room.awareness, update, connection);
    for (const clientId of room.awareness.getStates().keys()) {
      if (!before.has(clientId)) {
        connection.awarenessClientIds.add(clientId);
      }
    }
    broadcast(room, data, connection);
    return;
  }

  if (messageType === messageQueryAwareness) {
    sendAwareness(room, connection.socket);
  }
}

function matchesMemberToken(member: RelayMemberToken, token: string): boolean {
  if (member.token && member.token === token) {
    return true;
  }
  if (member.tokenHash && member.tokenHash === hashToken(token)) {
    return true;
  }
  return false;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseMemberTokens(input: string | undefined): RelayMemberToken[] | undefined {
  if (!input) {
    return undefined;
  }
  const parsed = JSON.parse(input) as RelayMemberToken[];
  if (!Array.isArray(parsed)) {
    throw new Error("COLLAB_MEMBER_TOKENS must be a JSON array");
  }
  return parsed;
}

function sendSyncStep1(room: RelayRoom, socket: WebSocket) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  send(socket, encoding.toUint8Array(encoder));
}

function sendAwareness(room: RelayRoom, socket: WebSocket) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(room.awareness.getStates().keys()))
  );
  send(socket, encoding.toUint8Array(encoder));
}

function broadcast(room: RelayRoom, data: Uint8Array, origin: unknown) {
  for (const connection of room.connections) {
    if (connection !== origin) {
      send(connection.socket, data);
    }
  }
}

function send(socket: WebSocket, data: Uint8Array) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(data);
  }
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const relay = createCollabRelayServer({
    host: process.env.COLLAB_RELAY_HOST ?? "127.0.0.1",
    port: Number(process.env.COLLAB_RELAY_PORT ?? 4327),
    allowedRoomPrefix: process.env.COLLAB_ALLOWED_ROOM_PREFIX ?? "layo:",
    token: process.env.COLLAB_ROOM_TOKEN || undefined,
    memberTokens: parseMemberTokens(process.env.COLLAB_MEMBER_TOKENS)
  });
  await relay.listen();
  console.log(`Canvas collaboration relay listening at ${relay.wsUrl}`);
}
