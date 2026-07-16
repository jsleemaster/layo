import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState
} from "./team-authorization-postgres";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres("PostgreSQL authorization audit log", () => {
  beforeAll(async () => {
    await migratePostgresTeamAuthorizationState({
      connectionString: connectionString!
    });
  });

  test("orders two client mutations with their committed generations and audit ids", async () => {
    const scope = `audit-order-${randomUUID()}`;
    const first = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    const second = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await first.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    let firstMutationEntered!: () => void;
    const firstMutationStarted = new Promise<void>((resolve) => {
      firstMutationEntered = resolve;
    });
    let releaseFirst!: () => void;
    const firstMutationReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstMutation = first.transact!(
      scope,
      "0".repeat(64),
      { mutating: true },
      async (snapshot) => {
        firstMutationEntered();
        await firstMutationReleased;
        return {
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: '{"version":2,"members":[]}',
          result: "first",
          auditEvent: {
            action: "token_created",
            actorUserId: "owner-a",
            subjectTokenId: "token-a",
            subjectTokenName: "Deploy A",
            source: "http",
            requestId: "request-a",
            metadata: {}
          }
        };
      }
    );
    await firstMutationStarted;

    let secondMutationEntered = false;
    const secondMutation = second.transact!(
      scope,
      "0".repeat(64),
      { mutating: true },
      async (snapshot) => {
        secondMutationEntered = true;
        return {
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: '{"version":2,"members":[]}',
          result: "second",
          auditEvent: {
            action: "token_revoked",
            actorUserId: "owner-b",
            subjectTokenId: "token-a",
            subjectTokenName: "Deploy A",
            source: "mcp",
            requestId: "request-b",
            metadata: {}
          }
        };
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(secondMutationEntered).toBe(false);

    releaseFirst();
    await expect(firstMutation).resolves.toMatchObject({ generation: "1" });
    await expect(secondMutation).resolves.toMatchObject({ generation: "2" });

    const events = await first.listAuditEvents!(scope, {
      afterId: "0",
      limit: 10
    });
    expect(events).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^[1-9][0-9]*$/),
        scope,
        generation: "1",
        action: "token_created",
        actorUserId: "owner-a",
        subjectTokenId: "token-a",
        subjectTokenName: "Deploy A",
        source: "http",
        requestId: "request-a",
        metadata: {}
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^[1-9][0-9]*$/),
        scope,
        generation: "2",
        action: "token_revoked",
        actorUserId: "owner-b",
        subjectTokenId: "token-a",
        subjectTokenName: "Deploy A",
        source: "mcp",
        requestId: "request-b",
        metadata: {}
      })
    ]);
    expect(BigInt(events[1]!.id)).toBeGreaterThan(BigInt(events[0]!.id));

    await first.close();
    await second.close();
  });
  test("rejects nested credential metadata and rolls back state plus audit", async () => {
    const scope = `audit-secret-${randomUUID()}`;
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    try {
      await expect(store.transact!(
        scope,
        "0".repeat(64),
        { mutating: true },
        async (snapshot) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: "must-not-commit",
          auditEvent: {
            action: "token_created",
            actorUserId: "owner-a",
            subjectTokenId: "token-secret",
            subjectTokenName: "Secret",
            source: "http",
            metadata: {
              request: {
                memberToken: "plaintext-secret"
              }
            }
          }
        })
      )).rejects.toThrow(/not allowed/i);

      await expect(store.read(scope)).resolves.toMatchObject({
        generation: "0"
      });
      await expect(store.listAuditEvents!(scope, {
        afterId: "0",
        limit: 10
      })).resolves.toEqual([]);
    } finally {
      await store.close();
    }
  });

  test("does not append an audit event for a non-mutating transaction", async () => {
    const scope = `audit-noop-${randomUUID()}`;
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    try {
      await expect(store.transact!(
        scope,
        "0".repeat(64),
        { mutating: false },
        async (snapshot) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: "noop",
          auditEvent: {
            action: "base_reconciled",
            actorUserId: "owner-a",
            source: "operator",
            metadata: {}
          }
        })
      )).rejects.toThrow(/must not append an audit event/i);
      await expect(store.listAuditEvents!(scope, {
        afterId: "0",
        limit: 10
      })).resolves.toEqual([]);
    } finally {
      await store.close();
    }
  });

  test("rejects a changed transaction without an audit event", async () => {
    const scope = `audit-required-${randomUUID()}`;
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    try {
      await expect(store.transact!(
        scope,
        "0".repeat(64),
        { mutating: true },
        async (snapshot) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: "must-not-commit"
        })
      )).rejects.toThrow(/audit event is required/i);
      await expect(store.read(scope)).resolves.toMatchObject({ generation: "0" });
    } finally {
      await store.close();
    }
  });

  test("rejects non-allowlisted metadata even when its key avoids the credential denylist", async () => {
    const scope = `audit-allowlist-${randomUUID()}`;
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    try {
      await expect(store.transact!(
        scope,
        "0".repeat(64),
        { mutating: true },
        async (snapshot) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: "must-not-commit",
          auditEvent: {
            action: "token_created",
            actorUserId: "owner-a",
            source: "http",
            metadata: { payload: "plaintext-secret" }
          }
        })
      )).rejects.toThrow(/metadata field payload is not allowed/i);
      await expect(store.read(scope)).resolves.toMatchObject({ generation: "0" });
    } finally {
      await store.close();
    }
  });

  test("rejects cursors above PostgreSQL bigint before issuing an audit query", async () => {
    const scope = `audit-cursor-${randomUUID()}`;
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    try {
      await expect(store.listAuditEvents!(scope, {
        afterId: "9223372036854775808",
        limit: 10
      })).rejects.toThrow(/PostgreSQL bigint/i);
    } finally {
      await store.close();
    }
  });

  test("rolls back state and audit for callback, serialization, and oversized metadata failures", async () => {
    const cases = [
      {
        name: "callback",
        operation: async () => {
          throw new Error("injected callback failure");
        },
        error: /injected callback failure/
      },
      {
        name: "state-serialization",
        operation: async (snapshot: { baseFingerprint: string }) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: "{not-json",
          result: undefined,
          auditEvent: {
            action: "base_reconciled" as const,
            actorUserId: "operator-a",
            source: "operator" as const,
            metadata: { reason: "operator_reconcile" }
          }
        }),
        error: /valid JSON/
      },
      {
        name: "metadata-size",
        operation: async (snapshot: { baseFingerprint: string; serializedState: string }) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: undefined,
          auditEvent: {
            action: "token_created" as const,
            actorUserId: "operator-a",
            source: "operator" as const,
            metadata: { expiresAt: "x".repeat(17_000) }
          }
        }),
        error: /too large/
      }
    ];

    for (const candidate of cases) {
      const scope = `audit-${candidate.name}-${randomUUID()}`;
      const store = await createPostgresTeamAuthorizationStateStore({
        connectionString: connectionString!
      });
      await store.initializeAbsent(scope, {
        generation: "0",
        baseFingerprint: "0".repeat(64),
        serializedState: '{"version":2,"members":[]}'
      });
      try {
        await expect(store.transact!(
          scope,
          "0".repeat(64),
          { mutating: true },
          candidate.operation
        )).rejects.toThrow(candidate.error);
        await expect(store.read(scope)).resolves.toMatchObject({ generation: "0" });
        await expect(store.listAuditEvents!(scope, {
          afterId: "0",
          limit: 10
        })).resolves.toEqual([]);
      } finally {
        await store.close();
      }
    }
  });

  test("rolls back audit when the PostgreSQL state update fails", async () => {
    const scope = `audit-update-failure-${randomUUID()}`;
    const triggerName = `fail_audit_update_${randomUUID().replaceAll("-", "")}`;
    const database = new Pool({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });
    await database.query(
      `CREATE TRIGGER ${triggerName}
       BEFORE UPDATE ON layo_team_authorization_state
       FOR EACH ROW
       WHEN (NEW.scope = '${scope}')
       EXECUTE FUNCTION suppress_redundant_updates_trigger()`
    );

    try {
      await expect(store.transact!(
        scope,
        "0".repeat(64),
        { mutating: true },
        async (snapshot) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: undefined,
          auditEvent: {
            action: "base_reconciled",
            actorUserId: "operator-a",
            source: "operator",
            metadata: { reason: "operator_reconcile" }
          }
        })
      )).rejects.toThrow();
      await expect(store.read(scope)).resolves.toMatchObject({ generation: "0" });
      await expect(store.listAuditEvents!(scope, {
        afterId: "0",
        limit: 10
      })).resolves.toEqual([]);
    } finally {
      await database.query(
        `DROP TRIGGER IF EXISTS ${triggerName} ON layo_team_authorization_state`
      );
      await Promise.all([store.close(), database.end()]);
    }
  });

  test("keeps audit ids and generations exact above Number.MAX_SAFE_INTEGER", async () => {
    const scope = `audit-large-id-${randomUUID()}`;
    const database = new Pool({ connectionString: connectionString! });
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "9007199254740993",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });
    await database.query(
      `SELECT setval(
        pg_get_serial_sequence('layo_authorization_audit_events', 'id'),
        9007199254740993,
        false
      )`
    );

    try {
      const committed = await store.transact!(
        scope,
        "0".repeat(64),
        { mutating: true },
        async (snapshot) => ({
          baseFingerprint: snapshot.baseFingerprint,
          serializedState: snapshot.serializedState,
          result: undefined,
          auditEvent: {
            action: "base_reconciled",
            actorUserId: "operator-a",
            source: "operator",
            metadata: { reason: "operator_reconcile" }
          }
        })
      );
      expect(committed.generation).toBe("9007199254740994");
      expect(committed.auditEvent?.id).toBe("9007199254740993");
      await expect(store.listAuditEvents!(scope, {
        afterId: "9007199254740992",
        limit: 10
      })).resolves.toEqual([
        expect.objectContaining({
          id: "9007199254740993",
          generation: "9007199254740994"
        })
      ]);
    } finally {
      await Promise.all([store.close(), database.end()]);
    }
  });

});
