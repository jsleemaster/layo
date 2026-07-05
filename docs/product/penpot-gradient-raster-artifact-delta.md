# Penpot Gradient Raster Artifact Delta

Date: 2026-07-05
Status: Implemented
Maturity gate: Import/export maturity, Developer handoff, Editor UX

## Gap

Layo preserved Penpot gradient paint-source metadata and could render supported linear gradients in selected-layer SVG/PDF vector artifacts, but selected-layer raster artifacts generated from the browser canvas still used the flattened fallback fill/stroke. The Dev Panel PNG path therefore lost visible Penpot paint fidelity.

## Decision

Layo adapts Penpot canvas/raster paint expectation for the current supported slice:

- Supported now: simple linear Penpot fill and stroke gradients preserved in `style.paint_sources` for non-text, non-group rectangular nodes.
- Canvas behavior: supported gradients are mapped to Konva fill/stroke linear gradient props, with fill priority set to the gradient when needed.
- Raster behavior: selected-layer raster downloads reuse the same Konva canvas render path, so the supported gradient is preserved in the downloaded PNG path exercised by e2e.
- Fallback retained: unsupported gradients, unsupported node kinds, and unsupported paint stacks continue to render through the flattened deterministic Layo fill/stroke values.

## Product Effect

The imported Penpot stroke-gradient card now produces a selected-layer PNG whose left and right stroke pixels show red/blue gradient evidence instead of the old purple midpoint fallback. This also improves the live canvas path for the same supported rectangular fill/stroke gradient sources because both paths share `App.tsx`'s `Rect` renderer.

## Evidence

- Regression: `apps/web/e2e/external-migration-penpot-stroke-gradient.spec.ts`.
- RED: Full Verification #28749312749 failed in Playwright CLI e2e before implementation because the PNG stroke sample stayed on the fallback purple color (`r = 128`).
- GREEN: Full Verification #28749797013 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m38s on `67088b288391a39be32427c52753fe89295b5d7b`.

## Remaining Delta

This does not close all Penpot gradient fidelity. Remaining gaps are radial/non-linear gradient geometry, exact mixed-stack overlay and blend-mode compositing, image-gradient interactions, non-rect/path gradient rendering, group/text gradient rendering, and deeper multi-paint stack parity. Deployment is intentionally deferred for this maturity-loop slice.
