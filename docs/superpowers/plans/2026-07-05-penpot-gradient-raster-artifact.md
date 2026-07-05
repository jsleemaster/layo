# Penpot Gradient Raster Artifact Plan

Date: 2026-07-05
Status: Implemented
Benchmark: Penpot canvas and raster artifact paint fidelity
Maturity gate: Import/export maturity, Developer handoff, Editor UX

## Failed Case

Layo preserved Penpot linear gradient paint-source metadata and selected-layer SVG/PDF vector artifacts could use the gradient source, but the Dev Panel PNG raster artifact still rendered the imported Penpot stroke gradient as the flattened fallback purple stroke. The same selected layer therefore looked less mature in browser-generated raster handoff than in vector handoff.

## Decision

Adapt the Penpot capability for Layo's current Konva canvas model:

- Preserve the existing flattened fill/stroke values as deterministic fallbacks.
- Render supported Penpot simple linear fill and stroke paint sources through Konva gradient props for non-text, non-group rectangular nodes.
- Use `fillPriority="linear-gradient"` when a fill gradient exists so Konva does not prefer the flattened fallback fill.
- Keep unsupported paint types, non-linear gradients, and unsupported node kinds on the existing deterministic fallback path.

## Implementation

- Add canvas gradient conversion helpers in `apps/web/src/App.tsx` for Penpot `style.paint_sources`.
- Convert normalized Penpot start/end coordinates into node-local Konva gradient points.
- Convert sorted gradient stops into Konva color stop arrays, including simple hex stop opacity handling.
- Spread the derived fill/stroke gradient props into the existing `Rect` render path used by live canvas and selected-layer raster export.
- Add Playwright CLI e2e regression coverage in `apps/web/e2e/external-migration-penpot-stroke-gradient.spec.ts` that imports the Penpot stroke-gradient archive, downloads the selected layer PNG from the Dev Panel, and samples left/right stroke pixels for red/blue gradient evidence instead of the purple fallback.

## Evidence

- RED: Full Verification #28749312749 failed in Playwright CLI e2e before implementation because the downloaded PNG left stroke pixel was the fallback purple channel value (`r = 128`) instead of a red-dominant gradient sample.
- GREEN: Full Verification #28749797013 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m38s on `67088b288391a39be32427c52753fe89295b5d7b`.

## Remaining Delta

This slice does not close all Penpot gradient fidelity. Remaining gaps are radial/non-linear gradient geometry, exact mixed-stack overlay and blend-mode compositing, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, and deeper multi-paint stack parity. Deployment is intentionally deferred for this maturity-loop slice.
