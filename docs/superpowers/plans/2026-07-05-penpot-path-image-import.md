# Penpot Path Image Import

## Goal

Adapt the next Penpot import/export maturity gap: Penpot `path` shapes should not be skipped during ZIP import when their SVG path data is readable.

## Penpot Reference

- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/types/shape.cljc
- Source: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/path.cljs
- Reference capability: Penpot includes `:path` in shape types and renders `shape.content` as an SVG `<path d=...>`.
- Decision: adapt. Layo does not yet have an editable vector/path document model, so this slice preserves simple readable path shapes as local `image/svg+xml` assets mapped to deterministic image nodes.
- Maturity gate: import/export.

## Failure Mode

Before this slice, `mapPenpotShape` allowed `frame`, `rect`, `text`, `image`, and `svg-raw`. A Penpot `path` child was treated as unsupported, which dropped visible vector artwork during import.

## RED Evidence

Full Verification #28728895566 failed in Core tests on PR #239:

- `apps/server/src/external-migration.penpot-path.test.ts` expected `mappedNodeCount: 2` and `skippedNodeCount: 0`, but the importer returned `mappedNodeCount: 1` and `skippedNodeCount: 1`.
- The HTTP persistence case expected `assetCount: 1`, but the importer returned `assetCount: 0`.
- Playwright CLI e2e was skipped after the Core tests failed.

## Implementation

- Adds `path` to the Penpot supported-shape set.
- Converts simple readable SVG path data into a synthetic SVG asset with deterministic id `penpot-asset-<shape-id>-path-svg`.
- Maps the path shape to a Layo image node with `fit_mode: "fill"`, natural size from Penpot bounds, and opacity from the Penpot shape.
- Preserves simple fill and stroke color/width in the generated SVG markup.
- Keeps unreadable path content explicit by warning and skipping instead of silently creating an invalid asset.

## GREEN Evidence

Full Verification #28729068240, job #85191506919, passed:

- Penpot maturity and design rule gates.
- Typecheck.
- Web build.
- Core tests.
- Playwright CLI e2e.

The new e2e spec ran at `[159/176]` as `apps/web/e2e/external-migration-penpot-path.spec.ts`, and the final e2e result was `176 passed (5.6m)`.

Storage Restore Drill #28729068246 and Storage Backup Retention #28729068239 both passed for head `4c9139ae8de7165c0fa3dd9f7990ea5887f4291d`.

## Remaining Divergence

Imported path artwork is visually portable but not editable as vector path nodes in Layo. Future Penpot maturity slices still need masks, editable path/vector geometry, components, variants, tokens, and library relations.

## Deployment

Deployment is intentionally deferred. It is not the acceptance gate for this maturity slice.
