# Penpot Radial Width Raster Canvas Delta

Date: 2026-07-06

## Reference

Penpot open-source snapshot: `penpot/penpot@a4ba5fc2e046d8583edcd4946f09e4ee64280431`. The relevant renderer path keeps radial `width` as gradient geometry and applies the gradient-vector angle plus 90 degrees before scaling the radial paint by width.

## Decision

Layo adapts this behavior for the supported selected-layer raster/canvas slice. Local-first import keeps the original Penpot paint source metadata under `style.paint_sources`; the web canvas now uses the preserved radial start/end/width values when rendering supported non-text, non-group rectangular fill gradients.

## Product Change

- Circular radial gradients continue to use Konva radial fill props.
- Radial gradients with `width` different from 1 generate an offscreen canvas pattern that applies the same width/angle inverse transform used by the selected-layer SVG/PDF radial geometry slices.
- Selected-layer PNG downloads now preserve the imported Penpot radial ellipse geometry instead of sampling the older circular fallback.

## Verification

- RED: Full Verification #28779327961 failed only in Playwright CLI e2e on `dev panel PNG raster artifact preserves the imported Penpot radial width geometry`; the top vertical probe sampled `b = 136` instead of being blue-dominant.
- GREEN: PR-head Full Verification is required before merge, with deployment intentionally deferred because Vercel is rate-limited and not part of this product-maturity slice.

## Remaining Gaps

Radial stroke-specific proof, non-rect/path/group/text radial artifacts, exact mixed-stack overlay/blend compositing, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export maturity gaps.
