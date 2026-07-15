import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState
} from "./team-authorization-postgres.js";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;
const fingerprint = "a".repeat(64);
const emptyState = JSON.stringify({ version: 2, members: [] });

describePostgres("PostgreSQL team authorization state store", () => {
  test("serializes concurrent first writers into exact bigint generations", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const first = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!,
      statementTimeoutMs: 5_000
    });
    const second = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!,
      statementTimeoutMs: 5_000
    });
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
              members: [{ userId: "first", tokens: [], revocations: [] }]
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
              members: [...parsed.members, { userId: "second", tokens: [], revocations: [] }]
            }),
            result: "second"
          };
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
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
      await expect(first.read(scope)).resolves.toMatchObject({
        generation: "2",
        baseFingerprint: fingerprint
      });
      const final = await first.read(scope);
      expect(JSON.parse(final.serializedState)).toMatchObject({
        version: 2,
        members: [{ userId: "first" }, { userId: "second" }]
      });
    } finally {
      releaseFirst?.();
      await Promise.all([first.close(), second.close()]);
    }
  });

  test("rolls back callback failures without advancing generation", async () => {
    await migratePostgresTeamAuthorizationState({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    const scope = `rollback-${randomUUID()}`;

    try {
      await expect(store.mutate(scope, fingerprint, async () => {
        throw new Error("injected mutation failure");
      })).rejects.toThrow("injected mutation failure");
      await expect(store.read(scope)).resolves.toEqual({
        generation: "0",
        baseFingerprint: fingerprint,
        serializedState: emptyState
      });
    } finally {
      await store.close();
    }
  });

  test("isolates scopes and keeps bigint generations exact", async () => {
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
});
