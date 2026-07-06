from pathlib import Path

plan = Path("docs/superpowers/plans/2026-07-06-penpot-radial-gradient-svg-artifact.md")
delta = Path("docs/product/penpot-radial-gradient-svg-artifact-delta.md")
status_path = Path("docs/superpowers/PLAN_STATUS.md")
benchmark_path = Path("docs/product/penpot-maturity-benchmark.md")

plan.write_text(
    """# Penpot Radial Gradient SVG Artifact

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
- GREEN: pending PR-head Full Verification after documentation and PR creation.
- Browser/editor direct interaction: not applicable for this slice because the behavior is selected-layer artifact serialization, not a browser interaction change. Full Verification still runs the Playwright CLI e2e suite on the PR head.

## Remaining Gaps

- Elliptical radial gradients using Penpot `width` and transform/rotation.
- Radial stroke gradients.
- Radial PDF, raster, and live canvas rendering.
- Non-rect/path/group/text radial gradient artifacts.
- Mixed gradient stacks, blend modes, and exact overlay compositing.
""",
    encoding="utf-8",
)

delta.write_text(
    """# Penpot Radial Gradient SVG Artifact Delta

## Reference Capability

Penpot preserves radial gradient fills as structured paint data and renders them through SVG radial paint servers. The current open-source reference exposes gradient type and geometry fields, then renders radial gradients with center/radius geometry and ordered stops.

## Layo Delta

Layo now adapts the first selected-layer SVG artifact slice for preserved Penpot radial fill metadata:

- Supports simple circular radial fill gradients on non-text, non-group nodes.
- Emits `<radialGradient id="layo-gradient-...-fill-0" cx="..." cy="..." r="...">` in SVG `<defs>`.
- Emits ordered SVG `<stop>` entries using the preserved Penpot stop offsets, colors, and paint-source opacity.
- Applies `fill="url(#...)"` to the exported shape while retaining `data-fallback-fill` for deterministic fallback/debug inspection.
- Leaves the existing PDF linear-gradient path linear-only to avoid pretending radial geometry is axial shading.

## Verification

- RED Full Verification #28751033299 failed because the radial fixture exported fallback `fill="#800080"` without `<defs>`.
- GREEN PR-head Full Verification is pending after PR creation.

## Follow-Up Gaps

This is not full Penpot radial parity. Remaining radial/non-linear gradient work includes elliptical width/rotation geometry, radial strokes, PDF/raster/canvas parity, non-rect/path/group/text coverage, image-gradient interactions, and exact mixed-stack overlay/blend compositing.
""",
    encoding="utf-8",
)

status = status_path.read_text(encoding="utf-8")
status = status.replace("Last audited: 2026-07-05", "Last audited: 2026-07-06", 1)
status = status.replace(
    "| _None_ | Idle | No active plan. Latest completed Penpot maturity-loop slice is `2026-07-05-penpot-gradient-raster-artifact.md`; deployment remains intentionally deferred. |",
    "| `2026-07-06-penpot-radial-gradient-svg-artifact.md` | In progress | Penpot maturity-loop slice for selected-layer SVG simple circular radial fill gradients. RED Full Verification #28751033299 failed in Core tests because SVG artifacts fell back to `fill=\"#800080\"` without `<defs>/<radialGradient>`. Implementation is on `codex/penpot-radial-gradient-svg-artifact`; PR-head GREEN verification is pending. |",
    1,
)
status_path.write_text(status, encoding="utf-8")

benchmark = benchmark_path.read_text(encoding="utf-8")
benchmark = benchmark.replace("Last checked: 2026-07-05", "Last checked: 2026-07-06", 1)
benchmark = benchmark.replace(
    "Gradient angle/radius fidelity, multiple gradient/stroke paint stacks, exact mixed image+paint compositing, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, library relations, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete.",
    "Gradient angle/radius fidelity outside selected-layer SVG simple circular radial fill artifacts, multiple gradient/stroke paint stacks, exact mixed image+paint compositing, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, library relations, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete.",
    1,
)
benchmark = benchmark.replace(
    "and `2026-07-05-penpot-gradient-raster-artifact.md` extend that flattening baseline by preserving Penpot paint-source metadata for agent/code handoff, selected-layer SVG/PDF artifacts, and the Konva-backed selected-layer raster path for supported simple linear fill/stroke gradients. Exact mixed-stack overlay/blend compositing, radial/non-linear gradient geometry, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
    "and `2026-07-05-penpot-gradient-raster-artifact.md` extend that flattening baseline by preserving Penpot paint-source metadata for agent/code handoff, selected-layer SVG/PDF artifacts, and the Konva-backed selected-layer raster path for supported simple linear fill/stroke gradients. `2026-07-06-penpot-radial-gradient-svg-artifact.md` adapts the first radial geometry slice by emitting selected-layer SVG `<radialGradient>` paint servers for simple circular Penpot radial fill gradients. Exact mixed-stack overlay/blend compositing, elliptical/rotated radial width geometry, radial stroke/PDF/raster/canvas parity, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
    1,
)
benchmark_path.write_text(benchmark, encoding="utf-8")
