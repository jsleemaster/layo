# Penpot Grid Area Boundary Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-like direct viewport boundary dragging for selected grid item spans and named grid areas.

**Architecture:** Extend the existing selected-grid overlay with per-selected-child area boundary handles. Explicit manual grid items update through `set_node_layout_item`; named-area children keep `layout_item.grid_area` and update the parent grid `layout.grid_areas` through `set_node_layout`. Dragging snaps to resolved grid track lines and clamps placement within the current grid.

**Tech Stack:** React, TypeScript, Vitest, Playwright CLI, Layo renderer document model.

---

## Penpot Reference

- Source: Penpot Flexible Layouts, Grid Layout > Areas: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Reference behavior: Penpot areas are compositions of grid cells; users can select a cell, hover near a cell limit until the cursor changes, then drag in the same direction to merge the selected area with other cells.
- Adaptation: Layo does not yet expose independent empty cell selection, so this slice exposes the same boundary-drag behavior for the selected grid item or named area represented by the selected child.
- Maturity gate: layout maturity in `docs/product/penpot-maturity-benchmark.md`.

## Files

- Modify: `apps/web/src/App.tsx`
  - Add `GridAreaBoundaryHandle` overlay data for a selected static child inside a selected or parent grid.
  - Add boundary handles for right/bottom and left/top edges of explicit manual grid placement and named grid areas.
  - Add `layoutItemForGridAreaBoundaryAtPoint` and `layoutForNamedGridAreaBoundaryAtPoint` helpers.
  - Dispatch `set_node_layout_item` for explicit child placement edits and `set_node_layout` for named area edits.
- Modify: `apps/web/src/styles.css`
  - Style area boundary handles with row/column resize cursors and stable hit areas.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for dragging the selected explicit child right boundary to expand a column span.
  - Add Playwright CLI coverage for dragging the selected named-area child bottom boundary to expand the named area row span while preserving the child's `grid_area` binding.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move direct viewport area/span boundary editing into the landed layout posture.
- Modify: `docs/product/figma-migration-roadmap.md`
  - Record direct selected area/span boundary editing and keep empty-cell merge menus as a later gap.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Add this plan after verification.

## Tasks

### Task 1: RED Playwright Coverage

- [x] **Step 1: Write explicit child failing e2e**

Add `canvas grid area boundary handle expands an explicit child span` to `apps/web/e2e/editor-mvp.spec.ts`.

Scenario:
- Create an empty project.
- Select `랜딩 프레임`.
- Set grid mode, `120px 80px 1fr` columns, `90px 90px` rows, `10` column gap, `8` row gap, and `20` padding.
- Select `헤드라인`.
- Set grid column `1`, grid row `1`, column span `1`, row span `1`, and width sizing `fill`.
- Drag `data-testid="grid-area-boundary-handle-right"` from the selected child edge to the second column edge.
- Assert Inspector `grid_column_span` becomes `2`, x remains `20`, and width becomes `210`.

- [x] **Step 2: Verify explicit child RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid area boundary handle expands an explicit child span" --workers=1 --reporter=line
```

Expected RED: `grid-area-boundary-handle-right` does not exist.

- [x] **Step 3: Write named-area failing e2e**

Add `canvas grid area boundary handle expands a named grid area` to `apps/web/e2e/editor-mvp.spec.ts`.

Scenario:
- Create an empty project.
- Select `랜딩 프레임`.
- Set grid mode, 2 columns, 2 rows, `120px 120px` columns, `80px 80px` rows, 0 gaps, 20 padding, and `grid_areas` to `hero:1/1/1/1`.
- Select `헤드라인`.
- Set `grid_area` to `hero`, width sizing `fill`, and height sizing `fill`.
- Drag `data-testid="grid-area-boundary-handle-bottom"` to the second row bottom.
- Assert parent `grid_areas` input becomes `hero:1/1/1/2`, selected child still has `grid_area` value `hero`, and height becomes `160`.

- [x] **Step 4: Verify named-area RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid area boundary handle expands a named grid area" --workers=1 --reporter=line
```

Expected RED: `grid-area-boundary-handle-bottom` does not exist.

### Task 2: Implement Boundary Overlay And Drag

- [x] **Step 1: Add overlay model**

Add interfaces and session state for `GridAreaBoundaryHandle` with `edge: "left" | "right" | "top" | "bottom"`, `axis`, `cursor`, frame id, child id, and viewport rect.

- [x] **Step 2: Calculate selected grid area handles**

Use the selected node's parent grid layout. Resolve explicit `grid_column/grid_row/grid_column_span/grid_row_span`, or resolve `layout_item.grid_area` through parent `layout.grid_areas`. Convert the occupied area boundary to viewport coordinates and expose four hit handles.

- [x] **Step 3: Commit drag on mouseup**

On boundary handle drag end, convert the client point to document coordinates, snap to the nearest valid grid line on the dragged axis, and clamp start/end so the resulting span is at least one track.

- [x] **Step 4: Update explicit placement**

For explicit child placement, dispatch:

```ts
dispatch({
  type: "set_node_layout_item",
  nodeId: childId,
  layoutItem: nextLayoutItem
});
```

- [x] **Step 5: Update named area placement**

For named-area children, dispatch:

```ts
dispatch({
  type: "set_node_layout",
  nodeId: parentGridId,
  layout: {
    ...layout,
    grid_areas: nextAreas
  }
});
```

The child must keep `layout_item.grid_area`.

### Task 3: GREEN Verification

- [x] **Step 1: Run focused e2e GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid area boundary handle expands" --workers=1 --reporter=line
```

Expected GREEN: both area boundary tests pass.

- [x] **Step 2: Capture Playwright API-log proof**

Run:

```bash
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid area boundary handle expands" --workers=1 --reporter=line
```

Expected GREEN: API log shows the boundary handle drag and Inspector assertions.

### Task 4: Documentation And Full Verification

- [x] **Step 1: Update maturity docs**

Update `docs/product/penpot-maturity-benchmark.md`, `docs/product/figma-migration-roadmap.md`, and `docs/superpowers/PLAN_STATUS.md` with this landed slice and remaining gaps.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid area boundary handle expands" --workers=1 --reporter=line
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas grid area boundary handle expands" --workers=1 --reporter=line
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

- Empty-cell multi-select merge and contextual "Merge cells" menu.
- Baseline alignment and deeper resizing semantics.
