# Penpot Stroke Gradient SVG Artifact

Date: 2026-07-05
Status: Completed
Branch: codex/penpot-stroke-gradient-svg-artifact

## Penpot Reference

Penpot treats fill and stroke paints as first-class vector style data. Layo already preserves Penpot `fill` and `stroke` gradient paint-source metadata in `style.paint_sources`, but selected-layer SVG artifacts only used the flattened `style.stroke` fallback. That meant a Penpot stroke gradient survived for agents and code metadata, but disappeared when a developer downloaded the selected layer as SVG.

## Adopt / Adapt / Diverge

- Adapt: emit simple preserved Penpot linear stroke gradients as SVG `<linearGradient>` paint servers and set `stroke="url(#...)"` in selected-layer SVG artifacts.
- Adapt: keep deterministic `data-fallback-stroke` with the flattened Layo stroke color so unsupported consumers and debugging paths retain a stable fallback.
- Diverge for now: radial gradients, exact blend/compositing, multiple stroke paint rendering, PDF stroke gradients, raster artifacts, and live canvas stroke-gradient rendering remain tracked follow-up gaps.

## Goal

Close the selected-layer SVG artifact gap for preserved Penpot linear stroke gradients without changing the local-first document model or broadening into unrelated rendering surfaces.

## Implementation

- Reused the existing Penpot paint-source metadata from `RendererNode.style.paint_sources`.
- Generalized fill-gradient lookup into a `paintGradientForNode(node, kind)` helper and added `strokeGradientForNode`.
- Emitted SVG defs for both fill and stroke gradients.
- Added `svgStrokeAttributeForNode` so a preserved stroke gradient uses `stroke="url(#...)"` plus `data-fallback-stroke`.
- Qualified SVG gradient ids by paint kind (`fill` or `stroke`) as well as Penpot index so real Penpot data with fill `index: 0` and stroke `index: 0` cannot collide.

## Regression Coverage

`apps/web/src/node-artifacts-gradient.test.ts` covers:

- Preserved Penpot fill gradients as SVG paint servers.
- Preserved Penpot stroke gradients as SVG paint servers.
- Distinct SVG paint-server ids when Penpot fill and stroke gradients share the same source index.
- Existing selected-layer PDF fill-gradient axial shading behavior remains covered.

## Verification

- RED: Full Verification #28747081513 failed in Core tests after adding the initial stroke-gradient SVG artifact regression.
- GREEN: Full Verification #28747291400 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m52s on branch head `e44e65f4e1e808f81bf70b31708eb9acf9733371`.

Deployment verification is intentionally deferred per current priority; product maturity work continues independently of Vercel deploy status.

## Remaining Gaps

- PDF stroke-gradient artifacts.
- Selected-layer PNG/JPEG/WEBP stroke-gradient raster artifacts.
- Live canvas gradient rendering.
- Radial gradient geometry.
- Stop-specific alpha and blend-mode compositing.
- Exact multi-paint stack rendering and export fidelity.
