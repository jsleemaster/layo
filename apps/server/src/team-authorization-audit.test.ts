import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
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
          serializedState: '{"version":2,"members":[{"userId":"owner-a"}]}',
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
          serializedState: '{"version":2,"members":[{"userId":"owner-b"}]}',
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

    const events = await first.listAuditEvents(scope, {
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
});
