# Penpot First-Class Fill Paints Plan

**Goal:** Replace scalar or child-node flattening of ordered Penpot fill paints
with one authoritative per-fill solid, gradient, or image ownership contract
across model, MCP/HTTP, collaboration, components, Inspector, canvas, artifacts,
migration, and code handoff.

**Benchmark decision:** Adopt Penpot's ordered fill paint flexibility. Adapt
image assets to Layo's local store and preserve mask/blend metadata explicitly.
Do not encode image fills as synthetic child layers when the original shape owns
the paint.

References:

- https://help.penpot.app/user-guide/designing/color-fill/
- https://github.com/penpot/penpot

## Task 1: Exact RED contract

- [ ] Add mixed solid, gradient, and image fill fixtures with independent order,
      opacity, visibility, blend metadata, and asset ownership.
- [ ] Prove current scalar fill and image-child paths lose ordered ownership
      through MCP/HTTP, Yjs, components, reload, and code handoff.
- [ ] Record canvas pixel, SVG, PDF, and raster artifact failures.

## Task 2: Unified fill paint ownership

- [ ] Add one structured ordered fill contract with deterministic legacy
      migration and validation.
- [ ] Preserve masks, blend metadata, gradient geometry/stops, assets, history,
      component overrides, and local-first storage.
- [ ] Render and export every supported paint source without flattening or
      synthetic image children.

## Task 3: Product proof

- [ ] Add Korean Inspector lifecycle controls for create/edit/reorder/hide/
      duplicate/delete and solid/gradient/image switching.
- [ ] Verify undo/redo, persistence, reload, collaboration, migration, code
      handoff, visible pixels, and downloaded artifacts through Playwright CLI.
- [ ] Run the failure-learning loop, review, merge, post-merge cleanup, and
      route the next exact Penpot gap.
