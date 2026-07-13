# Penpot Component Library And Swap Migration Plan

**Status:** Completed by PR #283.

**Goal:** Preserve Penpot external component-library references and nested
component swaps through Layo library ownership instead of blocking or flattening
cross-file reusable relations.

**Benchmark decision:** Adopt Penpot's cross-file component ownership and nested
swap semantics. Adapt packaged library records to Layo library manifests,
definitions, instances, and deterministic swap overrides. Diverge with a
review-time no-write blocker when a referenced library or source component is
not packaged or resolvable.

References:

- https://help.penpot.app/user-guide/design-systems/components/
- https://help.penpot.app/user-guide/design-systems/libraries/
- https://github.com/penpot/penpot

## Task 1: Exact RED Fixtures

- [x] Package a Penpot file plus referenced component library with stable
      `component-file`, main, copy, and connected-layer identifiers.
- [x] Add a nested component instance whose selected child component differs
      from the main source.
- [x] Prove review, import, persistence, agent inspection, code handoff, and
      browser rendering currently block or lose those relations.

## Task 2: Structural Migration

- [x] Map packaged external component definitions into deterministic Layo
      library ownership without duplicating local definitions.
- [x] Map nested component swaps and supported touched fields to reversible
      native instance metadata.
- [x] Preserve variant selection, assets, paints, and connected source ids
      across file boundaries.
- [x] Keep missing or ambiguous external sources as no-write review blockers.

## Task 3: Product Proof

- [x] Verify library registration, import, instance swap, detach, update,
      persistence, reload, and recovery.
- [x] Verify MCP/HTTP inspect, validation, summaries, Yjs, code handoff,
      SVG/PDF/raster output, and direct Playwright CLI interaction.
- [x] Run failure learning, review, merge, post-merge cleanup, and route the next
      exact Penpot maturity gap.

## Execution Evidence

- Cross-file review, structural ownership, storage, registry, update, asset,
  agent/code handoff, and no-write blocker coverage lives in
  `apps/server/src/external-migration.penpot-components.test.ts`.
- Direct HTTP and Playwright CLI import, layer selection, persistence, reload,
  project re-entry, and Inspector proof lives in
  `apps/web/e2e/external-migration-penpot.spec.ts`.
- Final Full Verification `29248081639` passed 250 web tests, 262 server
  tests, the Rust workspace, and 192 Playwright CLI cases.
- Product and failure-learning evidence is recorded in
  `docs/product/penpot-component-library-swap-migration-delta.md`.
- Update conflict and rollback recovery is routed to
  `2026-07-13-penpot-library-update-conflict-recovery.md`.
