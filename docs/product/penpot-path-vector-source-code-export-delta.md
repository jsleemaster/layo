# Penpot Path Vector Source Code Export Delta

Date: 2026-07-06

## Penpot Reference

Penpot remains the current open-source benchmark for team-product maturity because imported files, vector structure, and developer handoff outputs are expected to stay inspectable after migration.

Current reference URLs checked for this slice:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/
- https://help.penpot.app/user-guide/export-import/exporting-layers/

## Maturity Gate

This slice maps to:

- Import/export maturity: imported Penpot path data should remain available beyond rendered SVG bytes.
- Developer handoff: `/export/code` should expose preserved vector source metadata to downstream implementers and agents.
- Agent safety: code-export consumers should be able to distinguish an imported Penpot path bridge from a generic image asset.

Deployment is intentionally not part of this slice by user direction. Vercel preview status is secondary evidence only.

## Layo Adaptation

Layo continues to adapt Penpot path shapes through the existing local SVG image asset bridge for rendering. This slice extends the developer handoff layer:

- Code export collects image nodes with preserved `content.vector_source` metadata.
- Exported implementation structures expose that metadata as `content.vectorSource` on matching image nodes.
- Exported structures add a `Penpot vector` asset annotation so code-export consumers can find the original path source without parsing raw SVG bytes.

This still does not claim full first-class editable path-node import. It preserves source structure needed for future editable vector work.

## Failure Learning

The previous inspect slice made `/agent/inspect` aware of imported Penpot path sources but left `/export/code` with a generic image-only payload. The RED e2e imported a compound even-odd path and proved the export structure lacked both `content.vectorSource` and the `*-vector-source` annotation.

## Verification

- RED: Full Verification #28799691645 passed Penpot maturity/design gates, typecheck, web build, and core tests, then failed in Playwright CLI e2e at `apps/web/e2e/external-migration-penpot-path.spec.ts:285` because the exported path node did not include `content.vectorSource` or a `Penpot vector` annotation.

Final PR-head verification is tracked in the PR body because the last evidence line changes when this document is edited.

## Remaining Gaps

- First-class editable Penpot path-node import beyond the current SVG image-asset bridge.
- Agent mutation commands for preserved vector path metadata.
- Exact boolean geometry and winding semantics beyond stored path data and fill-rule metadata.
- Raw SVG semantic normalization beyond preserving provided markup/attributes.
- Masks, components, variants, tokens, and shared-library relation import/export parity.
- Production/deployment hardening remains lower priority for this slice.
