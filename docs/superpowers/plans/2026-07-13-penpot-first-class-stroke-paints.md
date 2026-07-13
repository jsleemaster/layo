# Penpot First-Class Stroke Paints Plan

**Goal:** Extend each ordered first-class stroke so it can own a solid,
gradient, or image paint source across the document model, deterministic agent
control, collaboration, Inspector, canvas, SVG/PDF/PNG, migration, and code
handoff.

**Benchmark decision:** Adopt Penpot's stroke paint flexibility while adapting
asset ownership to Layo's local-first storage and deterministic export model.
Do not keep gradient/image stroke paints in a parallel legacy contract.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Task 1: Exact RED contract

- [x] Add ordered solid, gradient, and image stroke fixtures with independent
      opacity, alignment, visibility, and dash behavior.
- [x] Prove current first-class strokes cannot preserve those paint sources
      through MCP/HTTP, reload, Yjs, components, and code handoff.
- [x] Record canvas, SVG, PDF, and PNG artifact failures before implementation.

## Task 2: Unified stroke paint ownership

- [x] Add one structured per-stroke paint-source contract and deterministic
      validation/migration from legacy gradient/image stroke fields.
- [x] Preserve asset references, gradient geometry/stops, order, no-op history,
      component overrides, and open/closed alignment behavior.
- [x] Render and export every supported paint source without flattening.

## Task 3: Product proof

- [x] Add Korean Inspector paint controls and full create/edit/reorder/
      hide/duplicate/delete lifecycle coverage.
- [x] Verify undo/redo, persistence, reload, collaboration, migration, code
      handoff, canvas pixels, and downloaded artifacts through Playwright CLI.
- [x] Run the failure-learning loop and code review, record final green
      evidence, and route the next exact Penpot gap. Merge and cleanup remain
      PR closeout gates.
