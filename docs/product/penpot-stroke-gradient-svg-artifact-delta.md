# Penpot Stroke Gradient SVG Artifact Delta

Date: 2026-07-05
Status: Implemented
Maturity gate: Import/export maturity, Developer handoff

## Gap

Layo preserved Penpot stroke-gradient paint-source metadata, but selected-layer SVG artifacts still rendered the flattened fallback stroke color. This lost visible gradient fidelity in a developer handoff artifact even though agents could inspect the source paint metadata.

## Decision

Layo adapts Penpot's vector paint expectation for the current supported slice:

- Supported now: simple linear Penpot stroke gradients preserved in `style.paint_sources` for non-text, non-group selected-layer SVG artifacts.
- Fallback retained: the flattened Layo stroke is preserved in `data-fallback-stroke`.
- Id safety: SVG paint-server ids include the paint kind plus Penpot source index so fill and stroke gradients with the same index do not collide.

## Product Effect

Selected-layer SVG downloads now preserve a Penpot stroke-gradient source as an SVG paint server instead of degrading to the midpoint fallback stroke. The artifact is still deterministic and inspectable because unsupported or fallback consumers can read the flattened stroke from `data-fallback-stroke`.

## Evidence

- Regression: `apps/web/src/node-artifacts-gradient.test.ts`.
- RED: Full Verification #28747081513 failed in Core tests before the SVG stroke-gradient artifact implementation.
- GREEN: Full Verification #28747291400 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m52s on `e44e65f4e1e808f81bf70b31708eb9acf9733371`.

## Remaining Delta

This does not close all Penpot gradient fidelity. Remaining gaps are PDF stroke-gradient artifacts, selected-layer raster artifacts, live canvas rendering, radial gradient geometry, stop-specific alpha, blend modes, and exact multi-paint compositing. Deployment is intentionally deferred for this maturity-loop slice.
