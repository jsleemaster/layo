# Penpot Authorization Audit Delta

Date: 2026-07-16
Penpot reference: `develop` commit `167aa7410f95bce91b9a80059624a3e3d9307f1e`
Decision: **adapt**

## Adopted

- Durable PostgreSQL audit rows.
- State mutation and audit append in one transaction.
- Unarchived export followed by archive marking.
- Stable event identity for retry and deduplication.

## Adapted For Layo

- Scope, generation, and event ids remain exact decimal strings.
- HTTP and MCP reads revalidate the authenticated state snapshot inside the audit query transaction.
- Operator export creates a private immutable local batch instead of sending events to a maintainer telemetry service; retries use a new path and stable event ids.
- Retention is explicit dry-run/apply, requires the exact reviewed candidate ids, and cannot delete unarchived rows.
- Browser activity history is Korean-first and owner-only.
- Bootstrap, restore, and offline reconciliation carry operator attribution.

## Deliberate Divergence

Layo remains local-first. Static Vercel hosting exposes only the web shell and a health function. It does not expose the filesystem server through shared serverless `/tmp` storage. Teams that need shared API storage operate an authenticated durable server separately.

## Evidence

- Transaction and secret-safety REDs: `29399966499`, `29401321360`.
- Deployment/review REDs: `29465058726`, `29465408735`, `29465735606`, `29465895114`, `29466525097`, `29467813326`.
- Operator contract RED: `29467393628`.
- Authorization Backup Drill: `29468592256`.
- Authorization Audit Archive Drill: `29468592227`.
- Storage Restore Drill: `29468592239`.
- Storage Backup Retention: `29468592273`.

Exact implementation head `8fcf77eb391f8249ab8d4efbc3a4bd65bed944a0` passed Full Verification `29471094368`, Authorization Backup `29471094371`, Authorization Audit Archive `29471094405`, Storage Restore `29471094381`, and Storage Backup Retention `29471094391`. Independent exact-head re-review was clean. PR #312 merge and post-merge cleanup remain recorded in the active plan.

## Merge And Deployment State

PR #312 squash-merged final docs head
`9e433418f771d479e997dd745bb68a466a5249e3` as
`4677d69055873710947f773d3f5bc881d676b4b0`. Production deployment is
separate from product completion: run `29472042251` failed its preflight
because all four required Vercel/GitHub Actions secrets are absent, so the live
alias remains on the older deployment until operators restore those secrets.
