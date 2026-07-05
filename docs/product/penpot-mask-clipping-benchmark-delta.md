# Penpot Mask Clipping Benchmark Delta

Last checked: 2026-07-05

## Reference

Penpot remains the open-source team-product benchmark for this lane. The relevant capability is masked-group fidelity in imported design files: a masked group should preserve grouped children and clipping intent instead of losing visible structure or silently exposing overflowing children.

Reference sources:

- https://github.com/penpot/penpot
- https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs

## Layo Decision

Adapt.

Layo now represents the first safe subset as bounds clipping:

- imported Penpot masked groups keep their group container and child tree;
- the imported group stores `clip: { type: "bounds" }`;
- agent inspection summaries expose the same bounds-clipping signal for deterministic tools;
- code export exposes `structure.clip` and CSS `overflow: hidden;`;
- selected-layer SVG artifacts emit a `clipPath` and keep the group viewBox bounded.

Layo deliberately does not claim these Penpot mask features yet:

- arbitrary mask vector geometry;
- alpha mask fidelity;
- exact blend/compositing behavior.

## Maturity Gate Impact

Import/export maturity improves because masked groups are no longer only structurally preserved; they now carry the first deterministic clipping primitive across persistence and handoff.

Developer handoff improves because exported structure, CSS, selected-layer SVG artifacts, and agent inspection summaries carry the bounds-clipping signal.

Agent safety improves because `inspectCanvas`, `findNodes`, and batch inspection output now include `clip` for clipped imported groups.

## Closed Follow-Up

`Expose bounds clip in agent inspection summaries` is now covered by the focused Penpot maturity-loop slice in `docs/superpowers/plans/2026-07-05-clip-agent-inspection-summary.md`.

Acceptance evidence:

- `AgentNodeSummary` includes optional `clip?: { type: "bounds" }`;
- server regression coverage asserts `inspectCanvas` on a clipped imported group;
- PR body and plan evidence name the original missed surface;
- Playwright CLI proof remains the existing full-suite browser import path because this slice does not add browser behavior.

## Next Loop

The next mask-fidelity gap is arbitrary/alpha mask fidelity. It should be split from this bounds-clipping primitive because it needs a richer document model, renderer behavior, export semantics, and visual regression proof.

Deployment remains intentionally deferred.
