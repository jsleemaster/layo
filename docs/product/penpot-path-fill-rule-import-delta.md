# Penpot Path Fill Rule Import Delta

Date: 2026-07-06

## Penpot Reference

Penpot remains the current open-source benchmark because it is a self-hostable team design platform built around open standards, code handoff, inspect surfaces, APIs, plugins, and AI/MCP workflows.

Current reference URLs checked for this slice:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/
- https://help.penpot.app/user-guide/export-import/exporting-layers/

Penpot project files are documented as ZIP archives with readable JSON structure plus binary/vector assets, and Penpot layer exports include SVG and PDF formats. Layo adapts that expectation by preserving compound path winding semantics in the current Penpot path-as-SVG-asset import path before deeper first-class path-node import work.

## Maturity Gate

This slice maps to:

- Import/export maturity: imported Penpot files should keep essential vector semantics when Layo stores the path as a local SVG asset.
- Developer handoff: the imported SVG asset should keep compound path holes inspectable instead of silently reverting to nonzero winding.
- Failure loop: the previous artifact slice closed selected-layer artifact output, then exposed the next gap at the Penpot ZIP import boundary.

Deployment is intentionally not part of this slice by user direction. Vercel preview status is secondary evidence only.

## Layo Adaptation

Layo now preserves Penpot-origin even-odd path fill-rule metadata while importing path shapes as local SVG image assets:

- Penpot path shape JSON accepts `fillRule`, `fill-rule`, or `fill_rule` values.
- `evenodd` and `even-odd` normalize to SVG `fill-rule="evenodd"`.
- Imported path SVG asset bytes receive the fill-rule only for the generated path SVG asset that matches the Penpot source shape id.
- Nonzero/default path imports keep the prior SVG output unchanged.
- The imported asset metadata byte length is updated after the SVG bytes are enriched.

## Failure Learning

The RED state proved that the Penpot path import flow was still losing compound path semantics after the selected-layer artifact path was fixed. A Penpot ZIP fixture with a compound path and `fill-rule: evenodd` imported successfully, but the stored SVG asset omitted `fill-rule="evenodd"`, so holes would render with the default nonzero winding.

## Verification

- RED: Full Verification #28796099763 passed Penpot maturity/design gates, typecheck, web build, and core tests, then failed in Playwright CLI e2e because the imported SVG asset was missing the expected `fill-rule="evenodd"` bytes.

Final PR-head verification is tracked in the PR body because the last evidence line changes when this document is edited.

## Remaining Gaps

- First-class Penpot path-node import beyond the current path-as-SVG-asset bridge.
- Exact boolean geometry and winding semantics beyond preserved even-odd SVG asset metadata.
- Raw SVG shape semantic normalization beyond preserving provided markup/attributes.
- Exact mixed-stack overlay and blend compositing.
- Image-gradient interactions.
- Group/text gradient rendering and deeper multi-paint stack parity.
- Masks, components, variants, tokens, and shared-library relation import/export parity.
