# Penpot Radial Width SVG Artifact Delta

## Reference Capability

Penpot preserves radial gradient geometry as structured paint data. In the current open-source reference, radial gradients carry `start-x`, `start-y`, `end-x`, `end-y`, and `width`; the frontend SVG renderer derives the radial center/radius from the start/end vector and applies a `gradientTransform` that rotates and scales the radial paint server around the start point.

## Layo Delta

Layo now adapts that geometry for the selected-layer SVG artifact path:

- Supports Penpot radial width geometry on preserved radial paint sources for supported non-text, non-group nodes.
- Emits SVG `<radialGradient>` paint servers with `cx`, `cy`, and `r` from the preserved radial start/end vector.
- Emits `gradientTransform="translate(...) rotate(...) scale(width 1) translate(...)"` when Penpot `width` is present and not the default circular value.
- Keeps the existing deterministic `data-fallback-fill` / `data-fallback-stroke` attributes for debug and unsupported-renderer fallback behavior.
- Leaves PDF/raster/canvas radial parity out of scope for this slice.

## Verification

- RED Full Verification #28774007613 failed in Core tests before implementation because the new fixture expected Penpot radial `width` geometry to emit SVG `gradientTransform`, while Layo emitted only center and radius.
- The final PR-head Full Verification run for PR #256 is the merge gate for this slice.
- Plan routing was updated so `PLAN_STATUS.md` points the latest completed Penpot maturity-loop slice at `2026-07-06-penpot-radial-width-svg-artifact.md`.

## Follow-Up Gaps

This is still selected-layer SVG artifact work, not full Penpot radial parity. Remaining radial/non-linear gradient work includes radial stroke-specific proof, radial PDF/raster/canvas parity, non-rect/path/group/text coverage, image-gradient interactions, and exact mixed-stack overlay/blend compositing.
