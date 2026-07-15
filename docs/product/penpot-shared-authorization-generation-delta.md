# Penpot Shared Authorization Generation Delta

Date: 2026-07-15
Status: active PR evidence
Penpot reference: `develop` commit `167aa7410f95bce91b9a80059624a3e3d9307f1e`

## Benchmark Decision

Penpot persists access-token authority in PostgreSQL and creates tokens inside a
database transaction. Layo adopts the durable transactional ordering boundary,
adapts it to one operator-selected team-owned scope and the existing member-file
identity model, and deliberately diverges by keeping filesystem authorization as
the zero-database local-first default.

The shared mode is optional infrastructure owned by the deploying team. It does
not introduce a maintainer-operated Layo backend, account service, or deployment
dependency.

## Product Contract

- `LAYO_AUTHORIZATION_DATABASE_URL` and
  `LAYO_AUTHORIZATION_SHARED_SCOPE` are an all-or-nothing pair. Partial or
  whitespace-only configuration fails before HTTP listen or MCP connect.
- Shared mode requires `LAYO_LIBRARY_REGISTRY_MEMBERS_FILE`. That file remains
  the base identity record; PostgreSQL stores only the canonical base
  fingerprint, bounded managed-token JSON, schema version, and exact monotonic
  generation.
- Scope identifiers are explicit, stable, validated deployment identifiers.
  They are never inferred from a hostname, path, or process.
- Mutations lock one scope row, recheck the base fingerprint, execute the
  existing token semantics, and publish the next generation in one transaction.
  A no-op keeps the current generation.
- Request-time HTTP, MCP, and SSE authorization reads PostgreSQL. The process
  cache is an optimization only; database errors fail closed.
- Startup verifies migration state and scope readability before accepting work.
  Shutdown rejects new authorization work, stops refresh scheduling, drains
  in-flight work, and then closes the pool. HTTP pre-close terminates active SSE
  streams; MCP handles signals, transport close, startup failure, and stdin EOF.
- Filesystem mode keeps the existing watched sidecar and process/file-lock
  behavior without opening PostgreSQL.

## Failure Learning Evidence

Deterministic RED evidence:

- Full Verification `29384546474`: PostgreSQL state-store contract was absent.
- Full Verification `29385917375`: bootstrap/export/restore CLI contract was
  absent.
- Full Verification `29386840736`: two-client shared-manager transaction
  contract was absent.
- Full Verification `29388355639`: request-time authorization provider
  factories were absent.
- Full Verification `29388618800`: HTTP and MCP request paths could not accept
  the provider.
- Full Verification `29390562604`: lifecycle review regressions proved missing
  whitespace validation, active-SSE pre-close, stdin EOF shutdown, and startup
  failure cleanup.
- Full Verification `29391073510`: shutdown disposer inference failed
  typecheck.
- Full Verification `29391351523`: async shutdown rejection reporting occurred
  outside the focused deterministic test boundary.

GREEN evidence established before the lifecycle review:

- Exact head `b5bc7fd7ec0be1f5a40302fe396ff4517936b370`, Full Verification
  `29388825857`: maturity/design gates, typecheck, web build, 427 server tests,
  Rust/workspace tests, and full Playwright CLI e2e passed.
- Storage Restore Drill `29388825795` and Storage Backup Retention
  `29388825808` passed on that same head.
- Exact lifecycle head `ba6420c1d71293e4f0664f61d19170adc38ca8f3`
  passed the failed-job rerun for Full Verification `29389837619`; the first
  attempt hit only an existing load-sensitive five-second test timeout.
- Authorization Backup Drill `29392003479` passed PostgreSQL 16 migration,
  bootstrap, versioned export, exact-scope deletion, explicit restore,
  byte-identical re-export, private artifact mode, and secret-leak checks.

The final repaired PR-head Full Verification, storage drills, independent review,
and merge evidence remain Task 8 gates and must be added before this document is
marked complete.

## Operations Boundary

The migration role owns schema creation and the migration ledger. The runtime
role needs only migration-ledger read plus select/insert/update access to the
authorization state table. The client applies a five-second statement timeout;
TLS policy, CA trust, credential rotation, connection limits, monitoring, and
database-level backup are operator responsibilities.

The repository export is a versioned logical artifact for one selected scope.
Restore refuses overwrite and requires explicit absent-scope confirmation.
Downgrade is export plus operator-controlled stop/reconfigure/restore action.
Layo does not automatically promote a stale filesystem sidecar after shared mode
is disabled.

## Residual Gaps

This slice closes the previously recorded multi-host managed-token generation
gap for one explicit scope. It does not close:

- durable append-only authorization audit-event consumption,
- hosted general account recovery or administrator-assisted recovery,
- multi-region database availability and disaster recovery,
- hosted identity, SSO, SCIM, or organization policy,
- agent dry-run/reviewability for token mutations,
- general hosted durable pub/sub for registry events,
- automatic downgrade or stale-sidecar reconciliation.

Deployment remains non-gating. The product target remains the full Penpot
maturity benchmark, not completion of this isolated authorization slice.
