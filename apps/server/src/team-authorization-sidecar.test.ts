import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  createTeamAuthorizationFileManager,
  watchTeamAuthorizationConfigFile
} from "./team-authorization";

describe("team authorization managed token sidecar", () => {
  test("never overwrites a non-cooperating base rewrite after authentication", async () => {
    const setup = await fixture(baseMembers());
    const operatorBase = JSON.stringify([
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "legacy-owner-token",
        revokedAt: "2026-07-15T10:00:00.000Z"
      },
      {
        userId: "operator-editor",
        role: "editor",
        teamIds: ["team-alpha"],
        token: "operator-secret"
      }
    ], null, 2);
    const manager = createTeamAuthorizationFileManager(
      setup.basePath,
      setup.source.config,
      {
        now: () => new Date("2026-07-15T12:00:00.000Z"),
        generateId: () => {
          writeFileSync(setup.basePath, operatorBase, "utf8");
          return "post-auth-token";
        },
        generateSecret: () => "post-auth-secret"
      }
    );

    try {
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "base-secret" },
        {
          type: "create",
          input: { name: "Post auth", expiresInDays: null }
        }
      )).rejects.toMatchObject({
        message: "team authorization file changed during token management",
        statusCode: 409
      });
      const persistedBase = await readFile(setup.basePath, "utf8");
      expect(persistedBase).toBe(operatorBase);
      expect(persistedBase).not.toContain("post-auth-secret");
      await expect(
        readFile(sidecarPath(setup.basePath), "utf8")
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await setup.close();
    }
  });

  test("merges base and sidecar authentication, revokes only the target, and persists restart", async () => {
    const base = baseMembers();
    const setup = await fixture(base);
    let now = new Date("2026-07-14T12:00:00.000Z");
    const manager = createTeamAuthorizationFileManager(
      setup.basePath,
      setup.source.config,
      {
        now: () => now,
        generateId: () => "managed-token",
        generateSecret: () => "managed-secret"
      }
    );

    try {
      await manager.createToken("owner-user", {
        name: "Managed token",
        expiresInDays: null
      });
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "managed-secret" },
        { type: "list" }
      )).resolves.toEqual({
        type: "list",
        tokens: [
          {
            id: "base-token",
            name: "Base token",
            createdAt: "2026-07-14T00:00:00.000Z"
          },
          {
            id: "base-sibling",
            name: "Base sibling",
            createdAt: "2026-07-14T01:00:00.000Z"
          },
          {
            id: "managed-token",
            name: "Managed token",
            createdAt: "2026-07-14T12:00:00.000Z"
          }
        ],
        activeTokenId: "managed-token"
      });

      now = new Date("2026-07-15T09:30:00.000Z");
      await manager.revokeToken("owner-user", "base-token");
      expect(await readFile(setup.basePath, "utf8")).toBe(base);
      expect(() =>
        authenticateTeamMember(setup.source.config, "owner-user", "base-secret", now)
      ).toThrow("team member credentials are invalid");
      expect(
        authenticateTeamMember(setup.source.config, "owner-user", "sibling-secret", now)
      ).toMatchObject({ tokenId: "base-sibling" });
      expect(
        authenticateTeamMember(setup.source.config, "owner-user", "managed-secret", now)
      ).toMatchObject({ tokenId: "managed-token" });

      const sidecar = await readFile(sidecarPath(setup.basePath), "utf8");
      expect(sidecar).not.toContain("base-secret");
      expect(sidecar).not.toContain("sibling-secret");
      expect(sidecar).not.toContain("managed-secret");

      setup.source.close();
      const restarted = await watchTeamAuthorizationConfigFile(setup.basePath);
      try {
        expect(() =>
          authenticateTeamMember(restarted.config, "owner-user", "base-secret", now)
        ).toThrow("team member credentials are invalid");
        expect(
          authenticateTeamMember(restarted.config, "owner-user", "sibling-secret", now)
        ).toMatchObject({ tokenId: "base-sibling" });
        expect(
          authenticateTeamMember(restarted.config, "owner-user", "managed-secret", now)
        ).toMatchObject({ tokenId: "managed-token" });
      } finally {
        restarted.close();
      }
    } finally {
      await setup.close();
    }
  });

  test("fails closed when the sidecar is malformed at startup", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-sidecar-bad-"));
    const basePath = path.join(root, "members.json");
    await writeFile(basePath, baseMembers(), "utf8");
    await writeFile(sidecarPath(basePath), "{not-json", "utf8");

    try {
      await expect(watchTeamAuthorizationConfigFile(basePath)).rejects.toThrow();
    } finally {
      await rm(root, {\n        recursive: true,\n        force: true,\n        maxRetries: 20,\n        retryDelay: 10\n      });
    }
  });

  test("fails closed when a plaintext sidecar appears after startup", async () => {
    const setup = await fixture(baseMembers(), 60_000);
    const manager = createTeamAuthorizationFileManager(
      setup.basePath,
      setup.source.config
    );

    try {
      await writeFile(sidecarPath(setup.basePath), JSON.stringify({
        members: [{
          userId: "owner-user",
          tokens: [{ id: "bad", name: "Bad", token: "plaintext" }]
        }]
      }), "utf8");
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "legacy-owner-token" },
        { type: "list" }
      )).rejects.toThrow();
    } finally {
      await setup.close();
    }
  });

  test("quarantines a token minted when the base changes after the freshness read", async () => {
    const setup = await fixture(baseMembers(), 60_000);
    const operatorBase = JSON.stringify([
      {
        userId: "owner-user",
        role: "viewer",
        teamIds: ["team-alpha"],
        token: "rotated-operator-secret"
      }
    ], null, 2);
    let hookCalled = false;
    const options = {
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      generateId: () => "final-window-token",
      generateSecret: () => "final-window-secret",
      beforeSidecarRename: async () => {
        hookCalled = true;
        await writeFile(setup.basePath, operatorBase, "utf8");
      }
    } as Parameters<typeof createTeamAuthorizationFileManager>[2] & {
      beforeSidecarRename: () => Promise<void>;
    };
    const manager = createTeamAuthorizationFileManager(
      setup.basePath,
      setup.source.config,
      options
    );

    try {
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "base-secret" },
        {
          type: "create",
          input: { name: "Final window", expiresInDays: null }
        }
      )).rejects.toMatchObject({ statusCode: 409 });
      expect(hookCalled).toBe(true);
      expect(await readFile(setup.basePath, "utf8")).toBe(operatorBase);
      const sidecar = await readFile(sidecarPath(setup.basePath), "utf8");
      expect(sidecar).toContain('"quarantined": true');
      expect(sidecar).not.toContain("final-window-secret");
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "final-window-secret" },
        { type: "list" }
      )).rejects.toThrow();
    } finally {
      await setup.close();
    }
  });

  test("does not resurrect managed tokens after a removed user id is reintroduced", async () => {
    const originalBase = baseMembers();
    const setup = await fixture(originalBase);
    const ids = ["dormant-token", "fresh-token"];
    const secrets = ["dormant-secret", "fresh-secret"];
    const manager = createTeamAuthorizationFileManager(
      setup.basePath,
      setup.source.config,
      {
        now: () => new Date("2026-07-15T12:00:00.000Z"),
        generateId: () => ids.shift()!,
        generateSecret: () => secrets.shift()!
      }
    );

    try {
      await manager.createToken("owner-user", {
        name: "Dormant token",
        expiresInDays: null
      });
      await writeFile(setup.basePath, JSON.stringify([
        {
          userId: "replacement-user",
          role: "owner",
          teamIds: ["team-alpha"],
          token: "replacement-secret"
        }
      ]), "utf8");
      await waitFor(() => authenticationFails(
        setup.source.config,
        "owner-user",
        "legacy-owner-token"
      ));

      await writeFile(setup.basePath, originalBase, "utf8");
      await waitFor(() => authenticationFails(
        setup.source.config,
        "owner-user",
        "legacy-owner-token"
      ));

      await manager.manageTokens(
        { userId: "owner-user", memberToken: "legacy-owner-token" },
        {
          type: "create",
          input: { name: "Fresh generation", expiresInDays: null }
        }
      );
      expect(manager.listTokens("owner-user").map((token) => token.id)).toEqual([
        "base-token",
        "base-sibling",
        "fresh-token"
      ]);
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "dormant-secret" },
        { type: "list" }
      )).rejects.toThrow();
      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "fresh-secret" },
        { type: "list" }
      )).resolves.toMatchObject({ activeTokenId: "fresh-token" });
    } finally {
      await setup.close();
    }
  });

  test.each([
    {
      label: "malformed JSON",
      content: "{not-json"
    },
    {
      label: "plaintext credential",
      content: JSON.stringify({
        version: 1,
        members: [{
          userId: "owner-user",
          tokens: [{ id: "bad", name: "Bad", token: "plaintext" }],
          revocations: []
        }]
      })
    },
    {
      label: "conflicting token id",
      content: JSON.stringify({
        version: 1,
        members: [{
          userId: "owner-user",
          tokens: [{
            id: "base-token",
            name: "Conflict",
            tokenHash: hash("conflict-secret")
          }],
          revocations: []
        }]
      })
    }
  ])("fails cached authentication closed for $label sidecar and recovers after repair", async ({
    content
  }) => {
    const setup = await fixture(baseMembers());

    try {
      await writeFile(sidecarPath(setup.basePath), content, "utf8");
      await waitFor(() => authenticationFails(
        setup.source.config,
        "owner-user",
        "legacy-owner-token"
      ));

      await rm(sidecarPath(setup.basePath), { force: true });
      await waitFor(() => !authenticationFails(
        setup.source.config,
        "owner-user",
        "legacy-owner-token"
      ));
    } finally {
      await setup.close();
    }
  });

  test("does not report revoke success before file and directory sync complete", async () => {
    const setup = await fixture(baseMembers());
    const setupManager = createTeamAuthorizationFileManager(
      setup.basePath,
      setup.source.config,
      {
        now: () => new Date("2026-07-15T12:00:00.000Z"),
        generateId: () => "durable-token",
        generateSecret: () => "durable-secret"
      }
    );

    try {
      await setupManager.createToken("owner-user", {
        name: "Durable token",
        expiresInDays: null
      });
      expect((await stat(sidecarPath(setup.basePath))).mode & 0o777).toBe(0o600);

      const syncEvents: string[] = [];
      const options = {
        now: () => new Date("2026-07-16T12:00:00.000Z"),
        syncFile: async (handle: { sync: () => Promise<void> }) => {
          syncEvents.push("file");
          await handle.sync();
        },
        syncDirectory: async () => {
          syncEvents.push("directory");
          throw new Error("directory sync failed");
        }
      } as Parameters<typeof createTeamAuthorizationFileManager>[2] & {
        syncFile: (handle: { sync: () => Promise<void> }) => Promise<void>;
        syncDirectory: (directoryPath: string) => Promise<void>;
      };
      const manager = createTeamAuthorizationFileManager(
        setup.basePath,
        setup.source.config,
        options
      );

      await expect(manager.manageTokens(
        { userId: "owner-user", memberToken: "legacy-owner-token" },
        { type: "revoke", tokenId: "durable-token" }
      )).rejects.toThrow("directory sync failed");
      expect(syncEvents).toEqual(["file", "directory"]);
    } finally {
      await setup.close();
    }
  });

});

async function fixture(base: string, pollIntervalMs = 10) {
  const root = await mkdtemp(path.join(tmpdir(), "layo-token-sidecar-"));
  const basePath = path.join(root, "members.json");
  await writeFile(basePath, base, "utf8");
  const source = await watchTeamAuthorizationConfigFile(basePath, {
    pollIntervalMs
  });
  return {
    basePath,
    source,
    close: async () => {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  };
}


async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for authorization state");
}

function authenticationFails(
  config: Parameters<typeof authenticateTeamMember>[0],
  userId: string,
  token: string
): boolean {
  try {
    authenticateTeamMember(config, userId, token);
    return false;
  } catch {
    return true;
  }
}

function sidecarPath(basePath: string): string {
  return `${basePath}.tokens.json`;
}

function baseMembers(): string {
  return JSON.stringify([
    {
      userId: "owner-user",
      role: "owner",
      teamIds: ["team-alpha"],
      token: "legacy-owner-token",
      tokens: [
        {
          id: "base-token",
          name: "Base token",
          tokenHash: hash("base-secret"),
          createdAt: "2026-07-14T00:00:00.000Z"
        },
        {
          id: "base-sibling",
          name: "Base sibling",
          tokenHash: hash("sibling-secret"),
          createdAt: "2026-07-14T01:00:00.000Z"
        }
      ]
    }
  ], null, 2);
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

