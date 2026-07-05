# Penpot Stroke Gradient PDF Artifact Delta

Date: 2026-07-05
Status: Implemented
Maturity gate: Import/export maturity, Developer handoff

## Gap

Layo preserved Penpot stroke-gradient paint-source metadata, and SVG selected-layer artifacts could render the gradient stroke, but selected-layer PDF artifacts still emitted the flattened fallback solid stroke. This lost Penpot-level vector paint fidelity in a developer handoff artifact.

## Decision

Layo adapts Penpot vector paint expectation for the current supported slice:

- Supported now: simple linear Penpot stroke gradients preserved in `style.paint_sources` for non-text, non-group selected-layer PDF artifacts.
- Fallback retained: unsupported stroke gradients continue to use the flattened Layo stroke path.
- PDF behavior: supported stroke gradients emit axial shading resources and clip the shading to the rectangular stroke ring instead of drawing fallback solid stroke commands.

## Product Effect

Selected-layer PDF downloads now preserve a Penpot stroke-gradient source as a vector shading stroke instead of degrading to the midpoint fallback stroke. The artifact remains deterministic because unsupported gradients stay on the existing fallback path and supported gradients are generated from preserved paint-source coordinates and stops.

## Evidence

- Regression: `apps/web/src/node-artifacts-gradient.test.ts`.
- RED: Full Verification #28748110842 failed in Core tests before the PDF stroke-gradient artifact implementation.
- GREEN: Full Verification #28748276845 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m34s on `6041b3518f204f7a4755be4884c570c0ad7cae72`.

## Remaining Delta

This does not close all Penpot gradient fidelity. Remaining gaps are selected-layer raster artifacts, live canvas rendering, radial gradient geometry, stop-specific alpha, blend modes, exact multi-paint compositing, and deeper mixed gradient/stroke paint stacks. Deployment is intentionally deferred for this maturity-loop slice.
