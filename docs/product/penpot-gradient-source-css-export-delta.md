# Penpot Gradient Source CSS Export Delta

Last checked: 2026-07-05

## Reference

Penpot remains the open-source benchmark for design handoff fidelity in this lane. The relevant capability is carrying gradient paint intent into exported/dev-facing artifacts instead of reducing the shape to a single sampled color.

Reference sources:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/

## Layo Decision

Adapt.

Layo keeps the deterministic flattened `background-color` fallback from the importer, then uses preserved Penpot `style.paint_sources` metadata to add CSS `background-image` for simple fill gradients in code export. This raises developer handoff fidelity while leaving live canvas rendering and exact compositing as explicit future gaps.

## Product Evidence

- Global code export CSS includes `background-image: linear-gradient(...)` for a node with preserved Penpot fill gradient sources.
- Per-element CSS includes the same gradient handoff and still keeps the flattened fallback `background-color`.
- Exported structure continues to expose `style.paintSources` and `Penpot paint` annotations.
- Generated element modules serialize both the gradient CSS and source metadata.

## Verification

Full Verification `#28743933385` passed on code head `0054d9bc4b8df9fc5772459e4a811f8e89f778e8` in 7m48s, including Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.

The focused regression is `apps/server/src/code-export.penpot-paint-source.test.ts`.

## Remaining Gap

The live editor still renders flattened paint, and selected-layer artifacts do not yet use preserved gradient geometry. Blend modes, exact multi-paint stacks, radial geometry, stroke gradient handoff, and image+paint compositing remain future Penpot maturity-loop cases.

Deployment remains intentionally deferred.
