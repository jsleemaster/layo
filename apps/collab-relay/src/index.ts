import { createServer, type IncomingMessage, type Server } from "node:http";
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
}

export interface RelayValidationInput {
  roomId: string;
  allowedRoomPrefix: string;
  expectedToken?: string;
  token?: string | null;
}

export type RelayValidationResult =
  | { ok: true }
  | { ok: false; reason: "room prefix is not allowed" | "relay token is invalid" };

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

interface RelayConnection {
  socket: WebSocket;
  awarenessClientIds: Set<number>;
}

interface RelayRoom {
  id: string;
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

  return { ok: true };
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
      token: target.token
    });

    if (!validation.ok) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      connectToRoom(getRoom(rooms, target.roomId), websocket);
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

function parseUpgradeRequest(request: IncomingMessage, host: string): { roomId: string; token: string | null } {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const roomId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const header = request.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  return {
    roomId,
    token: bearerToken ?? url.searchParams.get("token")
  };
}

function getRoom(rooms: Map<string, RelayRoom>, roomId: string): RelayRoom {
  const existing = rooms.get(roomId);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const room: RelayRoom = {
    id: roomId,
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

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(room, encoding.toUint8Array(encoder), origin);
  });
  rooms.set(roomId, room);
  return room;
}

function connectToRoom(room: RelayRoom, socket: WebSocket) {
  const connection: RelayConnection = {
    socket,
    awarenessClientIds: new Set()
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

  sendSyncStep1(room, socket);
  sendAwareness(room, socket);
}

function handleMessage(room: RelayRoom, connection: RelayConnection, data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.readSyncMessage(decoder, encoder, room.doc, connection);
    if (encoding.length(encoder) > 1) {
      send(connection.socket, encoding.toUint8Array(encoder));
    }
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
    allowedRoomPrefix: process.env.COLLAB_ALLOWED_ROOM_PREFIX ?? "canvas-mcp-editor:",
    token: process.env.COLLAB_ROOM_TOKEN || undefined
  });
  await relay.listen();
  console.log(`Canvas collaboration relay listening at ${relay.wsUrl}`);
}
