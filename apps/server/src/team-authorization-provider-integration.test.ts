import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createHttpServer } from "./http";
import { createMcpServer } from "./mcp";
import { FileStorage } from "./storage";
import type {
  AuthenticatedTeamMember,
  TeamAuthorizationPrincipal,
  TeamAuthorizationProvider
} from "./team-authorization";

let tempRoot: string | undefined;
let activeClient: Client | undefined;
let activeMcpServer: ReturnType<typeof createMcpServer> | undefined;

afterEach(async () => {
  await activeClient?.close().catch(() => undefined);
  await activeMcpServer?.close().catch(() => undefined);
  activeClient = undefined;
  activeMcpServer = undefined;
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

const staleConfig = {
  members: [
    {
      userId: "shared-viewer",
      role: "viewer" as const,
      teamIds: ["team-alpha"],
      token: "stale-token"
    }
  ]
};

function member(): AuthenticatedTeamMember {
  return {
    userId: "shared-viewer",
    role: "viewer",
    teamIds: ["team-alpha"],
    tokenId: undefined
  };
}

function inactiveCredential(): Error {
  return Object.assign(new Error("team member credentials are invalid"), {
    code: "EINVAL",
    statusCode: 401
  });
}

test("HTTP awaits the request-time provider instead of accepting stale config credentials", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-provider-http-"));
  const principals: TeamAuthorizationPrincipal[] = [];
  const provider: TeamAuthorizationProvider = {
    async authenticate(principal) {
      principals.push(principal);
      throw inactiveCredential();
    }
  };
  const server = createHttpServer(new FileStorage(tempRoot), {
    libraryRegistryAuth: staleConfig,
    libraryRegistryAuthorizationProvider: provider
  });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/libraries",
      headers: {
        authorization: "Bearer stale-token",
        "x-layo-user-id": "shared-viewer"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(principals).toEqual([
      { userId: "shared-viewer", memberToken: "stale-token" }
    ]);
  } finally {
    await server.close();
  }
});

test("MCP awaits the request-time provider for every protected tool call", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-provider-mcp-"));
  let active = true;
  let calls = 0;
  const provider: TeamAuthorizationProvider = {
    async authenticate(principal) {
      calls += 1;
      expect(principal).toEqual({
        userId: "shared-viewer",
        memberToken: "stale-token"
      });
      if (!active) {
        throw inactiveCredential();
      }
      return member();
    }
  };
  activeClient = new Client({ name: "layo-provider-test", version: "1.0.0" });
  activeMcpServer = createMcpServer(new FileStorage(tempRoot), {
    libraryRegistryAuth: staleConfig,
    libraryRegistryAuthorizationProvider: provider,
    libraryRegistryPrincipal: {
      userId: "shared-viewer",
      memberToken: "stale-token"
    }
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    activeClient.connect(clientTransport),
    activeMcpServer.connect(serverTransport)
  ]);

  const allowed = await activeClient.callTool({
    name: "list_library_registry",
    arguments: {}
  });
  expect(allowed).not.toMatchObject({ isError: true });

  active = false;
  const blocked = await activeClient.callTool({
    name: "list_library_registry",
    arguments: {}
  });
  expect(blocked).toMatchObject({
    isError: true,
    content: [expect.objectContaining({ text: expect.stringMatching(/credentials are invalid/) })]
  });
  expect(calls).toBe(2);
});

test("SSE rechecks the provider and closes after a shared credential is revoked", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-provider-sse-"));
  let active = true;
  let calls = 0;
  const provider: TeamAuthorizationProvider = {
    async authenticate() {
      calls += 1;
      if (!active) {
        throw inactiveCredential();
      }
      return member();
    }
  };
  const server = createHttpServer(new FileStorage(tempRoot), {
    libraryRegistryAuth: staleConfig,
    libraryRegistryAuthorizationProvider: provider
  });
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();

  try {
    const response = await fetch(`${address}/libraries/events`, {
      headers: {
        authorization: "Bearer stale-token",
        "x-layo-user-id": "shared-viewer"
      },
      signal: controller.signal
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const initial = await reader.read();
    expect(new TextDecoder().decode(initial.value)).toContain("event: ready");

    active = false;
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
    expect(calls).toBeGreaterThanOrEqual(2);
  } finally {
    controller.abort();
    await server.close();
  }
});

test("HTTP close ends an active library SSE stream before waiting for sockets", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-provider-sse-close-"));
  const server = createHttpServer(new FileStorage(tempRoot));
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();

  try {
    const response = await fetch(`${address}/libraries/events`, {
      signal: controller.signal
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const initial = await reader.read();
    expect(new TextDecoder().decode(initial.value)).toContain("event: ready");

    const closeOutcome = await Promise.race([
      server.close().then(() => "closed" as const),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 750);
      })
    ]);

    expect(closeOutcome).toBe("closed");
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  } finally {
    controller.abort();
    await server.close();
  }
});

test("HTTP close rejects a library SSE that finishes authentication after pre-close", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-provider-sse-preclose-race-"));
  let releaseAuthentication!: () => void;
  const authenticationReleased = new Promise<void>((resolve) => {
    releaseAuthentication = resolve;
  });
  let authenticationStarted!: () => void;
  const authenticationEntered = new Promise<void>((resolve) => {
    authenticationStarted = resolve;
  });
  const provider: TeamAuthorizationProvider = {
    async authenticate() {
      authenticationStarted();
      await authenticationReleased;
      return member();
    }
  };
  const server = createHttpServer(new FileStorage(tempRoot), {
    libraryRegistryAuth: staleConfig,
    libraryRegistryAuthorizationProvider: provider
  });
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();

  try {
    const responsePromise = fetch(`${address}/libraries/events`, {
      headers: {
        authorization: "Bearer stale-token",
        "x-layo-user-id": "shared-viewer"
      },
      signal: controller.signal
    });
    await authenticationEntered;
    const closePromise = server.close();
    releaseAuthentication();

    const closeOutcome = await Promise.race([
      closePromise.then(() => "closed" as const),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 750);
      })
    ]);

    expect(closeOutcome).toBe("closed");
    await expect(responsePromise).resolves.toMatchObject({ status: 503 });
  } finally {
    controller.abort();
    releaseAuthentication();
    await server.close();
  }
});
