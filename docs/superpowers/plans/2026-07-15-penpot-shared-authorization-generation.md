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

- [x] Add a PostgreSQL 16 service to Full Verification and a test-only URL with secret-free purpose comments.
- [x] Add `pg` and `@types/pg` through pnpm.
- [x] Add a versioned migration table plus authorization scope table with primary-key scope, nonnegative bigint generation, 64-hex base fingerprint, JSONB state, schema version, updated timestamp, and an encoded-state size check.
- [x] Document separate migration and runtime roles: migration owns advisory-lock/DDL privileges; runtime receives only schema-version read and scope-row SELECT/INSERT/UPDATE privileges. Do not grant privileges from application SQL.
- [x] Write a real PostgreSQL RED with two pools. Transaction A seeds/locks generation zero and pauses before its callback returns; prove B's callback cannot enter, release A, then prove B reads generation 1 and commits generation 2.
- [x] Require rollback to preserve prior generation/state, different scopes to remain isolated, oversized/malformed state to fail, and generation above JavaScript safe integer to remain exact as a decimal string.
- [x] Run the focused test and record the intended missing-store/migration RED.
- [x] Implement an explicit `authorization:migrate` command that takes a fixed PostgreSQL advisory lock, applies versioned migrations idempotently, and records schema version. Runtime startup only validates the required schema version and never needs DDL privileges.
- [x] Add a two-client migration race test proving one ordered migration result and runtime startup tests for missing/newer schema versions.
- [x] Implement atomic seed, locked reread, callback transaction, exact bigint parsing, commit, rollback, statement timeout, and idempotent close.
- [x] Re-run the focused suite to GREEN.

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

- [x] Write RED coverage for `bootstrap --empty` and `bootstrap --from-sidecar` into an absent scope.
- [x] When two hosts bootstrap concurrently, require identical canonical base fingerprint and serialized state; reject a conflicting loser without changing generation/state.
- [x] Reject bootstrap when the database scope is nonempty, when the sidecar has plaintext/malformed state, or when the current base cannot merge the sidecar.
- [x] Add `export` that emits a secret-free versioned JSON artifact with scope, generation string, base fingerprint, and hash-only state.
- [x] Add `restore` only for an absent scope. Reject every existing-scope restore, including matching fingerprint/generation, so a stale backup cannot resurrect revoked tokens over live state. Preserve the artifact generation as provenance while the restored row starts from that exact generation; require an explicit operator confirmation flag and test stale-backup/live-scope no-write behavior.
- [x] Require shared runtime startup to fail when the scope is absent with an exact bootstrap instruction. Runtime startup must never auto-import a sidecar.
- [x] Prove shared mode ignores a stale sidecar after bootstrap and filesystem mode remains unchanged.
- [x] Add package scripts for migrate/bootstrap/export/restore and focused GREEN tests.


**Task 1-2 evidence (2026-07-15):**

- Store RED: Full Verification `29383180698` failed on rollback scope recreation and plaintext state acceptance.
- CLI RED: Full Verification `29384285521` failed because the explicit shared CLI contract did not exist.
- Task 1 review found rollback cleanup, sidecar hash normalization, and pool lifecycle gaps; follow-up review was clean at `bb9ba622f02314ac0a744f6f9da9526c323927cf`.
- Task 2 review found locale ordering, export permissions/error precedence, and atomic backup publication gaps; follow-up review was clean at `5562b3cb8ad6ba7d559ce29d4c9edd227b39cf99`.
- Full Verification `29385113162` passed maturity gates, typecheck, build, and core PostgreSQL suites on the Task 2 exact head before Playwright completion. Storage Restore Drill `29385113134` and Retention `29385113107` are the corresponding exact-head runs.

## Task 3: Canonical whole-base fingerprint and reconciliation RED

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Create: `apps/server/src/team-authorization-shared-store.test.ts`

- [x] Export/test one deterministic canonical whole-base fingerprint independent of JSON whitespace and member/token ordering.
- [x] Include all identity-relevant role, team, lifecycle, token metadata, and credential hashes; never include plaintext itself, only its hash.
- [x] Write a real PostgreSQL two-manager RED proving unmanaged member/role/team divergence fails closed.
- [x] Require a stale host to remain closed after another host reconciles a new base fingerprint.
- [x] Do not allow runtime principals to reconcile a scope-level base fingerprint. Add an explicit offline `authorization:reconcile-base` operator command requiring the current shared fingerprint, expected generation, and candidate base file; inside one locked transaction preserve revocations, quarantine incompatible managed generations, replace the canonical fingerprint, and increment generation once.
- [x] Write a stale/divergent runtime-host RED proving its locally valid owner credential cannot reconcile. Write concurrent offline reconciliation RED: one expected generation wins and a different candidate receives conflict without overwrite.
- [x] Implement shared manager options `stateStore` and required `sharedScope`.
- [x] Keep default filesystem locking/sidecar persistence byte-for-byte behavior unchanged.
- [x] Re-run sidecar, management, and shared-store suites to GREEN.

## Task 4: Commit/publication semantics and concurrent mutation

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/team-authorization-shared-store.test.ts`

- [x] Write two-manager concurrent create RED and require both hashes, one global generation sequence, and no plaintext in PostgreSQL.
- [x] Re-read and authenticate against the locked latest state inside every mutation callback; stale/revoked principals cannot overwrite newer state.
- [x] Re-read the local base immediately before returning the transaction callback so a pre-commit base change rolls back.
- [x] After commit, treat the database result as authoritative. If local base/cache publication fails, clear the local config, schedule refresh, return the committed result/one-time secret, and never report a false rollback.
- [x] Add an injected post-commit publication failure RED proving the created secret is returned exactly once, the hash remains committed, and another healthy host can authenticate it.
- [x] Add revoke/list/reconciliation variants and restart proof.
- [x] Re-run focused suites to GREEN.

**Task 3-4 evidence (2026-07-15):**

- Initial shared-manager RED: Full Verification `29385474812` failed on the missing reconciliation API and shared manager options.
- No-op generation RED: Full Verification `29386020111` proved idempotent revoke incorrectly advanced generation.
- Review converted stale list publication, post-commit refresh, quarantine recovery, raw mutate no-op, identical reconciliation, and PostgreSQL no-op cases into focused regression coverage.
- Late-list verification `29386441354` exposed a test-time error: revocation was fixed at `12:30:01Z` while authentication used the earlier CI wall clock. The regression now supplies an explicit post-revocation time; exact-head Full Verification `29386579896` passed.
- Independent review then found stale direct listings and multi-member quarantine deadlock. RED `29387074305` failed in exactly those two cases; shared listings now transact through PostgreSQL and quarantined managed state is isolated per member.
- Full Verification `29387261850` passed all 419 tests but caught an unhandled concurrent-reconciliation rejection. The loser Promise now receives a rejection handler at creation, eliminating the test-harness race.
- Publication RED `29387591852` proved a recovered member's committed state could not republish while another member remained quarantined. Publication now excludes only quarantined managed tokens and retains valid operator base credentials.
- Exact reviewed head `8638a9d155d46f14ec343b1d16d42d2b6ce1e1c7`: Full Verification `29387700993` passed maturity/design gates, typecheck, web build, core tests, and Playwright CLI e2e in 10m40s. Storage Restore Drill `29387701003` and Retention `29387700996` passed. Independent P0-P2 review was clean.

## Task 5: Request-time revocation and outage behavior

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/mcp.ts`
- Create: `apps/server/src/team-authorization-shared-auth.test.ts`
- Modify: relevant HTTP/MCP authorization tests

- [x] Add an async authorization source/provider used by every protected HTTP route, SSE poll, MCP tool, and token-management operation.
- [x] Before authentication, read the current operator base file, read PostgreSQL, then reread the base file. Accept only equal base snapshots whose canonical fingerprint equals the shared row; retry a bounded number of times on an in-flight base write, then fail closed.
- [x] Write RED proving a base change between database read and authentication cannot use a watched cache or accept the old credential.
- [x] Write RED proving host B rejects a token on the first protected request after host A commits revocation, without waiting for watcher polling.
- [x] Require unchanged generations to avoid reparsing managed state but still complete the stable base/database/base read before auth.
- [x] Write deterministic outage/timeout/malformed-generation/unsafe-bigint RED cases: startup and each protected request fail closed, cached credentials are not accepted, and recovery publishes only the newest generation.
- [x] Prevent a slow stale read from republishing after a newer generation or after close.
- [x] Preserve unconfigured local-first synchronous behavior.
- [x] Re-run HTTP, SSE, MCP, and management tests to GREEN.

**Task 5 evidence (2026-07-15):**

- Provider contract RED: Full Verification `29388355639` failed because `createTeamAuthorizationProvider` and `createSharedTeamAuthorizationProvider` did not exist.
- Request-path integration RED: Full Verification `29388618800` failed because HTTP and MCP did not accept a request-time authorization provider.
- First GREEN attempt `29388717693` proved the new HTTP, MCP, and SSE provider tests passed, while three existing token-administration tests caught an over-broad manager gate that returned 500 instead of the required 503 without an authorization source.
- The manager gate now requires both a manager and an authorization provider. Exact head `b5bc7fd7ec0be1f5a40302fe396ff4517936b370`: Full Verification `29388825857` passed maturity/design gates, typecheck, web build, all 427 server tests, Rust/workspace tests, and Playwright CLI e2e in 10m12s. Storage Restore Drill `29388825795` and Retention `29388825808` passed on the same head.

## Task 6: Async lifecycle and startup wiring

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/mcp.ts`
- Create or modify: focused startup/lifecycle tests

- [x] Require `LAYO_AUTHORIZATION_DATABASE_URL` and `LAYO_AUTHORIZATION_SHARED_SCOPE` together; reject partial configuration before HTTP listen or MCP connect.
- [x] Add short purpose comments without values/secrets around env wiring.
- [x] Return an async idempotent `close()` and `settled()` from the shared source/manager lifecycle.
- [x] HTTP close order: stop requests, stop refresh scheduling, drain, close pool.
- [x] MCP close order: stop transport/tool entry, stop refresh scheduling, drain, close pool.
- [x] Replace unawaitable `process.once("exit")` cleanup for shared resources with tested `SIGINT`, `SIGTERM`, transport-close, and startup-failure cleanup paths; keep a synchronous final safety hook only for resources that need none.
- [x] Prove no callback publishes after close and close is safe when called twice.
- [x] Re-run startup/lifecycle tests to GREEN.

**Task 6 evidence (2026-07-15):**

- Review RED Full Verification `29390562604` stopped on focused missing contracts for whitespace partial configuration, active-SSE pre-close, stdin EOF/signal shutdown, and HTTP construction/listen failure cleanup.
- Type repair RED `29391073510` stopped at the two shutdown-disposer annotations; async rejection RED `29391351523` then stopped only at deterministic failure reporting.
- Exact lifecycle repair head `da8579012196393664d6a8c9e5324abc302a8a7b`: Full Verification `29391895624` passed maturity/design gates, typecheck, web build, 442 server tests, Rust/workspace tests, and full Playwright CLI e2e.

## Task 7: Operations, backup, and product evidence

**Files:**
- Modify: `README.md`
- Modify: the established server environment template
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-shared-authorization-generation-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan
- Modify: storage/authorization backup workflows or add a focused authorization backup drill

- [x] Document filesystem default versus optional team-owned PostgreSQL authority.
- [x] Document explicit scope stability, request-time DB dependency, statement timeout, TLS/connection responsibility, migration privileges, hash-only state, and partial-config fail-close.
- [x] Add CI backup/restore proof for one authorization scope using the versioned export/restore commands; existing filesystem restore/retention evidence is not sufficient.
- [x] Document downgrade as explicit export plus operator action; never claim automatic stale-sidecar recovery.
- [x] Record Penpot reference commit, adopt/adapt/diverge decision, deterministic RED/GREEN IDs, and residual audit/general-recovery boundaries.
- [x] Keep the prior PR #308 local git exit-134 cleanup exception active until local status/current-branch/worktree checks actually succeed.

**Task 7 evidence (2026-07-15):**

- `README.md` and `apps/server/.env.example` document the local filesystem default, shared-mode configuration pair, stable scope, request-time dependency, five-second statement timeout, role separation, TLS/operator boundary, hash-only state, and explicit downgrade.
- `docs/product/penpot-shared-authorization-generation-delta.md`, the maturity benchmark, and `PLAN_STATUS.md` preserve the Penpot reference, adopt/adapt/diverge decision, RED/GREEN chain, and residual audit/recovery boundary.
- Authorization Backup Drill `29392003479` passed PostgreSQL 16 migration, bootstrap, private versioned export, exact-scope deletion, explicit absent-scope restore, byte-identical re-export, and secret-leak checks.

## Task 8: Verification, review, merge, and cleanup

- [x] Run focused PostgreSQL, bootstrap/export/restore, shared-manager, sidecar, HTTP, MCP, lifecycle, typecheck, and build checks.
- [x] Run Full Verification, filesystem Storage Restore Drill/Retention, and the new PostgreSQL authorization backup drill on the exact PR head.
- [x] Request independent security/code review focused on seed races, SQL injection, transaction rollback, bigint overflow, state size, stale generation, request-time outage behavior, scope disclosure, base divergence, migration conflict, plaintext leakage, and async shutdown.
- [x] Convert every actionable finding into a deterministic RED and repeat until review is clean.
- [x] Update the PR body with Penpot reference, failure evidence, verification, and deliberate divergence.
- [x] Squash merge only the exact reviewed and verified head.
- [ ] Run post-merge cleanup. If local system binaries still exit 134, preserve the explicit cleanup exception and do not claim local worktree cleanup.

**Task 8 review evidence (2026-07-15):**

- Independent lifecycle review found four initial P1/P2 issues, all reproduced by Full Verification `29390562604` and repaired by `29391895624`.
- Follow-up review found late SSE writes and close-rejection cleanup. RED `29394310891` failed at the missing ended-response guard; RED `29394464321` then failed only because runtime cleanup was skipped after `server.close()` rejection.
- A further initial-authentication/pre-close race produced actual-network RED `29394980417`. Repair attempt `29395174139` rejected the assumption that Fastify `preClose` always publishes state before an in-flight handler resumes.
- Final code head `05cc03591e71e30f53d737f52070da92cf9c8f6a` publishes closing state synchronously at `server.close()`, rejects post-close SSE hijack, suppresses ended-response writes, and always closes authorization runtime. Full Verification `29395377834` attempt 3 passed all gates with 445 server tests and 200 Playwright CLI cases. Independent re-review found no P0-P2.
- A later merge-gate run exposed nondeterministic read-entry ordering in the slow-generation test itself. Head `a263f7c2b3a91c43c59bc6ac2c094ef48e28f956` adds an explicit first-read barrier; Full Verification `29396976596`, Authorization Backup Drill `29396976519`, Storage Restore Drill `29396976502`, and Storage Backup Retention `29396976529` passed on that exact head.

**Merge and cleanup evidence (2026-07-15):**

- Evidence-only head `fd1783c6861a9d7bf63580e7acccc6e4a279cd73` passed Full Verification `29397873608`, Authorization Backup Drill `29397873842`, Storage Restore Drill `29397873471`, and Storage Backup Retention `29397873455`.
- PR #310 squash-merged as `9a710fc6bbd9b81d6ef68d8d5f4421aae28803a9` at 2026-07-15 07:48 UTC. Remote merge state and feature-branch deletion were verified.
- Required local `git status --short --branch`, `git branch --show-current`, and `git worktree list` still exit 134. The post-merge cleanup checkbox remains open and the local branch/worktree exception is retained; no dirty or user-owned worktree was deleted.
