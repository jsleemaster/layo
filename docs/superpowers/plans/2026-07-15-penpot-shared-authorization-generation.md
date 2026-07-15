# Penpot Shared Authorization Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give optional multi-host Layo HTTP and MCP instances one team-owned PostgreSQL authorization state with transactional, monotonically increasing generations and request-time revocation checks while preserving the existing local-first file sidecar as the default mode.

**Architecture:** Add a versioned PostgreSQL authorization store keyed by an explicit operator-selected scope. Every mutation atomically seeds the scope row when absent, locks it, verifies one canonical whole-base fingerprint, mutates only hash-only managed state, and increments a bigint generation. Shared-mode HTTP/MCP authentication refreshes the generation from PostgreSQL before every protected operation and fails closed on outage or divergence; the watched config remains a UI/event cache, not the authorization authority. Existing filesystem sidecar behavior remains unchanged unless shared mode is explicitly configured.

**Tech Stack:** TypeScript, Fastify, MCP SDK, PostgreSQL 16, `pg`, Vitest, Playwright CLI, GitHub Actions

---

## Penpot Benchmark Decision

Reference snapshot: Penpot `develop` commit `167aa7410f95bce91b9a80059624a3e3d9307f1e` (2026-07-14).

- Architecture: https://help.penpot.app/technical-guide/developer/architecture/
- Backend: https://help.penpot.app/technical-guide/developer/architecture/backend/
- Access-token command: https://github.com/penpot/penpot/blob/167aa7410f95bce91b9a80059624a3e3d9307f1e/backend/src/app/rpc/commands/access_token.clj
- Access-token schema: https://github.com/penpot/penpot/blob/167aa7410f95bce91b9a80059624a3e3d9307f1e/backend/src/app/migrations/sql/0099-add-access-token-table.sql
- Access-token authentication: https://github.com/penpot/penpot/blob/167aa7410f95bce91b9a80059624a3e3d9307f1e/backend/src/app/http/access_token.clj

Penpot persists access tokens in PostgreSQL, creates them in `db/tx-run!`, and validates token existence/expiry against PostgreSQL during authentication. Layo will **adapt** that authority:

- Adopt one database transaction and request-time database lookup as ordering/authentication boundaries.
- Adapt storage to a team-owned PostgreSQL scope row containing a canonical base fingerprint, hash-only managed state, and monotonic bigint generation.
- Preserve the operator members file as identity input and explicit base-credential reconciliation.
- Diverge by keeping filesystem sidecar mode as the zero-database local-first default.
- Reject host-local path-derived scopes and silent dual-write/downgrade behavior.

This slice advances maturity gates 7, 8, and 10. It does not close audit consumption, general account recovery, or whole-product Penpot parity.

## Invariants

1. Scope is explicit and stable across hosts; local file paths never identify shared state.
2. A scope row is seeded with `INSERT ... ON CONFLICT DO NOTHING`, then locked with `SELECT ... FOR UPDATE`; concurrent first writers cannot both observe generation zero.
3. Generation is PostgreSQL `bigint`, represented as a decimal string in TypeScript/JSON, and increments exactly once per committed state mutation.
4. The row stores a SHA-256 fingerprint of the complete canonical operator base config, including unmanaged members, roles, teams, lifecycle fields, token ids/names, and credential hashes.
5. Shared managed state remains hash-only and size-bounded. No plaintext token, database URL, or relay secret may enter the row, logs, export, or docs.
6. Shared mode never reads or writes `<members-file>.tokens.json` after bootstrap. Downgrade requires an explicit export; stale sidecars are never reused automatically.
7. A protected HTTP/MCP request must refresh the shared generation before authentication. Database outage, timeout, malformed state, unsafe bigint, or base divergence fails closed.
8. A committed token mutation is authoritative even if local cache publication fails afterward. The API returns the committed result and clears/refreshes the local cache; it must not report rollback after commit or lose the one-time secret behind a false error.
9. Close is asynchronous, idempotent, stops new refreshes, drains in-flight work, then closes the pool. No callback may publish after close.

## Task 1: Versioned PostgreSQL store and deterministic first-writer RED

**Files:**
- Create: `apps/server/migrations/0001-team-authorization-state.sql`
- Create: `apps/server/src/team-authorization-postgres.ts`
- Create: `apps/server/src/team-authorization-postgres.test.ts`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/full-verification.yml`

- [ ] Add a PostgreSQL 16 service to Full Verification and a test-only URL with secret-free purpose comments.
- [ ] Add `pg` and `@types/pg` through pnpm.
- [ ] Add a versioned migration table plus authorization scope table with primary-key scope, nonnegative bigint generation, 64-hex base fingerprint, JSONB state, schema version, updated timestamp, and an encoded-state size check.
- [ ] Document separate migration and runtime roles: migration owns advisory-lock/DDL privileges; runtime receives only schema-version read and scope-row SELECT/INSERT/UPDATE privileges. Do not grant privileges from application SQL.
- [ ] Write a real PostgreSQL RED with two pools. Transaction A seeds/locks generation zero and pauses before its callback returns; prove B's callback cannot enter, release A, then prove B reads generation 1 and commits generation 2.
- [ ] Require rollback to preserve prior generation/state, different scopes to remain isolated, oversized/malformed state to fail, and generation above JavaScript safe integer to remain exact as a decimal string.
- [ ] Run the focused test and record the intended missing-store/migration RED.
- [ ] Implement an explicit `authorization:migrate` command that takes a fixed PostgreSQL advisory lock, applies versioned migrations idempotently, and records schema version. Runtime startup only validates the required schema version and never needs DDL privileges.
- [ ] Add a two-client migration race test proving one ordered migration result and runtime startup tests for missing/newer schema versions.
- [ ] Implement atomic seed, locked reread, callback transaction, exact bigint parsing, commit, rollback, statement timeout, and idempotent close.
- [ ] Re-run the focused suite to GREEN.

Store contract:

```ts
export interface TeamAuthorizationStateSnapshot {
  generation: string;
  baseFingerprint: string;
  serializedState: string;
}

export interface TeamAuthorizationStateStore {
  read(scope: string): Promise<TeamAuthorizationStateSnapshot>;
  mutate<T>(
    scope: string,
    expectedBaseFingerprint: string,
    operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{ baseFingerprint: string; serializedState: string; result: T }>
  ): Promise<{ generation: string; baseFingerprint: string; serializedState: string; result: T }>;
  close(): Promise<void>;
}
```

## Task 2: Explicit bootstrap, export, and no-dual-write boundary

**Files:**
- Create: `apps/server/src/team-authorization-shared-cli.ts`
- Create: `apps/server/src/team-authorization-shared-cli.test.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/team-authorization.ts`

- [ ] Write RED coverage for `bootstrap --empty` and `bootstrap --from-sidecar` into an absent scope.
- [ ] When two hosts bootstrap concurrently, require identical canonical base fingerprint and serialized state; reject a conflicting loser without changing generation/state.
- [ ] Reject bootstrap when the database scope is nonempty, when the sidecar has plaintext/malformed state, or when the current base cannot merge the sidecar.
- [ ] Add `export` that emits a secret-free versioned JSON artifact with scope, generation string, base fingerprint, and hash-only state.
- [ ] Add `restore` only for an absent scope. Reject every existing-scope restore, including matching fingerprint/generation, so a stale backup cannot resurrect revoked tokens over live state. Preserve the artifact generation as provenance while the restored row starts from that exact generation; require an explicit operator confirmation flag and test stale-backup/live-scope no-write behavior.
- [ ] Require shared runtime startup to fail when the scope is absent with an exact bootstrap instruction. Runtime startup must never auto-import a sidecar.
- [ ] Prove shared mode ignores a stale sidecar after bootstrap and filesystem mode remains unchanged.
- [ ] Add package scripts for migrate/bootstrap/export/restore and focused GREEN tests.

## Task 3: Canonical whole-base fingerprint and reconciliation RED

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Create: `apps/server/src/team-authorization-shared-store.test.ts`

- [ ] Export/test one deterministic canonical whole-base fingerprint independent of JSON whitespace and member/token ordering.
- [ ] Include all identity-relevant role, team, lifecycle, token metadata, and credential hashes; never include plaintext itself, only its hash.
- [ ] Write a real PostgreSQL two-manager RED proving unmanaged member/role/team divergence fails closed.
- [ ] Require a stale host to remain closed after another host reconciles a new base fingerprint.
- [ ] Do not allow runtime principals to reconcile a scope-level base fingerprint. Add an explicit offline `authorization:reconcile-base` operator command requiring the current shared fingerprint, expected generation, and candidate base file; inside one locked transaction preserve revocations, quarantine incompatible managed generations, replace the canonical fingerprint, and increment generation once.
- [ ] Write a stale/divergent runtime-host RED proving its locally valid owner credential cannot reconcile. Write concurrent offline reconciliation RED: one expected generation wins and a different candidate receives conflict without overwrite.
- [ ] Implement shared manager options `stateStore` and required `sharedScope`.
- [ ] Keep default filesystem locking/sidecar persistence byte-for-byte behavior unchanged.
- [ ] Re-run sidecar, management, and shared-store suites to GREEN.

## Task 4: Commit/publication semantics and concurrent mutation

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/team-authorization-shared-store.test.ts`

- [ ] Write two-manager concurrent create RED and require both hashes, one global generation sequence, and no plaintext in PostgreSQL.
- [ ] Re-read and authenticate against the locked latest state inside every mutation callback; stale/revoked principals cannot overwrite newer state.
- [ ] Re-read the local base immediately before returning the transaction callback so a pre-commit base change rolls back.
- [ ] After commit, treat the database result as authoritative. If local base/cache publication fails, clear the local config, schedule refresh, return the committed result/one-time secret, and never report a false rollback.
- [ ] Add an injected post-commit publication failure RED proving the created secret is returned exactly once, the hash remains committed, and another healthy host can authenticate it.
- [ ] Add revoke/list/reconciliation variants and restart proof.
- [ ] Re-run focused suites to GREEN.

## Task 5: Request-time revocation and outage behavior

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/mcp.ts`
- Create: `apps/server/src/team-authorization-shared-auth.test.ts`
- Modify: relevant HTTP/MCP authorization tests

- [ ] Add an async authorization source/provider used by every protected HTTP route, SSE poll, MCP tool, and token-management operation.
- [ ] Before authentication, read the current operator base file, read PostgreSQL, then reread the base file. Accept only equal base snapshots whose canonical fingerprint equals the shared row; retry a bounded number of times on an in-flight base write, then fail closed.
- [ ] Write RED proving a base change between database read and authentication cannot use a watched cache or accept the old credential.
- [ ] Write RED proving host B rejects a token on the first protected request after host A commits revocation, without waiting for watcher polling.
- [ ] Require unchanged generations to avoid reparsing managed state but still complete the stable base/database/base read before auth.
- [ ] Write deterministic outage/timeout/malformed-generation/unsafe-bigint RED cases: startup and each protected request fail closed, cached credentials are not accepted, and recovery publishes only the newest generation.
- [ ] Prevent a slow stale read from republishing after a newer generation or after close.
- [ ] Preserve unconfigured local-first synchronous behavior.
- [ ] Re-run HTTP, SSE, MCP, and management tests to GREEN.

## Task 6: Async lifecycle and startup wiring

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/mcp.ts`
- Create or modify: focused startup/lifecycle tests

- [ ] Require `LAYO_AUTHORIZATION_DATABASE_URL` and `LAYO_AUTHORIZATION_SHARED_SCOPE` together; reject partial configuration before HTTP listen or MCP connect.
- [ ] Add short purpose comments without values/secrets around env wiring.
- [ ] Return an async idempotent `close()` and `settled()` from the shared source/manager lifecycle.
- [ ] HTTP close order: stop requests, stop refresh scheduling, drain, close pool.
- [ ] MCP close order: stop transport/tool entry, stop refresh scheduling, drain, close pool.
- [ ] Replace unawaitable `process.once("exit")` cleanup for shared resources with tested `SIGINT`, `SIGTERM`, transport-close, and startup-failure cleanup paths; keep a synchronous final safety hook only for resources that need none.
- [ ] Prove no callback publishes after close and close is safe when called twice.
- [ ] Re-run startup/lifecycle tests to GREEN.

## Task 7: Operations, backup, and product evidence

**Files:**
- Modify: `README.md`
- Modify: the established server environment template
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-shared-authorization-generation-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan
- Modify: storage/authorization backup workflows or add a focused authorization backup drill

- [ ] Document filesystem default versus optional team-owned PostgreSQL authority.
- [ ] Document explicit scope stability, request-time DB dependency, statement timeout, TLS/connection responsibility, migration privileges, hash-only state, and partial-config fail-close.
- [ ] Add CI backup/restore proof for one authorization scope using the versioned export/restore commands; existing filesystem restore/retention evidence is not sufficient.
- [ ] Document downgrade as explicit export plus operator action; never claim automatic stale-sidecar recovery.
- [ ] Record Penpot reference commit, adopt/adapt/diverge decision, deterministic RED/GREEN IDs, and residual audit/general-recovery boundaries.
- [ ] Keep the prior PR #308 local git exit-134 cleanup exception active until local status/current-branch/worktree checks actually succeed.

## Task 8: Verification, review, merge, and cleanup

- [ ] Run focused PostgreSQL, bootstrap/export/restore, shared-manager, sidecar, HTTP, MCP, lifecycle, typecheck, and build checks.
- [ ] Run Full Verification, filesystem Storage Restore Drill/Retention, and the new PostgreSQL authorization backup drill on the exact PR head.
- [ ] Request independent security/code review focused on seed races, SQL injection, transaction rollback, bigint overflow, state size, stale generation, request-time outage behavior, scope disclosure, base divergence, migration conflict, plaintext leakage, and async shutdown.
- [ ] Convert every actionable finding into a deterministic RED and repeat until review is clean.
- [ ] Update the PR body with Penpot reference, failure evidence, verification, and deliberate divergence.
- [ ] Squash merge only the exact reviewed and verified head.
- [ ] Run post-merge cleanup. If local system binaries still exit 134, preserve the explicit cleanup exception and do not claim local worktree cleanup.
