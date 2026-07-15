import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, test } from "vitest";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState
} from "./team-authorization-postgres.js";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const fingerprint = "a".repeat(64);
const emptyState = JSON.stringify({ version: 2, members: [] });

function memberState(userId: string) {
  return {
    userId,
    baseFingerprint: fingerprint,
    quarantined: false,
    tokens: [],
    revocations: []
  };
}

function withApplicationName(urlValue: string, applicationName: string): string {
  const url = new URL(urlValue);
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

async function waitForDatabaseLock(pool: Pool, applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ wait_event_type: string | null }>(
      `SELECT wait_event_type
         FROM pg_stat_activity
        WHERE application_name = $1
          AND state = 'active'`,
      [applicationName]
    );
    if (result.rows.some((row) => row.wait_event_type === "Lock")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the second authorization writer to block");
}

describePostgres("PostgreSQL team authorization state store", () => {
  test("serializes concurrent first writers into exact bigint generations", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const applicationName = `layo-second-writer-${randomUUID()}`;
    const first = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!,
      statementTimeoutMs: 5_000
    });
    const second = await createPostgresTeamAuthorizationStateStore({
      connectionString: withApplicationName(connectionString!, applicationName),
      statementTimeoutMs: 5_000
    });
    const observer = new Pool({ connectionString: connectionString! });
    const scope = `first-writer-${randomUUID()}`;
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstIsEntered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });
    const firstMayCommit = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondEntered = false;

    try {
      const firstMutation = first.mutate(
        scope,
        fingerprint,
        async (snapshot) => {
          expect(snapshot).toEqual({
            generation: "0",
            baseFingerprint: fingerprint,
            serializedState: emptyState
          });
          firstEntered();
          await firstMayCommit;
          return {
            baseFingerprint: fingerprint,
            serializedState: JSON.stringify({
              version: 2,
              members: [memberState("first")]
            }),
            result: "first"
          };
        }
      );
      await firstIsEntered;

      const secondMutation = second.mutate(
        scope,
        fingerprint,
        async (snapshot) => {
          secondEntered = true;
          expect(snapshot.generation).toBe("1");
          const parsed = JSON.parse(snapshot.serializedState) as {
            version: number;
            members: unknown[];
          };
          return {
            baseFingerprint: fingerprint,
            serializedState: JSON.stringify({
              ...parsed,
              members: [...parsed.members, memberState("second")]
            }),
            result: "second"
          };
        }
      );

      await waitForDatabaseLock(observer, applicationName);
      expect(secondEntered).toBe(false);
      releaseFirst();

      await expect(firstMutation).resolves.toMatchObject({
        generation: "1",
        result: "first"
      });
      await expect(secondMutation).resolves.toMatchObject({
        generation: "2",
        result: "second"
      });
      const final = await first.read(scope);
      expect(final).toMatchObject({
        generation: "2",
        baseFingerprint: fingerprint
      });
      expect(JSON.parse(final.serializedState)).toMatchObject({
        version: 2,
        members: [{ userId: "first" }, { userId: "second" }]
      });
    } finally {
      releaseFirst?.();
      await Promise.all([first.close(), second.close(), observer.end()]);
    }
  });

  test("rolls back a failed first mutation to an absent scope", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    const scope = `rollback-${randomUUID()}`;

    try {
      await expect(store.mutate(scope, fingerprint, async () => {
        throw new Error("injected mutation failure");
      })).rejects.toThrow("injected mutation failure");
      await expect(store.read(scope)).rejects.toThrow(
        `authorization scope ${scope} does not exist`
      );
    } finally {
      await store.close();
    }
  });

  test("rejects plaintext and malformed managed state without advancing generation", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    const scope = `plaintext-${randomUUID()}`;
    const plaintextState = JSON.stringify({
      version: 2,
      members: [{
        ...memberState("owner-user"),
        tokens: [{ id: "bad", name: "Bad", token: "plaintext" }]
      }]
    });

    try {
      await expect(store.mutate(scope, fingerprint, async () => ({
        baseFingerprint: fingerprint,
        serializedState: plaintextState,
        result: null
      }))).rejects.toThrow(/hash-only|plaintext|managed state/i);
      await expect(store.read(scope)).rejects.toThrow(
        `authorization scope ${scope} does not exist`
      );
    } finally {
      await store.close();
    }
  });

  test("isolates scopes", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    const firstScope = `scope-a-${randomUUID()}`;
    const secondScope = `scope-b-${randomUUID()}`;

    try {
      await store.mutate(firstScope, fingerprint, async (snapshot) => ({
        baseFingerprint: fingerprint,
        serializedState: snapshot.serializedState,
        result: null
      }));
      await store.mutate(secondScope, fingerprint, async (snapshot) => ({
        baseFingerprint: fingerprint,
        serializedState: snapshot.serializedState,
        result: null
      }));

      await expect(store.read(firstScope)).resolves.toMatchObject({ generation: "1" });
      await expect(store.read(secondScope)).resolves.toMatchObject({ generation: "1" });
    } finally {
      await store.close();
    }
  });

  test("keeps generations exact above Number.MAX_SAFE_INTEGER", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    const admin = new Pool({ connectionString: connectionString! });
    const scope = `bigint-${randomUUID()}`;

    try {
      await store.mutate(scope, fingerprint, async (snapshot) => ({
        baseFingerprint: fingerprint,
        serializedState: snapshot.serializedState,
        result: null
      }));
      await admin.query(
        `UPDATE layo_team_authorization_state
            SET generation = $2::bigint
          WHERE scope = $1`,
        [scope, "9007199254740993"]
      );

      await expect(store.read(scope)).resolves.toMatchObject({
        generation: "9007199254740993"
      });
      await expect(store.mutate(scope, fingerprint, async (snapshot) => ({
        baseFingerprint: fingerprint,
        serializedState: snapshot.serializedState,
        result: null
      }))).resolves.toMatchObject({
        generation: "9007199254740994"
      });
    } finally {
      await Promise.all([store.close(), admin.end()]);
    }
  });
});
