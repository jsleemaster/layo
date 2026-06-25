# Penpot Row Column Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-like separate row and column gap controls to Layo Flex layouts while preserving legacy single `gap` behavior.

**Architecture:** Keep `gap` as the compatibility fallback and add optional `row_gap` / `column_gap` fields to the shared layout contract. Layout solvers derive main-axis and cross-axis gaps from direction: horizontal uses `column_gap` between items and `row_gap` between wrapped lines; vertical uses `row_gap` between items and `column_gap` between wrapped columns. MCP/HTTP, Rust serialization, code export, Inspector controls, and tests all use the same fields.

**Tech Stack:** TypeScript, React, Fastify storage/MCP, Vitest, Playwright CLI, Rust `serde`/`ts-rs`.

---

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Flex Layout properties include `Gap: Row, column`.
- Decision: Adopt the capability, but adapt it by keeping existing `gap` as the fallback for older Layo files and commands.
- Maturity gate: `docs/product/penpot-maturity-benchmark.md` gate 4, layout maturity.
- Minimal-change ladder: extend the existing layout model, solver, MCP schema, and Inspector pattern instead of introducing a new layout system.

## Files

- Modify: `packages/renderer/src/index.ts` to expose optional `row_gap` and `column_gap`.
- Modify: `apps/server/src/storage.ts` to mirror the shared layout contract.
- Modify: `apps/server/src/mcp.ts` to accept optional `row_gap` and `column_gap` in `nodeLayoutSchema`.
- Modify: `apps/server/src/layout.ts` to normalize gap fields and compute axis-specific gaps.
- Modify: `apps/server/src/storage.test.ts` and `apps/server/src/code-export.test.ts` for server and export coverage.
- Modify: `apps/web/src/editor-state.ts` to normalize and solve axis-specific gaps.
- Modify: `apps/web/src/editor-state.test.ts` for state-level RED/GREEN coverage.
- Modify: `apps/web/src/App.tsx` to add Korean Inspector inputs for row/column gap.
- Modify: `apps/web/e2e/editor-mvp.spec.ts` for Playwright CLI visible interaction proof.
- Modify: `crates/editor-core/src/model.rs`, `crates/editor-core/src/lib.rs`, and generated bindings for Rust serialization.
- Modify: `crates/editor-core/tests/document_model.rs` for Rust round-trip coverage.
- Modify: product docs and plan status after verification.

### Task 1: RED Tests

- [x] Add `apps/web/src/editor-state.test.ts` coverage named `auto layout uses separate row and column gaps for wrapped rows`.

```ts
layout: {
  mode: "auto",
  direction: "horizontal",
  wrap: "wrap",
  align_items: "start",
  justify_content: "start",
  align_content: "start",
  gap: 12,
  row_gap: 24,
  column_gap: 6,
  padding: { top: 20, right: 20, bottom: 20, left: 20 }
}
```

Expected child positions with two 70x40 children on the first row and one on the second row inside a 200px frame:

```ts
first: { x: 20, y: 20 }
second: { x: 96, y: 20 }
third: { x: 20, y: 84 }
```

- [x] Run `pnpm --filter @layo/web test -- src/editor-state.test.ts` and verify failure shows legacy `gap` still used for both axes.
- [x] Add server storage dry-run coverage with the same geometry and expected normalized layout fields.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts` and verify failure shows `row_gap` / `column_gap` are dropped or ignored.
- [x] Add Rust JSON round-trip assertions for `row_gap` and `column_gap`.
- [x] Run `cargo test -p editor-core layout_metadata_round_trips_through_json` and verify failure shows missing fields.

### Task 2: GREEN Implementation

- [x] Add optional fields to TypeScript `NodeLayout` contracts:

```ts
row_gap?: number;
column_gap?: number;
```

- [x] Add optional fields to MCP schema:

```ts
row_gap: z.number().optional(),
column_gap: z.number().optional(),
```

- [x] Normalize gap fields in web/server layout modules:

```ts
const gap = Math.max(0, finiteNumber(layout.gap, 0));
const rowGap = Math.max(0, finiteNumber(layout.row_gap, gap));
const columnGap = Math.max(0, finiteNumber(layout.column_gap, gap));
```

- [x] Use axis helpers in solvers:

```ts
const mainGap = isVertical ? layout.row_gap ?? layout.gap : layout.column_gap ?? layout.gap;
const crossGap = isVertical ? layout.column_gap ?? layout.gap : layout.row_gap ?? layout.gap;
```

- [x] Preserve legacy files by omitting normalized `row_gap` and `column_gap` when they match `gap`.
- [x] Add Rust fields with serde defaults so older JSON still loads:

```rust
#[serde(default)]
pub row_gap: Option<f64>,
#[serde(default)]
pub column_gap: Option<f64>,
```

### Task 3: Inspector and Browser Proof

- [x] Add two numeric Inspector inputs near the current gap input:
  - `data-testid="inspector-layout-row-gap"`, Korean label `행 간격`
  - `data-testid="inspector-layout-column-gap"`, Korean label `열 간격`
- [x] Keep the existing `inspector-layout-gap` as compatibility/default gap.
- [x] Add Playwright CLI test that sets horizontal wrap, row gap 24, column gap 6, and verifies selected child positions.
- [x] Run focused Playwright CLI:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "row and column gaps" --workers=1 --reporter=line
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
cargo test --workspace
git diff --check
pnpm test:e2e
```

- [x] Update `docs/product/penpot-maturity-benchmark.md`, `docs/product/figma-migration-roadmap.md`, and `docs/superpowers/PLAN_STATUS.md` with the landed row/column gap slice and remaining layout gaps.
- [x] Commit, push, create PR, merge, and run `docs/process/post-merge-cleanup.md`.


## Verification Results

- RED web: `pnpm --filter @layo/web test -- src/editor-state.test.ts` failed with `gap-rectangle-1` at `x: 102` instead of `x: 96`, proving legacy `gap` was still used for column spacing.
- RED server: `pnpm --filter @layo/server test -- src/storage.test.ts` failed because normalized layout dropped `row_gap` / `column_gap`.
- RED Rust: `cargo test -p editor-core layout_metadata_round_trips_through_json` failed because `NodeLayout` had no `row_gap` or `column_gap` fields.
- GREEN focused: `pnpm --filter @layo/web test -- src/editor-state.test.ts` passed.
- GREEN focused: `pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts` passed.
- GREEN focused: `cargo test -p editor-core layout_metadata_round_trips_through_json` passed.
- GREEN focused: `cargo test -p editor-core` passed and regenerated `crates/editor-core/bindings/NodeLayout.ts`.
- Browser proof: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "row and column gaps" --workers=1 --reporter=line` passed.
- Browser proof with API log: `DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "row and column gaps" --workers=1 --reporter=line` passed after sandbox EPERM was rerun with approved external execution.

- Full check: `pnpm typecheck` passed.
- Full check: `pnpm run check:penpot-maturity` passed.
- Full check: `pnpm --filter @layo/web build` passed.
- Full check: `pnpm test` passed, including workspace package tests and `cargo test --workspace`.
- Full check: `cargo test --workspace` passed again as a standalone verification.
- Full check: `git diff --check` passed after docs and generated binding updates.
- Full e2e: `pnpm test:e2e` passed 52 tests.

- Compatibility fix: Rust `row_gap` / `column_gap` use `Option<f64>` with `skip_serializing_if = "Option::is_none"`, so legacy files load without producing `null` gap fields on serialization.
- Regression check: `cargo test -p editor-core` passed after the Rust serialization compatibility fix.
- Final full check: `pnpm test` passed again after the Rust serialization compatibility fix.
