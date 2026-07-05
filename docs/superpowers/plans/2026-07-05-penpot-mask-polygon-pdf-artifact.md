# Penpot Mask Polygon PDF Artifact

## Goal

Close the next Penpot mask maturity gap after SVG artifact polygon clipping: selected-layer PDF artifacts should preserve the same Penpot mask polygon geometry that Layo already stores in `clip.source.points`.

Deployment remains intentionally deferred.

## Penpot Reference

- https://github.com/penpot/penpot
- https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs
- https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc

Decision: adapt. Layo keeps the local-first bounds clip primitive, but uses preserved Penpot source points to emit a PDF clipping path when selected-layer PDF artifacts are generated.

## Failed Case

After `2026-07-05-penpot-mask-polygon-svg-artifact.md`, selected-layer SVG artifacts emitted polygon `<clipPath>` geometry, but selected-layer PDF artifacts still flattened all PDF drawing entries without opening a clipping scope for clipped nodes. A Penpot masked group with diamond source points could therefore keep correct structure, code handoff, and SVG artifact geometry while the PDF artifact did not carry the same mask shape.

## Minimal-Change Ladder

- Reuse existing `clip.source.points` instead of adding a new document-model mask primitive.
- Reuse the current PDF content stream generator instead of adding a PDF dependency.
- Add PDF `q`/`W`/`n`/`Q` clipping commands around the existing node entry collection.
- Keep bounds-only clips as rectangular PDF clipping scopes.
- Keep raster/canvas/alpha fidelity as explicit follow-up gaps.

## Implementation

- Split polygon point normalization in `apps/web/src/node-artifacts.ts` into a reusable helper shared by SVG and PDF artifact paths.
- Added PDF path clipping for clipped nodes with valid Penpot polygon source points.
- Added PDF rect clipping fallback for clipped nodes without usable polygon source points.
- Extended `apps/web/src/node-artifacts-clip.test.ts` to assert both PDF rect clipping and PDF polygon path clipping.

## Verification

Pending final Full Verification for this branch.

Local shell verification remains unavailable in this Codex session because commands such as `git status`, `git branch`, `git worktree list`, `python3`, `perl`, `node`, and `sleep` exit with code 134 before producing useful output.
