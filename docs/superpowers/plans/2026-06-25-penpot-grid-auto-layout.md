# Penpot Grid Auto Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the first Penpot-like Grid Layout slice: grid mode, equal auto cells, and automatic row/column placement for static children.

**Architecture:** Extend the existing `NodeLayout` contract with `mode: "grid"` plus optional `grid_columns` and `grid_rows`. Reuse existing padding, row/column gap, layout item static/absolute positioning, and fill sizing; add a small grid solver beside the current flex solver instead of overloading flex direction semantics. This slice adopts Penpot Grid auto placement only; manual cells, areas, FR/auto/pixel units, and named grid areas remain explicit later gaps.

**Tech Stack:** TypeScript, React, Fastify storage/MCP, Vitest, Playwright CLI, Rust `serde`/`ts-rs`.

---

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Penpot Grid is based on CSS Grid and organizes items in two-dimensional rows and columns.
- Penpot Grid container properties include row/column direction, alignment, row/column gaps, and padding.
- Penpot Grid cell properties include auto positioning and static/absolute positioning.
- Decision: Adopt auto cell placement first. Defer manual placement, areas, FR units, stretch/align-self depth, and viewport row/column editing to later maturity slices.
- Maturity gate: `docs/product/penpot-maturity-benchmark.md` gate 4, layout maturity.
- Minimal-change ladder: extend the existing layout metadata and solvers; avoid introducing a separate layout engine or CSS Grid renderer dependency.

## Files

- Modify: `packages/renderer/src/index.ts` for `NodeLayout.mode: "grid"`, `grid_columns`, and `grid_rows`.
- Modify: `apps/server/src/storage.ts` to mirror the shared layout contract.
- Modify: `apps/server/src/mcp.ts` to accept grid layout command fields.
- Modify: `apps/server/src/layout.ts` to normalize grid metadata and lay out static children into equal cells.
- Modify: `apps/server/src/storage.test.ts` and `apps/server/src/code-export.test.ts` for agent-command and export coverage.
- Modify: `apps/web/src/editor-state.ts` to normalize grid metadata and lay out static children into equal cells.
- Modify: `apps/web/src/editor-state.test.ts` for RED/GREEN state coverage.
- Modify: `apps/web/src/App.tsx` to expose Korean Inspector grid controls.
- Modify: `apps/web/e2e/editor-mvp.spec.ts` for Playwright CLI visible proof.
- Modify: `crates/editor-core/src/model.rs`, `crates/editor-core/src/lib.rs`, generated bindings, and `crates/editor-core/tests/document_model.rs` for Rust serialization.
- Modify: product docs and `docs/superpowers/PLAN_STATUS.md` after verification.

### Task 1: RED Tests

- [x] Add `apps/web/src/editor-state.test.ts` coverage named `grid layout auto-places static children into equal cells`.

Expected setup:

```ts
frame.size = { width: 360, height: 240 };
frame.layout = {
  mode: "grid",
  direction: "horizontal",
  grid_columns: 2,
  grid_rows: 2,
  row_gap: 12,
  column_gap: 16,
  gap: 0,
  padding: { top: 20, right: 24, bottom: 20, left: 24 },
  align_items: "start",
  justify_content: "start"
};
```

With four static children, expected cell geometry is:

```ts
cellWidth = (360 - 24 - 24 - 16) / 2 = 148;
cellHeight = (240 - 20 - 20 - 12) / 2 = 94;
positions = [
  { x: 24, y: 20 },
  { x: 188, y: 20 },
  { x: 24, y: 126 },
  { x: 188, y: 126 }
];
```

- [x] Run `pnpm --filter @layo/web test -- src/editor-state.test.ts` and verify failure shows grid mode is ignored or normalized to none.
- [x] Add server storage dry-run coverage with the same grid layout and expected positions.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts` and verify failure shows grid mode is dropped or ignored.
- [x] Add code-export coverage proving `grid_columns` and `grid_rows` survive export.
- [x] Add Rust JSON round-trip assertions for `layout.mode = "grid"`, `grid_columns`, and `grid_rows`.
- [x] Run `cargo test -p editor-core layout_metadata_round_trips_through_json` and verify failure shows missing grid mode/fields.

### Task 2: GREEN Implementation

- [x] Add `"grid"` to TypeScript `NodeLayout.mode` contracts.
- [x] Add optional numeric `grid_columns` and `grid_rows` fields to TypeScript contracts and MCP schema.
- [x] Normalize grid columns/rows to integers >= 1; default columns to 2 and rows to enough rows for the current static child count.
- [x] Add `normalizedGridLayout` or equivalent branching so `relayoutNode` dispatches flex mode to existing flex code and grid mode to new grid code.
- [x] Implement grid auto-placement for static children only; absolute layout items remain out of flow.
- [x] Use existing `row_gap`, `column_gap`, `padding`, child margins, child fill sizing, `align_items`, and `justify_content` where they map directly to cell positioning.
- [x] Keep container fit sizing out of this first grid slice unless tests require it.
- [x] Add Rust `LayoutMode::Grid` with serde snake_case and optional `grid_columns`/`grid_rows`.

### Task 3: Inspector and Browser Proof

- [x] Add `그리드` to the layout mode selector.
- [x] Add Korean Inspector numeric inputs:
  - `data-testid="inspector-layout-grid-columns"`, label `그리드 열`
  - `data-testid="inspector-layout-grid-rows"`, label `그리드 행`
- [x] Show grid inputs only when `layout.mode === "grid"`.
- [x] Add Playwright CLI test that selects a frame, sets grid mode, columns, rows, row/column gaps, and verifies children move into two rows.
- [x] Run focused Playwright CLI:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "grid layout auto-places" --workers=1 --reporter=line
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
pnpm --filter @layo/web build
pnpm test
git diff --check
pnpm test:e2e
```

- [x] Update `docs/product/penpot-maturity-benchmark.md`, `docs/product/figma-migration-roadmap.md`, and `docs/superpowers/PLAN_STATUS.md` with the landed grid auto layout slice and remaining grid gaps.
- [x] Commit, push, create PR, merge, and run `docs/process/post-merge-cleanup.md`.
