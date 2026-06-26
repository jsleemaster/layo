# Penpot Grid Reorder Tracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-like selected-grid viewport row/column header dragging so users can reorder grid tracks and keep static grid-flow objects attached to their tracks.

**Architecture:** Reuse the existing selected-grid viewport header controls as draggable drop targets. Add one undoable editor command that reorders the selected row or column track, remaps static grid-flow child placement onto the moved track order, relayouts the frame, and restores the complete previous frame snapshot on undo.

**Tech Stack:** React, TypeScript, Vitest, Playwright CLI, Layo renderer document model.

---

## Penpot Reference

- Source: Penpot Flexible Layouts, Grid Layout > Design viewport > Drag columns and rows: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Decision: adopt viewport drag-reorder for row and column headers.
- Adaptation: this slice moves static grid-flow children with the reordered track by materializing their new grid row/column placement. Absolute children stay outside grid flow. Span/area-specific reorder semantics and the Penpot Ctrl variation that leaves elements in place remain later layout maturity work.
- Maturity gate: layout maturity in `docs/product/penpot-maturity-benchmark.md`.

## Files

- Modify: `apps/web/src/editor-state.ts`
  - Add `reorder_grid_track_with_children`.
  - Reuse the grid placement plan from layout and delete-with-shapes work.
  - Restore the prior frame snapshot for undo.
- Modify: `apps/web/src/App.tsx`
  - Make grid header controls draggable.
  - Dispatch `reorder_grid_track_with_children` when a header is dropped on another header of the same axis.
- Modify: `apps/web/src/editor-state.test.ts`
  - Add unit regressions for column reorder, row reorder, undo, and locked-child blocking.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for dragging column and row headers in the viewport.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move basic viewport row/column reorder controls into current layout posture after verification.
- Modify: `docs/product/figma-migration-roadmap.md`
  - Record selected-grid header drag reorder and keep area/span/deeper semantics as remaining gaps.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Add this plan to completed plans after verification.

## Tasks

### Task 1: RED Unit And Playwright Coverage

- [x] **Step 1: Write the failing unit tests**

Add unit tests to `apps/web/src/editor-state.test.ts`:

- `reorders a grid column with static children in one undoable command`
- `reorders a grid row with static children in one undoable command`
- `does not reorder a grid track when a moving child is locked`

- [x] **Step 2: Verify unit RED**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "reorders a grid"
```

Expected RED: fails because `reorder_grid_track_with_children` is not handled.

- [x] **Step 3: Write the failing Playwright test**

Add `canvas grid headers drag reorder rows and columns with shapes` to `apps/web/e2e/editor-mvp.spec.ts`.

- [x] **Step 4: Verify Playwright RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid headers drag reorder rows and columns with shapes" --workers=1 --reporter=line
```

Expected RED: fails because grid headers are not draggable and dropping a header does not reorder tracks.

### Task 2: Implement Document Semantics

- [x] **Step 1: Add the command type**

Add this variant to `EditorCommand`:

```ts
| {
    type: "reorder_grid_track_with_children";
    nodeId: string;
    axis: "column" | "row";
    fromIndex: number;
    toIndex: number;
    previousNode?: RendererNode;
  }
```

- [x] **Step 2: Implement track index movement helpers**

Add helpers for moving an array item, mapping old track indices to new indices, checking whether a child placement moves, and converting static children to explicit grid placement after the reorder.

- [x] **Step 3: Implement the command**

In `applyCommand`, handle `reorder_grid_track_with_children` by validating the selected frame/component, refusing no-op or locked moving children, moving the selected track, materializing child placements for static grid-flow children, relayouting the document, and returning an inverse command with `previousNode`.

- [x] **Step 4: Verify unit GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "reorders a grid"
```

Expected GREEN: column reorder, row reorder, undo, and locked-child blocking pass.

### Task 3: Implement Viewport Header Drag

- [x] **Step 1: Add drag state**

Add `GridTrackDragState` and React state for the currently dragged grid header.

- [x] **Step 2: Wire header drag events**

Wire header `mousedown` plus document-level `mouseup` detection to dispatch the reorder command only for same-node, same-axis drops.

- [x] **Step 3: Verify focused Playwright GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid headers drag reorder rows and columns with shapes" --workers=1 --reporter=line
```

Expected GREEN: dragging a column header reorders column track values and attached layer positions; dragging a row header reorders row track values and attached layer positions.

### Task 4: Documentation And Full Verification

- [x] **Step 1: Update docs**

Update `docs/product/penpot-maturity-benchmark.md`, `docs/product/figma-migration-roadmap.md`, and `docs/superpowers/PLAN_STATUS.md`.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "reorders a grid"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid headers drag reorder rows and columns with shapes" --workers=1 --reporter=line
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid headers drag reorder rows and columns with shapes" --workers=1 --reporter=line
pnpm --filter @layo/web typecheck
pnpm typecheck
pnpm run check:penpot-maturity
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

Expected GREEN: all commands exit 0. Any failure becomes the next loop goal.

## Remaining Gaps After This Slice

- Area/span-aware viewport grid reorder semantics.
- Penpot Ctrl variation that leaves elements in place while reordering tracks.
- Viewport area/span editing.
- Baseline alignment and deeper grid resizing semantics.
