# Penpot Library In-Use Deletion Guard Delta

**Date:** 2026-07-13  
**PR:** #284  
**Active plan:** `2026-07-13-penpot-library-update-conflict-recovery.md`

## Benchmark Decision

- **Adopt:** Penpot's explicit library update step before shared source changes
  reach dependent files.
- **Adapt:** Layo previews source-to-target component deletion through the
  existing registry subscription map and reports every directly or indirectly
  affected instance.
- **Diverge deliberately:** deleting a definition used by a target instance or
  `component_swap` is a no-write blocker instead of leaving a stale local copy
  or silently invalidating the target.

References:

- https://help.penpot.app/user-guide/design-systems/libraries/
- https://help.penpot.app/user-guide/design-systems/components/
- https://github.com/penpot/penpot

## Product Delta

- `reviewLibraryRegistryItemUpdate` compares the published archive with the
  source-to-target component map.
- Deleted components report source id, mapped target id, direct instance ids,
  and parent instances whose swap override selects the deleted definition.
- `updateLibraryRegistryItem` runs the same preview before asset, document, or
  subscription writes and returns an input-validation error when deletion is in
  use.
- Unused source deletions are removed from target definitions during an
  otherwise compatible refresh.
- HTTP exposes `POST
  /files/:fileId/import/library/registry/update/review`.
- The Korean editor reviews first and reports deleted component and affected
  instance counts instead of sending the update request.

## Failure Learning

- The existing update notification only compared registry timestamps and
  counts; it did not describe semantic component deletion.
- The existing update implementation replaced present definitions but retained
  removed definitions indefinitely.
- Impact analysis must include both the selected nested instance and the parent
  instance carrying `component_swap`; checking `definition_id` alone is
  incomplete.
- Browser proof must assert that the apply endpoint is never called after a
  blocked preview, not only that an error message appears.

No memory note was added because this is a repository-local product contract now
captured by the focused fixture, HTTP test, Playwright interaction, this delta,
and the active plan.

## Verification

- RED Full Verification `29249518688`: 262 server tests passed and the new
  case failed because `reviewLibraryRegistryItemUpdate` did not exist.
- GREEN Full Verification `29250183489`: maturity/design gates, typecheck,
  web build, core suites, Rust workspace tests, and 192 Playwright CLI cases
  passed.
- The Playwright case imports the real packaged Penpot library, reloads the
  project, clicks the library update action, sees the Korean conflict summary,
  and proves the apply request count remains zero.

## Remaining Gap

The active plan remains open. The next exact cases are an incompatible source
replacement with preserved ids and a locally overridden target instance whose
override no longer applies. Partial-write rollback and version recovery remain
after those semantic conflicts.
