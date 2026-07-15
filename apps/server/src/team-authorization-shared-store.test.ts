import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  createTeamAuthorizationFileManager,
  parseTeamAuthorizationConfig,
  type TeamAuthorizationConfig
} from "./team-authorization.js";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState,
  type TeamAuthorizationStateSnapshot,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";
import {
  canonicalTeamAuthorizationBaseFingerprint,
  runTeamAuthorizationBaseReconciliation
} from "./team-authorization-shared-cli.js";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const emptyState = "{\"version\":2,\"members\":[]}";

type Store = Awaited<ReturnType<typeof createPostgresTeamAuthorizationStateStore>>;

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tokenHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function withApplicationName(urlValue: string, applicationName: string): string {
  const url = new URL(urlValue);
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

async function waitForDatabaseLock(
  observer: Pool,
  applicationName: string
): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const result = await observer.query<{ wait_event_type: string | null }>(
      `SELECT wait_event_type
         FROM pg_stat_activity
        WHERE application_name = $1
          AND state = 'active'`,
      [applicationName]
    );
    if (result.rows.some(({ wait_event_type }) => wait_event_type === "Lock")) {
      return;
    }
  }
  throw new Error("second shared authorization transaction never blocked");
}

function ownerBase(): unknown[] {
  return [
    {
      userId: "owner-user",
      role: "owner",
      teamIds: ["team-alpha"],
      token: "owner-base-secret"
    },
    {
      userId: "unmanaged-user",
      role: "viewer",
      teamIds: ["team-alpha"],
      token: "unmanaged-base-secret"
    }
  ];
}

function configFrom(base: string): TeamAuthorizationConfig {
  const config = parseTeamAuthorizationConfig(base);
  if (!config) {
    throw new Error("test base config did not parse");
  }
  return config;
}

async function withBaseFiles(
  callback: (root: string, firstBasePath: string, secondBasePath: string) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "layo-shared-auth-manager-"));
  const firstBasePath = path.join(root, "host-a-members.json");
  const secondBasePath = path.join(root, "host-b-members.json");
  try {
    const base = JSON.stringify(ownerBase(), null, 2);
    await Promise.all([
      writeFile(firstBasePath, base, "utf8"),
      writeFile(secondBasePath, base, "utf8")
    ]);
    await callback(root, firstBasePath, secondBasePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function initializeScope(
  store: TeamAuthorizationStateStore,
  scope: string,
  base: string
): Promise<TeamAuthorizationStateSnapshot> {
  const snapshot = {
    generation: "0",
    baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
    serializedState: emptyState
  };
  const initialized = await store.initializeAbsent(scope, snapshot);
  expect(initialized.initialized).toBe(true);
  return initialized.snapshot;
}

function pauseFirstMutation(
  store: Store,
  callbackEntered: Deferred,
  mayCommit: Deferred
): TeamAuthorizationStateStore {
  let first = true;
  return {
    read: (scope) => store.read(scope),
    initializeAbsent: (scope, snapshot) => store.initializeAbsent(scope, snapshot),
    mutate: (scope, fingerprint, operation) =>
      store.mutate(scope, fingerprint, async (snapshot) => {
        const result = await operation(snapshot);
        if (first) {
          first = false;
          callbackEntered.resolve();
          await mayCommit.promise;
        }
        return result;
      }),
    close: () => store.close()
  };
}

describePostgres("shared PostgreSQL team authorization manager", () => {
  beforeAll(async () => {
    await migratePostgresTeamAuthorizationState({
      connectionString: connectionString!
    });
  });

  test("serializes concurrent token creates across hosts and commits generation two with hashes only", async () => {
    await withBaseFiles(async (_root, firstBasePath, secondBasePath) => {
      const scope = `concurrent-create-${randomUUID()}`;
      const firstStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const secondApplicationName = `layo-shared-second-${randomUUID()}`;
      const secondStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: withApplicationName(
          connectionString!,
          secondApplicationName
        )
      });
      const observer = new Pool({ connectionString: connectionString! });
      const base = await readFile(firstBasePath, "utf8");
      await initializeScope(firstStore, scope, base);
      const callbackEntered = deferred();
      const mayCommit = deferred();
      const firstManager = createTeamAuthorizationFileManager(
        firstBasePath,
        configFrom(base),
        {
          stateStore: pauseFirstMutation(firstStore, callbackEntered, mayCommit),
          sharedScope: scope,
          now: () => new Date("2026-07-15T10:00:00.000Z"),
          generateId: () => "host-a-token",
          generateSecret: () => "layo_pat_host_a"
        }
      );
      const secondManager = createTeamAuthorizationFileManager(
        secondBasePath,
        configFrom(await readFile(secondBasePath, "utf8")),
        {
          stateStore: secondStore,
          sharedScope: scope,
          now: () => new Date("2026-07-15T10:00:01.000Z"),
          generateId: () => "host-b-token",
          generateSecret: () => "layo_pat_host_b"
        }
      );

      try {
        const firstCreate = firstManager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          {
            type: "create",
            input: { name: "Host A", expiresInDays: null }
          }
        );
        await callbackEntered.promise;

        const secondCreate = secondManager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          {
            type: "create",
            input: { name: "Host B", expiresInDays: null }
          }
        );
        await waitForDatabaseLock(observer, secondApplicationName);
        mayCommit.resolve();

        await expect(firstCreate).resolves.toMatchObject({
          type: "create",
          created: { token: "layo_pat_host_a" }
        });
        await expect(secondCreate).resolves.toMatchObject({
          type: "create",
          created: { token: "layo_pat_host_b" }
        });

        const committed = await secondStore.read(scope);
        expect(committed.generation).toBe("2");
        expect(committed.serializedState).toContain(tokenHash("layo_pat_host_a"));
        expect(committed.serializedState).toContain(tokenHash("layo_pat_host_b"));
        expect(committed.serializedState).not.toContain("layo_pat_host_a");
        expect(committed.serializedState).not.toContain("layo_pat_host_b");
        expect(committed.serializedState).not.toMatch(/"token"\s*:/);
      } finally {
        mayCommit.resolve();
        await Promise.all([
          firstStore.close(),
          secondStore.close(),
          observer.end()
        ]);
      }
    });
  });

  test("re-authenticates a stale principal inside the locked transaction after another host revokes it", async () => {
    await withBaseFiles(async (_root, firstBasePath, secondBasePath) => {
      const scope = `stale-revocation-${randomUUID()}`;
      const firstStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const secondStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const base = await readFile(firstBasePath, "utf8");
      await initializeScope(firstStore, scope, base);
      const firstManager = createTeamAuthorizationFileManager(
        firstBasePath,
        configFrom(base),
        {
          stateStore: firstStore,
          sharedScope: scope,
          now: () => new Date("2026-07-15T11:00:00.000Z"),
          generateId: () => "soon-revoked",
          generateSecret: () => "layo_pat_soon_revoked"
        }
      );
      const secondManager = createTeamAuthorizationFileManager(
        secondBasePath,
        configFrom(await readFile(secondBasePath, "utf8")),
        {
          stateStore: secondStore,
          sharedScope: scope,
          now: () => new Date("2026-07-15T11:00:01.000Z"),
          generateId: () => "must-not-commit",
          generateSecret: () => "layo_pat_must_not_commit"
        }
      );

      try {
        const created = await firstManager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          {
            type: "create",
            input: { name: "Temporary", expiresInDays: null }
          }
        );
        expect(created).toMatchObject({
          type: "create",
          created: { token: "layo_pat_soon_revoked" }
        });

        await expect(secondManager.manageTokens(
          { userId: "owner-user", memberToken: "layo_pat_soon_revoked" },
          { type: "list" }
        )).resolves.toMatchObject({ type: "list", activeTokenId: "soon-revoked" });

        await firstManager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          { type: "revoke", tokenId: "soon-revoked" }
        );
        const beforeRejectedMutation = await firstStore.read(scope);

        await expect(secondManager.manageTokens(
          { userId: "owner-user", memberToken: "layo_pat_soon_revoked" },
          {
            type: "create",
            input: { name: "Stale overwrite", expiresInDays: null }
          }
        )).rejects.toMatchObject({ statusCode: 401 });

        const afterRejectedMutation = await firstStore.read(scope);
        expect(afterRejectedMutation).toEqual(beforeRejectedMutation);
        expect(afterRejectedMutation.generation).toBe("2");
        expect(afterRejectedMutation.serializedState).not.toContain(
          tokenHash("layo_pat_must_not_commit")
        );
      } finally {
        await Promise.all([firstStore.close(), secondStore.close()]);
      }
    });
  });

  test.each([
    ["unmanaged member role", (members: any[]) => {
      members[1].role = "editor";
    }],
    ["unmanaged member team", (members: any[]) => {
      members[1].teamIds = ["team-beta"];
    }],
    ["unmanaged member base credential", (members: any[]) => {
      members[1].token = "changed-unmanaged-secret";
    }],
    ["unmanaged member addition", (members: any[]) => {
      members.push({
        userId: "new-unmanaged-user",
        role: "viewer",
        teamIds: ["team-alpha"],
        token: "new-unmanaged-secret"
      });
    }]
  ])("fails closed on %s divergence and does not let a runtime principal reconcile it", async (_label, diverge) => {
    await withBaseFiles(async (_root, firstBasePath, secondBasePath) => {
      const scope = `divergence-${randomUUID()}`;
      const store = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const base = await readFile(firstBasePath, "utf8");
      await initializeScope(store, scope, base);
      const divergentMembers = JSON.parse(
        await readFile(secondBasePath, "utf8")
      ) as any[];
      diverge(divergentMembers);
      const divergentBase = JSON.stringify(divergentMembers, null, 2);
      await writeFile(secondBasePath, divergentBase, "utf8");
      const manager = createTeamAuthorizationFileManager(
        secondBasePath,
        configFrom(divergentBase),
        { stateStore: store, sharedScope: scope }
      );

      try {
        await expect(manager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          { type: "list" }
        )).rejects.toMatchObject({ statusCode: 409 });
        await expect(store.read(scope)).resolves.toEqual({
          generation: "0",
          baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
          serializedState: emptyState
        });
      } finally {
        await store.close();
      }
    });
  });

  test("returns a committed one-time secret when local cache publication fails and a healthy host authenticates it immediately", async () => {
    await withBaseFiles(async (_root, firstBasePath, secondBasePath) => {
      const scope = `publication-failure-${randomUUID()}`;
      const failingStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const healthyStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const base = await readFile(firstBasePath, "utf8");
      await initializeScope(failingStore, scope, base);
      const failingManager = createTeamAuthorizationFileManager(
        firstBasePath,
        configFrom(base),
        {
          stateStore: failingStore,
          sharedScope: scope,
          now: () => new Date("2026-07-15T12:00:00.000Z"),
          generateId: () => "committed-token",
          generateSecret: () => "layo_pat_committed_once",
          publishSharedConfig: async () => {
            throw new Error("injected local cache publication failure");
          }
        }
      );
      const healthyConfig = configFrom(await readFile(secondBasePath, "utf8"));
      const healthyManager = createTeamAuthorizationFileManager(
        secondBasePath,
        healthyConfig,
        { stateStore: healthyStore, sharedScope: scope }
      );

      try {
        await expect(failingManager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          {
            type: "create",
            input: { name: "Committed once", expiresInDays: null }
          }
        )).resolves.toEqual({
          type: "create",
          created: {
            token: "layo_pat_committed_once",
            metadata: {
              id: "committed-token",
              name: "Committed once",
              createdAt: "2026-07-15T12:00:00.000Z"
            }
          }
        });

        const committed = await failingStore.read(scope);
        expect(committed.generation).toBe("1");
        expect(committed.serializedState).toContain(
          tokenHash("layo_pat_committed_once")
        );
        expect(committed.serializedState).not.toContain("layo_pat_committed_once");

        await expect(healthyManager.manageTokens(
          { userId: "owner-user", memberToken: "layo_pat_committed_once" },
          { type: "list" }
        )).resolves.toMatchObject({
          type: "list",
          activeTokenId: "committed-token"
        });
        expect(authenticateTeamMember(
          healthyConfig,
          "owner-user",
          "layo_pat_committed_once"
        )).toMatchObject({ tokenId: "committed-token" });
      } finally {
        await Promise.all([failingStore.close(), healthyStore.close()]);
      }
    });
  });

  test("survives restart in PostgreSQL and never reads or writes the filesystem sidecar in shared mode", async () => {
    await withBaseFiles(async (_root, firstBasePath, secondBasePath) => {
      const scope = `restart-${randomUUID()}`;
      const sidecarPath = `${firstBasePath}.tokens.json`;
      const staleSidecar = "{malformed-stale-sidecar";
      await writeFile(sidecarPath, staleSidecar, "utf8");
      const firstStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const base = await readFile(firstBasePath, "utf8");
      await initializeScope(firstStore, scope, base);
      const firstManager = createTeamAuthorizationFileManager(
        firstBasePath,
        configFrom(base),
        {
          stateStore: firstStore,
          sharedScope: scope,
          now: () => new Date("2026-07-15T13:00:00.000Z"),
          generateId: () => "restart-token",
          generateSecret: () => "layo_pat_restart"
        }
      );

      await firstManager.manageTokens(
        { userId: "owner-user", memberToken: "owner-base-secret" },
        {
          type: "create",
          input: { name: "Restart", expiresInDays: null }
        }
      );
      expect(await readFile(sidecarPath, "utf8")).toBe(staleSidecar);
      await firstStore.close();

      const restartedStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const restartedConfig = configFrom(
        await readFile(secondBasePath, "utf8")
      );
      const restartedManager = createTeamAuthorizationFileManager(
        secondBasePath,
        restartedConfig,
        { stateStore: restartedStore, sharedScope: scope }
      );
      try {
        await expect(restartedManager.manageTokens(
          { userId: "owner-user", memberToken: "layo_pat_restart" },
          { type: "list" }
        )).resolves.toMatchObject({
          type: "list",
          activeTokenId: "restart-token"
        });
        expect(await readFile(sidecarPath, "utf8")).toBe(staleSidecar);
        await expect(readFile(`${secondBasePath}.tokens.json`, "utf8"))
          .rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await restartedStore.close();
      }
    });
  });

  test("offline reconcile-base requires current fingerprint and expected generation, and one concurrent candidate wins", async () => {
    await withBaseFiles(async (root, firstBasePath) => {
      const scope = `reconcile-${randomUUID()}`;
      const firstApplicationName = `layo-reconcile-first-${randomUUID()}`;
      const secondApplicationName = `layo-reconcile-second-${randomUUID()}`;
      const firstStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: withApplicationName(
          connectionString!,
          firstApplicationName
        )
      });
      const secondStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: withApplicationName(
          connectionString!,
          secondApplicationName
        )
      });
      const observer = new Pool({ connectionString: connectionString! });
      const currentBase = await readFile(firstBasePath, "utf8");
      const currentFingerprint =
        canonicalTeamAuthorizationBaseFingerprint(currentBase);
      await initializeScope(firstStore, scope, currentBase);

      const firstCandidatePath = path.join(root, "candidate-a.json");
      const secondCandidatePath = path.join(root, "candidate-b.json");
      const firstCandidate = ownerBase() as any[];
      firstCandidate[1].role = "editor";
      const secondCandidate = ownerBase() as any[];
      secondCandidate[1].teamIds = ["team-beta"];
      await Promise.all([
        writeFile(firstCandidatePath, JSON.stringify(firstCandidate), "utf8"),
        writeFile(secondCandidatePath, JSON.stringify(secondCandidate), "utf8")
      ]);

      const callbackEntered = deferred();
      const mayCommit = deferred();
      const firstReconcile = runTeamAuthorizationBaseReconciliation({
        stateStore: pauseFirstMutation(firstStore, callbackEntered, mayCommit),
        sharedScope: scope,
        currentBaseFingerprint: currentFingerprint,
        expectedGeneration: "0",
        candidateBasePath: firstCandidatePath
      });
      await callbackEntered.promise;
      const secondReconcile = runTeamAuthorizationBaseReconciliation({
        stateStore: secondStore,
        sharedScope: scope,
        currentBaseFingerprint: currentFingerprint,
        expectedGeneration: "0",
        candidateBasePath: secondCandidatePath
      });

      try {
        await waitForDatabaseLock(observer, secondApplicationName);
        mayCommit.resolve();

        await expect(firstReconcile).resolves.toMatchObject({
          generation: "1",
          baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(
            JSON.stringify(firstCandidate)
          )
        });
        await expect(secondReconcile).rejects.toMatchObject({
          statusCode: 409
        });

        await expect(firstStore.read(scope)).resolves.toMatchObject({
          generation: "1",
          baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(
            JSON.stringify(firstCandidate)
          )
        });
      } finally {
        mayCommit.resolve();
        await Promise.all([
          firstStore.close(),
          secondStore.close(),
          observer.end()
        ]);
      }
    });
  });

  test("fails first use without a shared scope row and gives the exact bootstrap instruction", async () => {
    await withBaseFiles(async (_root, firstBasePath) => {
      const scope = `missing-scope-${randomUUID()}`;
      const store = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const base = await readFile(firstBasePath, "utf8");
      const manager = createTeamAuthorizationFileManager(
        firstBasePath,
        configFrom(base),
        { stateStore: store, sharedScope: scope }
      );
      const instruction =
        `shared authorization scope ${scope} is not initialized; `
        + `run pnpm --filter @layo/server authorization:bootstrap `
        + `--scope ${scope} --base ${firstBasePath} --empty`;

      try {
        await expect(manager.manageTokens(
          { userId: "owner-user", memberToken: "owner-base-secret" },
          { type: "list" }
        )).rejects.toThrow(instruction);
      } finally {
        await store.close();
      }
    });
  });
});
