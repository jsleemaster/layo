import { describe, expect, test } from "vitest";
import WebSocket from "ws";
import {
  createCollabRelayServer,
  validateRelayConnection
} from "./index";

describe("collaboration relay", () => {
  test("serves health and accepts allowed websocket rooms", async () => {
    const relay = createCollabRelayServer({
      host: "127.0.0.1",
      port: 0,
      allowedRoomPrefix: "canvas-mcp-editor:"
    });
    await relay.listen();

    const health = await fetch(`${relay.httpUrl}/health`);
    expect(await health.json()).toEqual({
      ok: true,
      rooms: 0
    });

    const socket = new WebSocket(`${relay.wsUrl}/canvas-mcp-editor:team-1:sample-file`);
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
        roomId: "canvas-mcp-editor:team-1:sample-file",
        allowedRoomPrefix: "canvas-mcp-editor:"
      })
    ).toEqual({ ok: true });

    expect(
      validateRelayConnection({
        roomId: "other:team-1:sample-file",
        allowedRoomPrefix: "canvas-mcp-editor:"
      })
    ).toEqual({ ok: false, reason: "room prefix is not allowed" });

    expect(
      validateRelayConnection({
        roomId: "canvas-mcp-editor:team-1:sample-file",
        allowedRoomPrefix: "canvas-mcp-editor:",
        expectedToken: "secret",
        token: "wrong"
      })
    ).toEqual({ ok: false, reason: "relay token is invalid" });
  });
});
