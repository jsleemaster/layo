# Penpot Maturity Benchmark Delta: Path Image Import

Last checked: 2026-07-05

## Reference

- Penpot shape model: https://github.com/penpot/penpot/blob/main/common/src/app/common/types/shape.cljc
- Penpot path renderer: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/path.cljs

Penpot includes `:path` in its shape types and renders the shape `content` as an SVG `<path d=...>`.

## Decision

Adapt.

Layo does not yet have an editable vector/path document model. For this import/export maturity slice, Layo preserves simple readable Penpot path artwork as a local `image/svg+xml` asset and maps the shape to a deterministic image node. This keeps visual migration from dropping the layer while leaving full editable vector/path geometry as a later maturity target.

## Implemented Evidence

- `apps/server/src/external-migration-penpot.ts` now accepts `path` shapes when path data is readable.
- Simple path data becomes a synthetic SVG asset with deterministic id `penpot-asset-<shape-id>-path-svg`.
- Server and HTTP tests prove mapped node count, skipped count, asset metadata, persisted image node content, and persisted SVG bytes.
- Playwright CLI e2e proves the visible file-panel import path persists the path layer and serves the generated SVG asset bytes.

## Verification

- RED Full Verification #28728895566 failed in Core tests because the importer returned `mappedNodeCount: 1`, `skippedNodeCount: 1`, and HTTP `assetCount: 0` for a Penpot path child.
- GREEN Full Verification #28729068240 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- The new Playwright spec ran at `[159/176]`; the final e2e result was `176 passed (5.6m)`.
- Storage Restore Drill #28729068246 passed.
- Storage Backup Retention #28729068239 passed.

## Remaining Gaps

- Imported Penpot paths are not yet editable vector/path nodes in Layo.
- Complex Penpot path content forms beyond simple SVG path strings need broader parsing if encountered.
- Masks, components, variants, tokens, and shared library relations remain open Penpot import/export maturity gaps.
- Deployment remains intentionally deferred.
