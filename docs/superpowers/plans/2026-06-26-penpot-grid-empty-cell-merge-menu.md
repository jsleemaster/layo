# Penpot Grid Empty Cell Merge Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Penpot-like empty grid cell context menu so a selected grid frame can create a named grid area directly from the canvas.

**Architecture:** Extend the existing viewport grid overlay instead of adding a separate canvas layer. The selected grid frame already renders grid lines, headers, add/remove controls, and track context menus; this slice adds per-cell hit zones plus a focused context menu action that writes `layout.grid_areas` through the existing `set_node_layout` command path.

**Tech Stack:** React, TypeScript, Vite, Playwright CLI, existing Layo editor state commands.

---

## Penpot Reference

Source: https://help.penpot.app/user-guide/designing/flexible-layouts/

Penpot exposes grid-area editing from the design viewport. This slice adopts the core direct-manipulation behavior in Layo: selected grid frames expose empty-cell hit zones, and the context menu can create a named area from the selected cell. Multi-cell area selection and richer merge/split variants remain follow-up work.

## File Map

- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add RED/GREEN Playwright CLI coverage for the empty-cell merge menu.
- Modify: `apps/web/src/App.tsx`
  - Extend `GridViewportOverlay` with cell controls.
  - Add grid cell context menu state.
  - Add `applyGridCellMergeAction()` to append a deterministic `grid_areas` entry.
  - Render per-cell hit zones and the menu.
- Modify: `apps/web/src/styles.css`
  - Style invisible cell hit zones and reuse object menu styling.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move empty-cell single-cell merge menu from missing to landed posture.
- Modify: `docs/product/figma-migration-roadmap.md`
  - Update baseline and remaining non-goals.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record this completed slice after verification.

## Acceptance Criteria

- [x] A selected grid frame renders `grid-cell-hit-zone-<column>-<row>` elements.
- [x] Right-clicking a cell opens `grid-cell-context-menu`.
- [x] The menu includes `셀 병합 영역 만들기`.
- [x] Clicking the action appends a deterministic named area like `area1:2/1/1/1` to the frame `grid_areas`.
- [x] The command uses `set_node_layout`, preserving existing undo/redo, persistence, and collaboration semantics.
- [x] Playwright CLI verifies the real browser interaction.

## Tasks

### Task 1: RED Playwright Coverage

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Add failing test**

Add a Playwright test near the grid viewport tests:

```ts
test("canvas grid empty cell context menu creates a named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("8");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("area1:2/1/1/1");
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid empty cell context menu creates a named area" --workers=1 --reporter=line
```

Expected: FAIL because `grid-cell-hit-zone-2-1` does not exist.

### Task 2: Overlay Cell Hit Zones

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Add grid cell overlay types and rendering**

Extend the existing grid viewport overlay with per-cell controls:

```ts
interface GridViewportCellControl {
  id: string;
  testId: string;
  column: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  title: string;
}
```

Only selected grid frames should render these controls; selected grid children should keep area boundary handles without frame-level cell controls.

- [x] **Step 2: Keep the Task 1 RED failure as the missing-feature proof**

The Task 1 focused Playwright run already failed on the missing cell hit zone before production code changed. The implementation then moved directly through the overlay and menu/action together, with Task 3 verifying the same user flow GREEN.

### Task 3: Cell Context Menu And Merge Action

**Files:**
- Modify: `apps/web/src/App.tsx`

- [x] **Step 1: Add context menu state**

Add `GridCellContextMenuState` with frame node id, zero-based column, zero-based row, and menu position.

- [x] **Step 2: Implement merge action**

When `merge` is clicked:

1. Find the selected grid frame.
2. Normalize its grid layout and current grid area list.
3. Generate the first unused area name: `area1`, `area2`, ...
4. Append `{ name, column: column + 1, row: row + 1, column_span: 1, row_span: 1 }`.
5. Dispatch `set_node_layout`.
6. Close the menu.

- [x] **Step 3: Verify GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid empty cell context menu creates a named area" --workers=1 --reporter=line
```

Expected: PASS.

### Task 4: Documentation And Regression Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update product docs**

Record that a first empty-cell merge menu exists, while multi-cell selection, split/unmerge, baseline alignment, and deeper resizing semantics remain gaps.

- [x] **Step 2: Run focused and full verification**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid empty cell context menu creates a named area" --workers=1 --reporter=line
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid empty cell context menu creates a named area" --workers=1 --reporter=line
pnpm --filter @layo/web typecheck
pnpm typecheck
pnpm run check:penpot-maturity
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass with no unreviewed output.

### Task 5: Publish And Cleanup

**Files:**
- Commit all modified files.

- [ ] **Step 1: Commit, push, PR**

Use a branch like `codex/penpot-grid-empty-cell-merge-menu`.

- [ ] **Step 2: Merge**

Create and merge the PR after verification.

- [ ] **Step 3: Cleanup**

Sync `main`, prune remote refs/worktrees, remove safe generated artifacts, stop dev servers, and verify ports `5173` and `4317` are clear.
