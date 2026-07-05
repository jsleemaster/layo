# Penpot Mask Clipping Benchmark Delta

Last checked: 2026-07-05

## Reference

Penpot remains the open-source team-product benchmark for this lane. The relevant capability is masked-group fidelity in imported design files: a masked group should preserve grouped children and clipping intent instead of losing visible structure or silently exposing overflowing children.

Reference sources:

- https://github.com/penpot/penpot
- https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs

The current Penpot mask renderer uses mask shape `points` to build SVG clip/mask definitions and keeps masked groups identifiable through the group shape's `masked-group` marker.

## Layo Decision

Adapt.

Layo now represents the first safe subset as bounds clipping while preserving Penpot mask source metadata and using source polygon points for code handoff:

- imported Penpot masked groups keep their group container and child tree;
- the imported group stores `clip: { type: "bounds" }`;
- when the Penpot masked group exposes source data, `clip.source` preserves the Penpot shape id, name, type, bounds, opacity, and polygon points;
- agent inspection summaries expose the same bounds-clipping and source metadata for deterministic tools;
- code export exposes `structure.clip`, source metadata, CSS `overflow: hidden;`, and CSS `clip-path: polygon(...)` when source points and bounds are available;
- generated element JS modules serialize the same enriched structure and polygon CSS;
- selected-layer SVG artifacts emit a bounds `clipPath` and keep the group viewBox bounded.

Layo deliberately does not claim these Penpot mask features yet:

- canvas rendering from arbitrary mask vector geometry;
- selected-layer SVG/PDF/raster artifact fidelity for arbitrary masks;
- alpha mask compositing fidelity from the preserved source opacity;
- exact blend/compositing behavior.

## Maturity Gate Impact

Import/export maturity improves because masked groups are no longer only structurally preserved; they now carry the first deterministic clipping primitive plus the Penpot source metadata required for later arbitrary/alpha fidelity.

Developer handoff improves because exported structure, CSS, selected-layer SVG artifacts, and agent inspection summaries carry the clipping signal. Code export structure preserves the Penpot mask source metadata, and CSS handoff now maps available source points into a polygon `clip-path` while keeping the bounds fallback.

Agent safety improves because `inspectCanvas`, `findNodes`, and batch inspection output now include `clip` for clipped imported groups, including source metadata when available.

## Closed Follow-Ups

`Expose bounds clip in agent inspection summaries` is covered by `docs/superpowers/plans/2026-07-05-clip-agent-inspection-summary.md`.

`Preserve Penpot mask source metadata` is tracked by `docs/superpowers/plans/2026-07-05-penpot-mask-source-metadata.md`.

`Export Penpot mask polygons in code handoff` is tracked by `docs/superpowers/plans/2026-07-05-penpot-mask-polygon-code-export.md`.

Acceptance evidence for the source metadata and polygon handoff slices:

- persisted imported groups include `clip.source` for Penpot masked groups with points and opacity;
- `AgentNodeSummary` carries the same source metadata;
- code export structure carries the same source metadata and clip annotation detail;
- generated CSS keeps `overflow: hidden;` and emits polygon `clip-path` when source points are available;
- generated JS modules serialize the enriched structure and polygon CSS.

## Next Loop

The next mask-fidelity gap is visible/artifact arbitrary mask rendering and alpha compositing. It should build on `clip.source` instead of trying to infer the Penpot mask shape after import.

Deployment remains intentionally deferred.
