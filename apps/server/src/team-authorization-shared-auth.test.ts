import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  canonicalTeamAuthorizationBaseFingerprint,
  createSharedTeamAuthorizationProvider,
  createTeamAuthorizationFileManager,
  createTeamAuthorizationProvider,
  parseTeamAuthorizationConfig,
  type TeamAuthorizationConfig
} from "./team-authorization.js";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState,
  type TeamAuthorizationStateSnapshot,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const emptyState = "{\"version\":2,\"members\":[]}";

function ownerBase(secret = "owner-base-secret"): string {
  return JSON.stringify([
    {
      userId: "owner-user",
      role: "owner",
      teamIds: ["team-alpha"],
      token: secret
    }
  ]);
}

function configFrom(base: string): TeamAuthorizationConfig {
  const config = parseTeamAuthorizationConfig(base);
  if (!config) {
    throw new Error("test authorization config did not parse");
  }
  return config;
}

function tokenHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function readOnlyStore(
  read: (scope: string) => Promise<TeamAuthorizationStateSnapshot>
): TeamAuthorizationStateStore {
  return {
    read,
    initializeAbsent: async () => {
      throw new Error("initializeAbsent is not available in this test store");
    },
    mutate: async () => {
      throw new Error("mutate is not available in this test store");
    },
    close: async () => undefined
  };
}

async function withBaseFile(
  callback: (basePath: string, base: string) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "layo-shared-auth-provider-"));
  const basePath = path.join(root, "members.json");
  const base = ownerBase();
  try {
    await writeFile(basePath, base, "utf8");
    await callback(basePath, base);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("team authorization providers", () => {
  test("preserves synchronous local authorization", () => {
    const provider = createTeamAuthorizationProvider(
      configFrom(ownerBase())
    );

    const member = provider.authenticate({
      userId: "owner-user",
      memberToken: "owner-base-secret"
    });

    expect(member).not.toBeInstanceOf(Promise);
    expect(member).toMatchObject({
      userId: "owner-user",
      role: "owner"
    });
  });

  test("fails closed when the base changes across the database read", async () => {
    await withBaseFile(async (basePath, base) => {
      const original = {
        generation: "0",
        baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
        serializedState: emptyState
      };
      let reads = 0;
      const store = readOnlyStore(async () => {
        reads += 1;
        if (reads === 1) {
          await writeFile(basePath, ownerBase("changed-owner-secret"), "utf8");
        }
        return original;
      });
      const provider = createSharedTeamAuthorizationProvider(
        basePath,
        configFrom(base),
        store,
        "stable-base",
        { maxStableReadAttempts: 2 }
      );

      await expect(provider.authenticate({
        userId: "owner-user",
        memberToken: "owner-base-secret"
      })).rejects.toMatchObject({ statusCode: 409 });
      expect(reads).toBe(2);
    });
  });

  test("fails closed on a database outage instead of accepting the published cache", async () => {
    await withBaseFile(async (basePath, base) => {
      const snapshot = {
        generation: "0",
        baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
        serializedState: emptyState
      };
      let outage = false;
      const store = readOnlyStore(async () => {
        if (outage) {
          throw new Error("injected authorization database outage");
        }
        return snapshot;
      });
      const config = configFrom(base);
      const provider = createSharedTeamAuthorizationProvider(
        basePath,
        config,
        store,
        "outage"
      );

      await expect(provider.authenticate({
        userId: "owner-user",
        memberToken: "owner-base-secret"
      })).resolves.toMatchObject({ userId: "owner-user" });
      expect(authenticateTeamMember(
        config,
        "owner-user",
        "owner-base-secret"
      )).toMatchObject({ userId: "owner-user" });

      outage = true;
      await expect(provider.authenticate({
        userId: "owner-user",
        memberToken: "owner-base-secret"
      })).rejects.toThrow("injected authorization database outage");
    });
  });

  test("does not let a slow older generation republish over a newer read", async () => {
    await withBaseFile(async (basePath, base) => {
      const secret = "layo_pat_provider_generation";
      const activeState = JSON.stringify({
        version: 2,
        members: [{
          userId: "owner-user",
          baseFingerprint: tokenHash(JSON.stringify({
            userId: "owner-user",
            role: "owner",
            teamIds: ["team-alpha"],
            hashes: [tokenHash("owner-base-secret")],
            namedTokens: []
          })),
          quarantined: false,
          tokens: [{
            id: "provider-token",
            name: "Provider token",
            tokenHash: tokenHash(secret),
            createdAt: "2026-07-15T15:00:00.000Z"
          }],
          revocations: []
        }]
      });
      const revokedState = activeState.replace(
        '"revocations":[]',
        '"revocations":[{"tokenId":"provider-token","revokedAt":"2026-07-15T15:01:00.000Z"}]'
      );
      let release!: () => void;
      const delayed = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reads = 0;
      let firstReadStarted!: () => void;
      const firstReadEntered = new Promise<void>((resolve) => {
        firstReadStarted = resolve;
      });
      const fingerprint = canonicalTeamAuthorizationBaseFingerprint(base);
      const store = readOnlyStore(async () => {
        reads += 1;
        if (reads === 1) {
          firstReadStarted();
          await delayed;
          return {
            generation: "1",
            baseFingerprint: fingerprint,
            serializedState: activeState
          };
        }
        return {
          generation: "2",
          baseFingerprint: fingerprint,
          serializedState: revokedState
        };
      });
      const config = configFrom(base);
      const provider = createSharedTeamAuthorizationProvider(
        basePath,
        config,
        store,
        "publication-order"
      );

      const stale = provider.authenticate({
        userId: "owner-user",
        memberToken: secret
      }, new Date("2026-07-15T15:00:30.000Z"));
      await firstReadEntered;
      await expect(provider.authenticate({
        userId: "owner-user",
        memberToken: "owner-base-secret"
      }, new Date("2026-07-15T15:02:00.000Z"))).resolves.toMatchObject({
        userId: "owner-user"
      });
      release();
      await stale;

      expect(() => authenticateTeamMember(
        config,
        "owner-user",
        secret,
        new Date("2026-07-15T15:02:00.000Z")
      )).toThrow("team member credentials are invalid");
    });
  });
});

describePostgres("shared request-time revocation", () => {
  beforeAll(async () => {
    await migratePostgresTeamAuthorizationState({
      connectionString: connectionString!
    });
  });

  test("rejects another host's revoked token on the first protected authentication", async () => {
    await withBaseFile(async (basePath, base) => {
      const scope = `request-revoke-${randomUUID()}`;
      const writerStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      const readerStore = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      await writerStore.initializeAbsent(scope, {
        generation: "0",
        baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
        serializedState: emptyState
      }, TEST_ONLY_UNAUDITED_AUTHORIZATION_INITIALIZATION);
      let now = new Date("2026-07-15T15:05:00.000Z");
      const writer = createTeamAuthorizationFileManager(
        basePath,
        configFrom(base),
        {
          stateStore: writerStore,
          sharedScope: scope,
          now: () => now,
          generateId: () => "request-token",
          generateSecret: () => "layo_pat_request_revoked"
        }
      );
      const readerConfig = configFrom(await readFile(basePath, "utf8"));
      const provider = createSharedTeamAuthorizationProvider(
        basePath,
        readerConfig,
        readerStore,
        scope
      );

      try {
        await writer.createToken("owner-user", {
          name: "Request token",
          expiresInDays: null
        });
        await expect(provider.authenticate({
          userId: "owner-user",
          memberToken: "layo_pat_request_revoked"
        }, now)).resolves.toMatchObject({ tokenId: "request-token" });

        now = new Date("2026-07-15T15:06:00.000Z");
        await writer.revokeToken("owner-user", "request-token");
        expect(authenticateTeamMember(
          readerConfig,
          "owner-user",
          "layo_pat_request_revoked",
          now
        )).toMatchObject({ tokenId: "request-token" });

        await expect(provider.authenticate({
          userId: "owner-user",
          memberToken: "layo_pat_request_revoked"
        }, now)).rejects.toMatchObject({ statusCode: 401 });
      } finally {
        await Promise.all([writerStore.close(), readerStore.close()]);
      }
    });
  });
});
