# Penpot Radial Gradient SVG Artifact Delta

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
- GREEN PR-head Full Verification #28772353798 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m57s. Storage Restore Drill #28772353810 and Storage Backup Retention #28772353751 passed for the same head.
- Latest PR-head checks remain the merge gate for any evidence-only follow-up commits after this recorded GREEN run.

## Follow-Up Gaps

This is not full Penpot radial parity. Remaining radial/non-linear gradient work includes elliptical width/rotation geometry, radial strokes, PDF/raster/canvas parity, non-rect/path/group/text coverage, image-gradient interactions, and exact mixed-stack overlay/blend compositing.
