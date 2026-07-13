# Penpot Idempotent Library Publication Plan

Date: 2026-07-14
Status: Completed by PR #294 merge gate

## Goal

Make a retried library publication return the original committed result without
creating another archive/registry/event transaction when the caller repeats the
same idempotency key.

## Penpot Comparison

- Reference: https://github.com/penpot/penpot/releases/tag/2.14.1
- Current source: https://github.com/penpot/penpot/tree/develop
- Adopt: retry only operations with an explicit idempotent contract.
- Adapt: persist receipts in team-owned local storage and commit each receipt in
  the same recovery journal as archive, registry metadata, and registry events.
- Diverge: do not require Penpot's hosted RPC/database runtime.

## Maturity Gates

- Operations
- Design systems
- Import/export maturity
- Failure loop

## Exact Failed Case

After a successful publication response is lost, the same request is retried
with the same key. Before implementation Layo advances `updatedAt`, appends a
second sequence, and returns a different result.

RED: Full Verification `29279535916` failed only on the duplicate publication
regression.

## Tasks

- [x] Add the exact duplicate-retry storage RED.
- [x] Persist a publication receipt in the archive/registry/event transaction.
- [x] Return the receipt across a new storage instance.
- [x] Reject the same key with a different request fingerprint as HTTP 409.
- [x] Pass `Idempotency-Key` from HTTP into storage.
- [x] Expose the same retry key through the MCP publication tool.
- [x] Reject unsafe path-like keys as no-write HTTP 400.
- [x] Complete final full verification and review.
- [x] Prepare PR merge and post-merge cleanup.

## Failure Learning

Full Verification `29280022017` passed 281 of 282 server tests. The remaining
test incorrectly expected Fastify's detailed conflict text in `error`; the
established response stores it in `message`. The test now preserves that
contract.

MCP RED `29280506268` proved the existing tool discarded the key and published
twice. HTTP validation RED `29280727694` proved an unsafe path-like key was
blocked before writes but surfaced as 500 instead of the required input 400.
Follow-up `29280923088` confirmed the 400 implementation and corrected the test
to the existing validation `{ error }` branch rather than Fastify's `{ message }`
branch used by ordinary 409 conflicts.

## Final Verification

- Full Verification `29281150206`: maturity/design gates, typecheck, build,
  web 251, server 282, Rust workspace, and Playwright CLI 192 passed.
- Storage Restore Drill `29281150135`: passed.
- Storage Backup Retention `29281150115`: passed.

## Remaining Gap

Receipts are durable for a shared local filesystem. Hosted multi-instance
publication still needs authenticated principals, a transactional shared
database/object store, receipt retention policy, and durable pub/sub.
