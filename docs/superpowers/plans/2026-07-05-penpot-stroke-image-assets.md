# Plan: Penpot Stroke Image Asset Import

## Goal

Close the next Penpot import/export maturity slice for packaged rect
`stroke-image` paint records by preserving the referenced image asset in Layo's
local asset storage and imported document tree.

## Penpot Benchmark Decision

- Reference capability: Penpot's current open-source shape schema allows
  `:stroke-image` as a valid stroke paint attribute, and its image detection
  helper checks both `fills` and `strokes` for image-backed paint records.
- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/types/shape.cljc
- Decision: adapt. Layo does not yet have first-class image-backed stroke band
  rendering, so this slice preserves the packaged image-backed stroke as a Layo
  image node using the existing local asset storage path.
- Deliberate divergence: exact stroke-band tiling/compositing, frame stroke-image
  backgrounds, and mixed image stroke stacks remain separate fidelity gaps.

## Minimal-Change Ladder

1. Behavior belongs to the import/export maturity lane and is listed in the
   Penpot stroke-stack maturity note as an open stroke-image gap.
2. Reuse the existing Penpot media packaging reader, asset storage, HTTP import
   routes, and file-panel Playwright import flow.
3. Add failing server and Playwright coverage first; the expected failure is
   that review can see the packaged media, but import drops the `stroke-image`
   asset and persists a plain rectangle instead of an image node.
4. Implement only the rect stroke-image asset preservation slice.
5. Keep deployment deferred.

## RED Coverage

- `apps/server/src/external-migration.penpot-stroke-image.test.ts` creates a
  `Border texture card` rect with a packaged `stroke-image` PNG record, then
  expects the imported result and HTTP persistence path to keep one imported
  asset and an image node with `asset_id: penpot-asset-1616...`.
- `apps/web/e2e/external-migration-penpot-stroke-image.spec.ts` runs the same
  archive through the visible file-panel import flow, then checks the persisted
  HTTP document and `/assets/{assetId}` response.

## Verification Log

- RED Full Verification #28725171703 failed as expected. Core tests showed
  `imported.importedAssets` length `0` instead of `1`, and HTTP import returned
  `assetCount: 0` instead of `1`.
- GREEN Full Verification #28725424332 passed Penpot maturity/design gates,
  typecheck, web build, Core tests, and Playwright CLI e2e after the importer
  mapped rect `stroke-image` records through the packaged asset path.
- The GREEN Playwright CLI log included
  `apps/web/e2e/external-migration-penpot-stroke-image.spec.ts` at `[158/172]`
  and finished with `172 passed (5.6m)`.
- Storage Restore Drill #28725424329 and Storage Backup Retention #28725424333
  passed for the same GREEN head.
- Deployment remains intentionally deferred for this loop.
