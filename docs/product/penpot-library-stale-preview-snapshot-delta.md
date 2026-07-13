# Penpot Library Stale Preview Snapshot Delta

**PR:** #286  
**Status:** Registry archive review/apply race closed. The broader interrupted-write
rollback and version-recovery plan remains active.

## Failed Case

`updateLibraryRegistryItem` previously read the published archive once for
compatibility review and again for mutation. A publisher could replace compatible
archive A with incompatible archive B between those reads. The operation then
mutated the target with B even though only A had passed preflight.

RED Full Verification `29253847729` proved the public update path performed two
registry archive reads. The fixture captures A, publishes B from inside the first
read boundary, and expects the target to receive only A.

## Benchmark Decision

- **Adopt:** Penpot's explicit library update review semantics.
- **Adapt:** bind review and mutation to one immutable local archive buffer,
  parsed library payload, and target document snapshot.
- **Diverge:** a concurrent newer publication remains pending for the next update
  instead of changing an in-flight local-first operation.

## Implemented Contract

- Shared component compatibility review is now a pure function of subscription,
  target snapshot, and source component snapshot.
- The public review route continues to inspect the current archive without writes.
- The apply path captures registry entry, archive, target document, and parsed
  library exactly once.
- Compatibility checks, id-map reuse, asset writes, component/token replacement,
  and subscription metadata all consume the captured snapshot.
- A concurrently published B cannot be mixed into the operation that reviewed A.

## Verification

GREEN Full Verification `29254347531` passed after infrastructure recovery:

- maturity and design rule gates
- TypeScript typecheck and web build
- 251 web tests
- 265 server tests
- Rust workspace tests
- 192 Playwright CLI tests

The focused race fixture proves one archive read, compatible A styling, preserved
source-node identity, and preserved local override after B is published.

## Failure Learning

The first RED attempt for `29253847729` failed in GitHub Actions setup with
`Failed to resolve action download info`; rerunning the same commit separated
infrastructure failure from the expected two-read assertion.

The first GREEN attempt for `29254347531` passed all core tests but encountered
unrelated existing browser-state failures and flaky retries. A same-commit rerun
passed all 192 Playwright tests. No product code was changed to mask those
failures.

**Root cause:** preflight and mutation independently resolved mutable registry
state. A safe preview is not sufficient unless the exact reviewed bytes are the
bytes consumed by apply.

**Durable guard:** the test changes the registry during the first read callback,
asserts a single archive read, and checks that the target reflects A rather than B.

## Next Goal

Inject a deterministic failure after asset writes and before document or
subscription completion. Require atomic commit or snapshot restoration, then
prove retry and saved-version recovery before closing the active plan.
