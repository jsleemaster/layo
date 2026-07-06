# Penpot Radial Gradient SVG Artifact

## Goal

Close the next Penpot maturity-loop gap for selected-layer SVG handoff: simple circular Penpot radial fill gradients must export as SVG paint servers instead of collapsing to Layo's deterministic fallback fill color.

## Penpot Reference

- Penpot `common/src/app/common/types/color.cljc` defines gradient paint data with `:linear` and `:radial` types plus `start-x`, `start-y`, `end-x`, `end-y`, `width`, and ordered `stops`.
- Penpot `frontend/src/app/main/ui/shapes/gradients.cljs` renders radial gradients through SVG `<radialGradient>` paint servers using center/radius geometry and stop vectors.
- Penpot shape attribute and custom-stroke paths route gradient fills/strokes through paint-server URLs instead of flattening them to a midpoint solid color.

## Decision

Adapt Penpot's radial fill artifact behavior for Layo's local-first, deterministic selected-layer SVG export. This slice deliberately handles the smallest product-valid radial case: non-text, non-group nodes with preserved Penpot radial fill paint-source metadata, at least two valid stops, and circular center-to-edge geometry. It keeps PDF gradient shading, raster export, live canvas rendering, radial stroke gradients, elliptical radial width/rotation, paths, groups, text, blend modes, and exact mixed-stack compositing as follow-up gaps.

## RED Evidence

Full Verification #28751033299 failed in Core tests on branch `codex/penpot-radial-gradient-svg-artifact` after adding `apps/web/src/node-artifacts-gradient.test.ts` coverage. The failure proved `svgForNode(penpotRadialGradientCard)` emitted fallback `fill="#800080"` and no `<defs>` or `<radialGradient>` paint server.

## Implementation Notes

- `apps/web/src/node-artifacts.ts` now separates SVG gradient selection from the existing PDF linear-gradient selection path.
- PDF artifacts continue to use the existing linear-only `fillGradientForNode` and `strokeGradientForNode` helpers so a radial fill is not accidentally emitted as an axial PDF shading.
- SVG artifacts use `svgPaintGradientForNode` to accept `linear` and `radial` paint-source gradients, emit `<radialGradient>` for radial fills, and keep deterministic `data-fallback-fill` metadata.
- The radial radius is derived from the normalized Penpot start/end vector, with a stable center fallback of `0.5,0.5` and radius fallback of `0.5` for incomplete simple radial data.

## Verification

- RED: Full Verification #28751033299 failed in `apps/web/src/node-artifacts-gradient.test.ts` before implementation.
- GREEN: PR-head Full Verification #28772353798 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m57s. Storage Restore Drill #28772353810 and Storage Backup Retention #28772353751 passed for the same head.
- Browser/editor direct interaction: not applicable for this slice because the behavior is selected-layer artifact serialization, not a browser interaction change. Full Verification still runs the Playwright CLI e2e suite on the PR head.

## Remaining Gaps

- Elliptical radial gradients using Penpot `width` and transform/rotation.
- Radial stroke gradients.
- Radial PDF, raster, and live canvas rendering.
- Non-rect/path/group/text radial gradient artifacts.
- Mixed gradient stacks, blend modes, and exact overlay compositing.
