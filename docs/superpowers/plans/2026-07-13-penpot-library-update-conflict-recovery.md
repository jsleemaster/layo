# Penpot Library Update Conflict And Recovery Plan

**Status:** Active after PR #290.

**Goal:** Make imported Penpot library updates safe under source deletion,
renames, local override conflicts, and partial failure, with deterministic
preview, rollback, and recovery evidence.

**Benchmark decision:** Adopt Penpot's explicit shared-library update workflow
and source ownership. Adapt it to Layo's local-first registry subscriptions,
version history, deterministic component maps, and no-write previews. Diverge by
requiring an atomic preflight or recoverable snapshot before any update that can
invalidate target instances.

References:

- https://help.penpot.app/user-guide/design-systems/libraries/
- https://help.penpot.app/user-guide/design-systems/components/
- https://github.com/penpot/penpot

## Task 1: Exact RED Fixtures

- [ ] Start from the packaged cross-file library and nested-swap fixture merged
      by PR #283.
- [ ] Add source rename, deletion, incompatible replacement, local override,
      stale subscription, and interrupted-write cases.
- [ ] Prove current preview, update, instance validity, and recovery behavior for
      each exact failure.

## Task 2: Atomic Update Contract

- [ ] Add an agent-readable update preview with added, changed, deleted,
      conflicted, and affected-instance summaries.
- [ ] Preserve compatible swaps and overrides while blocking unresolved source
      deletions or incompatible replacements before writes.
- [ ] Make registry archive, target document, subscription metadata, and asset
      updates atomic or restore them from a deterministic snapshot.
- [ ] Keep team ownership and local-first storage boundaries intact.

## Task 3: Product Proof

- [ ] Verify accept, reject, rollback, retry, persistence, reload, and version
      recovery through storage and HTTP.
- [ ] Verify agent inspection, validation, change summaries, Yjs preservation,
      code handoff, SVG/PDF/raster output, and direct Playwright CLI interaction.
- [ ] Run failure learning, review, merge, post-merge cleanup, and route the next
      exact Penpot maturity gap.

## Progress After PR #284

- [x] Reused the packaged cross-file nested-swap fixture from PR #283.
- [x] Added the exact in-use source-deletion RED case.
- [x] Added source/target deletion mapping and direct plus parent-swap impact
      summaries.
- [x] Blocked update before asset, target document, or subscription writes.
- [x] Added storage, HTTP, web API, Korean UI, and direct Playwright CLI proof.
- [x] Add incompatible same-id replacement and local override conflict cases.
- [x] Validate replacement source-node identity across base and variant source
      trees, return affected instances and missing override targets, and block
      storage/HTTP/UI apply before writes.
- [x] Preserve the existing in-use deletion UI proof and add a direct
      Playwright CLI pass for override conflicts with zero apply requests.
- [x] Add a stale-preview race that publishes archive B after archive A is
      captured for review.
- [x] Bind compatibility review and mutation to one registry archive, parsed
      library, and target document snapshot.
- [x] Add stale-subscription metadata concurrency coverage and preserve an
      external subscription entry when rollback identity no longer matches.
- [x] Add concurrent target-writer rollback coverage and preserve the newer
      product edit when optimistic identity no longer matches.
- [x] Inject a failure after asset, document, and subscription writes and restore
      the exact pre-update bytes for every affected path.
- [x] Prove identical retry plus manual saved-version and recovery-version flows.
- [x] Add per-file serialization shared by library updates and normal product
      saves, plus optimistic target identity for direct filesystem changes.
- [x] Add crash-level write-ahead journal, atomic path replacement, startup
      recovery, and external-byte conflict proof.
- [x] Scope startup recovery to one shared promise per storage instance so
      project reads cannot roll back an active same-process journal.
- [ ] Add cross-process mutation locking with safe stale-lock recovery.

Evidence is recorded in
`docs/product/penpot-library-in-use-deletion-guard-delta.md` and
`docs/product/penpot-library-override-target-conflict-delta.md`,
`docs/product/penpot-library-stale-preview-snapshot-delta.md`, and
`docs/product/penpot-library-update-rollback-delta.md`, and
`docs/product/penpot-library-concurrent-writer-guard-delta.md`, and
`docs/product/penpot-library-subscription-writer-guard-delta.md`, and
`docs/product/penpot-library-crash-recovery-journal-delta.md`. The plan remains
active; do not treat PR #290 as completion of the broader recovery goal.
Cross-process mutation locking and stale-lock recovery are next.
