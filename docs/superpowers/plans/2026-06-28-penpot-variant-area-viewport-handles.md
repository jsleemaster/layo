# Penpot Variant Area Viewport Handles

## Goal

Close the visual-only variant-area gap by letting designers edit component
variant spacing directly on the canvas, while preserving Layo's saved
`ComponentDefinition.variant_area` model and agent-editable command path.

## Reference

- Penpot components and variants: https://help.penpot.app/user-guide/design-systems/components/#variants

## Decision

Adopt the Penpot-style expectation that related component variants are managed
as a visible design-system area. Adapt it to Layo by keeping the saved
variant-area metadata as the source of truth and making the viewport handle call
the same persistence path as the right Inspector.

## Failure

The previous slice showed a selected-main-component variant-area outline, but
the outline was read-only. Editing the area still required typing gap values in
the Inspector, so the canvas did not support direct manipulation for variant
area spacing.

## Implementation

- Added horizontal and vertical gap handles inside the selected main
  component's variant-area outline.
- Dragging a gap handle adjusts `ComponentDefinition.variant_area.gap` through
  the existing `set_component_variant_area` reducer and server persistence
  route.
- Reused the existing variant-area reflow behavior, so changing the gap through
  the handle moves the matching source nodes and live canvas nodes.
- Kept the change limited to web viewport interaction because the saved model,
  reducer, storage, HTTP, and agent command semantics already existed.

## Verification

- RED: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts -g "combines selected components as variants" --workers=1 --reporter=line` failed because `component-variant-area-gap-handle-horizontal` did not exist.
- GREEN: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts -g "combines selected components as variants" --workers=1 --reporter=line`
- GREEN: `pnpm --filter @layo/web typecheck`
- GREEN: `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "reflows variant source nodes|horizontal variant area layout"`

## Remaining Gap

Viewport gap handles now cover direct spacing edits for horizontal and vertical
variant areas. Direct viewport reordering of variant sources, broader
effect/style override fidelity, and hosted theme/library registry sync remain
open design-system maturity gaps.
