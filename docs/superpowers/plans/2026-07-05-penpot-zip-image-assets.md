# 2026-07-05 Penpot ZIP Image Asset Import

## Goal

Close the next Penpot import/export maturity gap by preserving packaged Penpot
image assets when importing a v3 `.penpot` ZIP export. This slice is not a
full Penpot importer; it adopts Penpot's current ZIP media/object structure for
image shapes and maps it into Layo image nodes backed by local asset storage.

Deployment remains intentionally deferred for this loop.

## Penpot Reference

- Penpot user docs describe the current export as a ZIP archive that contains
  binary bitmap/vector assets beside readable JSON.
- Penpot source `backend/src/app/binfile/v3.clj` exports file media JSON at
  `files/{file-id}/media/{media-id}.json` and storage binaries at
  `objects/{storage-object-id}.{ext}`.
- Penpot shape source defines `:image` as a shape type, with image shape
  `metadata` carrying `{ id, width, height, mtype }`, and fill/stroke image
  colors using image records.

## Adopt / Adapt / Diverge

- Adopt: support Penpot v3 ZIP media JSON and storage object binaries as the
  authoritative packaged asset source.
- Adapt: map Penpot image shapes into Layo `image` nodes with local
  `/assets/{assetId}` storage, preserving natural dimensions and MIME type.
- Diverge for this slice: advanced Penpot fill-image scaling, strokes, masks,
  thumbnails, components, variants, tokens, and library linkage remain separate
  maturity loops.

## RED Case

A Penpot ZIP with one frame and one image shape should:

- review as importable with one image asset candidate,
- import with `mappedNodeCount: 2` and `skippedNodeCount: 0`,
- create a Layo image node whose `content.asset_id` references a local asset,
- persist the packaged image bytes through `FileStorage.importExternalMigrationArchive`,
- pass through the visible file-panel upload/import flow and serve the asset at
  `/assets/{assetId}`.

## Test Plan

- `apps/server/src/external-migration.penpot-assets.test.ts`
- `apps/server/src/external-migration.penpot-assets-http.test.ts`
- `apps/web/e2e/external-migration-penpot-assets.spec.ts`
- `pnpm run check:penpot-maturity`
- `pnpm run check:design-rules`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `cargo test -p editor-core`
- `pnpm test`
- `pnpm test:e2e`

## Evidence

- RED Full Verification #28715641813 failed at Core tests after the RED-only commit: Penpot image shape was skipped, producing `mappedNodeCount: 1`, `skippedNodeCount: 1`, and `assetCount: 0` instead of the expected image-node plus asset persistence.
- GREEN Full Verification #28715730038 passed in 7m30s after implementation: maturity/design gates, typecheck, web build, core tests, and Playwright CLI e2e all passed. The e2e proof uploads the `.penpot` ZIP through the file panel, clicks `외부 디자인 가져오기`, verifies `Hero image` in the layer panel, inspects the persisted image node, and fetches `/assets/{assetId}` as `image/png`.

## Remaining Follow-up Gaps

- Penpot image fills on rect/frame shapes with `fill-image` metadata.
- Penpot stroke images, masks, paths, circles, SVG raw shapes, gradients,
  shadows, components, variants, tokens, and shared library relations.
- Full Penpot import/export round-trip fidelity beyond this basic image-asset
  slice.
