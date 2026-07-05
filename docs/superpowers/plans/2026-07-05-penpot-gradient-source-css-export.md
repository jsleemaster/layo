# Penpot Gradient Source CSS Export

Date: 2026-07-05
Branch: `codex/penpot-gradient-source-css-export`

## Penpot Comparison

Reference capability: Penpot keeps gradient paint records as structured source data and can hand off gradient intent rather than only a sampled midpoint color. After `2026-07-05-penpot-paint-source-metadata.md`, Layo preserved Penpot paint sources but still emitted code-export CSS that only used the flattened `background-color` fallback.

Decision: adapt.

Layo should keep the flattened color as a stable fallback, then add a CSS `background-image` gradient when a preserved Penpot fill gradient source is available. This improves developer handoff without claiming full live-canvas or exact multi-paint compositing fidelity yet.

## Goal

Use preserved `style.paint_sources` to export a simple Penpot fill gradient as deterministic CSS while keeping existing flattened render styles and structure metadata.

## Implementation

- `apps/server/src/code-export.ts` now post-processes global and per-element CSS for preserved fill gradient paint sources.
- The generated CSS keeps `background-color` as fallback and adds `background-image: linear-gradient(...)` for the first preserved fill gradient source.
- Gradient angle is derived from preserved Penpot start/end geometry; stops are sorted by offset and support stop opacity through `rgba(...)`.
- `apps/server/src/code-export.penpot-paint-source.test.ts` covers global CSS, per-element CSS, structure `paintSources`, annotation presence, and generated JS module serialization.

## Verification

- Full Verification `#28743933385` passed on code head `0054d9bc4b8df9fc5772459e4a811f8e89f778e8` in 7m48s.
- Passed gates: Penpot maturity and design rule gates, typecheck, web build, Core tests, and Playwright CLI e2e.

## Remaining Gap

This slice handles simple fill-gradient CSS handoff only. Remaining paint-fidelity loops are visible canvas gradient geometry, selected-layer artifact gradient fidelity, blend-mode compositing, exact multi-paint stack rendering/export, radial geometry fidelity, stroke gradient CSS handoff, and image+paint compositing.

Deployment remains intentionally deferred.
