# Penpot Radial Raster Canvas Delta

## Reference Capability

Penpot preserves radial gradient paint geometry with start, end, width, and stops, then renders radial gradients through a radial gradient transform path. The current Penpot reference for this slice is `penpot/penpot@a4ba5fc2e046d8583edcd4946f09e4ee64280431`, `frontend/src/app/main/ui/shapes/gradients.cljs` lines 69-106 and `common/src/app/common/types/color.cljc` lines 94-105.

## Layo Delta

Layo now adapts preserved Penpot circular radial fill paint sources for the live canvas and selected-layer PNG raster artifacts:

- Supports a single normal-blend radial fill paint source on non-text, non-group rectangular nodes.
- Maps the Penpot radial start point to the Konva radial center.
- Uses the Penpot start-to-end vector length as the circular radial radius.
- Reuses the existing gradient stop normalization and opacity handling for canvas color stops.
- Keeps the existing linear fill/stroke canvas gradient path intact.

## Verification

- RED Full Verification #28777522435 failed in Playwright CLI e2e before implementation because the imported radial PNG artifact still sampled the flattened midpoint fallback color at the gradient center.
- The final PR-head Full Verification run for PR #259 is the merge gate for this slice.

## Follow-Up Gaps

This is supported circular radial fill raster/canvas work, not full Penpot radial parity. Remaining gaps include radial width/ellipse canvas parity, radial stroke-specific proof, non-rect/path/group/text radial artifacts, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, shared library relations, and exact mixed-stack overlay/blend compositing.
