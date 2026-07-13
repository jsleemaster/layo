# Penpot PDF Stroke Marker Fidelity Delta

## Benchmark decision

Layo adapts Penpot's visible endpoint decorations and stroke editing workflow. Metadata comments are no longer accepted as PDF fidelity evidence.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://help.penpot.app/user-guide/designing/layers/
- https://help.penpot.app/user-guide/first-steps/shortcuts/

## Landed product evidence

- PDF exports draw line-arrow, triangle, square, circle, and diamond endpoint markers as real transformed path geometry using the open path's endpoint tangents.
- First-class path SVG and PDF bounds expand for stroke and marker extents instead of clipping wide or rotated endpoints.
- Selected-layer PNG tight bounds include endpoint extensions.
- The Korean Inspector edits stroke color, width, cap, join, dash pattern, start marker, and end marker.
- Style edits accumulate before persistence, serialize in request order, survive reload, and persist undo/redo transitions.
- The shared server `set_node_style` normalizer validates and preserves every stroke contract field instead of silently dropping them.

## Failure learning

- Full Verification `29217022078` caught an impossible TypeScript narrowing after filtering closed commands.
- Run `29217100582` exposed broad artifact-coordinate churn; stroke-aware bounds were scoped to first-class paths and path expectations were updated deliberately.
- Run `29217259044` proved the base style normalizer deleted new stroke fields.
- Runs `29217809060` and `29218210022` exposed rapid-control persistence races; Inspector style drafts now accumulate and server writes are serialized.
- Runs `29218608425`, `29219009146`, and `29219407554` showed that form focus and redundant dash commits weakened history evidence.
- Run `29219810335` proved the editor reducer's no-op comparison ignored stroke contract fields.
- Run `29220282723` corrected the focused history fixture to the actual renderer document type.
- Run `29220835186` corrected transient file-read and tight raster-height assumptions.
- A broad remote replacement briefly inserted a stroke locator into an unrelated boolean test; it was immediately isolated and repaired before relying on CI.

## Verification

Full Verification `29221738942` passed the maturity/design gates, typecheck, web build, Core tests, and all 186 Playwright cases. The earlier complete GREEN `29221320688` proved the marker/history implementation before the final color and width controls were added.

## Next exact gap

Penpot supports multiple ordered strokes with per-stroke color, opacity, width, position, style, visibility, dash/gap, and endpoints. Layo still has one stroke per node, so the next loop is first-class multi-stroke rather than another single-stroke refinement.
