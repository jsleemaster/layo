import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createTeamAuthorizationFileManager,
  parseTeamAuthorizationConfig,
  type TeamAuthorizationConfig
} from "./team-authorization.js";
import type {
  TeamAuthorizationStateSnapshot,
  TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";
import { canonicalTeamAuthorizationBaseFingerprint } from "./team-authorization-shared-cli.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function tokenHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function configFrom(base: string): TeamAuthorizationConfig {
  const config = parseTeamAuthorizationConfig(base);
  if (!config) {
    throw new Error("test authorization config did not parse");
  }
  return config;
}

function memoryStore(initial: TeamAuthorizationStateSnapshot): {
  store: TeamAuthorizationStateStore;
  current: () => TeamAuthorizationStateSnapshot;
  replace: (snapshot: TeamAuthorizationStateSnapshot) => void;
  transactionOptions: Array<{ mutating: boolean }>;
} {
  let snapshot = initial;
  const transactionOptions: Array<{ mutating: boolean }> = [];
  const store: TeamAuthorizationStateStore = {
    async read() {
      return snapshot;
    },
    async initializeAbsent() {
      return { initialized: false, snapshot };
    },
    async transact<T>(_scope, expectedBaseFingerprint, options, operation) {
      transactionOptions.push(options);
      if (snapshot.baseFingerprint !== expectedBaseFingerprint) {
        throw new Error("authorization base fingerprint does not match shared state");
      }
      const result = await operation(snapshot);
      const changed = options.mutating && result.changed !== false;
      snapshot = {
        generation: changed
          ? (BigInt(snapshot.generation) + 1n).toString()
          : snapshot.generation,
        baseFingerprint: result.baseFingerprint,
        serializedState: result.serializedState
      };
      return { ...snapshot, result: result.result };
    },
    async mutate<T>(_scope, expectedBaseFingerprint, operation) {
      if (snapshot.baseFingerprint !== expectedBaseFingerprint) {
        throw new Error("authorization base fingerprint does not match shared state");
      }
      const result = await operation(snapshot);
      if (result.changed !== false) {
        snapshot = {
          generation: (BigInt(snapshot.generation) + 1n).toString(),
          baseFingerprint: result.baseFingerprint,
          serializedState: result.serializedState
        };
      }
      return { ...snapshot, result: result.result };
    },
    async close() {}
  };
  return {
    store,
    current: () => snapshot,
    replace: (next) => {
      snapshot = next;
    },
    transactionOptions
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "layo-reviewed-token-"));
  roots.push(root);
  const filePath = path.join(root, "members.json");
  const base = JSON.stringify([
    {
      userId: "owner-user",
      role: "owner",
      teamIds: ["team-alpha"],
      token: "owner-base-secret"
    }
  ], null, 2);
  await writeFile(filePath, base, "utf8");
  const initial = {
    generation: "7",
    baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(base),
    serializedState: "{\"version\":2,\"members\":[]}"
  };
  const state = memoryStore(initial);
  const generateId = vi.fn(() => "reviewed-token");
  const generateSecret = vi.fn(() => "layo_pat_reviewed_secret");
  const manager = createTeamAuthorizationFileManager(
    filePath,
    configFrom(await readFile(filePath, "utf8")),
    {
      stateStore: state.store,
      sharedScope: "team-alpha",
      now: () => new Date("2026-07-16T01:00:00.000Z"),
      generateId,
      generateSecret
    }
  );
  return {
    manager,
    state,
    generateId,
    generateSecret,
    principal: {
      userId: "owner-user",
      memberToken: "owner-base-secret",
      audit: { source: "mcp" as const }
    }
  };
}

describe("agent-reviewed account token mutation", () => {
  test("previews a create without state, audit, id, or secret mutation", async () => {
    const { manager, state, generateId, generateSecret, principal } = await fixture();
    const before = state.current();

    await expect(manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    })).resolves.toEqual({
      type: "create",
      expectedGeneration: "7",
      changed: true,
      summary: {
        name: "Deploy automation",
        expiresAt: "2026-08-15T01:00:00.000Z"
      }
    });

    expect(state.current()).toEqual(before);
    expect(state.transactionOptions).toEqual([{ mutating: false }]);
    expect(generateId).not.toHaveBeenCalled();
    expect(generateSecret).not.toHaveBeenCalled();
  });

  test("rejects a stale reviewed generation before generating token material", async () => {
    const { manager, state, generateId, generateSecret, principal } = await fixture();
    const review = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });
    state.replace({ ...state.current(), generation: "8" });
    const before = state.current();

    await expect(manager.manageTokens(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 },
      expectedGeneration: review.expectedGeneration
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(state.current()).toEqual(before);
    expect(generateId).not.toHaveBeenCalled();
    expect(generateSecret).not.toHaveBeenCalled();
  });

  test("commits the exact reviewed generation and returns plaintext only once", async () => {
    const { manager, state, generateSecret, principal } = await fixture();
    const review = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });

    const result = await manager.manageTokens(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 },
      expectedGeneration: review.expectedGeneration
    });

    expect(result).toEqual({
      type: "create",
      created: {
        token: "layo_pat_reviewed_secret",
        metadata: {
          id: "reviewed-token",
          name: "Deploy automation",
          createdAt: "2026-07-16T01:00:00.000Z",
          expiresAt: "2026-08-15T01:00:00.000Z"
        }
      }
    });
    expect(state.current().generation).toBe("8");
    expect(state.current().serializedState).toContain(tokenHash("layo_pat_reviewed_secret"));
    expect(state.current().serializedState).not.toContain("layo_pat_reviewed_secret");
    expect(generateSecret).toHaveBeenCalledOnce();
  });
});
