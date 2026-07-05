# Penpot Mask Source Metadata

## Goal

Close the next Penpot maturity-loop slice after bounds clipping: imported Penpot masked groups should retain deterministic mask source metadata, including the Penpot mask shape id, bounds, opacity, and polygon points when present.

This does not claim full arbitrary or alpha mask rendering. It preserves the source metadata needed for that later renderer/export slice while keeping the current safe bounds-clipping fallback.

## Penpot Reference

- Source: https://github.com/penpot/penpot
- Source: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs
- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- Reference capability: Penpot mask rendering uses the mask shape's points for SVG clip/mask definitions and treats masked groups as first-class group shapes.
- Decision: adapt. Layo keeps `clip: { type: "bounds" }` for rendering/export fallback, but now preserves the Penpot mask source under `clip.source` for deterministic agents and handoff.
- Maturity gates: import/export maturity, developer handoff, agent safety.

## Minimal-Change Ladder

1. Confirm behavior: after PR #242, Layo exposes bounds clipping to agents but still discards the Penpot mask shape's source points and opacity.
2. Reuse local patterns: keep the existing bounds clipping fallback and agent/code export clip surfaces.
3. Prefer existing primitives: preserve source metadata inside the existing `clip` object instead of adding a parallel mask document model in this slice.
4. Implement narrowly: wrap existing external migration and code export implementations so the large import/export paths are preserved while source metadata is enriched.
5. Preserve validation: add focused server regression coverage that proves persistence, agent inspection, and code handoff all retain the same mask source metadata.

## Failure Mode

The previous bounds-clipping slice prevented overflowing children, but it flattened Penpot masks to an anonymous bounds clip. That meant the exact Penpot mask source needed for arbitrary vector and alpha fidelity was not inspectable after import.

A self-review caught one additional handoff failure before merge: the wrapper enriched `element.structure`, but the precomputed `element.jsModule` artifact still serialized the stale base structure. The regression now asserts that generated JS modules also carry `clip.source` and the bounds-fallback annotation detail.

## RED Evidence

The focused regression asserts that a Penpot masked group with four mask points and opacity imports with `clip.source` on the persisted group, agent inspection summary, code export structure, code export annotation, and generated JS module. Prior code only returned `clip: { type: "bounds" }`.

Local RED execution is unavailable in this Codex session because local shell commands such as `python3`, `git status`, and `git worktree list` exit with code 134 before producing output. CI is the executable proof path for this branch.

## Implementation

- Preserves the existing external migration implementation as `external-migration-base.ts`.
- Wraps `importExternalMigrationArchive` to enrich Penpot masked groups with `clip.source` metadata after the base import succeeds.
- Preserves the existing code export implementation as `code-export-base.ts`.
- Wraps `exportDesignToCode` to reattach `clip.source` into exported structures and clip annotations.
- Regenerates each exported element `jsModule` after structure enrichment so the serialized handoff artifact matches `element.structure`.
- Extends agent and renderer-facing `NodeClip` shapes to carry optional Penpot source metadata.
- Strengthens the Penpot mask clipping server regression to assert source metadata across persistence, agent inspection, code handoff, and generated JS module output.

## Verification

- Full Verification #28732770022 passed on code head `bf291f46ceede1a83598689b7ffe4b1e12f4c222`: Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e all completed successfully in 7m59s.
- Core tests include the focused Penpot masked-group regression for persisted `clip.source`, agent inspection, code export structure/annotation, and generated `jsModule` metadata.
- Local shell verification remains unavailable in this Codex session because local commands such as `python3`, `git status`, `git branch`, `git worktree list`, and `sleep` exit with code 134 before producing useful output.

## Remaining Divergence

- Layo still renders and exports CSS with bounds clipping fallback.
- Arbitrary polygon mask rendering, alpha mask compositing, selected-layer SVG/PDF/raster artifact fidelity, and exact Penpot blend/compositing behavior remain follow-up gaps.

## Deployment

Deployment remains intentionally deferred.
