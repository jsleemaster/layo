# Penpot Mask Polygon Code Export

## Goal

Close the next Penpot maturity-loop slice after preserving mask source metadata: code export should use preserved Penpot mask polygon points to emit a deterministic CSS `clip-path: polygon(...)` handoff while keeping the existing `overflow: hidden` bounds fallback.

This does not claim canvas rendering, selected-layer artifact export, alpha mask compositing, or exact Penpot blend behavior. It uses the source metadata from `clip.source` to make developer handoff less lossy.

## Penpot Reference

- Source: https://github.com/penpot/penpot
- Source: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs
- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- Reference capability: Penpot mask rendering uses mask shape `points` to build SVG mask/clip definitions for masked groups.
- Decision: adapt. Layo maps preserved Penpot points into CSS polygon percentages for code handoff, while the editor/runtime model still keeps `clip: { type: "bounds" }` as the stable clipping primitive.
- Maturity gates: developer handoff, import/export maturity, agent safety.

## Minimal-Change Ladder

1. Confirm behavior: PR #243 preserves `clip.source.points`, but generated CSS and JS module artifacts still expose only bounds clipping.
2. Reuse local patterns: keep the code-export wrapper introduced for mask source enrichment.
3. Prefer existing primitives: generate CSS `clip-path: polygon(...)` from `clip.source.bounds` and `clip.source.points` instead of adding a new mask renderer or document model.
4. Implement narrowly: enrich `result.css` and per-element `css` strings, then regenerate `jsModule` so serialized artifacts match.
5. Preserve validation: extend the existing Penpot masked-group regression to assert global CSS, element CSS, annotation detail, and JS module output.

## Failure Mode

The source metadata slice retained Penpot polygon points but still described code export as a bounds-only fallback. Developers reading generated handoff artifacts could not recover the actual diamond/polygon mask shape even though the source points were available.

## RED Evidence

The strengthened regression asserts that a Penpot masked group with four diamond points exports `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);` in global CSS, element CSS, and generated JS module output. Prior code only emitted `overflow: hidden;`.

Local RED execution is unavailable in this Codex session because local shell commands such as `python3`, `git status`, `git branch`, `git worktree list`, and `sleep` exit with code 134 before producing useful output. CI is the executable proof path for this branch.

## Implementation

- Enriches global code export CSS with polygon `clip-path` rules when `clip.source.points` and valid source bounds exist.
- Enriches each element CSS artifact the same way.
- Updates clip handoff annotations to distinguish polygon clip-path handoff from bounds-only fallback.
- Regenerates element `jsModule` output after CSS and structure enrichment.
- Extends the Penpot mask clipping server regression to assert polygon CSS in all code handoff surfaces.

## Verification

Pending CI verification.

## Remaining Divergence

- Canvas rendering still uses the existing bounds clipping behavior.
- Selected-layer SVG/PDF/raster export fidelity still uses the existing artifact path unless covered by a later slice.
- Alpha mask compositing from Penpot opacity and exact blend/compositing behavior remain follow-up gaps.

## Deployment

Deployment remains intentionally deferred.
