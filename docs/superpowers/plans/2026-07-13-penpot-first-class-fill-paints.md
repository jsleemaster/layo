# Penpot First-Class Fill Paints Plan

**Status:** Completed on PR #281 code head.

**Goal:** Replace scalar or child-node flattening of ordered Penpot fill paints
with one authoritative per-fill solid, gradient, or image ownership contract
across model, MCP/HTTP, collaboration, components, Inspector, canvas, artifacts,
migration, and code handoff.

**Benchmark decision:** Adopt Penpot's ordered fill paint flexibility. Adapt
image assets to Layo's local store and preserve mask/blend metadata explicitly.
Do not encode image fills as synthetic child layers when the original shape owns
the paint.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Task 1: Exact RED contract

- [x] Add mixed solid, gradient, and image fill fixtures with independent order,
      opacity, visibility, blend metadata, and asset ownership.
- [x] Prove scalar fill and image-child paths lose ordered ownership through
      agent control, artifacts, migration, and code handoff.
- [x] Record canvas, SVG, PDF, and raster failures in PR #281.

## Task 2: Unified fill paint ownership

- [x] Add one structured ordered fill contract with deterministic legacy
      migration and validation.
- [x] Preserve masks, blend metadata, gradient geometry/stops, assets, history,
      component overrides, Yjs, persistence, and reload.
- [x] Render and export every supported paint source without flattening or
      synthetic image children.

## Task 3: Product proof

- [x] Add Korean Inspector lifecycle controls for create/edit/reorder/hide/
      duplicate/delete and solid/gradient/image switching.
- [x] Verify undo/redo, persistence, reload, collaboration, migration, code
      handoff, visible pixels, SVG/PDF, and PNG/JPEG/WEBP through Playwright CLI.
- [x] Run failure learning and route Penpot component/instance migration next.

## Evidence

- RED Full Verification `29234879563` proved SVG/PDF scalar fallback.
- Repair run `29237444747` exposed a PDF mask command-order regression.
- Browser run `29238306764` exposed the missing fill-stack reducer equality.
- GREEN Full Verification `29239015361` passed every gate; Playwright reported
  189 passed and one existing variant-authoring case flaky after retry.
- Storage Restore Drill `29239015644` and Backup Retention `29239015484`
  passed.
