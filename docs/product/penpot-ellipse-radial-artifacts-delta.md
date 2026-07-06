# Penpot Ellipse Radial Artifacts Delta

Date: 2026-07-06

## Penpot Reference

Penpot preserves vector shape geometry and paint sources instead of flattening an ellipse-shaped artifact to rectangular export primitives. Layo adapts that behavior for the existing Penpot-origin `clip.source.shapeType` metadata on supported selected-layer artifacts.

Reference snapshot remains `penpot/penpot@a4ba5fc2e046d8583edcd4946f09e4ee64280431` from `docs/product/penpot-maturity-benchmark.md`.

## Layo Adaptation

This slice keeps the renderer node contract unchanged and uses the preserved clip source shape metadata to choose ellipse geometry in the existing selected-layer artifact exporter:

- SVG clip paths and alpha masks emit `<ellipse>` for `ellipse` and `circle` source shapes.
- SVG self primitives emit `<ellipse>` instead of `<rect>` for the same source shapes while preserving fill/stroke gradient paint attributes.
- PDF clip, fill, stroke, gradient fill, and gradient stroke paths share a Bezier ellipse path helper instead of rectangular `re` paths for the same source shapes.

## Failure Learning

The first GREEN attempt passed the focused regression but used a wrapper/base split that routed this Penpot case around the existing artifact pipeline. That was rejected in review because Penpot maturity requires the product path itself to mature, not a fixture-specific bypass.

The repaired implementation keeps the RED coverage and integrates the shape-path behavior into `apps/web/src/node-artifacts.ts` directly.

## Verification

- RED: Full Verification #28785734565 failed in Core tests after the ellipse radial artifact regression was added.
- First GREEN but rejected in review: Full Verification #28786258033 passed, but the implementation used the wrapper/base bypass.
- Repaired implementation: Full Verification #28786997967 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e on the in-pipeline exporter implementation.

Deployment/Vercel is intentionally deferred for this product-maturity slice.

## Remaining Gaps

- General arbitrary vector path artifact geometry beyond preserved polygon and ellipse/circle sources.
- Exact mixed-stack overlay and blend compositing.
- Image-gradient interactions.
- Group/text gradient rendering and deeper multi-paint stack parity.
- Component, variant, token, and shared-library relation import/export parity.
