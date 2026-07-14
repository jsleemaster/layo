import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  authorizeTeamLibraryRead,
  authorizeTeamLibraryWrite,
  bearerToken,
  parseTeamAuthorizationConfig,
  watchTeamAuthorizationConfigFile,
  watchTeamMemberTokenFile
} from "./team-authorization";

describe("team library authorization", () => {
  test("parses normalized plaintext and SHA-256 member credentials", () => {
    const tokenHash = createHash("sha256").update("hashed-token").digest("hex");
    const config = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: " editor-user ",
          role: "editor",
          teamIds: [" team-beta ", "team-alpha", "team-alpha"],
          token: "editor-token"
        },
        {
          userId: "owner-user",
          role: "owner",
          teamIds: ["team-alpha"],
          tokenHash
        }
      ])
    );

    expect(config).toEqual({
      members: [
        {
          userId: "editor-user",
          role: "editor",
          teamIds: ["team-alpha", "team-beta"],
          token: "editor-token",
          tokenHash: undefined
        },
        {
          userId: "owner-user",
          role: "owner",
          teamIds: ["team-alpha"],
          token: undefined,
          tokenHash
        }
      ]
    });
    expect(authenticateTeamMember(config!, "editor-user", "editor-token")).toMatchObject({
      userId: "editor-user",
      role: "editor"
    });
    expect(authenticateTeamMember(config!, "owner-user", "hashed-token")).toMatchObject({
      userId: "owner-user",
      role: "owner"
    });
  });

  test("rejects blank member and team identifiers at configuration time", () => {
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "   ",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "editor-token"
          }
        ])
      )
    ).toThrow("invalid library registry team member credential");
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "editor-user",
            role: "editor",
            teamIds: ["   "],
            token: "editor-token"
          }
        ])
      )
    ).toThrow("invalid library registry team member credential");
  });

  test("enforces activation, expiry, revocation, and hash rotation windows", () => {
    const rotatedTokenHash = createHash("sha256").update("rotated-token").digest("hex");
    const config = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: "rotating-user",
          role: "editor",
          teamIds: ["team-alpha"],
          token: "legacy-token",
          tokenHashes: [rotatedTokenHash, rotatedTokenHash.toUpperCase()],
          notBefore: "2026-07-14T00:00:00.000Z",
          expiresAt: "2026-07-15T00:00:00.000Z",
          revokedAt: "2026-07-14T18:00:00.000Z"
        }
      ])
    );

    expect(
      authenticateTeamMember(
        config!,
        "rotating-user",
        "legacy-token",
        new Date("2026-07-14T12:00:00.000Z")
      )
    ).toMatchObject({ userId: "rotating-user", role: "editor" });
    expect(
      authenticateTeamMember(
        config!,
        "rotating-user",
        "rotated-token",
        new Date("2026-07-14T12:00:00.000Z")
      )
    ).toMatchObject({ userId: "rotating-user", role: "editor" });
    expect(captureError(() =>
      authenticateTeamMember(
        config!,
        "rotating-user",
        "legacy-token",
        new Date("2026-07-13T23:59:59.999Z")
      )
    )).toMatchObject({ statusCode: 401 });
    expect(captureError(() =>
      authenticateTeamMember(
        config!,
        "rotating-user",
        "legacy-token",
        new Date("2026-07-14T18:00:00.000Z")
      )
    )).toMatchObject({ statusCode: 401 });

    const expired = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: "expired-user",
          role: "editor",
          teamIds: ["team-alpha"],
          token: "expired-token",
          expiresAt: "2020-01-01T00:00:00.000Z"
        }
      ])
    );
    expect(captureError(() =>
      authenticateTeamMember(expired!, "expired-user", "expired-token")
    )).toMatchObject({ statusCode: 401 });
  });

  test("rejects invalid credential lifecycle configuration", () => {
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "editor-user",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "editor-token",
            expiresAt: "not-a-date"
          }
        ])
      )
    ).toThrow("invalid library registry team member expiresAt");
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "editor-user",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "fallback-token",
            tokenHashes: ["not-a-sha256"]
          }
        ])
      )
    ).toThrow("invalid library registry team member tokenHashes");
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "editor-user",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "editor-token",
            notBefore: "2026-07-15T00:00:00.000Z",
            expiresAt: "2026-07-14T00:00:00.000Z"
          }
        ])
      )
    ).toThrow("expiresAt must be after notBefore");
  });

  test("returns stable authentication and authorization failures", () => {
    const config = {
      members: [
        {
          userId: "viewer-user",
          role: "viewer" as const,
          teamIds: ["team-alpha"],
          token: "viewer-token"
        }
      ]
    };

    expect(captureError(() => authenticateTeamMember(config, undefined, undefined))).toMatchObject({
      statusCode: 401
    });
    expect(captureError(() => authenticateTeamMember(config, "viewer-user", "wrong-token"))).toMatchObject({
      statusCode: 401
    });
    const viewer = authenticateTeamMember(config, "viewer-user", "viewer-token");
    expect(() => authorizeTeamLibraryRead(viewer, "team-alpha")).not.toThrow();
    expect(captureError(() => authorizeTeamLibraryRead(viewer, "team-beta"))).toMatchObject({
      statusCode: 403
    });
    expect(captureError(() => authorizeTeamLibraryRead(viewer, undefined))).toMatchObject({
      statusCode: 403
    });
    expect(captureError(() => authorizeTeamLibraryWrite(viewer, "team-alpha"))).toMatchObject({
      statusCode: 403
    });
    expect(captureError(() => authorizeTeamLibraryWrite({ ...viewer, role: "editor" }, "team-beta"))).toMatchObject({
      statusCode: 403
    });
    expect(captureError(() => authorizeTeamLibraryWrite({ ...viewer, role: "editor" }, undefined))).toMatchObject({
      statusCode: 403
    });
  });

  test("extracts only bearer authorization headers", () => {
    expect(bearerToken("Bearer member-token")).toBe("member-token");
    expect(bearerToken(["Bearer first-token", "Bearer second-token"])).toBe("first-token");
    expect(bearerToken("Basic member-token")).toBeUndefined();
  });

  test("reloads rotated credentials from a watched team authorization file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-auth-"));
    const configPath = path.join(root, "members.json");
    await writeFile(configPath, credentialJson("legacy-token"), "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, { pollIntervalMs: 10 });

    try {
      expect(
        authenticateTeamMember(source.config, "editor-user", "legacy-token")
      ).toMatchObject({ userId: "editor-user", role: "editor" });

      await writeFile(configPath, credentialJson("rotated-token"), "utf8");
      await waitForAuthentication(source.config, "rotated-token");

      expect(captureError(() =>
        authenticateTeamMember(source.config, "editor-user", "legacy-token")
      )).toMatchObject({ statusCode: 401 });
      expect(
        authenticateTeamMember(source.config, "editor-user", "rotated-token")
      ).toMatchObject({ userId: "editor-user", role: "editor" });
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reloads an MCP principal token from a watched secret file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-token-"));
    const tokenPath = path.join(root, "member-token");
    await writeFile(tokenPath, "legacy-token\n", "utf8");
    const source = await watchTeamMemberTokenFile(tokenPath, { pollIntervalMs: 10 });

    try {
      expect(source.token.value).toBe("legacy-token");
      await writeFile(tokenPath, "rotated-token\n", "utf8");
      await waitFor(() => source.token.value === "rotated-token");
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("retains the last valid MCP principal token when the watched secret becomes blank", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-token-"));
    const tokenPath = path.join(root, "member-token");
    await writeFile(tokenPath, "stable-token\n", "utf8");
    const reloadErrors: Error[] = [];
    const source = await watchTeamMemberTokenFile(tokenPath, {
      pollIntervalMs: 10,
      onError: (error) => reloadErrors.push(error)
    });

    try {
      await writeFile(tokenPath, "   \n", "utf8");
      await waitFor(() => reloadErrors.length > 0);
      expect(source.token.value).toBe("stable-token");
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("retains the last valid credentials when a watched file becomes malformed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-auth-"));
    const configPath = path.join(root, "members.json");
    await writeFile(configPath, credentialJson("stable-token"), "utf8");
    const reloadErrors: Error[] = [];
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10,
      onError: (error) => reloadErrors.push(error)
    });

    try {
      await writeFile(configPath, "{ malformed", "utf8");
      await waitFor(() => reloadErrors.length === 1);

      expect(
        authenticateTeamMember(source.config, "editor-user", "stable-token")
      ).toMatchObject({ userId: "editor-user", role: "editor" });
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

});

function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("expected callback to throw");
}


function credentialJson(token: string): string {
  return JSON.stringify([
    {
      userId: "editor-user",
      role: "editor",
      teamIds: ["team-alpha"],
      token
    }
  ]);
}

async function waitForAuthentication(
  config: NonNullable<ReturnType<typeof parseTeamAuthorizationConfig>>,
  token: string
): Promise<void> {
  await waitFor(() => {
    try {
      authenticateTeamMember(config, "editor-user", token);
      return true;
    } catch {
      return false;
    }
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for watched authorization reload");
}
