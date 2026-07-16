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

The exact final one-head Full Verification and review/merge evidence remain in the active plan until PR #312 is ready.
