# Penpot Component Library And Swap Migration Delta

**Date:** 2026-07-13  
**PR:** #283  
**Maturity gate:** Design systems, import/export, library ownership, developer handoff

## Benchmark Decision

- **Adopt:** Penpot cross-file `component-file`, `component-id`,
  `shape-ref`, and nested `swap-slot-*` ownership semantics.
- **Adapt:** Packaged Penpot source files become team-owned Layo project
  documents, registry libraries, subscriptions, native definitions, instances,
  and deterministic `component_swap` overrides.
- **Adapt:** Media owned by a packaged source library is stored once and remains
  available to library archives, subscriptions, imported definitions, and
  refreshed target definitions.
- **Diverge deliberately:** unresolved or ambiguous external component sources
  block review before project, file, asset, or registry writes.

Official references:

- https://help.penpot.app/user-guide/design-systems/components/
- https://help.penpot.app/user-guide/design-systems/libraries/
- https://github.com/penpot/penpot/commit/a006a12ab6929804af918ec1f5c845d0aeab8b51
- https://github.com/penpot/penpot/blob/develop/backend/src/app/common/files/component.cljc

## Product Delta

Packaged Penpot component libraries now preserve:

- every manifest file as one relation graph while keeping only the selected
  product file on the target canvas;
- source libraries as project documents published to Layo's existing library
  registry with deterministic identity subscriptions;
- external main definitions without duplicate source-library definitions;
- nested selected copies as native instances and outer
  `component_swap` overrides keyed by the original source slot;
- cross-file fills, image paints, asset metadata, archive bytes, and accurate
  library/subscription asset counts;
- source library republish and target refresh without losing the nested swap;
- no-write review blockers for missing or ambiguous packaged sources;
- agent inspection, document validation, structured code handoff, HTTP
  persistence, browser import, project reload, and direct layer/Inspector
  interaction.

The Playwright proof uploads a packaged product plus Shape library, confirms
four review candidates, imports both documents, selects `Card copy`, verifies
x=400, checks the persisted Circle swap through HTTP, reloads, reopens the
imported project through `project-switcher`, and selects the same layer again.

## Failure Learning

- **First-file-only graph:** review originally read only the first manifest file,
  so valid external component sources looked missing. Package parsing now builds
  one relation graph from every manifest file.
- **Flattened nested swap:** root copies were materialized before nested copies,
  losing the selected child definition. Nested copies are now materialized
  first, definitions are refreshed, then root copies and swap overrides are
  applied.
- **Ownership without persistence:** the first mapping returned source
  libraries but storage wrote only the target. Storage now validates all
  deterministic ids before writes, persists project documents, publishes
  registry entries, and records subscriptions.
- **Primary-file-only media:** component relations crossed files while media
  lookup did not. Package media is now merged across all source files, and
  image-paint assets participate in file, project, and library archives.
- **Reload test gap:** the browser test expected the layer panel immediately
  after reload although the app returns to the file panel. It now reopens the
  imported project through the real project switcher before checking layers.
- **Materialized child identity assumption:** the first agent assertion expected
  the Penpot copy-layer id. Native instances intentionally use the stable
  `copy-root__source-slot` identity, now asserted explicitly.

No memory note was added: these misses are repository-local migration and
verification contracts captured by focused tests, this delta, the completed
plan, and the PR body.

## Verification

- Review RED `29244805795`: a packaged valid cross-file relation was blocked.
- Structural RED `29245285835`: external native definitions were absent.
- Ownership RED `29245799016`: imported source libraries were not returned.
- Persistence RED `29246130322`: the project contained only the target file.
- Storage repair `29246276547`: typecheck caught the missing `assetCount`
  return contract before runtime.
- Browser failure `29246894374`: 191 cases passed and the new reload assertion
  exposed the missing project re-entry action.
- Agent-contract failure `29247968681`: 261 server tests passed and the new
  inspection assertion exposed the incorrect copy-layer id assumption.
- Final Full Verification `29248081639`: maturity/design gates, typecheck, web
  build, 250 web tests, 262 server tests, Rust workspace tests, and 192
  Playwright CLI cases passed.

## Remaining Gap

The happy-path library refresh is now proven, but concurrent source changes,
deleted or renamed definitions, incompatible local overrides, partial write
failure, and rollback/recovery are not yet exercised as one product workflow.
The next maturity-loop goal is
`2026-07-13-penpot-library-update-conflict-recovery.md`.
