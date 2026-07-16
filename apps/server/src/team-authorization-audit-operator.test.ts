import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  applyAuthorizationAuditRetention,
  exportAuthorizationAuditEvents,
  type AuthorizationAuditOperatorStore
} from "./team-authorization-audit-operator.js";
import type { TeamAuthorizationAuditEvent } from "./team-authorization-postgres.js";

const EVENT: TeamAuthorizationAuditEvent = {
  id: "9007199254740993",
  scope: "team-a",
  generation: "9007199254740995",
  action: "token_created",
  actorUserId: "owner-a",
  subjectTokenId: "deploy-a",
  subjectTokenName: "Deploy A",
  source: "operator",
  requestId: "request-a",
  metadata: { reason: "rotation" },
  createdAt: "2026-07-16T00:00:00.000Z"
};

function fakeStore(overrides: Partial<AuthorizationAuditOperatorStore> = {}): AuthorizationAuditOperatorStore {
  return {
    listUnarchivedAuditEvents: vi.fn(async () => [EVENT]),
    markAuditEventsArchived: vi.fn(async () => undefined),
    listArchivedAuditRetentionCandidates: vi.fn(async () => []),
    deleteArchivedAuditEvents: vi.fn(async () => 0),
    ...overrides
  };
}

describe("authorization audit operator export", () => {
  test("durably creates a private versioned artifact before marking exact ids archived", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-audit-export-"));
    const outputPath = path.join(root, "audit.json");
    const order: string[] = [];
    const store = fakeStore({
      markAuditEventsArchived: vi.fn(async (_scope, eventIds) => {
        order.push("archive");
        expect(eventIds).toEqual(["9007199254740993"]);
        const artifact = JSON.parse(await readFile(outputPath, "utf8"));
        expect(artifact.events).toEqual([EVENT]);
      })
    });

    const result = await exportAuthorizationAuditEvents({
      store,
      scope: "team-a",
      outputPath,
      limit: 100,
      now: () => new Date("2026-07-16T01:00:00.000Z"),
      afterDurableReplace: () => {
        order.push("replace");
      }
    });

    expect(order).toEqual(["replace", "archive"]);
    expect(result).toEqual({
      outputPath,
      exportedCount: 1,
      firstEventId: "9007199254740993",
      lastEventId: "9007199254740993"
    });
    const raw = await readFile(outputPath, "utf8");
    expect(JSON.parse(raw)).toEqual({
      version: 1,
      scope: "team-a",
      exportedAt: "2026-07-16T01:00:00.000Z",
      events: [EVENT]
    });
    expect(raw).not.toMatch(/plaintext|database.*url/i);
    expect((await stat(outputPath)).mode & 0o077).toBe(0);
    expect(await readdir(root)).toEqual(["audit.json"]);
  });

  test("re-exports stable ids to a new batch after the archive commit fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-audit-retry-"));
    const firstOutputPath = path.join(root, "audit-first.json");
    const retryOutputPath = path.join(root, "audit-retry.json");
    let archiveAttempts = 0;
    const store = fakeStore({
      markAuditEventsArchived: vi.fn(async () => {
        archiveAttempts += 1;
        if (archiveAttempts === 1) {
          throw new Error("injected archive commit failure");
        }
      })
    });

    await expect(exportAuthorizationAuditEvents({
      store,
      scope: "team-a",
      outputPath: firstOutputPath,
      limit: 100,
      now: () => new Date("2026-07-16T01:00:00.000Z")
    })).rejects.toThrow("injected archive commit failure");
    const first = JSON.parse(await readFile(firstOutputPath, "utf8"));

    await expect(exportAuthorizationAuditEvents({
      store,
      scope: "team-a",
      outputPath: retryOutputPath,
      limit: 100,
      now: () => new Date("2026-07-16T01:01:00.000Z")
    })).resolves.toMatchObject({ exportedCount: 1 });
    const second = JSON.parse(await readFile(retryOutputPath, "utf8"));

    expect(first.events[0].id).toBe("9007199254740993");
    expect(second.events[0].id).toBe("9007199254740993");
    expect(archiveAttempts).toBe(2);
    expect((await readdir(root)).sort()).toEqual([
      "audit-first.json",
      "audit-retry.json"
    ]);
  });
});

test("refuses to overwrite an existing audit artifact", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "layo-audit-existing-"));
  const outputPath = path.join(root, "audit.json");
  const store = fakeStore();

  await exportAuthorizationAuditEvents({
    store,
    scope: "team-a",
    outputPath,
    limit: 100
  });
  await expect(exportAuthorizationAuditEvents({
    store,
    scope: "team-a",
    outputPath,
    limit: 100
  })).rejects.toThrow(/already exists|immutable batch/i);
});

describe("authorization audit retention", () => {
  test("dry-run reports archived candidates without deleting", async () => {
    const deleteArchivedAuditEvents = vi.fn(async () => 2);
    const store = fakeStore({
      listArchivedAuditRetentionCandidates: vi.fn(async () => ["8", "9"]),
      deleteArchivedAuditEvents
    });

    await expect(applyAuthorizationAuditRetention({
      store,
      scope: "team-a",
      archivedBefore: "2026-06-16T00:00:00.000Z",
      keepNewest: 10,
      limit: 100,
      apply: false
    })).resolves.toEqual({ candidateIds: ["8", "9"], deletedCount: 0, applied: false });
    expect(deleteArchivedAuditEvents).not.toHaveBeenCalled();
  });

  test("apply deletes only the exact archived candidate ids selected by policy", async () => {
    const deleteArchivedAuditEvents = vi.fn(async (_scope, ids) => {
      expect(ids).toEqual(["8", "9"]);
      return 2;
    });
    const store = fakeStore({
      listArchivedAuditRetentionCandidates: vi.fn(async () => ["8", "9"]),
      deleteArchivedAuditEvents
    });

    await expect(applyAuthorizationAuditRetention({
      store,
      scope: "team-a",
      archivedBefore: "2026-06-16T00:00:00.000Z",
      keepNewest: 10,
      limit: 100,
      apply: true,
      reviewedCandidateIds: ["8", "9"]
    })).resolves.toEqual({ candidateIds: ["8", "9"], deletedCount: 2, applied: true });
  });
});
