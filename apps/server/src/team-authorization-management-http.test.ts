import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";
import {
  createTeamAuthorizationFileManager,
  watchTeamAuthorizationConfigFile
} from "./team-authorization";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("team access token HTTP administration", () => {
  test("creates, lists, and revokes only the authenticated member's token", async () => {
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
      expect(listed.body).not.toContain("layo_pat_http_secret");
      expect(listed.body).not.toContain("tokenHash");

      const otherList = await server.inject({
        method: "GET",
        url: "/account/tokens",
        headers: credentials("other-user", "other-token")
      });
      expect(otherList.json()).toEqual({ tokens: [] });

      const revoked = await server.inject({
        method: "DELETE",
        url: "/account/tokens/token-deploy",
        headers: credentials("owner-user", "legacy-owner-token")
      });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json().metadata).toMatchObject({
        id: "token-deploy",
        revokedAt: "2026-07-14T12:00:00.000Z"
      });
    } finally {
      source.close();
      await server.close();
    }
  });

  test("keeps token administration unavailable without an operator-owned file manager", async () => {
    const server = createHttpServer(new FileStorage(), {
      libraryRegistryAuth: {
        members: [{
          userId: "owner-user",
          role: "owner",
          teamIds: ["team-alpha"],
          token: "legacy-owner-token"
        }]
      }
    });
    try {
      const response = await server.inject({
        method: "GET",
        url: "/account/tokens",
        headers: credentials("owner-user", "legacy-owner-token")
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: "team access token administration requires file-backed authorization"
      });
    } finally {
      await server.close();
    }
  });
});

function credentials(userId: string, token: string) {
  return {
    "x-layo-user-id": userId,
    authorization: `Bearer ${token}`
  };
}
