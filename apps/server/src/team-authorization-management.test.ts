import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  createTeamAuthorizationFileManager,
  watchTeamAuthorizationConfigFile
} from "./team-authorization";

describe("team access token administration", () => {
  test("creates a named token while returning its secret only once", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-admin-"));
    const configPath = path.join(root, "members.json");
    const base = ownerConfig();
    await writeFile(configPath, base, "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10
    });
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      generateId: () => "token-deploy",
      generateSecret: () => "layo_pat_one_time_secret"
    });

    try {
      const created = await manager.createToken("owner-user", {
        name: "Deploy automation",
        expiresInDays: 30
      });

      expect(created).toEqual({
        token: "layo_pat_one_time_secret",
        metadata: {
          id: "token-deploy",
          name: "Deploy automation",
          createdAt: "2026-07-14T12:00:00.000Z",
          expiresAt: "2026-08-13T12:00:00.000Z"
        }
      });
      expect(manager.listTokens("owner-user")).toEqual([created.metadata]);
      expect(manager.listTokens("owner-user")[0]).not.toHaveProperty("token");
      expect(manager.listTokens("owner-user")[0]).not.toHaveProperty("tokenHash");

      expect(await readFile(configPath, "utf8")).toBe(base);
      const persisted = await readFile(`${configPath}.tokens.json`, "utf8");
      expect(persisted).not.toContain("layo_pat_one_time_secret");
      expect(persisted).not.toMatch(/"token"\\s*:/);
      expect(persisted).toContain(
        createHash("sha256").update("layo_pat_one_time_secret").digest("hex")
      );
      expect(
        authenticateTeamMember(
          source.config,
          "owner-user",
          "layo_pat_one_time_secret"
        )
      ).toMatchObject({
        userId: "owner-user",
        tokenId: "token-deploy",
        tokenName: "Deploy automation"
      });
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("revokes one managed token durably without invalidating its sibling", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-admin-"));
    const configPath = path.join(root, "members.json");
    await writeFile(configPath, ownerConfig(), "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10
    });
    const ids = ["token-primary", "token-preview"];
    const secrets = ["layo_pat_primary", "layo_pat_preview"];
    let now = new Date("2026-07-14T12:00:00.000Z");
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => now,
      generateId: () => ids.shift()!,
      generateSecret: () => secrets.shift()!
    });

    try {
      await manager.createToken("owner-user", {
        name: "Primary automation",
        expiresInDays: null
      });
      await manager.createToken("owner-user", {
        name: "Preview automation",
        expiresInDays: 60
      });

      now = new Date("2026-07-15T09:30:00.000Z");
      const revoked = await manager.revokeToken("owner-user", "token-primary");
      expect(revoked).toMatchObject({
        id: "token-primary",
        revokedAt: "2026-07-15T09:30:00.000Z"
      });
      expect(() =>
        authenticateTeamMember(source.config, "owner-user", "layo_pat_primary", now)
      ).toThrow("team member credentials are invalid");
      expect(
        authenticateTeamMember(source.config, "owner-user", "layo_pat_preview", now)
      ).toMatchObject({ tokenId: "token-preview" });

      source.close();
      const restarted = await watchTeamAuthorizationConfigFile(configPath, {
        pollIntervalMs: 10
      });
      try {
        expect(() =>
          authenticateTeamMember(restarted.config, "owner-user", "layo_pat_primary", now)
        ).toThrow("team member credentials are invalid");
        expect(
          authenticateTeamMember(restarted.config, "owner-user", "layo_pat_preview", now)
        ).toMatchObject({ tokenId: "token-preview" });
      } finally {
        restarted.close();
      }
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("preserves operator changes written before the watcher reloads them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-admin-"));
    const configPath = path.join(root, "members.json");
    await writeFile(configPath, ownerConfig(), "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 60_000
    });
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      generateId: () => "token-after-operator-edit",
      generateSecret: () => "layo_pat_after_operator_edit"
    });

    try {
      const operatorConfig = JSON.stringify(
        [
          {
            userId: "owner-user",
            role: "owner",
            teamIds: ["team-alpha"],
            token: "legacy-owner-token",
            revokedAt: "2026-07-15T10:00:00.000Z"
          },
          {
            userId: "new-editor",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "operator-added-token"
          }
        ],
        null,
        2
      );
      await writeFile(configPath, operatorConfig, "utf8");

      await manager.createToken("owner-user", {
        name: "Created after operator edit",
        expiresInDays: 30
      });

      const persisted = await readFile(configPath, "utf8");
      expect(persisted).toContain('"revokedAt": "2026-07-15T10:00:00.000Z"');
      expect(persisted).toContain('"userId": "new-editor"');
      expect(() =>
        authenticateTeamMember(
          source.config,
          "owner-user",
          "legacy-owner-token",
          new Date("2026-07-15T12:00:00.000Z")
        )
      ).toThrow("team member credentials are invalid");
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects unknown members and duplicate generated ids without changing the file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-admin-"));
    const configPath = path.join(root, "members.json");
    const initial = ownerConfigWithExistingToken();
    await writeFile(configPath, initial, "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath);
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      generateId: () => "existing-token",
      generateSecret: () => "layo_pat_unused"
    });

    try {
      await expect(
        manager.createToken("missing-user", { name: "Unknown", expiresInDays: 30 })
      ).rejects.toThrow("team authorization member was not found");

      await expect(
        manager.createToken("owner-user", { name: "Duplicate", expiresInDays: 30 })
      ).rejects.toThrow("team authorization token id already exists");
      expect(await readFile(configPath, "utf8")).toBe(initial);
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  test("preserves a concurrent operator rewrite and leaves the issued token unusable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-admin-"));
    const configPath = path.join(root, "members.json");
    await writeFile(configPath, ownerConfigWithExistingToken(), "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 60_000
    });
    const operatorMembers = JSON.parse(ownerConfigWithExistingToken());
    operatorMembers[0].tokens[0].revokedAt = "2026-07-14T11:59:00.000Z";
    const operatorConfig = `${JSON.stringify(operatorMembers, null, 2)}\n`;
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      generateId: () => {
        writeFileSync(configPath, operatorConfig, "utf8");
        return "token-after-authentication";
      },
      generateSecret: () => "layo_pat_must_not_persist"
    });

    try {
      await expect(
        manager.manageTokens(
          { userId: "owner-user", memberToken: "existing-secret" },
          {
            type: "create",
            input: { name: "Concurrent create", expiresInDays: 30 }
          }
        )
      ).rejects.toMatchObject({
        message: "team authorization file changed during token management",
        statusCode: 409
      });
      const persistedBase = await readFile(configPath, "utf8");
      expect(persistedBase).toBe(operatorConfig);
      expect(persistedBase).not.toContain("layo_pat_must_not_persist");
      await expect(
        readFile(`${configPath}.tokens.json`, "utf8")
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });


  test("returns the active named token id only from atomic list authentication", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-admin-"));
    const configPath = path.join(root, "members.json");
    await writeFile(configPath, ownerConfigWithExistingToken(), "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 60_000
    });
    const manager = createTeamAuthorizationFileManager(configPath, source.config);

    try {
      await expect(
        manager.manageTokens(
          { userId: "owner-user", memberToken: "existing-secret" },
          { type: "list" }
        )
      ).resolves.toEqual({
        type: "list",
        tokens: [{
          id: "existing-token",
          name: "Existing",
          createdAt: "2026-07-14T00:00:00.000Z"
        }],
        activeTokenId: "existing-token"
      });

      await expect(
        manager.manageTokens(
          { userId: "owner-user", memberToken: "legacy-owner-token" },
          { type: "list" }
        )
      ).resolves.toEqual({
        type: "list",
        tokens: [{
          id: "existing-token",
          name: "Existing",
          createdAt: "2026-07-14T00:00:00.000Z"
        }]
      });
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

});

function ownerConfigWithExistingToken(): string {
  return JSON.stringify(
    [
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "legacy-owner-token",
        tokens: [
          {
            id: "existing-token",
            name: "Existing",
            tokenHash: createHash("sha256").update("existing-secret").digest("hex"),
            createdAt: "2026-07-14T00:00:00.000Z"
          }
        ]
      }
    ],
    null,
    2
  );
}

function ownerConfig(): string {
  return JSON.stringify(
    [
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "legacy-owner-token"
      }
    ],
    null,
    2
  );
}
