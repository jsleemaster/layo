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
      await rm(root, { recursive: true, force: true });
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
