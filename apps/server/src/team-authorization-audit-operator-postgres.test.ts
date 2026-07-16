import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import {
  exportAuthorizationAuditEvents,
  applyAuthorizationAuditRetention,
  type AuthorizationAuditOperatorStore
} from "./team-authorization-audit-operator.js";
import {
  createPostgresTeamAuthorizationStateStore,
  migratePostgresTeamAuthorizationState,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";

const connectionString = process.env.LAYO_TEST_POSTGRES_URL;
const describePostgres = connectionString ? describe : describe.skip;

function asOperatorStore(
  store: TeamAuthorizationStateStore
): AuthorizationAuditOperatorStore {
  return {
    listUnarchivedAuditEvents: store.listUnarchivedAuditEvents!.bind(store),
    markAuditEventsArchived: store.markAuditEventsArchived!.bind(store),
    listArchivedAuditRetentionCandidates:
      store.listArchivedAuditRetentionCandidates!.bind(store),
    deleteArchivedAuditEvents: store.deleteArchivedAuditEvents!.bind(store)
  };
}

describePostgres("PostgreSQL authorization audit archive drill", () => {
  beforeAll(async () => {
    await migratePostgresTeamAuthorizationState({
      connectionString: connectionString!
    });
  });

  test("retries stable ids, archives exact rows, and retains every unarchived row", async () => {
    const scope = `audit-archive-${randomUUID()}`;
    const root = await mkdtemp(path.join(tmpdir(), "layo-audit-pg-"));
    const outputPath = path.join(root, "audit.json");
    const store = await createPostgresTeamAuthorizationStateStore({
      connectionString: connectionString!
    });
    await store.initializeAbsent(scope, {
      generation: "0",
      baseFingerprint: "0".repeat(64),
      serializedState: '{"version":2,"members":[]}'
    });

    try {
      for (const [index, action] of [
        [1, "token_created"],
        [2, "token_revoked"]
      ] as const) {
        await store.transact!(
          scope,
          "0".repeat(64),
          { mutating: true },
          async (snapshot) => ({
            baseFingerprint: snapshot.baseFingerprint,
            serializedState: snapshot.serializedState,
            result: undefined,
            auditEvent: {
              action,
              actorUserId: "operator-a",
              source: "operator",
              ...(action === "token_created"
                ? {
                    subjectTokenId: "deploy-a",
                    subjectTokenName: "Deploy A"
                  }
                : {
                    subjectTokenId: "deploy-a",
                    subjectTokenName: "Deploy A"
                  }),
              metadata: {}
            }
          })
        );
        expect(index).toBeGreaterThan(0);
      }

      const operatorStore = asOperatorStore(store);
      let injected = false;
      await expect(exportAuthorizationAuditEvents({
        store: {
          ...operatorStore,
          markAuditEventsArchived: async () => {
            injected = true;
            throw new Error("injected archive commit failure");
          }
        },
        scope,
        outputPath,
        limit: 100,
        now: () => new Date("2026-07-16T04:00:00.000Z")
      })).rejects.toThrow("injected archive commit failure");
      expect(injected).toBe(true);
      const firstIds = JSON.parse(await readFile(outputPath, "utf8"))
        .events.map((event: { id: string }) => event.id);

      await exportAuthorizationAuditEvents({
        store: operatorStore,
        scope,
        outputPath,
        limit: 100,
        now: () => new Date("2026-07-16T04:01:00.000Z")
      });
      const retryIds = JSON.parse(await readFile(outputPath, "utf8"))
        .events.map((event: { id: string }) => event.id);
      expect(retryIds).toEqual(firstIds);
      expect((await store.listAuditEvents!(scope, {
        afterId: "0",
        limit: 10
      })).every((event) => event.archivedAt)).toBe(true);

      await store.transact!(
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

      const retention = {
        store: operatorStore,
        scope,
        archivedBefore: "2999-01-01T00:00:00.000Z",
        keepNewest: 0,
        limit: 100
      };
      await expect(applyAuthorizationAuditRetention({
        ...retention,
        apply: false
      })).resolves.toMatchObject({
        candidateIds: firstIds,
        deletedCount: 0,
        applied: false
      });
      await expect(applyAuthorizationAuditRetention({
        ...retention,
        apply: true
      })).resolves.toMatchObject({
        candidateIds: firstIds,
        deletedCount: 2,
        applied: true
      });
      const remaining = await store.listAuditEvents!(scope, {
        afterId: "0",
        limit: 10
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({
        action: "base_reconciled",
        archivedAt: undefined
      });
    } finally {
      await store.close();
    }
  });
});
