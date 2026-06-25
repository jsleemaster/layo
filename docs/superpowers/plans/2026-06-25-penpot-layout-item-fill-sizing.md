# Penpot Layout Item Fill Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-like child fill sizing for auto-layout items inside fixed-size layout containers.

**Architecture:** Extend the existing `NodeLayoutItem` contract with optional `width_sizing` and `height_sizing` fields. Reuse the current web/server flex solvers and child metrics rather than introducing a second layout engine. Fixed remains the default; `fill` only consumes available parent space when the relevant parent axis is fixed, avoiding circular sizing when the container axis is already `fit`.

**Tech Stack:** TypeScript, React, Fastify storage/MCP, Vitest, Playwright CLI, Rust `serde`/`ts-rs`.

---

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Flex reference: Penpot says Flex can resize, fit, and fill content/containers automatically and lists sizing among Flex properties.
- Grid reference: Penpot Grid element properties include `Width: fix, 100%`, which maps cleanly to a first Layo child-fill metadata slice.
- Decision: Adopt layout-item `fill` sizing for fixed-size auto-layout containers first. Defer percentage values, min/max, baseline, and full Grid sizing to later maturity gaps.
- Maturity gate: `docs/product/penpot-maturity-benchmark.md` gate 4, layout maturity.
- Minimal-change ladder: extend existing `layout_item`, existing solvers, and existing Inspector patterns.

## Files

- Modify: `packages/renderer/src/index.ts` for optional `NodeLayoutItem.width_sizing` and `height_sizing`.
- Modify: `apps/server/src/storage.ts` to mirror the shared layout-item contract.
- Modify: `apps/server/src/mcp.ts` to accept optional layout-item sizing fields.
- Modify: `apps/server/src/layout.ts` to normalize layout-item sizing and apply fill sizes before final child positioning.
- Modify: `apps/server/src/storage.test.ts` and `apps/server/src/code-export.test.ts` for agent-command and export coverage.
- Modify: `apps/web/src/editor-state.ts` to normalize layout-item sizing and apply fill sizes before final child positioning.
- Modify: `apps/web/src/editor-state.test.ts` for RED/GREEN state coverage.
- Modify: `apps/web/src/App.tsx` to add Korean Inspector controls for selected child sizing.
- Modify: `apps/web/e2e/editor-mvp.spec.ts` for Playwright CLI visible proof.
- Modify: `crates/editor-core/src/model.rs`, `crates/editor-core/src/lib.rs`, generated bindings, and `crates/editor-core/tests/document_model.rs` for Rust serialization.
- Modify: product docs and `docs/superpowers/PLAN_STATUS.md` after verification.

### Task 1: RED Tests

- [x] Add `apps/web/src/editor-state.test.ts` coverage named `auto layout lets static children fill fixed parent axes`.

Expected setup:

```ts
frame.size = { width: 360, height: 240 };
frame.layout = {
  mode: "auto",
  direction: "vertical",
  align_items: "start",
  justify_content: "start",
  gap: 12,
  padding: { top: 20, right: 24, bottom: 20, left: 24 }
};
text.size = { width: 100, height: 40 };
text.layout_item = {
  width_sizing: "fill",
  height_sizing: "fill",
  margin: { top: 0, right: 6, bottom: 0, left: 6 }
};
```

With a second 80x30 rectangle, expected text size is `{ width: 300, height: 158 }` because:

```ts
width = 360 - 24 - 24 - 6 - 6
height = 240 - 20 - 20 - 12 - 30 = 158
```

- [x] Run `pnpm --filter @layo/web test -- src/editor-state.test.ts` and verify the test fails because the child remains fixed size.
- [x] Add server storage dry-run coverage with the same layout item sizing and expected child size.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts` and verify failure shows layout-item sizing is dropped or ignored.
- [x] Add Rust JSON round-trip assertions for `layout_item.width_sizing` and `layout_item.height_sizing`.
- [x] Run `cargo test -p editor-core layout_metadata_round_trips_through_json` and verify failure shows missing fields/types.

### Task 2: GREEN Implementation

- [x] Add optional layout-item sizing fields to TypeScript contracts:

```ts
width_sizing?: "fixed" | "fill";
height_sizing?: "fixed" | "fill";
```

- [x] Add optional fields to MCP `nodeLayoutItemSchema`.
- [x] Normalize fixed defaults out of serialized layout items.
- [x] In single-line layout, before final positioning, distribute remaining main-axis space equally across static fill children for the main axis when the parent main axis is fixed.
- [x] Apply cross-axis fill as `availableCross - crossBefore - crossAfter` when the parent cross axis is fixed.
- [x] Keep fill sizing inert for circular axes where the parent axis is `fit`.
- [x] Add Rust enum `LayoutItemSizing` with serde snake_case and default `Fixed`.

### Task 3: Inspector and Browser Proof

- [x] Add two Korean Inspector selects in the layout item section:
  - `data-testid="inspector-layout-item-width-sizing"`, label `아이템 너비`, options `고정`, `채우기`
  - `data-testid="inspector-layout-item-height-sizing"`, label `아이템 높이`, options `고정`, `채우기`
- [x] Add Playwright CLI test that selects a child, sets both layout-item sizing controls to `fill`, and verifies the selected child Inspector width/height update.
- [x] Run focused Playwright CLI:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "layout item fill sizing" --workers=1 --reporter=line
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

- [x] Update `docs/product/penpot-maturity-benchmark.md`, `docs/product/figma-migration-roadmap.md`, and `docs/superpowers/PLAN_STATUS.md` with the landed layout-item fill sizing slice and remaining layout gaps.
- [x] Commit, push, create PR, merge, and run `docs/process/post-merge-cleanup.md`.
