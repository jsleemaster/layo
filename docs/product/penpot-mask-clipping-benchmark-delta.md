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
- code export exposes `structure.clip` and CSS `overflow: hidden;`;
- selected-layer SVG artifacts emit a `clipPath` and keep the group viewBox bounded.

Layo deliberately does not claim these Penpot mask features yet:

- arbitrary mask vector geometry;
- alpha mask fidelity;
- exact blend/compositing behavior;
- agent inspection summaries exposing `clip`.

## Maturity Gate Impact

Import/export maturity improves because masked groups are no longer only structurally preserved; they now carry the first deterministic clipping primitive across persistence and handoff.

Developer handoff improves because exported structure, CSS, and selected-layer SVG artifacts carry the bounds-clipping signal.

Agent safety remains incomplete until `inspectCanvas` / agent node summaries include `clip` and a regression test proves the surface.

## Next Loop

The next focused Penpot maturity-loop goal should be:

`Expose bounds clip in agent inspection summaries`

Acceptance should include:

- `AgentNodeSummary` includes `clip?: { type: "bounds" }`;
- server regression coverage for `inspectCanvas` on a clipped imported group;
- PR body and plan evidence naming the current missed surface;
- Playwright CLI proof remains required only when the browser behavior changes.

Deployment remains intentionally deferred.
