import { createHash } from "node:crypto";
import { unwatchFile } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  authorizeTeamLibraryRead,
  authorizeTeamLibraryWrite,
  bearerToken,
  createTeamAuthorizationFileManager,
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

  test("authenticates a named token record and reports its stable identity", () => {
    const tokenHash = createHash("sha256").update("deploy-secret").digest("hex");
    const config = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: "automation-user",
          role: "editor",
          teamIds: ["team-alpha"],
          tokens: [
            {
              id: "deploy",
              name: "Deploy automation",
              tokenHash,
              expiresAt: "2026-07-15T00:00:00.000Z"
            },
            {
              id: "preview",
              name: "Preview automation",
              token: "preview-secret"
            }
          ]
        }
      ])
    );

    expect(
      authenticateTeamMember(
        config!,
        "automation-user",
        "deploy-secret",
        new Date("2026-07-14T12:00:00.000Z")
      )
    ).toMatchObject({
      userId: "automation-user",
      role: "editor",
      tokenId: "deploy",
      tokenName: "Deploy automation"
    });
  });

  test("revokes one named token without invalidating its sibling", () => {
    const config = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: "automation-user",
          role: "editor",
          teamIds: ["team-alpha"],
          token: "retired-secret",
          tokens: [
            {
              id: "revoked-deploy",
              name: "Retired deploy key",
              token: "retired-secret",
              revokedAt: "2026-07-14T10:00:00.000Z"
            },
            {
              id: "active-preview",
              name: "Preview key",
              token: "preview-secret"
            }
          ]
        }
      ])
    );
    const now = new Date("2026-07-14T12:00:00.000Z");

    expect(captureError(() =>
      authenticateTeamMember(config!, "automation-user", "retired-secret", now)
    )).toMatchObject({ statusCode: 401 });
    expect(
      authenticateTeamMember(config!, "automation-user", "preview-secret", now)
    ).toMatchObject({ tokenId: "active-preview", tokenName: "Preview key" });
  });

  test("denies a shared secret when any matching named token is inactive", () => {
    const config = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: "automation-user",
          role: "editor",
          teamIds: ["team-alpha"],
          tokens: [
            {
              id: "active-first",
              name: "Active duplicate",
              token: "shared-secret"
            },
            {
              id: "revoked-second",
              name: "Revoked duplicate",
              token: "shared-secret",
              revokedAt: "2026-07-14T10:00:00.000Z"
            }
          ]
        }
      ])
    );

    expect(captureError(() =>
      authenticateTeamMember(
        config!,
        "automation-user",
        "shared-secret",
        new Date("2026-07-14T12:00:00.000Z")
      )
    )).toMatchObject({ statusCode: 401 });
  });

  test("rejects duplicate named token ids for one member", () => {
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "automation-user",
            role: "editor",
            teamIds: ["team-alpha"],
            tokens: [
              { id: "deploy", name: "Primary", token: "first-secret" },
              { id: "deploy", name: "Replacement", token: "second-secret" }
            ]
          }
        ])
      )
    ).toThrow("duplicate library registry team member token id");
  });

  test("reloads individual named-token revocation without restarting", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-token-record-"));
    const configPath = path.join(root, "members.json");
    const members = (revokedAt?: string) => JSON.stringify([
      {
        userId: "automation-user",
        role: "editor",
        teamIds: ["team-alpha"],
        tokens: [
          {
            id: "deploy",
            name: "Deploy automation",
            token: "deploy-secret",
            ...(revokedAt ? { revokedAt } : {})
          },
          {
            id: "preview",
            name: "Preview automation",
            token: "preview-secret"
          }
        ]
      }
    ]);
    await writeFile(configPath, members(), "utf8");
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10
    });

    try {
      expect(
        authenticateTeamMember(source.config, "automation-user", "deploy-secret")
      ).toMatchObject({ tokenId: "deploy" });

      await writeFile(
        configPath,
        members(new Date(Date.now() - 1_000).toISOString()),
        "utf8"
      );
      await waitFor(() => {
        try {
          authenticateTeamMember(source.config, "automation-user", "deploy-secret");
          return false;
        } catch {
          return true;
        }
      });

      expect(
        authenticateTeamMember(source.config, "automation-user", "preview-secret")
      ).toMatchObject({ tokenId: "preview" });
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("retries a transient truncated revocation write without another watcher event", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-token-retry-"));
    const configPath = path.join(root, "members.json");
    const members = (revokedAt?: string) => JSON.stringify([
      {
        userId: "automation-user",
        role: "editor",
        teamIds: ["team-alpha"],
        tokens: [
          {
            id: "deploy",
            name: "Deploy automation",
            token: "deploy-secret",
            ...(revokedAt ? { revokedAt } : {})
          },
          {
            id: "preview",
            name: "Preview automation",
            token: "preview-secret"
          }
        ]
      }
    ]);
    const completedConfig = members(new Date(Date.now() - 1_000).toISOString());
    await writeFile(configPath, members(), "utf8");
    const reloadErrors: Error[] = [];
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10,
      onError: (error) => {
        reloadErrors.push(error);
        unwatchFile(configPath);
      }
    });

    try {
      await writeFile(
        configPath,
        completedConfig.slice(0, Math.floor(completedConfig.length / 2)),
        "utf8"
      );
      await waitFor(() => reloadErrors.length >= 2);

      expect(() =>
        authenticateTeamMember(source.config, "automation-user", "preview-secret")
      ).toThrow("team member credentials are invalid");

      await writeFile(configPath, completedConfig, "utf8");
      await waitFor(() => {
        try {
          return authenticateTeamMember(
            source.config,
            "automation-user",
            "preview-secret"
          ).tokenId === "preview";
        } catch {
          return false;
        }
      });

      expect(() =>
        authenticateTeamMember(source.config, "automation-user", "deploy-secret")
      ).toThrow("team member credentials are invalid");
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
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

  test("fails cached authentication closed while a watched file is malformed and recovers after repair", async () => {
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
      await waitFor(() => reloadErrors.length > 0);

      expect(() =>
        authenticateTeamMember(source.config, "editor-user", "stable-token")
      ).toThrow("team member credentials are invalid");

      await writeFile(configPath, credentialJson("recovered-token"), "utf8");
      await waitFor(() => {
        try {
          return authenticateTeamMember(
            source.config,
            "editor-user",
            "recovered-token"
          ).userId === "editor-user";
        } catch {
          return false;
        }
      });
      expect(() =>
        authenticateTeamMember(source.config, "editor-user", "stable-token")
      ).toThrow("team member credentials are invalid");
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });


  test("starts with a quarantined v1 sidecar so a valid base credential can reconcile it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-auth-v1-recovery-"));
    const configPath = path.join(root, "members.json");
    const operatorRevokedSecret = "operator-revoked-secret";
    const baseMember = {
      userId: "recovery-user",
      role: "owner" as const,
      teamIds: ["team-alpha"],
      token: "recovery-base-token",
      tokens: [
        {
          id: "operator-revoked",
          name: "Operator token",
          tokenHash: createHash("sha256").update(operatorRevokedSecret).digest("hex")
        }
      ]
    };
    await writeFile(configPath, JSON.stringify([baseMember]), "utf8");
    await writeFile(
      configPath + ".tokens.json",
      JSON.stringify({
        version: 1,
        members: [
          {
            userId: "recovery-user",
            tokens: [
              {
                id: "legacy-managed",
                name: "Legacy managed token",
                tokenHash: createHash("sha256")
                  .update("legacy-managed-secret")
                  .digest("hex")
              }
            ],
            revocations: [
              {
                tokenId: "operator-revoked",
                revokedAt: "2026-07-14T10:00:00.000Z"
              }
            ]
          }
        ]
      }),
      "utf8"
    );

    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 60_000
    });
    try {
      expect(authenticationSucceeds(
        source.config,
        "recovery-user",
        "recovery-base-token"
      )).toBe(true);
      expect(authenticationSucceeds(
        source.config,
        "recovery-user",
        "legacy-managed-secret"
      )).toBe(false);
      expect(authenticationSucceeds(
        source.config,
        "recovery-user",
        operatorRevokedSecret
      )).toBe(false);

      const manager = createTeamAuthorizationFileManager(configPath, source.config, {
        now: () => new Date("2026-07-14T12:00:00.000Z"),
        generateId: () => "recovered-generation",
        generateSecret: () => "recovered-generation-secret"
      });
      await expect(manager.manageTokens(
        { userId: "recovery-user", memberToken: "recovery-base-token" },
        {
          type: "create",
          input: { name: "Recovered generation", expiresInDays: null }
        }
      )).resolves.toMatchObject({
        type: "create",
        created: { metadata: { id: "recovered-generation" } }
      });

      expect(authenticationSucceeds(
        source.config,
        "recovery-user",
        "recovered-generation-secret"
      )).toBe(true);
      expect(authenticationSucceeds(
        source.config,
        "recovery-user",
        "legacy-managed-secret"
      )).toBe(false);
      expect(authenticationSucceeds(
        source.config,
        "recovery-user",
        operatorRevokedSecret
      )).toBe(false);
      await waitForSidecarMember(configPath, "recovery-user", false);
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("restores surviving principals before reporting a successful watched quarantine", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-auth-immediate-recovery-"));
    const configPath = path.join(root, "members.json");
    const removedMember = {
      userId: "removed-user",
      role: "editor" as const,
      teamIds: ["team-alpha"],
      token: "removed-base-token"
    };
    const survivingMember = {
      userId: "surviving-user",
      role: "editor" as const,
      teamIds: ["team-alpha"],
      token: "surviving-base-token"
    };
    await writeFile(configPath, JSON.stringify([removedMember, survivingMember]), "utf8");
    const quarantineErrors: Error[] = [];
    let survivorActiveWhenQuarantineReported: boolean | undefined;
    let sourceConfig:
      | NonNullable<ReturnType<typeof parseTeamAuthorizationConfig>>
      | undefined;
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10,
      onError: (error) => {
        quarantineErrors.push(error);
        if (
          error.message === "team authorization token sidecar member was removed"
          && sourceConfig
        ) {
          survivorActiveWhenQuarantineReported = authenticationSucceeds(
            sourceConfig,
            "surviving-user",
            "surviving-base-token"
          );
        }
      }
    });
    sourceConfig = source.config;
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      generateId: () => "removed-managed",
      generateSecret: () => "removed-managed-secret"
    });

    try {
      await manager.createToken("removed-user", {
        name: "Removed managed token",
        expiresInDays: null
      });

      await writeFile(configPath, JSON.stringify([survivingMember]), "utf8");
      await waitFor(() => quarantineErrors.some(
        (error) => error.message === "team authorization token sidecar member was removed"
      ));

      expect(survivorActiveWhenQuarantineReported).toBe(true);
      expect(authenticationSucceeds(
        source.config,
        "removed-user",
        "removed-managed-secret"
      )).toBe(false);
      await waitForSidecarMember(configPath, "removed-user", true);
    } finally {
      source.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("quarantines a removed member without locking out survivors or resurrecting managed tokens", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-team-auth-member-removal-"));
    const configPath = path.join(root, "members.json");
    const removedMember = {
      userId: "removed-user",
      role: "editor" as const,
      teamIds: ["team-alpha"],
      token: "removed-base-token"
    };
    const survivingMember = {
      userId: "surviving-user",
      role: "editor" as const,
      teamIds: ["team-alpha"],
      token: "surviving-base-token",
      tokens: [
        {
          id: "surviving-revoked",
          name: "Revoked operator token",
          tokenHash: createHash("sha256")
            .update("surviving-revoked-secret")
            .digest("hex")
        }
      ]
    };
    await writeFile(configPath, JSON.stringify([removedMember, survivingMember]), "utf8");
    const reloadErrors: Error[] = [];
    const source = await watchTeamAuthorizationConfigFile(configPath, {
      pollIntervalMs: 10,
      onError: (error) => reloadErrors.push(error)
    });
    const manager = createTeamAuthorizationFileManager(configPath, source.config, {
      now: () => new Date("2026-07-14T12:00:00.000Z"),
      generateId: () => "removed-managed",
      generateSecret: () => "removed-managed-secret"
    });

    try {
      await manager.createToken("removed-user", {
        name: "Removed managed token",
        expiresInDays: null
      });
      await manager.revokeToken("surviving-user", "surviving-revoked");
      expect(
        authenticateTeamMember(source.config, "removed-user", "removed-managed-secret")
      ).toMatchObject({ tokenId: "removed-managed" });

      await writeFile(configPath, JSON.stringify([survivingMember]), "utf8");
      await waitFor(() => reloadErrors.some(
        (error) => error.message === "team authorization token sidecar member was removed"
      ));
      await waitForSidecarMember(configPath, "removed-user", true);
      await waitFor(() => authenticationSucceeds(
        source.config,
        "surviving-user",
        "surviving-base-token"
      ));

      expect(authenticationSucceeds(
        source.config,
        "removed-user",
        "removed-managed-secret"
      )).toBe(false);
      expect(authenticationSucceeds(
        source.config,
        "surviving-user",
        "surviving-revoked-secret"
      )).toBe(false);

      source.close();
      const restarted = await watchTeamAuthorizationConfigFile(configPath, {
        pollIntervalMs: 10
      });
      try {
        expect(
          authenticateTeamMember(
            restarted.config,
            "surviving-user",
            "surviving-base-token"
          )
        ).toMatchObject({ userId: "surviving-user" });
        expect(authenticationSucceeds(
          restarted.config,
          "surviving-user",
          "surviving-revoked-secret"
        )).toBe(false);

        await writeFile(
          configPath,
          JSON.stringify([removedMember, survivingMember]),
          "utf8"
        );
        const restartedManager = createTeamAuthorizationFileManager(
          configPath,
          restarted.config,
          {
            now: () => new Date("2026-07-14T13:00:00.000Z"),
            generateId: () => "readded-managed",
            generateSecret: () => "readded-managed-secret"
          }
        );
        await expect(restartedManager.manageTokens(
          { userId: "removed-user", memberToken: "removed-base-token" },
          {
            type: "create",
            input: { name: "Re-added generation", expiresInDays: null }
          }
        )).resolves.toMatchObject({
          type: "create",
          created: { metadata: { id: "readded-managed" } }
        });

        expect(authenticationSucceeds(
          restarted.config,
          "removed-user",
          "removed-managed-secret"
        )).toBe(false);
        expect(authenticationSucceeds(
          restarted.config,
          "removed-user",
          "readded-managed-secret"
        )).toBe(true);
        expect(authenticationSucceeds(
          restarted.config,
          "surviving-user",
          "surviving-base-token"
        )).toBe(true);
        expect(authenticationSucceeds(
          restarted.config,
          "surviving-user",
          "surviving-revoked-secret"
        )).toBe(false);
        await waitForSidecarMember(configPath, "removed-user", false);
      } finally {
        restarted.close();
      }
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


function authenticationSucceeds(
  config: NonNullable<ReturnType<typeof parseTeamAuthorizationConfig>>,
  userId: string,
  token: string
): boolean {
  try {
    authenticateTeamMember(config, userId, token);
    return true;
  } catch {
    return false;
  }
}

async function waitForSidecarMember(
  configPath: string,
  userId: string,
  quarantined: boolean
): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const sidecar = JSON.parse(
      await readFile(configPath + ".tokens.json", "utf8")
    ) as {
      members?: Array<{ userId?: string; quarantined?: boolean }>;
    };
    if (sidecar.members?.some(
      (member) => member.userId === userId && member.quarantined === quarantined
    )) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for managed token sidecar quarantine");
}
