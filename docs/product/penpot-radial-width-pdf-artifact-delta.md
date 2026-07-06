# Penpot Radial Width PDF Artifact Delta

## Reference Capability

Penpot preserves radial gradient `width` as paint geometry and renders radial gradients with a transform that translates to the gradient start point, rotates by the gradient vector angle plus 90 degrees, scales by the radial width, and translates back. The current Penpot reference for this slice is `penpot/penpot@a4ba5fc2e046d8583edcd4946f09e4ee64280431`, `frontend/src/app/main/ui/shapes/gradients.cljs` lines 69-106.

## Layo Delta

Layo now adapts preserved Penpot radial width geometry for selected-layer PDF artifacts:

- Supports radial paint sources with non-default positive `width` values in the PDF artifact path.
- Emits PDF `/ShadingType 3` resources with origin-relative radial coordinates for transformed radial fills.
- Applies a PDF `cm` transform after clipping and before painting the shading resource, matching the supported Penpot `rotate(angle + 90) scale(width 1)` geometry.
- Keeps the existing circular radial PDF path unchanged when `width` is the default value.
- Leaves raster/canvas radial parity, path/group/text radial artifacts, and exact mixed-stack compositing out of scope for this slice.

## Verification

- RED Full Verification #28776181108 failed in Core tests before implementation because the radial width PDF fixture expected a transformed Type 3 shading resource, while Layo fell back to the solid fill path.
- The final PR-head Full Verification run for PR #258 is the merge gate for this slice.
- Plan routing was updated so `PLAN_STATUS.md` points the latest completed Penpot maturity-loop slice at `2026-07-06-penpot-radial-width-pdf-artifact.md`.

## Follow-Up Gaps

This is still selected-layer PDF artifact work, not full Penpot radial parity. Remaining radial/non-linear gradient work includes radial stroke-specific proof, radial raster/canvas parity, non-rect/path/group/text coverage, image-gradient interactions, and exact mixed-stack overlay/blend compositing.
