from pathlib import Path

plan_path = Path("docs/superpowers/PLAN_STATUS.md")
plan = plan_path.read_text()
plan = plan.replace(
    "Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-width-svg-artifact.md`; deployment remains intentionally deferred.",
    "Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-pdf-artifact.md`; deployment remains intentionally deferred.",
    1,
)
new_row = "| `2026-07-06-penpot-radial-pdf-artifact.md` | Completed | Adapts preserved Penpot circular radial fill metadata to emit selected-layer PDF `/ShadingType 3` radial shading resources instead of falling back to a flattened solid fill. The regression is `apps/web/src/node-artifacts-radial-pdf.test.ts`; RED Full Verification #28775135264 failed in Core tests before implementation because the expected radial shading resource was absent. Final PR-head Full Verification is the merge gate for this slice. Product delta is recorded in `docs/product/penpot-radial-pdf-artifact-delta.md`. Remaining gaps are radial stroke-specific proof, radial width/ellipse PDF parity, radial raster/canvas parity, non-rect/path/group/text radial artifacts, exact mixed-stack overlay/blend compositing, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations; deployment remains intentionally deferred. |\n"
anchor = "| `2026-07-06-penpot-radial-width-svg-artifact.md` | Completed |"
if new_row not in plan:
    if anchor not in plan:
        raise SystemExit("PLAN_STATUS insertion anchor not found")
    plan = plan.replace(anchor, new_row + anchor, 1)
plan_path.write_text(plan)

benchmark_path = Path("docs/product/penpot-maturity-benchmark.md")
benchmark = benchmark_path.read_text()
benchmark = benchmark.replace(
    "Gradient geometry fidelity outside selected-layer SVG radial paint servers for simple circular and width-transformed Penpot radial gradients, multiple gradient/stroke paint stacks, exact mixed image+paint compositing, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, library relations, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete.",
    "Gradient geometry fidelity outside selected-layer SVG radial paint servers and selected-layer PDF circular radial fills, multiple gradient/stroke paint stacks, exact mixed image+paint compositing, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, library relations, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete.",
    1,
)
benchmark = benchmark.replace(
    "`2026-07-06-penpot-radial-gradient-svg-artifact.md` adapts the first radial geometry slice by emitting selected-layer SVG `<radialGradient>` paint servers for simple circular Penpot radial fill gradients. `2026-07-06-penpot-radial-width-svg-artifact.md` extends that selected-layer SVG radial path by adding Penpot width/angle `gradientTransform` for supported radial paint sources so elliptical radial geometry survives SVG export. Exact mixed-stack overlay/blend compositing, radial stroke-specific proof, radial PDF/raster/canvas parity, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
    "`2026-07-06-penpot-radial-gradient-svg-artifact.md` adapts the first radial geometry slice by emitting selected-layer SVG `<radialGradient>` paint servers for simple circular Penpot radial fill gradients. `2026-07-06-penpot-radial-width-svg-artifact.md` extends that selected-layer SVG radial path by adding Penpot width/angle `gradientTransform` for supported radial paint sources so elliptical radial geometry survives SVG export. `2026-07-06-penpot-radial-pdf-artifact.md` adds the first selected-layer PDF radial slice by emitting `/ShadingType 3` resources for supported circular Penpot radial fills. Exact mixed-stack overlay/blend compositing, radial stroke-specific proof, radial width/ellipse PDF parity, radial raster/canvas parity, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
    1,
)
benchmark_path.write_text(benchmark)
