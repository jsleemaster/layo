# Penpot Component Library And Swap Migration Plan

**Status:** Active after PR #282.

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

- [ ] Package a Penpot file plus referenced component library with stable
      `component-file`, main, copy, and connected-layer identifiers.
- [ ] Add a nested component instance whose selected child component differs
      from the main source.
- [ ] Prove review, import, persistence, agent inspection, code handoff, and
      browser rendering currently block or lose those relations.

## Task 2: Structural Migration

- [ ] Map packaged external component definitions into deterministic Layo
      library ownership without duplicating local definitions.
- [ ] Map nested component swaps and supported touched fields to reversible
      native instance metadata.
- [ ] Preserve variant selection, assets, paints, and connected source ids
      across file boundaries.
- [ ] Keep missing or ambiguous external sources as no-write review blockers.

## Task 3: Product Proof

- [ ] Verify library registration, import, instance swap, detach, update,
      persistence, reload, and recovery.
- [ ] Verify MCP/HTTP inspect, validation, summaries, Yjs, code handoff,
      SVG/PDF/raster output, and direct Playwright CLI interaction.
- [ ] Run failure learning, review, merge, post-merge cleanup, and route the next
      exact Penpot maturity gap.
