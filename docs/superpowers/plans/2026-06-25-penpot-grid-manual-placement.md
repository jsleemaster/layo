# Penpot Grid Manual Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the next Penpot-like Grid slice: manual child cell placement through grid row/column layout-item metadata.

**Architecture:** Extend the existing `NodeLayoutItem` contract with optional 1-based `grid_column` and `grid_row` fields, matching CSS Grid's `grid-column` and `grid-row` mental model. Reuse the existing grid solver, padding, row/column gaps, margins, fill sizing, static/absolute positioning, MCP command, code export, Rust serialization, and Inspector layout-item section instead of introducing a separate grid editor engine.

**Tech Stack:** TypeScript, React, Fastify storage/MCP, Vitest, Playwright CLI, Rust `serde`/`ts-rs`.

---

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Penpot Grid cell properties include Auto, Manual, and Area.
- Manual Grid elements are positioned in specific cells or areas and map to CSS `grid-column` and `grid-row`.
- Layo adopts Manual cell placement for one-cell spans in this slice.
- Layo defers multi-cell spans, named areas, FR/auto/pixel track units, viewport grid editing, and area merge/rename UI to later maturity slices.
- Maturity gate: `docs/product/penpot-maturity-benchmark.md` gate 4, layout maturity.
- Minimal-change ladder: extend `NodeLayoutItem` and the existing grid solver. Do not add a parallel CSS Grid renderer or separate grid-document structure yet.

## Files

- Modify: `packages/renderer/src/index.ts` for optional `NodeLayoutItem.grid_column` and `grid_row`.
- Modify: `apps/server/src/storage.ts` to mirror the shared layout-item contract.
- Modify: `apps/server/src/mcp.ts` to accept manual grid placement fields through `set_layout_item`.
- Modify: `apps/server/src/layout.ts` to normalize layout-item grid placement and reserve occupied manual cells before auto placement.
- Modify: `apps/server/src/storage.test.ts` and `apps/server/src/code-export.test.ts` for agent-command and export coverage.
- Modify: `apps/web/src/editor-state.ts` to normalize and solve manual grid placement in the browser model.
- Modify: `apps/web/src/editor-state.test.ts` for RED/GREEN state coverage.
- Modify: `apps/web/src/App.tsx` to show Korean grid placement controls for children whose parent is a grid layout.
- Modify: `apps/web/e2e/editor-mvp.spec.ts` for Playwright CLI visible proof.
- Modify: `crates/editor-core/src/model.rs`, generated bindings, and `crates/editor-core/tests/document_model.rs` for Rust serialization.
- Modify: product docs and `docs/superpowers/PLAN_STATUS.md` after verification.

### Task 1: RED Tests

- [x] Add `apps/web/src/editor-state.test.ts` coverage named `grid layout respects manual child row and column placement`.

Expected setup:

```ts
frame.size = { width: 390, height: 220 };
frame.layout = {
  mode: "grid",
  direction: "horizontal",
  grid_columns: 3,
  grid_rows: 2,
  row_gap: 10,
  column_gap: 12,
  gap: 0,
  padding: { top: 20, right: 15, bottom: 20, left: 15 },
  align_items: "start",
  justify_content: "start"
};
text.layout_item = {
  grid_column: 3,
  grid_row: 2,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
};
```

Expected cell geometry:

```ts
cellWidth = (390 - 15 - 15 - 12 - 12) / 3 = 112;
cellHeight = (220 - 20 - 20 - 10) / 2 = 85;
manualText = { x: 263, y: 115 };
autoChildren = [
  { x: 15, y: 20 },
  { x: 139, y: 20 },
  { x: 263, y: 20 }
];
```

- [x] Run `pnpm --filter @layo/web test -- src/editor-state.test.ts` and verify failure shows manual grid fields are ignored or dropped.
- [x] Add server storage dry-run coverage with the same manual grid layout and expected positions.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts` and verify failure shows manual grid fields are ignored or dropped.
- [x] Add code-export coverage proving `grid_column` and `grid_row` survive structured export.
- [x] Add Rust JSON round-trip assertions for `layout_item.grid_column = 3` and `layout_item.grid_row = 2`.
- [x] Run `cargo test -p editor-core layout_metadata_round_trips_through_json` and verify failure shows missing manual grid fields.

### Task 2: GREEN Implementation

- [x] Add optional numeric `grid_column` and `grid_row` fields to TypeScript `NodeLayoutItem` contracts.
- [x] Add optional numeric `grid_column` and `grid_row` fields to the MCP `nodeLayoutItemSchema`.
- [x] Normalize manual grid placement to positive 1-based integers.
- [x] Preserve manual grid placement only on static layout items; absolute items stay out of flow.
- [x] Add Rust `NodeLayoutItem.grid_column` and `grid_row` with optional `u32` serialization and generated binding updates.
- [x] Update web and server grid solvers so manual cells are placed first and auto children use the next unoccupied cell in source order.
- [x] Clamp manual column/row to the configured grid dimensions.
- [x] Keep the first slice to one-cell manual placement. Do not implement spans or named areas in this PR.

### Task 3: Inspector and Browser Proof

- [x] Add a selected-node parent lookup in `apps/web/src/App.tsx`.
- [x] Pass `selectedParentNode` into `Inspector`.
- [x] Show manual grid placement inputs only when the selected node's parent has `layout.mode === "grid"`.
- [x] Add Korean Inspector numeric inputs:
  - `data-testid="inspector-layout-item-grid-column"`, label `그리드 열 위치`
  - `data-testid="inspector-layout-item-grid-row"`, label `그리드 행 위치`
- [x] Add Playwright CLI test that sets a frame to Grid, selects a child, sets manual grid column/row, and verifies Inspector geometry moves the child to the requested cell.
- [x] Run focused Playwright CLI:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "manual grid cell placement" --workers=1 --reporter=line
```

### Task 4: Verification, Docs, PR

- [x] Run focused tests:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts
cargo test -p editor-core layout_metadata_round_trips_through_json
cargo test -p editor-core
```

- [x] Run broader checks:

```bash
pnpm typecheck
pnpm run check:penpot-maturity
