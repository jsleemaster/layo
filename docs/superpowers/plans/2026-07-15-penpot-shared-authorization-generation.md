# Penpot Shared Authorization Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give optional multi-host Layo HTTP and MCP instances one team-owned PostgreSQL authorization state with transactional, monotonically increasing generations while preserving the existing local-first file sidecar as the default mode.

**Architecture:** Add a focused PostgreSQL managed-token state store whose transaction locks one explicit operator-selected scope row, reads the current hash-only state, commits one next state, and increments its generation atomically. Inject the store into the existing file authorization watcher and manager so the base members file remains operator-owned identity input while all hosts observe and mutate one ordered managed-token generation. Require an explicit shared scope instead of deriving identity from host-local file paths; keep the filesystem sidecar path unchanged when PostgreSQL is not configured.

**Tech Stack:** TypeScript, Fastify, MCP SDK, PostgreSQL 16, `pg`, Vitest, Playwright CLI, GitHub Actions

---

## Penpot Benchmark Decision

Reference snapshot: Penpot `develop` commit `167aa7410f95bce91b9a80059624a3e3d9307f1e` (2026-07-14).

- Architecture: https://help.penpot.app/technical-guide/developer/architecture/
- Backend: https://help.penpot.app/technical-guide/developer/architecture/backend/
- Access-token command: https://github.com/penpot/penpot/blob/167aa7410f95bce91b9a80059624a3e3d9307f1e/backend/src/app/rpc/commands/access_token.clj
- Access-token schema: https://github.com/penpot/penpot/blob/167aa7410f95bce91b9a80059624a3e3d9307f1e/backend/src/app/migrations/sql/0099-add-access-token-table.sql
- Access-token authentication: https://github.com/penpot/penpot/blob/167aa7410f95bce91b9a80059624a3e3d9307f1e/backend/src/app/http/access_token.clj

Penpot persists access tokens in PostgreSQL and runs token creation in `db/tx-run!`. Layo will **adapt** that transactional ownership rather than copy Penpot's hosted account model:

- Adopt one database transaction as the ordering boundary.
- Adapt storage to an optional team-owned PostgreSQL row containing only Layo's hash-only managed sidecar state plus a monotonic generation.
- Preserve the operator-owned members file and explicit recovery semantics.
- Diverge by keeping filesystem sidecar mode as the zero-database local-first default.
- Reject implicit scope derivation from a local file path because paths can differ across hosts.

This slice advances maturity gates 7, 8, and 10. It does not close hosted identity, audit consumption, database backup policy, or whole-product Penpot parity.

## Task 1: PostgreSQL transactional store RED

**Files:**
- Create: `apps/server/src/team-authorization-postgres.test.ts`
- Create: `apps/server/src/team-authorization-postgres.ts`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/full-verification.yml`

- [ ] Add a PostgreSQL 16 service to Full Verification with a purpose comment and a test-only connection URL.
- [ ] Add `pg` and its TypeScript types through the workspace package manager.
- [ ] Write a real-database test using two independent pools/stores for one scope. Start two blocked mutations from generation zero and require both committed states to survive with generations 1 then 2.
- [ ] Require rollback to leave generation/state unchanged when the mutation callback throws.
- [ ] Require different scopes to remain isolated.
- [ ] Run `pnpm --filter @layo/server test -- team-authorization-postgres` and record the expected missing-module/API RED before implementation.
- [ ] Implement `PostgresTeamAuthorizationStateStore` with schema initialization, `SELECT ... FOR UPDATE`, one callback per transaction, JSON validation boundary, generation increment, commit, rollback, and close.
- [ ] Keep connection URLs out of logs and persisted state.
- [ ] Re-run the focused tests to GREEN.

Expected public contract:

```ts
export interface TeamAuthorizationStateSnapshot {
  generation: number;
  serializedState?: string;
}

export interface TeamAuthorizationStateStore {
  read(scope: string): Promise<TeamAuthorizationStateSnapshot>;
  mutate<T>(
    scope: string,
    operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{ serializedState: string; result: T }>
  ): Promise<{ generation: number; result: T }>;
  close(): Promise<void>;
}
```

## Task 2: Manager integration RED

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Create: `apps/server/src/team-authorization-shared-store.test.ts`
- Modify: `apps/server/src/team-authorization-postgres.ts`

- [ ] Write a real PostgreSQL integration test with two watched configs, two managers, one shared scope, and concurrent token creates.
- [ ] Prove the current filesystem managers lose one cross-host update when process locking is unavailable or host-local paths differ; retain that exact RED evidence.
- [ ] Require shared mode to preserve both token hashes, expose no plaintext in PostgreSQL, and increment one global generation.
- [ ] Require a transaction callback to re-read/authenticate the latest shared state before mutation so stale principals cannot overwrite revocation.
- [ ] Require malformed shared JSON, missing members, binding mismatch, and divergent base files to fail closed.
- [ ] Require explicit base-credential reconciliation to preserve revocations and create a fresh generation.
- [ ] Run the focused test and record the intended RED.
- [ ] Inject `stateStore` and required `sharedScope` into manager options.
- [ ] Route shared-mode mutation through the store transaction; route default mode through the existing filesystem lock and sidecar persistence unchanged.
- [ ] Publish the committed merged config only after transaction commit.
- [ ] Re-run focused sidecar, management, HTTP, MCP, and shared-store tests to GREEN.

## Task 3: Cross-instance observation and lifecycle

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/team-authorization-shared-store.test.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/mcp.ts`

- [ ] Write RED coverage proving a second host observes a committed generation without restart and rejects a revoked token.
- [ ] Extend the watched authorization source with shared-store polling through the existing serialized reload tail.
- [ ] Ignore an unchanged generation; fail closed on malformed state or base binding mismatch.
- [ ] Add `settled()` to the source lifecycle if not already present and require `close()` to stop polling and drain in-flight work.
- [ ] Wire `LAYO_AUTHORIZATION_DATABASE_URL` and `LAYO_AUTHORIZATION_SHARED_SCOPE` into HTTP and stdio MCP startup with short secret-free purpose comments.
- [ ] Require both variables together; reject partial configuration before listening or connecting.
- [ ] Close pools during HTTP/MCP shutdown.
- [ ] Re-run focused lifecycle and startup tests to GREEN.

## Task 4: Product and operations evidence

**Files:**
- Modify: `README.md`
- Modify: `deploy/collab-relay/.env.example` only if it is the established server env template; otherwise use the existing server deployment template
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-shared-authorization-generation-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [ ] Document file sidecar as the default and PostgreSQL as optional team-owned multi-host coordination.
- [ ] Document required scope stability, hash-only state, migration/backup ownership, TLS/connection-string responsibility, and fail-closed partial configuration.
- [ ] Record Penpot adopt/adapt/diverge decision, exact reference commit, RED/GREEN IDs, and residual boundaries.
- [ ] Keep the prior PR #308 local git exit-134 cleanup exception active until those commands actually succeed.
- [ ] Route audit-event consumption and agent dry-run/reviewability as remaining gaps.

## Task 5: Verification, review, merge, and cleanup

- [ ] Run focused PostgreSQL, sidecar, management, HTTP, MCP, typecheck, and build checks.
- [ ] Run Full Verification, Storage Restore Drill, and Storage Backup Retention on the exact PR head.
- [ ] Request independent security/code review focused on SQL injection, transaction rollback, stale generation, pool lifecycle, cross-scope disclosure, base divergence, and plaintext leakage.
- [ ] Convert every actionable finding into a deterministic RED and repeat until review is clean.
- [ ] Update the PR body with Penpot reference, failure evidence, verification, and deliberate divergence.
- [ ] Squash merge only the exact reviewed and verified head.
- [ ] Run post-merge cleanup. If local git still exits 134, preserve the explicit cleanup exception and do not claim local worktree cleanup.
