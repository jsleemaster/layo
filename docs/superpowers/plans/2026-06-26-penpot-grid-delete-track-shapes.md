# Penpot Grid Delete Track With Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-like selected-grid row/column header menu actions that delete a track and the static grid-flow shapes placed in that track.

**Architecture:** Reuse Layo's existing grid viewport header context menu and document relayout pipeline. Add one undoable editor command that removes the selected row or column track, deletes affected static grid-flow children, relayouts remaining children, and restores the complete previous frame snapshot on undo.

**Tech Stack:** React, TypeScript, Vitest, Playwright CLI, Layo renderer document model.

---

## Penpot Reference

- Source: Penpot Flexible Layouts, Grid Layout > Edit rows and columns: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Decision: adopt the "delete row/column and shapes" interaction, adapted to Layo's current grid model.
- Adaptation: this slice applies to static grid-flow children only. Absolute-positioned children are outside grid flow and are not removed by this action. Locked affected children block the command to avoid unsafe data loss.
- Maturity gate: layout maturity in `docs/product/penpot-maturity-benchmark.md`.

## Files

- Modify: `apps/web/src/editor-state.ts`
  - Add `delete_grid_track_with_children`.
  - Extract reusable grid placement planning from `relayoutGridChildren`.
  - Restore a complete previous frame snapshot for undo.
- Modify: `apps/web/src/App.tsx`
  - Add `열과 객체 삭제` and `행과 객체 삭제` menu items to the grid track context menu.
  - Dispatch the new command directly from the menu.
- Modify: `apps/web/src/editor-state.test.ts`
  - Add a unit regression proving delete-with-shapes, relayout, and undo.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for the visible header menu flow.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move delete-with-shapes out of the highest-risk grid gap list once verified.
- Modify: `docs/product/figma-migration-roadmap.md`
  - Record the new viewport grid context-menu behavior and remaining grid gaps.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Add this plan to completed plans after verification.

## Tasks

### Task 1: RED Unit And Playwright Coverage

- [x] **Step 1: Write the failing unit test**

Add `deletes a grid track with placed children in one undoable command` to `apps/web/src/editor-state.test.ts`.

- [x] **Step 2: Run the unit test and verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "deletes a grid track with placed children in one undoable command"
```

Expected RED: fails because `delete_grid_track_with_children` is not handled by `applyCommand`.

- [x] **Step 3: Write the failing Playwright test**

Add `canvas grid header context menu deletes tracks with shapes` to `apps/web/e2e/editor-mvp.spec.ts`.

- [x] **Step 4: Run the Playwright test and verify RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid header context menu deletes tracks with shapes" --workers=1 --reporter=line
```

Expected RED: fails because the grid track context menu has no `열과 객체 삭제` menu item.

### Task 2: Implement Document Semantics

- [x] **Step 1: Add the command type**

Add this variant to `EditorCommand`:

```ts
| {
    type: "delete_grid_track_with_children";
    nodeId: string;
    axis: "column" | "row";
    index: number;
    previousNode?: RendererNode;
  }
```

- [x] **Step 2: Extract grid placement planning**

Extract the placement map currently built inside `relayoutGridChildren` into a helper that returns `columns`, `rows`, and `placements`.

- [x] **Step 3: Implement the command**

In `applyCommand`, handle `delete_grid_track_with_children` by validating the frame/component, finding affected static grid-flow children, refusing to delete locked affected children, removing the selected track and affected children, relayouting the document, and returning an inverse command with the previous node snapshot.

- [x] **Step 4: Verify the unit test GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "deletes a grid track with placed children in one undoable command"
```

Expected GREEN: the track is removed, affected children are gone, remaining children relayout, and undo restores the prior frame.

### Task 3: Implement Visible Menu Actions

- [x] **Step 1: Extend menu action type**

Add `delete-with-children` to `GridTrackContextMenuAction`.

- [x] **Step 2: Dispatch the command**

In `applyGridTrackContextAction`, dispatch `delete_grid_track_with_children` directly when the menu action is `delete-with-children`.

- [x] **Step 3: Add Korean menu items**

Add `열과 객체 삭제` and `행과 객체 삭제` directly after the existing `열 삭제` and `행 삭제` menu items.

- [x] **Step 4: Verify focused Playwright GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid header context menu deletes tracks with shapes" --workers=1 --reporter=line
```

Expected GREEN: the context menu appears, the delete-with-shapes actions remove expected tracks and layers, and the Inspector reflects updated track values.

### Task 4: Documentation And Full Verification

- [x] **Step 1: Update maturity docs**

Update `docs/product/penpot-maturity-benchmark.md`, `docs/product/figma-migration-roadmap.md`, and `docs/superpowers/PLAN_STATUS.md`.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "deletes a grid track with placed children in one undoable command"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid header context menu deletes tracks with shapes" --workers=1 --reporter=line
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid header context menu deletes tracks with shapes" --workers=1 --reporter=line
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

- Viewport row/column reorder controls.
- Viewport area/span editing.
- Deeper grid resizing semantics and baseline alignment.
