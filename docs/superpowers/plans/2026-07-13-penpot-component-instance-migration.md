# Penpot Component Instance Migration Plan

**Status:** Completed by PR #282.

**Goal:** Map supported Penpot main components, linked copies, variants, and
instance overrides into Layo's native component definitions and instances
without flattening reusable relationships into ordinary frames.

**Benchmark decision:** Adopt Penpot's main-component and linked-copy ownership.
Adapt variant property/value combinations and connected-layer overrides to
Layo's existing definition, variant, instance, and override contracts. Diverge
with explicit no-write warnings when source identity or connected-layer mapping
is ambiguous instead of inventing links.

References:

- https://help.penpot.app/user-guide/design-systems/components/
- https://help.penpot.app/user-guide/design-systems/variants/
- https://github.com/penpot/penpot

## Task 1: Exact RED fixtures

- [x] Add a packaged Penpot file with one main component, one linked copy, a
      text/color override, and stable source identifiers.
- [x] Add a variant set with at least two property combinations and an instance
      selecting the non-default variant.
- [x] Prove review, import, HTTP persistence, agent inspection, component
      handoff, and browser rendering currently flatten or skip those relations.

## Task 2: Structural migration

- [x] Map supported mains to component definitions and copies to component
      instances with deterministic ids.
- [x] Map variant property/value combinations, selected variant ids, connected
      source trees, and supported text/fill/stroke/opacity/geometry overrides.
- [x] Preserve assets and fill/stroke paint ownership inside component trees.
- [x] Reject ambiguous or dangling relations in review without partial writes.

## Task 3: Product proof

- [x] Verify imported main and copy badges, variant controls, override retention,
      detach, component update behavior, undo/redo, persistence, and reload.
- [x] Verify MCP/HTTP inspect, validation, change summary, Yjs, library/code
      handoff, SVG/PDF/raster output, and direct Playwright CLI interaction.
- [x] Run failure learning, review, merge, post-merge cleanup, and route the next
      exact Penpot migration gap.

## Verification

- Ownership RED: `29240718967`.
- Variant RED: `29241301919`.
- Dangling relation RED: `29241748384`.
- Fill override RED: `29242451060`.
- Final code-head Full Verification: `29243082186` with 250 web,
  258 server, Rust workspace, and 191 Playwright CLI tests passing.
- Product evidence:
  `docs/product/penpot-component-instance-migration-delta.md`.
