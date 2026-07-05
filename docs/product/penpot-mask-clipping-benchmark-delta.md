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

Layo now represents the first safe subset as bounds clipping while preserving Penpot mask source metadata and using source polygon points for code, SVG artifact, and PDF artifact handoff:

- imported Penpot masked groups keep their group container and child tree;
- the imported group stores `clip: { type: "bounds" }`;
- when the Penpot masked group exposes source data, `clip.source` preserves the Penpot shape id, name, type, bounds, opacity, and polygon points;
- agent inspection summaries expose the same bounds-clipping and source metadata for deterministic tools;
- code export exposes `structure.clip`, source metadata, CSS `overflow: hidden;`, and CSS `clip-path: polygon(...)` when source points and bounds are available;
- generated element JS modules serialize the same enriched structure and polygon CSS;
- selected-layer SVG artifacts emit polygon `<clipPath>` shapes when source points are available, and keep the bounded viewBox plus rect fallback for clipped nodes without usable source points;
- selected-layer PDF artifacts open PDF clipping scopes for clipped nodes, using source polygon points as path clipping when available and rect clipping as the fallback.

Layo deliberately does not claim these Penpot mask features yet:

- canvas rendering from arbitrary mask vector geometry;
- selected-layer raster artifact fidelity for arbitrary masks;
- alpha mask compositing fidelity from the preserved source opacity;
- exact blend/compositing behavior.

## Maturity Gate Impact

Import/export maturity improves because masked groups are no longer only structurally preserved; they now carry the first deterministic clipping primitive plus the Penpot source metadata required for later arbitrary/alpha fidelity.

Developer handoff improves because exported structure, CSS, selected-layer SVG artifacts, selected-layer PDF artifacts, and agent inspection summaries carry the clipping signal. Code export structure preserves the Penpot mask source metadata, CSS handoff maps available source points into a polygon `clip-path`, SVG artifact export maps the same points into a polygon `<clipPath>`, and PDF artifact export maps them into a PDF clipping path while keeping bounds fallbacks.

Agent safety improves because `inspectCanvas`, `findNodes`, and batch inspection output now include `clip` for clipped imported groups, including source metadata when available.

## Closed Follow-Ups

`Expose bounds clip in agent inspection summaries` is covered by `docs/superpowers/plans/2026-07-05-clip-agent-inspection-summary.md`.

`Preserve Penpot mask source metadata` is tracked by `docs/superpowers/plans/2026-07-05-penpot-mask-source-metadata.md`.

`Export Penpot mask polygons in code handoff` is tracked by `docs/superpowers/plans/2026-07-05-penpot-mask-polygon-code-export.md`.

`Render Penpot mask polygons in selected SVG artifacts` is tracked by `docs/superpowers/plans/2026-07-05-penpot-mask-polygon-svg-artifact.md`.

`Render Penpot mask polygons in selected PDF artifacts` is tracked by `docs/superpowers/plans/2026-07-05-penpot-mask-polygon-pdf-artifact.md`.

Acceptance evidence for the source metadata, polygon handoff, SVG artifact, and PDF artifact slices:

- persisted imported groups include `clip.source` for Penpot masked groups with points and opacity;
- `AgentNodeSummary` carries the same source metadata;
- code export structure carries the same source metadata and clip annotation detail;
- generated CSS keeps `overflow: hidden;` and emits polygon `clip-path` when source points are available;
- generated JS modules serialize the enriched structure and polygon CSS;
- selected-layer SVG artifacts keep the rect fallback for bounds-only clips and emit polygon clipPath geometry when Penpot source points are available;
- selected-layer PDF artifacts keep the rect fallback for bounds-only clips and emit polygon clipping path geometry when Penpot source points are available.

## Next Loop

The next mask-fidelity gap is visible canvas rendering, selected-layer raster artifact fidelity, and alpha compositing. It should build on `clip.source` instead of trying to infer the Penpot mask shape after import.

Deployment remains intentionally deferred.
