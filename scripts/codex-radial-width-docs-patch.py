from pathlib import Path

plan_path = Path("docs/superpowers/PLAN_STATUS.md")
plan = plan_path.read_text()
plan = plan.replace(
    "Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-gradient-svg-artifact.md`; deployment remains intentionally deferred.",
    "Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-width-svg-artifact.md`; deployment remains intentionally deferred.",
    1,
)
new_row = "| `2026-07-06-penpot-radial-width-svg-artifact.md` | Completed | Adapts preserved Penpot radial gradient width geometry to emit selected-layer SVG `gradientTransform` on radial paint servers, preserving the supported elliptical/rotated radial shape while retaining deterministic fallback fills. The regression is `apps/web/src/node-artifacts-gradient.test.ts`; RED Full Verification #28774007613 failed in Core tests before implementation because the expected `gradientTransform` was absent. Final PR-head Full Verification is the merge gate for this slice. Product delta is recorded in `docs/product/penpot-radial-width-svg-artifact-delta.md`. Remaining gaps are radial stroke-specific proof, radial PDF/raster/canvas parity, non-rect/path/group/text radial artifacts, exact mixed-stack overlay/blend compositing, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations; deployment remains intentionally deferred. |\n"
anchor = "| `2026-07-06-penpot-radial-gradient-svg-artifact.md` | Completed |"
if new_row not in plan:
    if anchor not in plan:
        raise SystemExit("PLAN_STATUS insertion anchor not found")
    plan = plan.replace(anchor, new_row + anchor, 1)
plan_path.write_text(plan)

benchmark_path = Path("docs/product/penpot-maturity-benchmark.md")
benchmark = benchmark_path.read_text()
benchmark = benchmark.replace(
    "Gradient angle/radius fidelity outside selected-layer SVG simple circular radial fill artifacts, multiple gradient/stroke paint stacks, exact mixed image+paint compositing, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, library relations, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete.",
    "Gradient geometry fidelity outside selected-layer SVG radial paint servers for simple circular and width-transformed Penpot radial gradients, multiple gradient/stroke paint stacks, exact mixed image+paint compositing, blend modes, masks, paths, SVG raw shapes, components, variants, tokens, library relations, and deeper Figma components/variants/effects/advanced geometry/style mappers remain incomplete.",
    1,
)
benchmark = benchmark.replace(
    "`2026-07-06-penpot-radial-gradient-svg-artifact.md` adapts the first radial geometry slice by emitting selected-layer SVG `<radialGradient>` paint servers for simple circular Penpot radial fill gradients. Exact mixed-stack overlay/blend compositing, elliptical/rotated radial width geometry, radial stroke/PDF/raster/canvas parity, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
    "`2026-07-06-penpot-radial-gradient-svg-artifact.md` adapts the first radial geometry slice by emitting selected-layer SVG `<radialGradient>` paint servers for simple circular Penpot radial fill gradients. `2026-07-06-penpot-radial-width-svg-artifact.md` extends that selected-layer SVG radial path by adding Penpot width/angle `gradientTransform` for supported radial paint sources so elliptical radial geometry survives SVG export. Exact mixed-stack overlay/blend compositing, radial stroke-specific proof, radial PDF/raster/canvas parity, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export gaps.",
    1,
)
benchmark_path.write_text(benchmark)
