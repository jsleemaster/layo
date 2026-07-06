# Penpot Radial Stroke Raster Canvas Delta

Date: 2026-07-06

## Reference

Penpot open-source snapshot: `penpot/penpot@a4ba5fc2e046d8583edcd4946f09e4ee64280431`. The relevant renderer path keeps radial paint as geometry rather than flattening it, and Layo already mirrors that evidence for selected-layer SVG and PDF radial stroke artifacts.

## Decision

Layo adapts this behavior for the supported selected-layer raster/canvas slice. The local-first importer keeps the original Penpot stroke paint source metadata under `style.paint_sources`; the web canvas now resolves supported radial stroke sources through the shared radial gradient geometry path instead of relying on the flattened midpoint stroke color.

## Product Change

- The canvas radial helper now resolves supported `fill` or `stroke` Penpot paint sources while preserving the existing single-source, normal-blend guardrails.
- Supported radial strokes render through a Konva radial overlay. When the stroke does not fill the full rectangle, an inner fill mask restores the node fill area so the stroke ring remains gradient-painted.
- Selected-layer PNG downloads now preserve the imported Penpot radial stroke gradient instead of sampling the older flattened purple fallback in the raster artifact path.

## Verification

- RED: Full Verification #28783504718 failed only in Playwright CLI e2e on `dev panel PNG raster artifact preserves the imported Penpot radial stroke gradient`; `centerStroke.r` was 128 instead of greater than `centerStroke.b + 40` (expected greater than 168).
- Repair: Full Verification #28784248696 failed at the design-rule gate because the first implementation used a raw `#000000` fallback in TSX. The fallback now uses `editorKonvaTokens.selection.stroke`.
- GREEN: Full Verification #28784374979 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m47s. Deployment remains intentionally deferred because Vercel is rate-limited and is not part of this product-maturity slice.

## Remaining Gaps

Non-rect/path/group/text radial artifacts, exact mixed-stack overlay/blend compositing, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up import/export maturity gaps.
