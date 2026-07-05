# Penpot SVG Raw Image Import

## Goal

Close the next Penpot import/export maturity gap where Penpot `svg-raw` shapes were skipped during ZIP import.

## Penpot Reference

- `penpot/penpot` `common/src/app/common/types/shape.cljc` includes `:svg-raw` in the shape type set.
- `penpot/penpot` `frontend/src/app/main/ui/shapes/svg_raw.cljs` renders `shape.content` as SVG root/elements/leaves.

## Layo Decision

Adapt.

Layo does not yet have an editable raw-vector/SVG subtree document model. The product-aligned slice is to preserve readable Penpot raw SVG content as a local `image/svg+xml` asset and map the shape to a deterministic Layo image node, rather than silently skipping the shape and losing the visual asset.

This deliberately preserves visual and asset portability first. Editable raw SVG/path semantics remain a later vector-model gap.

## Gap

Before this slice, `apps/server/src/external-migration-penpot.ts` only mapped Penpot `frame`, `rect`, `text`, and `image` shapes. `svg-raw` entered the unsupported-shape branch, producing one mapped frame, zero imported assets, and a skipped child.

## Implementation

- Added server/HTTP regression tests for a Penpot ZIP containing a `svg-raw` child with inline SVG content.
- Added Playwright CLI e2e coverage for the visible file-panel import path, layer list evidence, persisted file API shape, and `/assets/{assetId}` byte check.
- Added the new e2e spec to the root `pnpm test:e2e` script so Full Verification runs it.
- Updated the Penpot importer so readable `svg-raw` content becomes a synthetic local SVG asset and image node.
- Added support for both raw `<svg>` string content and structured Penpot-like SVG content records where possible.

## Verification

- RED: Full Verification #28728076290 failed in Core tests because the new server cases still saw `mappedNodeCount: 1`, `skippedNodeCount: 1`, and HTTP `assetCount: 0`; e2e was skipped after core failure.
- GREEN: Full Verification #28728279896, job #85189486935, passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e. The new Playwright spec ran at `[162/175]`; final e2e result was `175 passed (5.7m)`.
- Storage Restore Drill #28728279895 passed for the same head.
- Storage Backup Retention #28728279907 passed for the same head.

Deployment is intentionally deferred per current priority.

## Remaining Risks

- Imported `svg-raw` is preserved as an image asset, not as editable vector/path nodes.
- Advanced SVG semantics, path editing, masks, blend modes, component relationships, variants, tokens, and Penpot library relations remain separate import/export maturity gaps.
