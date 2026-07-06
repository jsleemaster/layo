# Penpot Vector Path Artifacts Delta

Date: 2026-07-06

## Penpot Reference

Penpot remains the current open-source benchmark for this slice because it is a team design platform built around self-hosting, open standards, design-code-AI workflows, and inspect/export surfaces.

Current reference URLs checked for this slice:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/exporting-layers/
- https://help.penpot.app/user-guide/export-import/export-import-files/

Penpot layer exports support PNG, JPEG, WEBP, SVG, and PDF presets, and Penpot files are documented as open ZIP/JSON/binary-asset packages. Layo adapts that expectation for selected-layer artifacts by preserving Penpot-origin path geometry in SVG/PDF outputs instead of degrading those artifacts to rectangular primitives.

## Maturity Gate

This slice maps to:

- Import/export maturity: exported artifacts should preserve essential vector geometry and paint sources.
- Developer handoff: SVG/PDF selected-layer downloads should remain inspectable and usable by developers.
- Failure loop: the prior remaining gap named arbitrary vector path artifact geometry beyond polygon and ellipse/circle sources.

Deployment is intentionally not part of this slice by user direction. Vercel preview status is treated as secondary to product verification here.

## Layo Adaptation

Layo now preserves a Penpot-origin `clip.source.pathData` field for selected-layer artifact geometry:

- Renderer clip-source metadata includes optional `pathData`.
- SVG clip paths, alpha masks, and self primitives emit `<path d="...">` for preserved path data before falling back to polygon, ellipse, or rectangle output.
- PDF clip, fill, stroke, gradient fill, and gradient stroke paths parse supported SVG commands and emit PDF path commands for `M`, `L`, `H`, `V`, `C`, `Q`, and `Z`.
- Unsupported or malformed path data safely falls back to the existing shape path behavior instead of corrupting the export.

## Failure Learning

The first RED state intentionally proved that adding `pathData` to fixtures and types was not enough: the selected-layer artifact exporter still emitted rectangular PDF/SVG primitives.

A later implementation pass exposed a second miss: the SVG path-token regex was over-escaped in TypeScript, so path numbers would not be parsed correctly. The repaired implementation fixes the parser and keeps the same RED coverage rather than weakening the test.

## Verification

- RED: Full Verification #28788526695 failed in Core tests after the path regression was added; the PDF artifact still contained rectangular `re` clipping instead of path commands.
- GREEN repair run: Full Verification #28789473862 passed Penpot maturity/design gates, typecheck, web build, Core tests, Playwright CLI e2e, and committed the verified parser repair.
- Head verification: workflow-dispatched Full Verification #28789935884 passed the restored original workflow on branch head `aa9bd3ca0c0d991e0a50fde6661817e7e36ec65d`.

## Remaining Gaps

- SVG path commands outside the supported `M/L/H/V/C/Q/Z` subset, including arcs and smooth curve commands.
- Exact mixed-stack overlay and blend compositing.
- Image-gradient interactions.
- Group/text gradient rendering and deeper multi-paint stack parity.
- Masks and raw SVG shape import/export beyond selected-layer artifact paths.
- Component, variant, token, and shared-library relation import/export parity.
