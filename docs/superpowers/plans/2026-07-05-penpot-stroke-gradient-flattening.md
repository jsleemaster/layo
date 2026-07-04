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

Added failing coverage before implementation:

- Server mapper: a Penpot rectangle whose stroke record has `stroke-color-gradient` from red to blue and width 4 must import with Layo `style.stroke` `#800080` and `stroke_width` 4 instead of `stroke: null`.
- HTTP route: the same archive must review/import without assets and persist the flattened stroke through `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show the stroked layer and persist the flattened stroke through the browser path.

Expected current failure: Layo reads only `strokeColor`, `stroke-color`, or `color`, so a gradient stroke imports without a stroke.

## GREEN Implementation

- Reused the existing gradient-stop midpoint interpolation path by extracting a shared `penpotGradientPaint` helper.
- Kept fill gradients on `fillColorGradient` / `fill-color-gradient` / `gradient`.
- Extended `penpotStrokeColor` to read `strokeColorGradient`, `stroke-color-gradient`, or `gradient` from the first stroke record or shape fallback.
- Preserved existing solid stroke color and stroke width behavior.

## Failure Learning Note

The first RED CI run stopped before the domain assertions because the focused Playwright spec was added as a new file without registering it in `package.json#test:e2e`.

Root cause: the branch split a focused browser test into its own file but skipped the repo's existing e2e script coverage contract.

Durable guard: `scripts/check-e2e-script-coverage.test.mjs` already caught the miss. The branch registers `apps/web/e2e/external-migration-penpot-stroke-gradient.spec.ts` in `package.json#test:e2e`, so the same miss remains covered by the existing root `pnpm test` gate. No new memory note was added because the project already has an automated rule for this exact process failure.

## Verification Log

- RED Full Verification #28722244025: failed at `scripts/check-e2e-script-coverage.test.mjs` because the new Playwright spec was not listed in `package.json#test:e2e`.
- RED Full Verification #28722292528: reached the intended stroke-gradient assertions and failed with `style.stroke: null` and `stroke_width: 0` instead of `#800080` and `4`.
- GREEN Full Verification #28722346733: passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- Storage Restore Drill #28722346756: passed.
- Storage Backup Retention #28722346750: passed.
- Direct Playwright CLI e2e proof: #28722346733 uploaded `stroke-gradients.penpot` through the file panel, clicked `외부 디자인 가져오기`, verified the `Gradient stroke card` layer, and asserted the persisted file style as `fill: #ffffff`, `stroke: #800080`, `stroke_width: 4`, and `opacity: 1`.
- Deployment: intentionally deferred for this loop.
