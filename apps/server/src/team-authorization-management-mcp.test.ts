import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createMcpServer } from "./mcp";
import {
  createTeamAuthorizationFileManager,
  watchTeamAuthorizationConfigFile,
  type TeamAuthorizationConfig,
  type TeamAuthorizationConfigSource,
  type TeamAuthorizationFileManager
} from "./team-authorization";

const clients: Client[] = [];
const servers: Array<ReturnType<typeof createMcpServer>> = [];
const sources: TeamAuthorizationConfigSource[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => server.close().catch(() => undefined)));
  sources.splice(0).forEach((source) => source.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("team access token MCP administration", () => {
  test("advertises and applies authenticated create, list, and revoke with exact safety annotations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-mcp-success-"));
    roots.push(root);
    const configPath = path.join(root, "members.json");
    const otherToken = {
      id: "other-token",
      name: "Other automation",
      tokenHash: tokenHash("other-token-secret"),
      createdAt: "2026-07-13T12:00:00.000Z"
    };
    await writeFile(
      configPath,
      JSON.stringify(
        [
          {
            userId: "owner-user",
            role: "owner",
            teamIds: ["team-alpha"],
            token: "owner-member-token"
          },
          {
            userId: "other-user",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "other-member-token",
            tokens: [otherToken]
          }
        ],
        null,
        2
      ),
      "utf8"
    );
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 60_000
    });
    sources.push(source);
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      generateId: () => "owner-created",
      generateSecret: () => "layo_pat_mcp_secret"
    });
    const client = await connect({
      libraryRegistryAuth: source.config,
      libraryRegistryPrincipal: {
        userId: " owner-user ",
        memberToken: "owner-member-token"
      },
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

    const listed = parseToolJson(await client.callTool({
      name: "list_account_tokens",
      arguments: {}
    }));
    expect(listed).toEqual({ tokens: [created.metadata] });
    expect(JSON.stringify(listed)).not.toContain("layo_pat_mcp_secret");
    expect(JSON.stringify(listed)).not.toContain("tokenHash");

    const revoked = parseToolJson(await client.callTool({
      name: "revoke_account_token",
      arguments: { tokenId: "owner-created" }
    }));
    expect(revoked).toEqual({
      metadata: {
        ...created.metadata,
        revokedAt: "2026-07-14T12:00:00.000Z"
      }
    });
    expect(JSON.stringify(revoked)).not.toContain("layo_pat_mcp_secret");
    expect(JSON.stringify(revoked)).not.toContain("tokenHash");

    const persistedText = await readFile(configPath, "utf8");
    const persisted = JSON.parse(persistedText);
    const owner = persisted.find((member: { userId: string }) => member.userId === "owner-user");
    const other = persisted.find((member: { userId: string }) => member.userId === "other-user");
    expect(owner.tokens).toEqual([
      expect.objectContaining({
        id: "owner-created",
        tokenHash: tokenHash("layo_pat_mcp_secret"),
        revokedAt: "2026-07-14T12:00:00.000Z"
      })
    ]);
    expect(persistedText).not.toContain("layo_pat_mcp_secret");
    expect(owner.tokens[0]).not.toHaveProperty("token");
    expect(other.tokens).toEqual([otherToken]);
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

  test.each(
    ["invalid", "revoked-member", "revoked-named"].flatMap((principalState) =>
      ["list", "create", "revoke"].map((operation) => ({ principalState, operation }))
    )
  )("rejects a $principalState principal before $operation", async ({ principalState, operation }) => {
    const setup = await connectFileBackedMcp({
      principalState: principalState as PrincipalState
    });

    const before = await readFile(setup.configPath, "utf8");
    const result = await callManagementTool(setup.client, operation as ManagementOperation);
    expect(result).toMatchObject({
      isError: true,
      content: [expect.objectContaining({ text: expect.stringMatching(/credentials are invalid/) })]
    });
    expect(await readFile(setup.configPath, "utf8")).toBe(before);
  });

  test.each(
    ["revoked", "replaced"].flatMap((fileState) =>
      ["list", "create", "revoke"].map((operation) => ({ fileState, operation }))
    )
  )("uses current file credentials before $operation when the cached principal is $fileState", async ({
    fileState,
    operation
  }) => {
    const setup = await connectFileBackedMcp();
    const changed = membersFile({
      principalState: fileState === "revoked" ? "revoked-named" : "replaced-named"
    });
    await writeFile(setup.configPath, changed, "utf8");

    const result = await callManagementTool(setup.client, operation as ManagementOperation);
    expect(result).toMatchObject({
      isError: true,
      content: [expect.objectContaining({ text: expect.stringMatching(/credentials are invalid/) })]
    });
    expect(JSON.parse(await readFile(setup.configPath, "utf8"))).toEqual(JSON.parse(changed));
  });

  test("requires explicit acknowledgement before revoking the active named principal token", async () => {
    const setup = await connectFileBackedMcp();

    const result = await setup.client.callTool({
      name: "revoke_account_token",
      arguments: { tokenId: "principal-token" }
    });

    expect(result).toMatchObject({
      isError: true,
      content: [expect.objectContaining({ text: expect.stringMatching(/confirmSelfRevoke/) })]
    });
    expect(JSON.parse(await readFile(setup.configPath, "utf8"))).toEqual(
      JSON.parse(membersFile())
    );
  });

  test("revokes the active named principal only with acknowledgement and returns no secret", async () => {
    const setup = await connectFileBackedMcp();

    const result = parseToolJson(await setup.client.callTool({
      name: "revoke_account_token",
      arguments: { tokenId: "principal-token", confirmSelfRevoke: true }
    }));

    expect(result.metadata).toMatchObject({
      id: "principal-token",
      revokedAt: "2026-07-14T12:00:00.000Z"
    });
    expect(JSON.stringify(result)).not.toContain("principal-secret");
    expect(JSON.stringify(result)).not.toContain("tokenHash");
  });
});

type PrincipalState = "active" | "invalid" | "revoked-member" | "revoked-named";
type ManagementOperation = "list" | "create" | "revoke";

async function connectFileBackedMcp(options: { principalState?: PrincipalState } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "layo-token-mcp-review-"));
  roots.push(root);
  const configPath = path.join(root, "members.json");
  const principalState = options.principalState ?? "active";
  await writeFile(
    configPath,
    membersFile({ principalState: principalState === "invalid" ? "active" : principalState }),
    "utf8"
  );
  const source = await watchTeamAuthorizationConfigFile(configPath, {
    pollIntervalMs: 60_000
  });
  sources.push(source);
  const manager = createTeamAuthorizationFileManager(configPath, source.config, {
    now: () => new Date("2026-07-14T12:00:00.000Z"),
    generateId: () => "created-token",
    generateSecret: () => "layo_pat_created_secret"
  });
  const client = await connect({
    libraryRegistryAuth: source.config,
    libraryRegistryPrincipal: {
      userId: "owner-user",
      memberToken: principalState === "invalid" ? "wrong-secret" : "principal-secret"
    },
    teamAuthorizationManager: manager
  });
  return { client, configPath };
}

function membersFile(options: {
  principalState?: "active" | "revoked-member" | "revoked-named" | "replaced-named";
} = {}): string {
  const principalState = options.principalState ?? "active";
  return JSON.stringify(
    [
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        ...(principalState === "revoked-member"
          ? { revokedAt: "2020-01-01T00:00:00.000Z" }
          : {}),
        tokens: [
          {
            id: "principal-token",
            name: "MCP principal",
            tokenHash: tokenHash(
              principalState === "replaced-named" ? "replacement-secret" : "principal-secret"
            ),
            createdAt: "2026-07-13T12:00:00.000Z",
            ...(principalState === "revoked-named"
              ? { revokedAt: "2020-01-01T00:00:00.000Z" }
              : {})
          },
          {
            id: "target-token",
            name: "Target automation",
            tokenHash: tokenHash("target-secret"),
            createdAt: "2026-07-13T13:00:00.000Z"
          }
        ]
      }
    ],
    null,
    2
  );
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function callManagementTool(client: Client, operation: ManagementOperation) {
  if (operation === "list") {
    return client.callTool({ name: "list_account_tokens", arguments: {} });
  }
  if (operation === "create") {
    return client.callTool({
      name: "create_account_token",
      arguments: { name: "Must not persist", expiresInDays: null }
    });
  }
  return client.callTool({
    name: "revoke_account_token",
    arguments: { tokenId: "target-token" }
  });
}

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
    manageTokens: vi.fn(async () => {
      throw new Error("unexpected authenticated management");
    }),
    listTokens: vi.fn(() => []),
    createToken: vi.fn(async () => { throw new Error("unexpected create"); }),
    revokeToken: vi.fn(async () => { throw new Error("unexpected revoke"); })
  };
}

type TestMcpOptions = Parameters<typeof createMcpServer>[1] & {
  teamAuthorizationManager?: TeamAuthorizationFileManager;
};

async function connect(options: TestMcpOptions) {
  const client = new Client({ name: "layo-token-management-test", version: "1.0.0" });
  const server = createMcpServer(undefined, options as Parameters<typeof createMcpServer>[1]);
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
