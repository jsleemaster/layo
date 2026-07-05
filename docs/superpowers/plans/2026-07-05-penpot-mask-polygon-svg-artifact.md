# Penpot Mask Polygon SVG Artifact

## Goal

Close the next Penpot maturity-loop slice after polygon code handoff: selected-layer SVG artifacts should use preserved Penpot mask polygon source points when available, while keeping the existing bounds `clipPath` fallback for clipped nodes without polygon source data.

This does not claim canvas rendering, PDF/raster artifact masking, alpha mask compositing, or exact Penpot blend behavior. It narrows the visible artifact gap for SVG export only.

## Penpot Reference

- Source: https://github.com/penpot/penpot
- Source: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs
- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- Reference capability: Penpot mask rendering uses mask shape `points` to build SVG mask/clip definitions for masked groups.
- Decision: adapt. Layo maps preserved Penpot points into local SVG polygon points for selected-layer SVG artifacts, while preserving the existing `clip: { type: "bounds" }` primitive and rect fallback.
- Maturity gates: import/export maturity, developer handoff, artifact fidelity.

## Minimal-Change Ladder

1. Confirm behavior: selected-layer SVG artifacts already emitted a bounds `<rect>` clipPath even when `clip.source.points` had the Penpot polygon.
2. Reuse local patterns: keep `node-artifacts.ts` clipPath generation and existing clipped artifact test file.
3. Prefer existing primitives: use SVG `<polygon points="...">` inside the existing clipPath instead of adding a new rendering or document model primitive.
4. Implement narrowly: derive local polygon coordinates from `clip.source.bounds` and `clip.source.points`; fall back to the existing rect clipPath when points are missing or invalid.
5. Preserve validation: keep the existing bounds fallback test and add a focused Penpot polygon source case.

## Failure Mode

The previous slice made code handoff less lossy with CSS polygon `clip-path`, but selected-layer SVG artifacts still exported only a rectangular bounds clip. A designer or downstream tool inspecting the SVG artifact could not recover the imported Penpot diamond/polygon mask shape even though `clip.source.points` were preserved.

## RED Evidence

The strengthened `apps/web/src/node-artifacts-clip.test.ts` regression asserts that a clipped group with Penpot mask source points exports `<polygon points="50,0 100,30 50,60 0,30" />` in its SVG `<clipPath>` and no longer emits the bounds rect for that polygon-source case. The existing bounds-only clipped group test remains the fallback guard.

Local RED execution is unavailable in this Codex session because local shell commands such as `python3`, `perl`, `git status`, `git branch`, `git worktree list`, and `sleep` exit with code 134 before producing useful output. CI is the executable proof path for this branch.

## Implementation

- Reads `clip.source.points` and `clip.source.bounds` from renderer nodes.
- Converts Penpot source points into local SVG polygon coordinates by subtracting the source bounds origin.
- Emits a `<polygon>` inside the existing SVG `clipPath` when at least three finite source points and valid bounds exist.
- Preserves the existing rectangular bounds clipPath fallback for clipped nodes without usable polygon source data.
- Extends the clipped node artifact regression to cover both fallback and polygon-source behavior.

## Verification

Pending CI verification.

## Remaining Divergence

- Canvas rendering still uses the existing bounds clipping behavior.
- PDF/raster selected-layer artifacts still use the existing artifact path unless covered by a later slice.
- Alpha mask compositing from Penpot opacity and exact blend/compositing behavior remain follow-up gaps.

## Deployment

Deployment remains intentionally deferred.
