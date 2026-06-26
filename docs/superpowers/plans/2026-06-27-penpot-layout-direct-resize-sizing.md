# Penpot Layout Direct Resize Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make direct resizing of auto-layout and grid children preserve the user's chosen size by switching resized fill axes back to fixed sizing, with undo/redo restoring the previous sizing rule.

**Architecture:** Keep the browser behavior in `apps/web/src/editor-state.ts` so canvas handles, Inspector geometry fields, keyboard-driven commands, and future collaboration command paths share one rule. `update_node_geometry` snapshots `layout_item`, pins any resized fill axes to fixed before relayout, and includes the previous `layout_item` in the inverse command. Mirror the saved-document rule in `apps/server/src/storage.ts` so HTTP geometry updates do not persist a size that is immediately overwritten by layout fill sizing.

**Tech Stack:** TypeScript editor state, Vitest, Playwright CLI, Penpot maturity docs.

---

## Reference

- Penpot benchmark area: flexible layout resizing semantics, especially fixed versus fill/100% sizing behavior for layout children.
- Current Layo gap: `layout_item.width_sizing = "fill"` or `height_sizing = "fill"` is reapplied during `relayoutDocument`, so a direct resize can be lost immediately after the command.

## File Structure

- Modify: `apps/web/src/editor-state.ts`
  - Extend `update_node_geometry` with optional `layoutItem` restore data for undo/redo.
  - Add helper logic to find a node's layout parent and pin resized fill axes to fixed before relayout.
- Modify: `apps/web/src/editor-state.test.ts`
  - Add RED/GREEN coverage for direct resizing a fill child and undo/redo restoring sizing semantics.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for resizing a fill child in the editor UI and seeing the Inspector switch resized axes back to fixed.
- Modify: `apps/server/src/storage.ts`
  - Pin resized fill axes before persisted server geometry updates relayout the document.
- Modify: `apps/server/src/storage.test.ts`
  - Add RED/GREEN server coverage for direct geometry updates against fill layout items.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move direct resize sizing semantics from the broad resizing gap into landed layout posture after verification.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record this plan as the current active/completed slice with verification evidence.

## Task 1: RED State Test

**Files:**
- Modify: `apps/web/src/editor-state.test.ts`

- [x] **Step 1: Add the failing test**

Add a test near the existing auto-layout fill sizing tests:

```ts
test("direct resizing a fill layout child pins resized axes to fixed and supports undo", () => {
  const document = sampleDocument();
  const frame = findNodeById(document, "frame-1") as any;
  frame.size = { width: 360, height: 240 };
  frame.layout = {
    mode: "auto",
    direction: "vertical",
    align_items: "start",
    justify_content: "start",
    gap: 12,
    padding: { top: 20, right: 24, bottom: 20, left: 24 }
  };
  const text = findNodeById(document, "text-1") as any;
  text.size = { width: 100, height: 40 };
  text.layout_item = {
    width_sizing: "fill",
    height_sizing: "fill",
    margin: { top: 0, right: 6, bottom: 0, left: 6 }
  };

  const resized = executeEditorCommand(createEditorState(document), {
    type: "update_node_geometry",
    nodeId: "text-1",
    patch: { width: 180 }
  });

  expect(findNodeById(resized.document, "text-1")?.size.width).toBe(180);
  expect(findNodeById(resized.document, "text-1")?.layout_item).toMatchObject({
    height_sizing: "fill",
    margin: { top: 0, right: 6, bottom: 0, left: 6 }
  });
  expect(findNodeById(resized.document, "text-1")?.layout_item?.width_sizing).toBeUndefined();

  const undone = undo(resized);
  expect(findNodeById(undone.document, "text-1")?.layout_item).toMatchObject({
    width_sizing: "fill",
    height_sizing: "fill"
  });

  const redone = redo(undone);
  expect(findNodeById(redone.document, "text-1")?.size.width).toBe(180);
  expect(findNodeById(redone.document, "text-1")?.layout_item?.width_sizing).toBeUndefined();
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "direct resizing a fill layout child"
```

Expected: FAIL because `relayoutDocument` still reapplies `width_sizing: "fill"` and overwrites the manually resized width.

## Task 2: Implement Direct Resize Sizing Semantics

**Files:**
- Modify: `apps/web/src/editor-state.ts`

- [x] **Step 1: Extend the command type**

Add `layoutItem?: NodeLayoutItem | null` to the `update_node_geometry` command variant.

- [x] **Step 2: Snapshot and restore `layout_item` in `update_node_geometry`**

When applying `update_node_geometry`, clone the current `layout_item` before mutation and include it in the inverse command. If the incoming command includes `layoutItem`, restore it exactly before relayout.

- [x] **Step 3: Pin resized fill axes to fixed**

For normal geometry updates, if the target node is a static child of an auto-layout or grid parent:

```ts
if (command.patch.width !== undefined && nextLayoutItem.width_sizing === "fill") {
  delete nextLayoutItem.width_sizing;
}
if (command.patch.height !== undefined && nextLayoutItem.height_sizing === "fill") {
  delete nextLayoutItem.height_sizing;
}
```

Keep existing margin, placement, min/max, and self-alignment metadata intact. If the resulting layout item is only the default zero-margin static item, remove `node.layout_item`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "direct resizing a fill layout child"
```

Expected: PASS.

## Task 3: Playwright UI Regression

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Add a focused e2e test**

Add a test that creates a project, configures the selected child as a fill layout child using existing Inspector controls, drags the bottom-right resize handle, and verifies:

- `inspector-layout-item-width-sizing` and `inspector-layout-item-height-sizing` switch from `fill` to `fixed` after a bottom-right resize.
- The width and height inputs keep the dragged size instead of snapping back to fill.
- Undo restores both sizing controls and fill-computed dimensions; redo reapplies fixed sizing.

- [x] **Step 2: Verify GREEN after implementation**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "direct resize pins fill layout child axes" --workers=1 --reporter=line
```

Expected after implementation: PASS.

## Task 4: Documentation And Guard Updates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update maturity posture**

Add direct layout-child resize sizing semantics to the landed layout posture. Keep broader baseline alignment and deeper resizing semantics as remaining gaps unless this slice fully closes them.

- [x] **Step 2: Update plan status**

Record this plan as the current active slice while implementing. After verification, mark it completed with exact commands run.

## Task 5: Full Verification, Publish, Merge, Cleanup

- [x] **Step 1: Run focused checks**

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "direct resizing a fill layout child"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "direct resize pins fill layout child axes" --workers=1 --reporter=line
```

- [x] **Step 2: Run broad checks**

```bash
pnpm --filter @layo/web typecheck
pnpm typecheck
pnpm run check:penpot-maturity
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

- [x] **Step 3: Publish**

Commit, push, open a PR, merge it, sync `main`, delete the feature branch, prune worktrees, remove generated artifacts, and verify ports `5173` and `4317` are clear.
