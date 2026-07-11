# Penpot PDF Stroke Marker Fidelity Plan

**Goal:** Draw open-path endpoint markers as real PDF geometry, make selected-layer export bounds account for stroke and markers, and expose first-class Korean stroke controls without weakening the deterministic agent contract.

**Benchmark decision:** Adapt Penpot endpoint decorations and stroke controls. PDF comments are not visual parity; marker geometry and unclipped artifact bounds are required evidence.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://help.penpot.app/user-guide/designing/layers/

## Task 1: Exact RED cases

- [ ] Add PDF render/operator fixtures for every supported endpoint marker.
- [ ] Add clipped-bound regressions for wide strokes and rotated endpoint markers.
- [ ] Add direct Inspector interaction coverage for cap, join, dash, and endpoints.

## Task 2: Geometry and bounds

- [ ] Derive deterministic start/end points and tangents from supported path commands.
- [ ] Emit marker geometry in PDF with stroke-owned color and transform.
- [ ] Expand SVG/PDF/raster selected-layer bounds for stroke and marker extents.

## Task 3: Human workflow

- [ ] Add Korean-first Inspector controls with undo/redo and persistence.
- [ ] Keep MCP/HTTP schemas, validation, and change summaries aligned.
- [ ] Verify direct Playwright interactions and all selected-layer artifacts.

## Task 4: Close and route

- [ ] Run the full failure-learning loop and final verification.
- [ ] Review, merge, post-merge clean, and route the next exact Penpot gap.
