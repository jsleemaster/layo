# 2026-07-05 Penpot Stroke Gradient Flattening

## Goal

Close the next Penpot import/export maturity gap for Penpot stroke gradients. Layo currently flattens simple fill gradients into deterministic midpoint fills, but Penpot `stroke-color-gradient` records are not read by the Penpot ZIP mapper, so a stroked rectangle can lose its visible stroke when the stroke is gradient-backed.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/shape/attrs.cljc` lists `:stroke-color-gradient` beside `:stroke-color` and `:stroke-opacity` as shape stroke attributes.
- `frontend/src/app/plugins/strokes.cljs` exposes plugin-facing `strokeColorGradient` and updates `:stroke-color-gradient` while removing `:stroke-color`.

Decision:

- Adopt: treat Penpot stroke gradients as real stroke paint metadata during import.
- Adapt: because Layo's current saved document model has a single CSS-like stroke color field, flatten a simple Penpot stroke gradient to its deterministic midpoint color, mirroring the existing fill-gradient import behavior.
- Diverge for now: exact stroke gradient direction/radius, multiple stroke paint stacks, stroke image paints, blend modes, and richer vector stroke rendering remain follow-up import/export gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: a Penpot rectangle whose stroke record has `stroke-color-gradient` from red to blue and width 4 must import with Layo `style.stroke` `#800080` and `stroke_width` 4 instead of `stroke: null`.
- HTTP route: the same archive must review/import without assets and persist the flattened stroke through `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show the stroked layer and persist the flattened stroke through the browser path.

Expected current failure: Layo reads only `strokeColor`, `stroke-color`, or `color`, so a gradient stroke imports without a stroke.

## GREEN Implementation Target

- Reuse the existing gradient-stop midpoint interpolation helper already used by fill gradients.
- Extend `penpotStrokeColor` to read `strokeColorGradient`, `stroke-color-gradient`, or `gradient` from the first stroke record or shape fallback.
- Preserve existing solid stroke color and stroke width behavior.

## Verification Log

- RED Full Verification: pending.
- GREEN Full Verification: pending.
- Direct Playwright CLI e2e proof: pending.
- Deployment: intentionally deferred for this loop.
