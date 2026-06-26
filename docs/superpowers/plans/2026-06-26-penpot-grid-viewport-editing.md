# Penpot Grid Viewport Editing

**Goal:** Move Layo's grid layout controls closer to Penpot by letting users
edit grid track sizes directly on the canvas, not only through Inspector text
fields.

**Penpot reference:** Penpot Flexible Layouts, Grid Layout section:
https://help.penpot.app/user-guide/designing/flexible-layouts/

**Maturity gate:** Layout maturity in
`docs/product/penpot-maturity-benchmark.md`.

## Gap

Layo already supports grid auto placement, manual cell placement, spans, named
areas, track units, gaps, padding, sizing, and reverse auto placement. Penpot's
grid workflow also exposes direct viewport controls for grid tracks. Without
canvas grid handles, users must leave the design surface and type track values
into the Inspector, which is slower and weaker than Penpot's layout editing
model.

## Implementation

- Show a grid overlay when exactly one selected frame or component uses
  `layout.mode = "grid"`.
- Draw non-interactive grid lines plus interactive resize handles for internal
  column and row boundaries.
- Convert handle pointer movement from viewport space into document-space track
  sizes.
- Update the selected node layout through the existing `set_node_layout`
  command path so undo/redo, relayout, persistence, and collaboration behavior
  remain consistent.
- Preserve existing Inspector string controls; a handle drag materializes the
  edited track as a `px` track and leaves untouched tracks unchanged.

## RED Evidence

- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid column handles resize tracks directly in the viewport" --workers=1 --reporter=line`
  is expected to fail because no `grid-column-resize-handle-1` exists in the
  current canvas.

## Verification

- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid column handles resize tracks directly in the viewport" --workers=1 --reporter=line`
- `pnpm --filter @layo/web typecheck`
- `pnpm --filter @layo/web test -- src/editor-state.test.ts --runInBand`
- `pnpm --filter @layo/web build`
- `pnpm test`
- `pnpm test:e2e` with `pnpm dev` running
- `git diff --check`

## Remaining Risks

- Adding/removing grid rows and columns directly in the viewport is still a
  later slice.
- Area naming and span editing remain Inspector-first after this slice.
