import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import {
  canonicalTeamAuthorizationBaseFingerprint,
  createTeamAuthorizationFileManager,
  parseTeamAuthorizationConfig
} from "./team-authorization.js";
import type {
  TeamAuthorizationStateSnapshot,
  TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";

test("rejects an audit page when the authorization base changes after the database read", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "layo-audit-base-race-"));
  const filePath = path.join(root, "members.json");
  const base = JSON.stringify([{
    userId: "owner-user",
    role: "owner",
    teamIds: ["team-alpha"],
    token: "owner-secret"
  }]);
  await writeFile(filePath, base, "utf8");
  const config = parseTeamAuthorizationConfig(base);
  if (!config) {
    throw new Error("test authorization config did not parse");
  }

  const snapshot: TeamAuthorizationStateSnapshot = {
    generation: "1",
    baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
    serializedState: "{\"version\":2,\"members\":[]}"
  };
  const listAuditEvents = vi.fn(async () => {
    await writeFile(filePath, JSON.stringify([{
      userId: "replacement-owner",
      role: "owner",
      teamIds: ["team-alpha"],
      token: "replacement-secret"
    }]), "utf8");
    return [];
  });
  const store = {
    read: vi.fn(async () => snapshot),
    initializeAbsent: vi.fn(),
    mutate: vi.fn(),
    transact: vi.fn(async (
      _scope: string,
      _fingerprint: string,
      _options: { mutating: boolean },
      operation: (locked: TeamAuthorizationStateSnapshot) => Promise<{
        baseFingerprint: string;
        serializedState: string;
        result: unknown;
      }>
    ) => {
      const result = await operation(snapshot);
      return {
        generation: snapshot.generation,
        baseFingerprint: result.baseFingerprint,
        serializedState: result.serializedState,
        result: result.result
      };
    }),
    listAuditEvents,
    close: vi.fn()
  } as unknown as TeamAuthorizationStateStore;
  const manager = createTeamAuthorizationFileManager(filePath, config, {
    stateStore: store,
    sharedScope: "team-alpha"
  });

  try {
    await expect(manager.listAuditEvents?.(
      { userId: "owner-user", memberToken: "owner-secret" },
      { afterId: "0", limit: 50 }
    )).rejects.toMatchObject({
      statusCode: 503,
      message: "authorization audit history is unavailable"
    });
    expect(listAuditEvents).toHaveBeenCalledWith(
      "team-alpha",
      expect.objectContaining({
        expectedGeneration: "1",
        expectedBaseFingerprint: snapshot.baseFingerprint
      })
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
