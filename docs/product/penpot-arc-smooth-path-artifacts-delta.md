# Penpot Arc And Smooth Path Artifacts Delta

Date: 2026-07-06

## Penpot Reference

Penpot remains the current open-source benchmark for this slice because it is a team design platform built around self-hosting, open standards, design-code-AI workflows, inspect surfaces, and SVG/CSS/HTML/JSON-oriented handoff.

Current reference URLs checked for this slice:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/exporting-layers/
- https://help.penpot.app/user-guide/export-import/export-import-files/

Penpot layer exports support vector handoff formats, including SVG and PDF presets, and Penpot project files are documented as open ZIP/JSON/binary-asset packages. Layo adapts that expectation by preserving Penpot-origin path geometry in selected-layer PDF artifacts instead of degrading curved paths to rectangular primitives.

## Maturity Gate

This slice maps to:

- Import/export maturity: exported artifacts should preserve essential vector geometry and paint sources.
- Developer handoff: PDF selected-layer downloads should remain inspectable and usable by developers.
- Failure loop: the previous gap named SVG path commands outside Layo's supported `M/L/H/V/C/Q/Z` subset, including arcs and smooth curve commands.

Deployment is intentionally not part of this slice by user direction. Vercel preview status is treated as secondary to product verification here.

## Layo Adaptation

Layo now preserves standard Penpot-origin arc and smooth path commands for selected-layer PDF artifacts:

- `A` and `a` elliptical arc commands are converted into one or more cubic PDF curve segments.
- `S` and `s` smooth cubic commands reflect the previous cubic control point when available and otherwise start from the current point.
- `T` and `t` smooth quadratic commands reflect the previous quadratic control point and then convert the segment to cubic PDF commands.
- Arc, smooth cubic, and smooth quadratic paths now participate in PDF clip, fill, stroke, and gradient paths instead of forcing rectangle fallback.
- Malformed path data still falls back to the existing safe shape path behavior.

## Failure Learning

The RED state proved that the earlier preserved `pathData` parser still dropped Penpot-origin `A`, `S`, and `T` commands. A selected-layer radial gradient shape with an arc and smooth curves produced a rectangular PDF clipping path instead of path commands.

The implementation also exposed an operations miss: branch-push workflow edits created GitHub Actions runs with no jobs, so the patch was applied through a temporary default-branch dispatch runner and the runner file was removed after use. The durable product fix remains the regression test and restored normal Full Verification run on the PR branch.

## Verification

- RED: Full Verification #28791489133 failed in Core tests after the `A/S/T` path regression was added; the PDF artifact still contained rectangular `re` clipping instead of `10 50 m` and cubic path commands.
- Focused GREEN: temporary patch runner #28792750396 passed `pnpm --filter @layo/web test src/node-artifacts-arc-smooth.test.ts` and committed implementation head `89d8a7efb0d04e9bf2b7057f003a905acbfb5bc1`.
- Code-head verification: workflow-dispatched Full Verification #28792783143 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e on code head `89d8a7efb0d04e9bf2b7057f003a905acbfb5bc1`.

Final PR-head verification is tracked in the PR body because the last evidence line changes when this document is edited.

## Remaining Gaps

- Exact path fill-rule, compound-path, boolean, and winding semantics.
- Penpot path and raw SVG shape import/export beyond selected-layer artifact preservation.
- Exact mixed-stack overlay and blend compositing.
- Image-gradient interactions.
- Group/text gradient rendering and deeper multi-paint stack parity.
- Masks, components, variants, tokens, and shared-library relation import/export parity.
