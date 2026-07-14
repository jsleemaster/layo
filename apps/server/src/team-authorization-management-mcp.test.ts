import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createMcpServer } from "./mcp";
import type {
  TeamAccessTokenMetadata,
  TeamAuthorizationConfig,
  TeamAuthorizationFileManager
} from "./team-authorization";

const clients: Client[] = [];
const servers: Array<ReturnType<typeof createMcpServer>> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => server.close().catch(() => undefined)));
});

describe("team access token MCP administration", () => {
  test("advertises and applies authenticated create, list, and revoke with exact safety annotations", async () => {
    const tokensByUser = new Map<string, TeamAccessTokenMetadata[]>([
      ["owner-user", []],
      ["other-user", [{ id: "other-token", name: "Other automation", createdAt: "2026-07-13T12:00:00.000Z" }]]
    ]);
    const manager: TeamAuthorizationFileManager = {
      listTokens: vi.fn((userId) => [...(tokensByUser.get(userId) ?? [])]),
      createToken: vi.fn(async (userId, input) => {
        const metadata = {
          id: "owner-created",
          name: input.name,
          createdAt: "2026-07-14T12:00:00.000Z",
          ...(input.expiresInDays === null ? {} : { expiresAt: "2026-08-13T12:00:00.000Z" })
        };
        tokensByUser.set(userId, [...(tokensByUser.get(userId) ?? []), metadata]);
        return { token: "layo_pat_mcp_secret", metadata };
      }),
      revokeToken: vi.fn(async (userId, tokenId) => {
        const metadata = (tokensByUser.get(userId) ?? []).find((token) => token.id === tokenId);
        if (!metadata) throw new Error("team authorization token was not found");
        const revoked = { ...metadata, revokedAt: "2026-07-14T12:05:00.000Z" };
        tokensByUser.set(userId, (tokensByUser.get(userId) ?? []).map((token) => token.id === tokenId ? revoked : token));
        return revoked;
      })
    };
    const client = await connect({
      libraryRegistryAuth: authorization(),
      libraryRegistryPrincipal: { userId: " owner-user ", memberToken: "owner-member-token" },
      teamAuthorizationManager: manager
    });

    const tools = await client.listTools();
    const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));
    expect(byName.get("list_account_tokens")?.annotations).toEqual({
      readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false
    });
    expect(byName.get("create_account_token")?.annotations).toEqual({
      readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false
    });
    expect(byName.get("revoke_account_token")?.annotations).toEqual({
      readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false
    });

    const created = parseToolJson(await client.callTool({
      name: "create_account_token",
      arguments: { name: "Deploy automation", expiresInDays: 30 }
    }));
    expect(created).toEqual({
      token: "layo_pat_mcp_secret",
      metadata: {
        id: "owner-created",
        name: "Deploy automation",
        createdAt: "2026-07-14T12:00:00.000Z",
        expiresAt: "2026-08-13T12:00:00.000Z"
      }
    });

    const listed = parseToolJson(await client.callTool({ name: "list_account_tokens", arguments: {} }));
    expect(listed).toEqual({ tokens: [created.metadata] });
    expect(JSON.stringify(listed)).not.toContain("layo_pat_mcp_secret");
    expect(JSON.stringify(listed)).not.toContain("tokenHash");

    const revoked = parseToolJson(await client.callTool({
      name: "revoke_account_token",
      arguments: { tokenId: "owner-created" }
    }));
    expect(revoked.metadata).toMatchObject({ id: "owner-created", revokedAt: "2026-07-14T12:05:00.000Z" });

    expect(manager.createToken).toHaveBeenCalledWith("owner-user", { name: "Deploy automation", expiresInDays: 30 });
    expect(manager.listTokens).toHaveBeenCalledWith("owner-user");
    expect(manager.revokeToken).toHaveBeenCalledWith("owner-user", "owner-created");
    expect(tokensByUser.get("other-user")).toEqual([
      { id: "other-token", name: "Other automation", createdAt: "2026-07-13T12:00:00.000Z" }
    ]);
  });

  test.each([
    {
      name: "the file-backed manager is missing",
      options: {
        libraryRegistryAuth: authorization(),
        libraryRegistryPrincipal: { userId: "owner-user", memberToken: "owner-member-token" }
      }
    },
    {
      name: "the principal is missing",
      options: { libraryRegistryAuth: authorization(), teamAuthorizationManager: noOpManager() }
    },
    {
      name: "authorization is missing",
      options: {
        libraryRegistryPrincipal: { userId: "owner-user", memberToken: "owner-member-token" },
        teamAuthorizationManager: noOpManager()
      }
    }
  ])("does not advertise management tools when $name", async ({ options }) => {
    const client = await connect(options);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).not.toContain("list_account_tokens");
    expect(names).not.toContain("create_account_token");
    expect(names).not.toContain("revoke_account_token");
  });

  test.each([
    { name: "invalid", auth: authorization(), token: "wrong-token" },
    {
      name: "revoked",
      auth: authorization({ revokedAt: "2026-07-14T00:00:00.000Z" }),
      token: "owner-member-token"
    }
  ])("rejects an $name principal before any token mutation", async ({ auth, token }) => {
    const manager = noOpManager();
    const client = await connect({
      libraryRegistryAuth: auth,
      libraryRegistryPrincipal: { userId: "owner-user", memberToken: token },
      teamAuthorizationManager: manager
    });

    const result = await client.callTool({
      name: "create_account_token",
      arguments: { name: "Must not persist", expiresInDays: null }
    });

    expect(result).toMatchObject({
      isError: true,
      content: [expect.objectContaining({ text: expect.stringMatching(/credentials are invalid/) })]
    });
    expect(manager.createToken).not.toHaveBeenCalled();
    expect(manager.listTokens).not.toHaveBeenCalled();
    expect(manager.revokeToken).not.toHaveBeenCalled();
  });
});

function authorization(memberOverrides: Record<string, unknown> = {}): TeamAuthorizationConfig {
  return {
    members: [
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "owner-member-token",
        ...memberOverrides
      },
      {
        userId: "other-user",
        role: "editor",
        teamIds: ["team-alpha"],
        token: "other-member-token"
      }
    ]
  };
}

function noOpManager(): TeamAuthorizationFileManager {
  return {
    listTokens: vi.fn(() => []),
    createToken: vi.fn(async () => { throw new Error("unexpected create"); }),
    revokeToken: vi.fn(async () => { throw new Error("unexpected revoke"); })
  };
}

async function connect(options: Parameters<typeof createMcpServer>[1]) {
  const client = new Client({ name: "layo-token-management-test", version: "1.0.0" });
  const server = createMcpServer(undefined, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);
  servers.push(server);
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function parseToolJson(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const first = content?.[0];
  expect(first).toMatchObject({ type: "text" });
  return JSON.parse(first?.text ?? "null");
}
