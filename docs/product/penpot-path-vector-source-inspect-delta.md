# Penpot Path Vector Source Inspect Delta

Date: 2026-07-06

## Penpot Reference

Penpot remains the current open-source benchmark for team-product maturity because its files and export/import flows preserve readable design structure, vector assets, and developer handoff surfaces.

Current reference URLs checked for this slice:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/
- https://help.penpot.app/user-guide/export-import/exporting-layers/

## Maturity Gate

This slice maps to:

- Import/export maturity: imported Penpot path data should not become an opaque asset-only bridge for agents.
- Developer handoff: agent inspection should expose the original Penpot path source metadata even while Layo renders through its current SVG image-asset bridge.
- Agent safety: AI tools should be able to inspect the preserved vector source before deciding whether to mutate, export, or report remaining migration gaps.

Deployment is intentionally not part of this slice by user direction. Vercel preview status is secondary evidence only.

## Layo Adaptation

Layo still adapts Penpot path shapes through the existing local SVG image asset bridge for rendering. This slice adds durable source metadata so the imported node remains inspectable:

- Imported Penpot path image nodes store `content.vector_source` with `origin`, `shapeId`, `shapeType`, original `pathData`, optional `fillRule`, and source bounds.
- `/files/:fileId/agent/inspect` returns that metadata as `vectorSource` on the image node summary.
- This does not claim full first-class path-node editing yet; it preserves the source structure needed for follow-up editable vector work.

## Failure Learning

The previous even-odd import slice preserved rendered SVG bytes but left the agent handoff surface unable to see that the image node came from a Penpot vector path. The RED test imported a compound even-odd path and proved `/agent/inspect` returned only a generic image node without `vectorSource`.

## Verification

- RED: Full Verification #28798008034 passed Penpot maturity/design gates, typecheck, web build, and core tests, then failed in Playwright CLI e2e because `inspection.nodes[].vectorSource` was missing for the imported Penpot path image node.

Final PR-head verification is tracked in the PR body because the last evidence line changes when this document is edited.

## Remaining Gaps

- First-class editable Penpot path-node import beyond the current SVG image-asset bridge.
- Agent mutation commands for preserved vector path metadata.
- Code-export structure annotations for preserved vector source metadata.
- Exact boolean geometry and winding semantics beyond stored path data and fill-rule metadata.
- Raw SVG semantic normalization beyond preserving provided markup/attributes.
- Masks, components, variants, tokens, and shared-library relation import/export parity.
