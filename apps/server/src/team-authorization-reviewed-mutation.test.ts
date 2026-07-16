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
const signingKey = "review-signing-key-with-at-least-thirty-two-bytes";

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
  const transact: NonNullable<TeamAuthorizationStateStore["transact"]> =
    async (_scope, expectedBaseFingerprint, options, operation) => {
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
    };
  const mutate: TeamAuthorizationStateStore["mutate"] =
    async (_scope, expectedBaseFingerprint, operation) => {
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
    };
  const store: TeamAuthorizationStateStore = {
    async read() {
      return snapshot;
    },
    async initializeAbsent() {
      return { initialized: false, snapshot };
    },
    transact,
    mutate,
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
    },
    {
      userId: "other-owner",
      role: "owner",
      teamIds: ["team-alpha"],
      token: "other-owner-secret"
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
  let currentNow = new Date("2026-07-16T01:00:00.000Z");
  const manager = createTeamAuthorizationFileManager(
    filePath,
    configFrom(await readFile(filePath, "utf8")),
    {
      stateStore: state.store,
      sharedScope: "team-alpha",
      reviewSigningKey: signingKey,
      now: () => currentNow,
      generateId,
      generateSecret
    }
  );
  return {
    manager,
    state,
    generateId,
    generateSecret,
    setNow: (value: string) => {
      currentNow = new Date(value);
    },
    principal: {
      userId: "owner-user",
      memberToken: "owner-base-secret",
      audit: { source: "mcp" as const }
    },
    otherPrincipal: {
      userId: "other-owner",
      memberToken: "other-owner-secret",
      audit: { source: "mcp" as const }
    }
  };
}

describe("agent-reviewed account token mutation", () => {
  test("previews a create without state, audit, token id, or token secret mutation", async () => {
    const { manager, state, generateId, generateSecret, principal } = await fixture();
    const before = state.current();

    const review = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });

    expect(review).toEqual({
      type: "create",
      expectedGeneration: "7",
      changed: true,
      summary: {
        name: "Deploy automation",
        expiresInDays: 30
      },
      receipt: expect.any(String),
      receiptExpiresAt: "2026-07-16T01:05:00.000Z"
    });
    expect(review.receipt).not.toContain("Deploy automation");
    expect(state.current()).toEqual(before);
    expect(state.transactionOptions).toEqual([{ mutating: false }]);
    expect(generateId).not.toHaveBeenCalled();
    expect(generateSecret).not.toHaveBeenCalled();
  });

  test("binds a receipt to the reviewed operation and principal", async () => {
    const {
      manager,
      state,
      generateId,
      generateSecret,
      principal,
      otherPrincipal
    } = await fixture();
    const review = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });
    const before = state.current();

    await expect(manager.manageTokens(principal, {
      type: "create",
      input: { name: "Different automation", expiresInDays: 30 },
      reviewReceipt: review.receipt!
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(manager.manageTokens(otherPrincipal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 },
      reviewReceipt: review.receipt!
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(state.current()).toEqual(before);
    expect(generateId).not.toHaveBeenCalled();
    expect(generateSecret).not.toHaveBeenCalled();
  });

  test("rejects a forged payload that reuses a valid receipt signature", async () => {
    const {
      manager,
      state,
      generateId,
      generateSecret,
      principal
    } = await fixture();
    const review = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });
    const before = state.current();
    const [encoded, signature] = review.receipt!.split(".");
    const payload = JSON.parse(
      Buffer.from(encoded!, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const forged = `${Buffer.from(JSON.stringify({
      ...payload,
      generation: "8"
    }), "utf8").toString("base64url")}.${signature}`;

    await expect(manager.manageTokens(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 },
      reviewReceipt: forged
    })).rejects.toMatchObject({ statusCode: 400 });

    expect(state.current()).toEqual(before);
    expect(generateId).not.toHaveBeenCalled();
    expect(generateSecret).not.toHaveBeenCalled();
  });

  test("rejects stale and expired receipts before generating token material", async () => {
    const {
      manager,
      state,
      generateId,
      generateSecret,
      setNow,
      principal
    } = await fixture();
    const stale = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });
    state.replace({ ...state.current(), generation: "8" });

    await expect(manager.manageTokens(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 },
      reviewReceipt: stale.receipt!
    })).rejects.toMatchObject({ statusCode: 409 });

    state.replace({ ...state.current(), generation: "7" });
    setNow("2026-07-16T01:05:00.001Z");
    await expect(manager.manageTokens(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 },
      reviewReceipt: stale.receipt!
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(generateId).not.toHaveBeenCalled();
    expect(generateSecret).not.toHaveBeenCalled();
  });

  test("uses commit time for expiry and rejects receipt replay after one commit", async () => {
    const {
      manager,
      state,
      generateSecret,
      setNow,
      principal
    } = await fixture();
    const review = await manager.reviewTokenMutation!(principal, {
      type: "create",
      input: { name: "Deploy automation", expiresInDays: 30 }
    });
    setNow("2026-07-16T01:02:00.000Z");

    const operation = {
      type: "create" as const,
      input: { name: "Deploy automation", expiresInDays: 30 as const },
      reviewReceipt: review.receipt!
    };
    const result = await manager.manageTokens(principal, operation);

    expect(result).toEqual({
      type: "create",
      created: {
        token: "layo_pat_reviewed_secret",
        metadata: {
          id: "reviewed-token",
          name: "Deploy automation",
          createdAt: "2026-07-16T01:02:00.000Z",
          expiresAt: "2026-08-15T01:02:00.000Z"
        }
      }
    });
    expect(state.current().generation).toBe("8");
    expect(state.current().serializedState).toContain(tokenHash("layo_pat_reviewed_secret"));
    expect(state.current().serializedState).not.toContain("layo_pat_reviewed_secret");
    expect(generateSecret).toHaveBeenCalledOnce();

    await expect(manager.manageTokens(principal, operation))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(generateSecret).toHaveBeenCalledOnce();
  });

  test("requires reviewed self-revoke acknowledgement and gives no receipt for an already revoked token", async () => {
    const { manager, state, principal } = await fixture();
    const created = await manager.manageTokens(principal, {
      type: "create",
      input: { name: "Self token", expiresInDays: null }
    });
    if (created.type !== "create") {
      throw new Error("expected token creation");
    }
    const namedPrincipal = {
      userId: "owner-user",
      memberToken: created.created.token,
      audit: { source: "mcp" as const }
    };

    await expect(manager.reviewTokenMutation!(namedPrincipal, {
      type: "revoke",
      tokenId: created.created.metadata.id
    })).rejects.toThrow(/confirmSelfRevoke/);

    const review = await manager.reviewTokenMutation!(namedPrincipal, {
      type: "revoke",
      tokenId: created.created.metadata.id,
      confirmSelfRevoke: true
    });
    expect(review).toMatchObject({
      type: "revoke",
      expectedGeneration: "8",
      changed: true,
      receipt: expect.any(String)
    });

    await expect(manager.manageTokens(namedPrincipal, {
      type: "revoke",
      tokenId: created.created.metadata.id,
      confirmSelfRevoke: false,
      reviewReceipt: review.receipt!
    })).rejects.toMatchObject({ statusCode: 400 });

    await expect(manager.manageTokens(namedPrincipal, {
      type: "revoke",
      tokenId: created.created.metadata.id,
      confirmSelfRevoke: true,
      reviewReceipt: review.receipt!
    })).resolves.toMatchObject({
      type: "revoke",
      metadata: {
        id: "reviewed-token",
        revokedAt: "2026-07-16T01:00:00.000Z"
      }
    });
    expect(state.current().generation).toBe("9");

    const noOp = await manager.reviewTokenMutation!(principal, {
      type: "revoke",
      tokenId: created.created.metadata.id
    });
    expect(noOp).toEqual({
      type: "revoke",
      expectedGeneration: "9",
      changed: false,
      summary: {
        metadata: {
          id: "reviewed-token",
          name: "Self token",
          createdAt: "2026-07-16T01:00:00.000Z",
          revokedAt: "2026-07-16T01:00:00.000Z"
        }
      }
    });
    expect(noOp).not.toHaveProperty("receipt");
    expect(state.current().generation).toBe("9");
  });

});
