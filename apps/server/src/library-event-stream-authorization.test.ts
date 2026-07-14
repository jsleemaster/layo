import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

test("closes an open library event stream after its member credential expires", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-stream-auth-"));
  const member = {
    userId: "stream-viewer",
    role: "viewer" as const,
    teamIds: ["team-alpha"],
    token: "stream-token",
    expiresAt: "2099-01-01T00:00:00.000Z"
  };
  const server = createHttpServer(new FileStorage(tempRoot), {
    libraryRegistryAuth: { members: [member] }
  });
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();

  try {
    const response = await fetch(`${address}/libraries/events`, {
      headers: {
        authorization: "Bearer stream-token",
        "x-layo-user-id": "stream-viewer"
      },
      signal: controller.signal
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const initial = await reader.read();
    expect(new TextDecoder().decode(initial.value)).toContain("event: ready");

    member.expiresAt = "2020-01-01T00:00:00.000Z";
    const outcome = await Promise.race([
      (async () => {
        const decoder = new TextDecoder();
        let payload = "";
        while (true) {
          const result = await reader.read();
          if (result.value) {
            payload += decoder.decode(result.value, { stream: !result.done });
          }
          if (result.done) {
            return { ended: true, payload };
          }
        }
      })(),
      new Promise<{ ended: false; payload: string }>((resolve) => {
        setTimeout(() => resolve({ ended: false, payload: "" }), 1_250);
      })
    ]);

    expect(outcome.ended).toBe(true);
    expect(outcome.payload).toContain("event: library-registry-authorization-ended");
    expect(outcome.payload).toContain('"code":"credential_inactive"');
    expect(outcome.payload).not.toContain("stream-token");
  } finally {
    controller.abort();
    await server.close();
  }
});
