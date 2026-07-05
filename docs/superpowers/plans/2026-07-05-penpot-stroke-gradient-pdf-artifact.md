# Penpot Stroke Gradient PDF Artifact Plan

Date: 2026-07-05
Status: Implemented
Benchmark: Penpot vector paint fidelity in developer handoff artifacts
Maturity gate: Import/export maturity, Developer handoff

## Failed Case

Layo preserved Penpot stroke-gradient paint-source metadata and SVG selected-layer artifacts could emit stroke gradients, but selected-layer PDF artifacts still degraded the same Penpot stroke gradient to the flattened fallback solid stroke. That meant the handoff PDF lost visible vector paint fidelity even when the original Penpot metadata was present and inspectable.

## Decision

Adapt the Penpot capability for Layo current document model:

- Preserve the existing flattened stroke as the deterministic fallback style.
- Emit a PDF axial shading resource for supported linear stroke-gradient paint sources.
- Clip the shading to the stroked rectangle ring instead of drawing the fallback solid stroke.
- Keep unsupported gradients on the existing deterministic fallback path.

## Implementation

- Add a PDF stroke-gradient entry path alongside the existing fill-gradient entry path in `apps/web/src/node-artifacts.ts`.
- Split rectangle PDF fill and stroke commands so gradient stroke entries can replace only the stroke fallback.
- Serialize gradient stroke entries as clipped `/ShN sh` commands with an even-odd stroke ring clip.
- Add regression coverage in `apps/web/src/node-artifacts-gradient.test.ts` for the Penpot stroke-gradient card PDF output and for suppressing the solid fallback stroke commands.

## Evidence

- RED: Full Verification #28748110842 failed in Core tests before implementation.
- GREEN: Full Verification #28748276845 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m34s on `6041b3518f204f7a4755be4884c570c0ad7cae72`.

## Remaining Delta

This slice does not close all Penpot gradient fidelity. Remaining gaps are selected-layer raster artifacts, live canvas rendering, radial gradient geometry, stop-specific alpha, blend modes, exact multi-paint compositing, and deeper mixed gradient/stroke paint stacks. Deployment is intentionally deferred for this maturity-loop slice.
