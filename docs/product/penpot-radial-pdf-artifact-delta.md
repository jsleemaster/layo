# Penpot Radial PDF Artifact Delta

## Reference Capability

Penpot keeps radial gradients as structured paint geometry and renders circular radial fills as radial paint regions. Layo's selected-layer PDF artifact path already supported linear gradient paint sources through axial PDF shading resources; this slice adds the comparable first circular radial fill path.

## Layo Delta

Layo now adapts preserved Penpot circular radial fill metadata for selected-layer PDF artifacts:

- Supports preserved radial paint sources when `width` is the default circular value.
- Emits PDF `/ShadingType 3` resources with `/Coords [centerX centerY 0 centerX centerY radius]` from the preserved Penpot start/end vector.
- Reuses the existing PDF gradient stop function generation for radial shading colors.
- Clips the radial shading to the exported node bounds and keeps the existing deterministic fallback path for unsupported radial width/ellipse cases.
- Leaves raster/canvas radial parity and radial width/ellipse PDF parity out of scope for this slice.

## Verification

- RED Full Verification #28775135264 failed in Core tests before implementation because the radial PDF fixture expected `/ShadingType 3`, while Layo emitted the fallback solid fill path.
- The final PR-head Full Verification run for PR #257 is the merge gate for this slice.
- Plan routing was updated so `PLAN_STATUS.md` points the latest completed Penpot maturity-loop slice at `2026-07-06-penpot-radial-pdf-artifact.md`.

## Follow-Up Gaps

This is not full Penpot radial parity. Remaining radial/non-linear gradient work includes radial stroke-specific proof, radial width/ellipse PDF parity, radial raster/canvas parity, non-rect/path/group/text coverage, image-gradient interactions, and exact mixed-stack overlay/blend compositing.
