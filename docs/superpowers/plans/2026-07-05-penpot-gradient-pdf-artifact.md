# Penpot Gradient PDF Artifact Plan

## Goal

Close the next Penpot maturity-loop gap after selected-layer SVG gradient artifact fidelity: selected-layer PDF artifacts should use preserved Penpot fill linear gradient metadata instead of only painting the flattened fallback fill.

## Benchmark

Penpot is the open-source benchmark for export fidelity. Layo should adapt this capability for local-first selected-layer artifacts while preserving deterministic fallback colors for unsupported paint cases.

Reference sources:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/

## Failed Case

Before this slice, a Penpot-imported rectangle with preserved `style.paint_sources` rendered as a gradient in selected-layer SVG artifacts, but selected-layer PDF artifacts still emitted only the flattened `style.fill` rectangle command.

RED evidence:

- Full Verification `#28746017528` passed Penpot maturity/design gates, typecheck, and web build, then failed in Core tests after adding the focused PDF artifact regression.

## Implementation Scope

- Add a PDF gradient fill entry for simple preserved Penpot fill linear gradients.
- Emit PDF axial shading resources under `/Shading`.
- Fill the selected rectangle by clipping to the node rect and invoking `/Sh1 sh`.
- Preserve existing stroke rendering after gradient fill.
- Keep deterministic flattened `style.fill` fallback for unsupported color formats and non-simple gradient cases.

## Verification

GREEN evidence:

- Full Verification `#28746327138` passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m38s.

Focused regression:

- `apps/web/src/node-artifacts-gradient.test.ts`

## Remaining Gap

Raster artifacts, live canvas rendering, radial gradient geometry, stroke-gradient artifacts, stop-specific PDF alpha, blend modes, and exact multi-paint compositing still need separate maturity-loop slices.

Deployment remains intentionally deferred.
