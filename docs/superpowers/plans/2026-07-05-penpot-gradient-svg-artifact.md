# Penpot Gradient SVG Artifact Fidelity

Date: 2026-07-05

## Penpot Reference Capability

Penpot is the open-source benchmark for import/export and developer handoff fidelity. In this slice, the relevant expectation is that gradient paint intent survives into exported design artifacts instead of being reduced to a sampled fallback color.

References:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/

## Layo Decision

Adapt.

Layo keeps deterministic flattened `style.fill` as the fallback color, then uses preserved Penpot `style.paint_sources` metadata to render simple fill linear gradients in selected-layer SVG artifacts as SVG paint servers.

## Failed Case

The prior slice made code export emit CSS gradients, but selected-layer SVG artifacts still rendered only the flattened fallback fill. The RED run `#28744752449` failed in Core tests after adding `apps/web/src/node-artifacts-gradient.test.ts` because no SVG `<linearGradient>` or `fill="url(#...)"` output existed.

## Implementation Scope

- Type preserved Penpot paint sources on `RendererNode.style.paint_sources`.
- Add SVG artifact helpers that select the first preserved Penpot fill linear gradient by paint-source order.
- Emit one `<linearGradient>` under the shared SVG `<defs>` block.
- Render non-text, non-group rect artifacts with `fill="url(#...)"` plus `data-fallback-fill` preserving the flattened color.
- Keep PDF, raster, live canvas rendering, radial gradients, stroke gradients, blend modes, and exact multi-paint compositing out of this slice.

## Verification

- RED Full Verification `#28744752449` failed in Core tests with the focused SVG artifact regression before implementation.
- First GREEN attempt `#28744966412` failed at typecheck because optional `source.gradient` was not narrowed.
- Final GREEN Full Verification `#28745127711` passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 6m28s.

## Remaining Gaps

- Selected-layer PDF/raster artifacts still render flattened gradient fallback color.
- Live canvas rendering still uses flattened paint.
- Radial gradient geometry, stroke-gradient artifact handoff, blend modes, and exact multi-paint ordering/compositing remain future Penpot maturity-loop cases.
- Deployment remains intentionally deferred.