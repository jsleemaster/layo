# Penpot Authorization Audit Log Plan

Date: 2026-07-15
Status: active
Penpot reference: `develop` commit `167aa7410f95bce91b9a80059624a3e3d9307f1e`
Prior merge: PR #310 / `9a710fc6bbd9b81d6ef68d8d5f4421aae28803a9`
Cleanup record: PR #311 / `2f3b90a21db1ba8dfc62576d1d06493a6dd300be`

## Failed maturity case

Layo now orders shared managed-token state through one PostgreSQL generation,
but a successful create, revoke, bootstrap, restore, or base reconciliation has
no durable append-only operator record. Process logs and API responses cannot
prove who changed which credential metadata, at which committed generation, or
whether an external operator consumed the event.

Penpot persists audit events in PostgreSQL and its archive task reads unarchived
rows, sends them, and records `archived_at`. Layo will adopt durable
append/consume semantics, adapt them to the explicit team-owned authorization
scope and deterministic HTTP/MCP contracts, and diverge by avoiding a
maintainer-operated telemetry/archive endpoint.

## Product contract

1. A changed shared authorization mutation and its secret-free audit event commit
   in the same PostgreSQL transaction. Neither may commit alone.
2. Events are immutable and ordered by exact bigint event id plus committed
   authorization generation. IDs and generations remain decimal strings in
   JavaScript contracts.
3. Event payloads contain scope, action, actor user id, subject token id/name,
   generation, source surface, request id when supplied, and database time.
   They never contain plaintext tokens, token hashes, member tokens, database
   URLs, raw member files, or arbitrary request bodies.
4. No-op and rejected mutations append nothing. A rollback leaves both state and
   audit rows unchanged.
5. HTTP and MCP owner reads use request-time authorization and cursor pagination.
   Editors/viewers, cross-scope principals, database outage, malformed rows, and
   unsafe values fail closed without leaking event metadata.
6. Operator export writes one private versioned NDJSON/JSON artifact atomically,
   marks only the exported rows archived, and is at-least-once across a crash
   between durable file replacement and database commit. Stable event ids are
   the deduplication key.
7. Filesystem authorization remains database-free and exposes no fake durable
   audit history.
8. Retention never deletes unarchived rows. Archived deletion requires explicit
   age/count policy, dry-run review, and operator action.
9. Shared runtime shutdown drains in-flight audit reads/exports before closing
   the pool.
10. UI is Korean-first and shows owner-only token activity with deterministic
    empty, loading, error, pagination, and identity-change invalidation states.

## Task 1: Versioned audit schema and transactional RED

**Files:**
- Create: `apps/server/migrations/0002-team-authorization-audit.sql`
- Modify: `apps/server/src/team-authorization-postgres.ts`
- Modify: `apps/server/src/team-authorization-postgres.test.ts`
- Modify: `.github/workflows/full-verification.yml`

- [ ] Add an immutable audit table with bigint id, scope, generation, action,
      actor, subject metadata, source, request id, created timestamp, archived
      timestamp, bounded JSON metadata, and indexes for scope/id and unarchived
      export.
- [ ] Extend migration versioning without granting privileges in application SQL.
- [ ] RED: two clients mutate one scope and produce state generations 1/2 plus
      audit ids in commit order.
- [ ] RED: callback failure, no-op, serialization failure, oversized metadata,
      plaintext-like forbidden fields, and state update failure append nothing.
- [ ] RED: event id/generation above JavaScript safe integer remains exact.
- [ ] Implement one transaction for state update plus audit append.

## Task 2: Mutation attribution

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: shared manager/provider tests
- Modify: HTTP/MCP token administration integration tests

- [ ] Thread typed actor, source, and optional request id through create/revoke,
      bootstrap, restore, and base reconciliation.
- [ ] Create and revoke events expose token id/name but no credential material.
- [ ] Reconciliation records counts/reason codes, not member-file contents.
- [ ] Rejected/no-op operations remain silent.
- [ ] Preserve one-time plaintext token delivery even if post-commit cache
      publication fails.

## Task 3: Owner cursor consumption

**Files:**
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/web/src/api.ts`
- Modify: Korean team settings UI
- Add focused unit/integration/e2e tests

- [ ] Add owner-only HTTP and MCP list operations with `afterId` and bounded
      `limit`.
- [ ] Re-authenticate through the request-time provider for every read.
- [ ] Prove editor/viewer/cross-scope denial and outage/malformed-row fail-close.
- [ ] Add Korean owner activity UI with identity/session generation invalidation.
- [ ] Run direct Playwright CLI owner/editor and pagination interactions.

## Task 4: Operator export and retention

**Files:**
- Create or modify audit CLI modules and package scripts
- Create focused PostgreSQL audit archive workflow
- Add operation tests and runbook

- [ ] Export an ordered private versioned artifact through atomic replace/fsync.
- [ ] Mark exactly the exported ids archived only after durable file replacement.
- [ ] Prove retry is at-least-once with stable-id dedup after injected commit
      failure.
- [ ] Add dry-run/apply retention that never deletes unarchived rows.
- [ ] Add PostgreSQL CI proof for append, export, archive mark, retry, and
      retention.
- [ ] Document migration/runtime/export roles, TLS, backup, and recovery.

## Task 5: Evidence, review, and merge

- [ ] Update README, environment template, maturity benchmark, PLAN_STATUS, and a
      focused product delta.
- [ ] Run focused tests, Full Verification, authorization audit archive drill,
      authorization backup drill, filesystem restore, and retention on one head.
- [ ] Request independent review for transaction atomicity, secret leakage,
      cursor isolation, SQL injection, bigint overflow, exporter crash windows,
      concurrent exporters, retention safety, and shutdown.
- [ ] Convert every finding into a deterministic RED until review is clean.
- [ ] Update PR body, squash merge exact reviewed head, and run post-merge
      cleanup without deleting dirty/user-owned worktrees.

Deployment remains non-gating. The prior local git exit-134 cleanup exceptions
remain explicit until local status/current-branch/worktree checks actually
succeed.
