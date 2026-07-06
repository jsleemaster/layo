# Penpot Path Fill Rule Artifacts Delta

Date: 2026-07-06

## Penpot Reference

Penpot remains the current open-source benchmark for this slice because it is a team design platform built around self-hosting, open standards, design-code-AI workflows, inspect surfaces, and SVG/CSS/HTML/JSON-oriented handoff.

Current reference URLs checked for this slice:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/exporting-layers/
- https://help.penpot.app/user-guide/export-import/export-import-files/

Penpot layer exports support vector handoff formats, including SVG and PDF presets, and Penpot project files are documented as open ZIP/JSON/binary-asset packages. Layo adapts that expectation by preserving Penpot-origin compound path fill-rule metadata in selected-layer artifacts instead of flattening every path through the nonzero winding default.

## Maturity Gate

This slice maps to:

- Import/export maturity: selected-layer SVG/PDF artifacts should preserve essential vector winding semantics.
- Developer handoff: compound path holes should remain inspectable in developer-facing exports.
- Failure loop: the previous gap named exact path fill-rule, compound-path, boolean, and winding semantics.

Deployment is intentionally not part of this slice by user direction. Vercel preview status is treated as secondary to product verification here.

## Layo Adaptation

Layo now preserves a Penpot-origin even-odd path fill rule for selected-layer SVG and PDF artifacts:

- `NodeClipSource.fillRule` carries `nonzero` or `evenodd` metadata for Penpot-origin clip/path sources.
- Selected-layer SVG path fills emit `fill-rule="evenodd"` when the source path uses even-odd winding.
- Selected-layer SVG clip paths emit `clip-rule="evenodd"`, and alpha-mask paths emit the matching fill rule.
- Selected-layer PDF path fills use `f*` and clip paths use `W*` for even-odd sources.
- Nonzero sources and sources without explicit fill-rule metadata keep the existing default `f` and `W` operators.

## Failure Learning

The RED state proved that preserved Penpot `pathData` still lost compound path semantics: the new test expected SVG `fill-rule`/`clip-rule` attributes plus PDF `f*`/`W*`, while the existing artifact code emitted the path geometry with default SVG/PDF nonzero fill behavior.

## Verification

- RED: Full Verification #28794432402 passed Penpot maturity/design gates, typecheck, and web build, then failed in Core tests on the added even-odd compound path artifact regression.

Final PR-head verification is tracked in the PR body because the last evidence line changes when this document is edited.

## Remaining Gaps

- Exact boolean geometry and winding semantics beyond preserved even-odd artifact metadata.
- Penpot path and raw SVG shape import/export beyond selected-layer artifact preservation.
- Exact mixed-stack overlay and blend compositing.
- Image-gradient interactions.
- Group/text gradient rendering and deeper multi-paint stack parity.
- Masks, components, variants, tokens, and shared-library relation import/export parity.
