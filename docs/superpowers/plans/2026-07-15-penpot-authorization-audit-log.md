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

- [x] Add an immutable audit table with bigint id, scope, generation, action,
      actor, subject metadata, source, request id, created timestamp, archived
      timestamp, bounded JSON metadata, and indexes for scope/id and unarchived
      export.
- [x] Extend migration versioning without granting privileges in application SQL.
- [x] RED: two clients mutate one scope and produce state generations 1/2 plus
      audit ids in commit order.
- [ ] RED: callback failure, no-op, serialization failure, oversized metadata,
      plaintext-like forbidden fields, and state update failure append nothing.
- [ ] RED: event id/generation above JavaScript safe integer remains exact.
- [x] Implement one transaction for state update plus audit append.

**Task 1 evidence (2026-07-15):**

- Contract RED Full Verification `29399966499` failed because
  `TeamAuthorizationStateStore.listAuditEvents` did not exist.
- First GREEN attempt `29400368590` reached core tests and exposed only a
  malformed managed-state fixture plus the old newer-schema sentinel.
- Exact initial transaction head `6f8edc1844496d5eb84a54581bc633ff37b1a1ed`
  passed Full Verification `29400734216`.
- Secret-safety RED `29401321360` proved nested
  `request.memberToken` metadata committed before recursive validation.
- Repaired head `52dc85fb220df11ad534ae0cac18f312bffb0043`
  rejects secret-related keys at every metadata depth, rejects cycles and
  no-op audit append, and passed Full Verification `29401692453`.
- Oversized metadata, exact event ids above JavaScript safe integer, injected
  state-update failure, and broader migration privilege proof remain open Task
  1 gates and are intentionally not checked.

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

## Deployment failure-learning evidence (2026-07-16)

The reported Vercel deployment
`dpl_6qaTjzmQHPus1bM4Ga1jXjAMBj45` failed at web typecheck because
`App.tsx` imported `pathHasOnlyClosedSubpaths` from `./path-editor` even
though the public implementation lives in `@layo/renderer`. Current code
already used the correct contract; the deployment artifact test now prevents
that import from moving back to the local editor module.

The comprehensive live check exposed two additional deployment failures that a
Vercel `READY` state did not detect:

- Production `/health` returned 500 because Node 24 could not resolve the
  extensionless `packages/renderer/dist/boolean-path` export.
- Collection and nested same-origin APIs returned Vercel platform 404 because
  `api/[...path].ts` did not expose multi-segment raw function routes.
- The first working bridge leaked Vercel's wildcard capture as `?path=...`
  into Fastify requests.
- The account audit E2E initially expected owner denial immediately after an
  identity import, but identity replacement correctly clears the member token.
  The test now reapplies the editor token before asserting the owner-only 403.

Durable fixes are the Node-loadable renderer ESM export, the
`check:serverless-runtime` gate in PR and production workflows, the explicit
`api/bridge.ts` function, tested route reconstruction, complete web API
rewrites, and live smoke coverage for both `/health` and `/projects`.
The production workflow now pins Vercel CLI `56.2.1`; the requested local
global upgrade was attempted but the local command runtime exited 134 before
installation, so no local upgrade success is claimed.

Evidence:

- Original Vercel log: `TS2305` missing
  `pathHasOnlyClosedSubpaths` export from `./path-editor`.
- Runtime RED: production `/health` 500 with `ERR_MODULE_NOT_FOUND` for
  `packages/renderer/dist/boolean-path`; production editor `/projects` 404.
- Contract RED Full Verification: `29465058726` for the stale CLI pin,
  `29465408735` for incomplete API rewrites, `29465735606` for the
  previously unwired live smoke, `29465895114` for the missing Node-loadable
  renderer contract, and `29466525097` for wildcard query leakage.
- UI failure-learning RED: `29408434747` for the editor identity/token
  lifecycle expectation.
- GREEN Full Verification: `29466650565` passed every gate including the
  serverless import check and full Playwright CLI E2E on
  `b6fc10d1e621d36ac7012e36f6778a03389d47dc`.
- Direct protected-preview Playwright check on
  `dpl_DKcJ6oeaDgd45sy3RXhLLj8EAcii`: editor rendered; `/health` 200
  `{"ok":true}`; `/projects` 200 `{"projects":[]}`; nested routes reached
  Fastify with no `x-vercel-error`; `/account/*` reached Fastify and
  returned the expected unconfigured file-authorization 503; no wildcard
  capture query remained.

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
