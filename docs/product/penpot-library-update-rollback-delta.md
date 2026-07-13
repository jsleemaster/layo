# Penpot Library Update Rollback Delta

**PR:** #287  
**Status:** Caught partial-write failures now restore exact local snapshots. Stale
subscription concurrency and crash-level durability remain active.

## Failed Case

`updateLibraryRegistryItem` wrote library assets, then the target document, then
the registry subscription. If the subscription commit failed after writing, the
operation rejected but left the new asset bytes, component definitions, and
subscription metadata partially applied.

RED Full Verification `29257315822` injected an exception after the subscription
file was actually written. Typecheck and build passed, while the server regression
proved the target retained the new `#7c3aed` component plus normalized fields
instead of matching its pre-update snapshot.

## Benchmark Decision

- **Adopt:** Penpot-grade update behavior must not expose a partially applied
  shared-library revision.
- **Adapt:** a local-first filesystem store captures exact bytes for every affected
  asset file, asset metadata file, target document, and subscription store.
- **Diverge:** caught failures use deterministic snapshot restoration rather than
  requiring a hosted database transaction.

## Implemented Contract

- Capture every affected storage path before the first write, including paths that
  do not yet exist.
- Write library assets sequentially so rejected parallel work cannot race with
  rollback.
- On any caught asset, document, or subscription failure, restore the exact prior
  bytes or remove files that were absent before the update.
- Preserve both the original write error and any rollback error with
  `AggregateError`.
- Permit an identical retry to apply the reviewed archive successfully.
- Preserve manual file-version recovery: restoring the pre-update version returns
  the original document and creates a recovery version containing the successfully
  retried update.

## Verification

GREEN Full Verification `29258125418` passed on the same implementation commit
after an unrelated browser-state rerun:

- maturity and design rule gates
- TypeScript typecheck and web build
- 251 web tests
- 266 server tests
- Rust workspace tests
- 192 Playwright CLI tests

The first GREEN candidate `29257511963` passed core tests but ended with 189
Playwright passes, two API-state flaky retries, and one unrelated variant-fixture
response failure. No product code was changed to mask those failures.

## Failure Learning

**Root cause:** the update path treated three independent filesystem write groups
as if rejection implied no commit. It had neither a transaction nor compensating
restore behavior.

**Durable guard:** the regression publishes changed component and SVG bytes,
restores the pre-update local asset, commits new subscription metadata, throws,
and then checks exact document, subscription, asset data, and asset metadata
restoration. It also proves retry and saved-version recovery.

## Remaining Risk And Next Goal

Caught failures are restored, but a process crash or power loss between writes
cannot execute the catch block. A concurrent writer can also change the same
document or subscription after snapshot capture and be overwritten by rollback.

Inject a concurrent target/subscription edit between snapshot capture and failure.
Require per-file update serialization plus optimistic snapshot identity so
rollback cannot clobber another writer. Then add a recoverable filesystem journal
or atomic commit protocol and prove restart recovery. Stale subscription metadata
remains part of that exact next goal.
