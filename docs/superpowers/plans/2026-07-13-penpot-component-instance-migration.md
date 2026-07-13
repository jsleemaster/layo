# Penpot Component Instance Migration Plan

**Status:** Active after PR #281.

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

- [ ] Add a packaged Penpot file with one main component, one linked copy, a
      text/color override, and stable source identifiers.
- [ ] Add a variant set with at least two property combinations and an instance
      selecting the non-default variant.
- [ ] Prove review, import, HTTP persistence, agent inspection, component
      handoff, and browser rendering currently flatten or skip those relations.

## Task 2: Structural migration

- [ ] Map supported mains to component definitions and copies to component
      instances with deterministic ids.
- [ ] Map variant property/value combinations, selected variant ids, connected
      source trees, and supported text/fill/stroke/opacity/geometry overrides.
- [ ] Preserve assets and fill/stroke paint ownership inside component trees.
- [ ] Reject ambiguous or dangling relations in review without partial writes.

## Task 3: Product proof

- [ ] Verify imported main and copy badges, variant controls, override retention,
      detach, component update behavior, undo/redo, persistence, and reload.
- [ ] Verify MCP/HTTP inspect, validation, change summary, Yjs, library/code
      handoff, SVG/PDF/raster output, and direct Playwright CLI interaction.
- [ ] Run failure learning, review, merge, post-merge cleanup, and route the next
      exact Penpot migration gap.
