# Penpot Frame Dual Image Paints

## Goal

Close the next Penpot import/export asset-loss gap for frames that contain both
a packaged `fill-image` and a packaged `stroke-image` on the same shape.

## Penpot Reference

- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/types/shape.cljc
- Reference capability: frame shapes merge generic shape attributes, including
  `:fills` and `:strokes`; stroke attrs include `:stroke-image`.
- Decision: adapt. Layo still does not claim exact Penpot image paint
  compositing, but the local-first importer must not drop either packaged image
  asset when both exist on the same frame.
- Maturity gate: import/export.

## Failure Case

The existing importer selected a single image paint for a frame with
`fill-image ?? stroke-image`. A Penpot frame with both records reviewed both
media assets but imported only one image child, so the persisted file had:

- `mappedNodeCount: 3` instead of `4`.
- HTTP import `assetCount: 1` instead of `2`.
- No deterministic `penpot-{frameId}-stroke-image` child when a frame
  `fill-image` was also present.

## Implementation

- Added server coverage for direct import and HTTP persistence of a frame with
  both packaged image paints.
- Added Playwright CLI file-panel coverage proving both image layers appear in
  the imported file and both `/assets/{assetId}` endpoints serve bytes.
- Changed Penpot frame mapping to collect fill and stroke image media
  separately, then prepend one deterministic image child per available packaged
  asset before foreground children.
- Kept rectangle and standalone image mapping on the existing single-image path.

## Verification

- RED Full Verification `28727329333`: failed in Core tests on
  `external-migration.penpot-frame-stroke-image.test.ts` because the new dual
  image-paint cases received `mappedNodeCount: 3` and HTTP `assetCount: 1`.
- GREEN Full Verification `28727453802`: passed maturity/design gates,
  typecheck, web build, Core tests, and Playwright CLI e2e. The new e2e was
  included as `[158/174]`, and the run ended with `174 passed (5.8m)`.
- Deployment remains intentionally deferred.

## Remaining Gaps

- Exact Penpot image paint compositing, blend modes, masks, paths, SVG raw
  shapes, components, variants, tokens, library relations, and deeper
  Figma/Penpot mapping remain follow-up import/export maturity work.
