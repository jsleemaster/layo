import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState,
  type TeamAuthorizationStateSnapshot,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";
import {
  canonicalTeamAuthorizationBaseFingerprint,
  runTeamAuthorizationSharedCli
} from "./team-authorization-shared-cli.js";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const emptyState = "{\"version\":2,\"members\":[]}";

interface InitializableStore extends TeamAuthorizationStateStore {
  initializeAbsent(
    scope: string,
    snapshot: TeamAuthorizationStateSnapshot
  ): Promise<{ initialized: boolean; snapshot: TeamAuthorizationStateSnapshot }>;
}

function cliEnv(): NodeJS.ProcessEnv {
  return { LAYO_AUTHORIZATION_DATABASE_URL: connectionString! };
}

function tokenHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function baseMembers(secret = "owner-base-secret"): unknown[] {
  return [{
    userId: "owner-user",
    role: "owner",
    teamIds: ["team-beta", "team-alpha"],
    token: secret,
    tokens: [{
      id: "operator-token",
      name: "Operator token",
      token: "operator-plaintext",
      createdAt: "2026-07-15T00:00:00.000Z"
    }]
  }];
}

async function withFiles(
  callback: (root: string, basePath: string) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "layo-shared-auth-cli-"));
  const basePath = path.join(root, "members.json");
  try {
    await callback(root, basePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function readScope(scope: string): Promise<TeamAuthorizationStateSnapshot> {
  const store = await createPostgresTeamAuthorizationStateStore({
    connectionString: connectionString!
  });
  try {
    return await store.read(scope);
  } finally {
    await store.close();
  }
}

function barrierStoreFactory(expectedAbsentReaders: number) {
  let absentReaders = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async (databaseUrl: string): Promise<InitializableStore> => {
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: databaseUrl
    }) as InitializableStore;
    return {
      read: async (scope) => {
        try {
          return await store.read(scope);
        } catch (error) {
          absentReaders += 1;
          if (absentReaders === expectedAbsentReaders) {
            release();
          }
          await ready;
          throw error;
        }
      },
      initializeAbsent: (scope, snapshot) =>
        store.initializeAbsent(scope, snapshot),
      mutate: (scope, fingerprint, operation) =>
        store.mutate(scope, fingerprint, operation),
      close: () => store.close()
    };
  };
}

describePostgres("shared authorization bootstrap/export/restore CLI", () => {
  beforeAll(async () => {
    await migratePostgresTeamAuthorizationState({
      connectionString: connectionString!
    });
  });

  test("bootstraps empty state at generation zero with a canonical whole-base fingerprint", async () => {
    await withFiles(async (_root, basePath) => {
      const scope = `empty-${randomUUID()}`;
      const firstBase = JSON.stringify(baseMembers(), null, 2);
      const reorderedBase = JSON.stringify([{
        ...(baseMembers()[0] as Record<string, unknown>),
        teamIds: ["team-alpha", "team-beta"]
      }]);
      await writeFile(basePath, firstBase, "utf8");

      await runTeamAuthorizationSharedCli([
        "bootstrap", "--scope", scope, "--base", basePath, "--empty"
      ], { env: cliEnv() });

      expect(await readScope(scope)).toEqual({
        generation: "0",
        baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(reorderedBase),
        serializedState: emptyState
      });
      expect(canonicalTeamAuthorizationBaseFingerprint(firstBase)).toBe(
        canonicalTeamAuthorizationBaseFingerprint(reorderedBase)
      );
      await expect(runTeamAuthorizationSharedCli([
        "bootstrap", "--scope", scope, "--base", basePath, "--empty"
      ], { env: cliEnv() })).rejects.toThrow(/already exists/i);
    });
  });

  test("migrates a v1 sidecar through existing parse and merge validation", async () => {
    await withFiles(async (_root, basePath) => {
      const scope = `sidecar-${randomUUID()}`;
      await writeFile(basePath, JSON.stringify(baseMembers()), "utf8");
      await writeFile(
        `${basePath}.tokens.json`,
        JSON.stringify({
          version: 1,
          members: [{
            userId: "owner-user",
            tokens: [{
              id: "managed-token",
              name: "Managed token",
              tokenHash: tokenHash("managed-secret"),
              createdAt: "2026-07-15T01:00:00.000Z"
            }],
            revocations: []
          }]
        }),
        "utf8"
      );

      await runTeamAuthorizationSharedCli([
        "bootstrap", "--scope", scope, "--base", basePath, "--from-sidecar"
      ], { env: cliEnv() });

      const snapshot = await readScope(scope);
      const state = JSON.parse(snapshot.serializedState) as {
        version: number;
        members: Array<{
          userId: string;
          baseFingerprint: string;
          quarantined: boolean;
          tokens: Array<{ tokenHash?: string; token?: string }>;
        }>;
      };
      expect(snapshot.generation).toBe("0");
      expect(state.version).toBe(2);
      expect(state.members[0]).toMatchObject({
        userId: "owner-user",
        quarantined: false,
        tokens: [{ tokenHash: tokenHash("managed-secret") }]
      });
      expect(state.members[0]?.baseFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(state.members[0]?.tokens[0]?.token).toBeUndefined();
    });
  });

  test("allows identical concurrent bootstrap but rejects a conflicting loser without overwrite", async () => {
    await withFiles(async (root, basePath) => {
      const identicalScope = `identical-${randomUUID()}`;
      await writeFile(basePath, JSON.stringify(baseMembers()), "utf8");
      const identicalFactory = barrierStoreFactory(2);
      await expect(Promise.all([
        runTeamAuthorizationSharedCli([
          "bootstrap", "--scope", identicalScope, "--base", basePath, "--empty"
        ], { env: cliEnv(), createStore: identicalFactory }),
        runTeamAuthorizationSharedCli([
          "bootstrap", "--scope", identicalScope, "--base", basePath, "--empty"
        ], { env: cliEnv(), createStore: identicalFactory })
      ])).resolves.toEqual([undefined, undefined]);
      await expect(readScope(identicalScope)).resolves.toMatchObject({
        generation: "0",
        serializedState: emptyState
      });

      const conflictScope = `conflict-${randomUUID()}`;
      const otherBasePath = path.join(root, "other-members.json");
      await writeFile(
        otherBasePath,
        JSON.stringify(baseMembers("different-base-secret")),
        "utf8"
      );
      const conflictFactory = barrierStoreFactory(2);
      const results = await Promise.allSettled([
        runTeamAuthorizationSharedCli([
          "bootstrap", "--scope", conflictScope, "--base", basePath, "--empty"
        ], { env: cliEnv(), createStore: conflictFactory }),
        runTeamAuthorizationSharedCli([
          "bootstrap", "--scope", conflictScope, "--base", otherBasePath, "--empty"
        ], { env: cliEnv(), createStore: conflictFactory })
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
      const winner = await readScope(conflictScope);
      expect(winner.generation).toBe("0");
      expect([
        canonicalTeamAuthorizationBaseFingerprint(await readFile(basePath, "utf8")),
        canonicalTeamAuthorizationBaseFingerprint(await readFile(otherBasePath, "utf8"))
      ]).toContain(winner.baseFingerprint);
    });
  });

  test("rejects plaintext and malformed sidecars without creating their scopes", async () => {
    await withFiles(async (_root, basePath) => {
      await writeFile(basePath, JSON.stringify(baseMembers()), "utf8");
      for (const [name, sidecar] of [
        ["plaintext", JSON.stringify({
          version: 2,
          members: [{
            userId: "owner-user",
            baseFingerprint: "a".repeat(64),
            quarantined: false,
            tokens: [{ id: "bad", name: "Bad", token: "plaintext" }],
            revocations: []
          }]
        })],
        ["malformed", "{not-json"]
      ] as const) {
        const scope = `${name}-${randomUUID()}`;
        await writeFile(`${basePath}.tokens.json`, sidecar, "utf8");
        await expect(runTeamAuthorizationSharedCli([
          "bootstrap", "--scope", scope, "--base", basePath, "--from-sidecar"
        ], { env: cliEnv() })).rejects.toThrow();
        const store = await createPostgresTeamAuthorizationStateStore({
          connectionString: connectionString!
        });
        try {
          await expect(store.read(scope)).rejects.toThrow(/does not exist/i);
        } finally {
          await store.close();
        }
      }
    });
  });

  test("exports secret-free JSON to stdout/file and restores only an absent scope", async () => {
    await withFiles(async (root, basePath) => {
      const exportScope = `export-${randomUUID()}`;
      await writeFile(basePath, JSON.stringify(baseMembers()), "utf8");
      await runTeamAuthorizationSharedCli([
        "bootstrap", "--scope", exportScope, "--base", basePath, "--empty"
      ], { env: cliEnv() });

      let stdout = "";
      await runTeamAuthorizationSharedCli(["export", "--scope", exportScope], {
        env: cliEnv(),
        stdout: { write: (chunk) => { stdout += chunk; } }
      });
      const exported = JSON.parse(stdout);
      expect(exported).toEqual({
        version: 1,
        scope: exportScope,
        generation: "0",
        baseFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        state: { version: 2, members: [] }
      });
      expect(stdout).not.toContain("owner-base-secret");
      expect(stdout).not.toContain("operator-plaintext");

      const outputPath = path.join(root, "authorization-backup.json");
      await runTeamAuthorizationSharedCli([
        "export", "--scope", exportScope, "--output", outputPath
      ], { env: cliEnv() });
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(exported);

      const restoreScope = `restore-${randomUUID()}`;
      const artifactPath = path.join(root, "restore.json");
      const artifact = {
        version: 1,
        scope: restoreScope,
        generation: "42",
        baseFingerprint: "b".repeat(64),
        state: { version: 2, members: [] }
      };
      await writeFile(artifactPath, JSON.stringify(artifact), "utf8");
      await expect(runTeamAuthorizationSharedCli([
        "restore", "--scope", restoreScope, "--input", artifactPath
      ], { env: cliEnv() })).rejects.toThrow(/confirm-absent-scope-restore/i);
      await runTeamAuthorizationSharedCli([
        "restore",
        "--scope", restoreScope,
        "--input", artifactPath,
        "--confirm-absent-scope-restore"
      ], { env: cliEnv() });
      await expect(readScope(restoreScope)).resolves.toEqual({
        generation: "42",
        baseFingerprint: "b".repeat(64),
        serializedState: emptyState
      });

      await writeFile(artifactPath, JSON.stringify({
        ...artifact,
        generation: "7",
        baseFingerprint: "c".repeat(64)
      }), "utf8");
      await expect(runTeamAuthorizationSharedCli([
        "restore",
        "--scope", restoreScope,
        "--input", artifactPath,
        "--confirm-absent-scope-restore"
      ], { env: cliEnv() })).rejects.toThrow(/already exists/i);
      await expect(readScope(restoreScope)).resolves.toEqual({
        generation: "42",
        baseFingerprint: "b".repeat(64),
        serializedState: emptyState
      });
    });
  });
});

