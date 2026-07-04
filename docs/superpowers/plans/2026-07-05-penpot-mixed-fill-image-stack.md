# 2026-07-05 Penpot Mixed Fill-Image Stack

## Goal

Close the next Penpot import/export maturity gap for mixed fill stacks that include packaged `fill-image` records behind or beside solid/gradient paints. Layo currently detects only the first fill record for image mapping, so a rectangle or frame whose first fill is a color/gradient and later fill is `fill-image` can drop the packaged asset path.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/fills.cljc` models fills as a vector-compatible collection and accepts `:fill-image`, `:fill-color`, and `:fill-color-gradient` in fill records.
- The same source exposes fill order helpers such as prepend/update over the full fills collection, so import should inspect the collection rather than only the first record.

Decision:

- Adopt: inspect every Penpot fill record for packaged `fill-image` metadata.
- Adapt: when Layo cannot preserve a mixed image+color/gradient paint stack as multiple paints, preserve the importable packaged image asset as the Layo image node/background and keep richer overlay/blend fidelity as a later gap.
- Diverge for now: exact mixed-stack compositing, blend modes, image+gradient overlay fidelity, masks, and multiple image fills remain follow-up import/export gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: a Penpot rectangle whose first fill is a gradient and second fill is `fill-image` must import as a Layo image node backed by the packaged asset instead of a rectangle with only the gradient midpoint fill.
- HTTP route: the same archive must review/import with one asset and persist the image node through `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show the mixed-stack layer and persist the imported image asset through the browser path.

Expected current failure: Layo reads only the first fill record when deciding image mapping, so the packaged image behind a color/gradient fill is not imported.

## GREEN Implementation Target

- Find the first importable `fill-image` record across all fill records for rectangles and frames.
- Use that record for media id lookup and fill-image opacity.
- Preserve existing first-fill image, image-shape, frame background, solid multi-fill, and gradient fill behavior.

## Verification Log

- RED Full Verification #28721329168 failed as expected in Core tests: the mapper imported `0` assets and the HTTP import returned `assetCount: 0` when a Penpot `fill-image` record appeared after a gradient fill.
- GREEN implementation commit `bff700a9` now scans the full Penpot `fills` collection for `fill-image` metadata and uses that record for image opacity.
- Final Full Verification #28721565316 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e after documentation cleanup.
- Direct Playwright CLI e2e proof: #28721565316 passed the visible file-panel import path, including the mixed fill-image stack e2e.
- Storage Restore Drill #28721565313 and Storage Backup Retention #28721565300 passed.
- Deployment: intentionally deferred for this loop.
