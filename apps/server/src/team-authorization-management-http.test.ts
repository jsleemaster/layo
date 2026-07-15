import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";
import {
  createTeamAuthorizationFileManager,
  watchTeamAuthorizationConfigFile,
  type TeamAuthorizationFileManager
} from "./team-authorization";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("team access token HTTP administration", () => {
  test("creates, lists, and revokes only the authenticated legacy member's token", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-http-"));
    roots.push(root);
    const configPath = path.join(root, "members.json");
    await writeFile(
      configPath,
      JSON.stringify([
        {
          userId: "owner-user",
          role: "owner",
          teamIds: ["team-alpha"],
          token: "legacy-owner-token"
        },
        {
          userId: "other-user",
          role: "editor",
          teamIds: ["team-alpha"],
          token: "other-token"
        }
      ]),
      "utf8"
    );
    const source = await watchTeamAuthorizationConfigFile(configPath);
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      generateId: () => "token-deploy",
      generateSecret: () => "layo_pat_http_secret"
    });
    const manageTokens = vi.spyOn(manager, "manageTokens");
    const server = createHttpServer(new FileStorage(path.join(root, "storage")), {
      libraryRegistryAuth: source.config,
      teamAuthorizationManager: manager
    });

    try {
      const invalid = await server.inject({
        method: "POST",
        url: "/account/tokens",
        headers: credentials("owner-user", "legacy-owner-token"),
        payload: { expiresInDays: 30 }
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({
        error: "team authorization token name is required"
      });

      const created = await server.inject({
        method: "POST",
        url: "/account/tokens",
        headers: credentials("owner-user", "legacy-owner-token"),
        payload: { name: "Deploy automation", expiresInDays: 30 }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toEqual({
        token: "layo_pat_http_secret",
        metadata: {
          id: "token-deploy",
          name: "Deploy automation",
          createdAt: "2026-07-14T12:00:00.000Z",
          expiresAt: "2026-08-13T12:00:00.000Z"
        }
      });

      const listed = await server.inject({
        method: "GET",
        url: "/account/tokens",
        headers: credentials("owner-user", "legacy-owner-token")
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual({ tokens: [created.json().metadata] });
      expect(listed.body).not.toContain("activeTokenId");
      expect(listed.body).not.toContain("layo_pat_http_secret");
      expect(listed.body).not.toContain("tokenHash");
      expect(listed.body).not.toContain("tokenHashes");

      const otherList = await server.inject({
        method: "GET",
        url: "/account/tokens",
        headers: credentials("other-user", "other-token")
      });
      expect(otherList.json()).toEqual({ tokens: [] });

      const revoked = await server.inject({
        method: "DELETE",
        url: "/account/tokens/token-deploy",
        headers: credentials("owner-user", "legacy-owner-token"),
        payload: { confirmSelfRevoke: false }
      });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json()).toEqual({
        metadata: {
          ...created.json().metadata,
          revokedAt: "2026-07-14T12:00:00.000Z"
        }
      });

      const auditContexts = manageTokens.mock.calls.map(([principal]) =>
        (principal as typeof principal & {
          audit?: { source?: string; requestId?: string };
        }).audit
      );
      expect(auditContexts).toHaveLength(5);
      expect(auditContexts.every((audit) => audit?.source === "http")).toBe(true);
      const requestIds = auditContexts.map((audit) => audit?.requestId);
      expect(requestIds.every((requestId) => typeof requestId === "string" && requestId.length > 0))
        .toBe(true);
      expect(new Set(requestIds)).toHaveLength(requestIds.length);
    } finally {
      source.close();
      await server.close();
    }
  });

  test("returns the named principal id and requires confirmation only for active-token revoke", async () => {
    const fixture = await createNamedCredentialFixture();
    try {
      const listed = await fixture.server.inject({
        method: "GET",
        url: "/account/tokens",
        headers: credentials("owner-user", "active-secret")
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual({
        tokens: [
          {
            id: "active-token",
            name: "Current browser",
            createdAt: "2026-07-13T12:00:00.000Z"
          },
          {
            id: "sibling-token",
            name: "Deploy automation",
            createdAt: "2026-07-12T12:00:00.000Z"
          }
        ],
        activeTokenId: "active-token"
      });
      expect(listed.body).not.toContain("active-secret");
      expect(listed.body).not.toContain("tokenHash");
      expect(listed.body).not.toContain("tokenHashes");
      expect(listed.body).not.toContain("operatorNote");

      const blocked = await fixture.server.inject({
        method: "DELETE",
        url: "/account/tokens/active-token",
        headers: credentials("owner-user", "active-secret"),
        payload: { confirmSelfRevoke: false }
      });
      expect(blocked.statusCode).toBe(400);
      expect(blocked.json().error).toContain("confirmSelfRevoke");

      const sibling = await fixture.server.inject({
        method: "DELETE",
        url: "/account/tokens/sibling-token",
        headers: credentials("owner-user", "active-secret"),
        payload: { confirmSelfRevoke: false }
      });
      expect(sibling.statusCode).toBe(200);
      expect(sibling.json()).toEqual({
        metadata: {
          id: "sibling-token",
          name: "Deploy automation",
          createdAt: "2026-07-12T12:00:00.000Z",
          revokedAt: "2026-07-14T12:00:00.000Z"
        }
      });

      const selfRevoked = await fixture.server.inject({
        method: "DELETE",
        url: "/account/tokens/active-token",
        headers: credentials("owner-user", "active-secret"),
        payload: { confirmSelfRevoke: true }
      });
      expect(selfRevoked.statusCode).toBe(200);
      expect(selfRevoked.json()).toEqual({
        metadata: {
          id: "active-token",
          name: "Current browser",
          createdAt: "2026-07-13T12:00:00.000Z",
          revokedAt: "2026-07-14T12:00:00.000Z"
        }
      });
    } finally {
      fixture.source.close();
      await fixture.server.close();
    }
  });

  test.each([
    {
      label: "list",
      request: {
        method: "GET" as const,
        url: "/account/tokens"
      }
    },
    {
      label: "create",
      request: {
        method: "POST" as const,
        url: "/account/tokens",
        payload: { name: "Must not persist", expiresInDays: null }
      }
    },
    {
      label: "revoke",
      request: {
        method: "DELETE" as const,
        url: "/account/tokens/sibling-token",
        payload: { confirmSelfRevoke: false }
      }
    }
  ])("authenticates current file state atomically for $label", async ({ request }) => {
    const fixture = await createNamedCredentialFixture();
    try {
      const persisted = JSON.parse(await readFile(fixture.configPath, "utf8"));
      persisted[0].tokens[0].revokedAt = "2026-07-14T11:59:00.000Z";
      await writeFile(fixture.configPath, JSON.stringify(persisted, null, 2), "utf8");
      const before = await readFile(fixture.configPath, "utf8");

      const response = await fixture.server.inject({
        ...request,
        headers: credentials("owner-user", "active-secret")
      });

      expect(response.statusCode).toBe(401);
      expect(await readFile(fixture.configPath, "utf8")).toBe(before);
    } finally {
      fixture.source.close();
      await fixture.server.close();
    }
  });

  test.each([
    {
      method: "GET" as const,
      url: "/account/tokens"
    },
    {
      method: "POST" as const,
      url: "/account/tokens",
      payload: { name: "Blocked", expiresInDays: 30 }
    },
    {
      method: "DELETE" as const,
      url: "/account/tokens/token-id",
      payload: { confirmSelfRevoke: true }
    }
  ])("keeps $method token administration unavailable without file-backed authorization", async (request) => {
    const manageTokens = vi.fn();
    const manager = {
      manageTokens,
      listTokens: vi.fn(),
      createToken: vi.fn(),
      revokeToken: vi.fn()
    } as unknown as TeamAuthorizationFileManager;
    const server = createHttpServer(new FileStorage(), {
      teamAuthorizationManager: manager
    });
    try {
      const response = await server.inject({
        ...request,
        headers: credentials("owner-user", "legacy-owner-token")
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: "team access token administration requires file-backed authorization"
      });
      expect(manageTokens).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});

async function createNamedCredentialFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "layo-token-http-named-"));
  roots.push(root);
  const configPath = path.join(root, "members.json");
  await writeFile(
    configPath,
    JSON.stringify(
      [{
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "legacy-owner-token",
        tokens: [
          {
            id: "active-token",
            name: "Current browser",
            token: "active-secret",
            createdAt: "2026-07-13T12:00:00.000Z",
            operatorNote: "must never leave the server"
          },
          {
            id: "sibling-token",
            name: "Deploy automation",
            token: "sibling-secret",
            createdAt: "2026-07-12T12:00:00.000Z"
          }
        ]
      }],
      null,
      2
    ),
    "utf8"
  );
  const source = await watchTeamAuthorizationConfigFile(configPath, {
    pollIntervalMs: 60_000
  });
  const manager = createTeamAuthorizationFileManager(configPath, source.config, {
    now: () => new Date("2026-07-14T12:00:00.000Z"),
    generateId: () => "created-token",
    generateSecret: () => "created-secret"
  });
  const server = createHttpServer(new FileStorage(path.join(root, "storage")), {
    libraryRegistryAuth: source.config,
    teamAuthorizationManager: manager
  });
  return { configPath, source, server };
}

function credentials(userId: string, token: string) {
  return {
    "x-layo-user-id": userId,
    authorization: `Bearer ${token}`
  };
}
