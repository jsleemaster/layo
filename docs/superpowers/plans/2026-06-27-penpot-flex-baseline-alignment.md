# Penpot Flex Baseline Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot/CSS-inspired baseline alignment for horizontal auto-layout rows so mixed text sizes align by text baseline instead of top, center, or bottom edges.

**Architecture:** Extend the existing `layout.align_items` contract with `baseline` and keep the behavior in the shared web/server layout solvers. The first slice applies baseline alignment to horizontal and horizontal-reverse auto-layout rows; vertical writing-mode baseline and grid baseline alignment remain explicit later gaps.

**Tech Stack:** TypeScript renderer/editor/server layout, Zod MCP schemas, Rust document model, Vitest, Playwright CLI.

---

## Reference

- Penpot Flexible Layouts says Flex Layout is based on the CSS Flexbox standard and exposes direction, align, justify, gap, padding, margin, and sizing properties: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Penpot README frames Penpot as a full-stack open-source team design platform with CSS Grid and Flex Layout as code-aligned primitives: https://github.com/penpot/penpot
- Layo maturity benchmark currently records `baseline alignment` as a remaining layout maturity gap.

## Scope

- Adopt: `layout.align_items = "baseline"` for horizontal and horizontal-reverse auto-layout rows.
- Behavior: text nodes use an approximate first-line baseline at `font_size * 0.8`, clamped within node height; non-text nodes use their bottom edge as fallback baseline.
- Preserve: margins, reverse row direction, fit sizing, fill sizing, undo/redo, server agent command parity, code export, and Rust JSON round-trip.
- Defer: vertical writing-mode baseline, wrapped-line per-line baseline, and grid baseline alignment.

## File Structure

- Modify: `packages/renderer/src/index.ts`
  - Add `"baseline"` to `NodeLayout.align_items`.
- Modify: `apps/web/src/editor-state.ts`
  - Normalize `baseline`.
  - Align horizontal auto-layout children by first baseline.
  - Treat `baseline` like `start` for unsupported vertical/wrapped/grid paths.
- Modify: `apps/web/src/editor-state.test.ts`
  - Add RED/GREEN coverage for horizontal baseline alignment and reverse-row baseline alignment.
- Modify: `apps/web/src/App.tsx`
  - Add Korean Inspector option `기준선` to `교차축 정렬`.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for selecting baseline in the Inspector and seeing mixed-size text baselines align.
- Modify: `apps/server/src/storage.ts`
  - Add `"baseline"` to the server `NodeLayout.align_items` union.
- Modify: `apps/server/src/layout.ts`
  - Mirror web baseline alignment.
- Modify: `apps/server/src/mcp.ts`
  - Accept `"baseline"` in `set_layout`.
- Modify: `apps/server/src/storage.test.ts`
  - Add server agent command coverage for baseline alignment.
- Modify: `crates/editor-core/src/model.rs`
  - Add `Baseline` to `LayoutAlignItems`.
- Modify: `crates/editor-core/tests/document_model.rs`
  - Prove Rust JSON round-trips `align_items: "baseline"`.
- Modify: `crates/editor-core/bindings/LayoutAlignItems.ts`
  - Regenerate or update binding to include `"baseline"`.
- Modify: `apps/server/src/code-export.test.ts`
  - Prove code export preserves `align_items: "baseline"`.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move horizontal flex baseline alignment from the broad gap to landed posture.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Track this slice and exact verification.

## Task 1: RED Web State Tests

- [x] **Step 1: Add horizontal baseline test**

Add `baseline alignment matches mixed text baselines in horizontal auto layout` near layout alignment tests in `apps/web/src/editor-state.test.ts`.

Expected setup:
- `frame-1` is a horizontal auto layout with `align_items: "baseline"`, `gap: 10`, `padding.top: 20`.
- `text-1` has font size 32, size `120 x 48`.
- Add `caption-1` text node with font size 16, size `80 x 24`.
- Trigger relayout with `update_node_geometry`.

Expected result:
- `text-1.y + 26 === caption-1.y + 13`, using rounded `font_size * 0.8`.
- `text-1.y === 20`.
- `caption-1.y === 33`.

- [x] **Step 2: Add reverse row baseline test**

Use `direction: "horizontal_reverse"` with the same children and assert the same baseline equality while x-order reverses.

- [x] **Step 3: Verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "baseline"
```

Expected: FAIL because `"baseline"` is normalized away or treated as start.

## Task 2: Implement Shared Baseline Semantics

- [x] **Step 1: Extend TypeScript layout types**

Add `"baseline"` to `NodeLayout.align_items` in renderer and server types.

- [x] **Step 2: Add baseline helper functions to web/server solvers**

Implement equivalent helpers in `apps/web/src/editor-state.ts` and `apps/server/src/layout.ts`:

```ts
function nodeBaselineOffset(node: RendererNode | DesignNode, isVertical: boolean): number {
  if (isVertical) {
    return node.size.width;
  }
  if (node.content.type === "text") {
    return Math.max(0, Math.min(node.size.height, Math.round(node.content.font_size * 0.8)));
  }
  return node.size.height;
}
```

For horizontal single-line layout only:

```ts
const baseline = !isVertical && layout.align_items === "baseline"
  ? Math.max(...flowChildren.map((child, index) => childMetrics[index].crossBefore + nodeBaselineOffset(child, isVertical)))
  : null;
```

If `baseline !== null`, position child cross-axis as:

```ts
crossStartPadding + baseline - nodeBaselineOffset(child, isVertical)
```

Then preserve the existing main-axis calculation and margins.

- [x] **Step 3: Keep unsupported paths deterministic**

Treat `baseline` like `start` in wrapped, vertical, and grid layout paths. Do not add hidden partial behavior there.

- [x] **Step 4: Verify GREEN web state**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "baseline"
```

Expected: PASS.

## Task 3: Server, MCP, Rust, Export Parity

- [x] **Step 1: Add server storage test**

Add `agent commands apply flex baseline alignment deterministically` in `apps/server/src/storage.test.ts` with the same geometry and expected y values as the web test.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "baseline"
```

Expected: FAIL until server schema/solver accepts and applies baseline.

- [x] **Step 3: Update MCP schema, Rust enum, binding, and export test**

Add `"baseline"` to `nodeLayoutSchema.align_items`, `LayoutAlignItems`, `crates/editor-core/bindings/LayoutAlignItems.ts`, and code-export coverage.

- [x] **Step 4: Verify parity**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "baseline"
cargo test -p editor-core layout_metadata_round_trips_through_json
pnpm --filter @layo/server test -- src/code-export.test.ts -t "exports layout"
```

Expected: PASS.

## Task 4: Inspector And Playwright Proof

- [x] **Step 1: Add Inspector option**

Add `<option value="baseline">기준선</option>` to `inspector-layout-align-items`.

- [x] **Step 2: Add focused Playwright test**

Add `inspector auto layout baseline aligns mixed text baselines` in `apps/web/e2e/editor-mvp.spec.ts`. The test selects the frame, sets horizontal auto layout and baseline alignment, creates a second text node, sets mixed sample font sizes and heights, then asserts:

- Inspector `align_items` select is `baseline`.
- Large text y is `20`.
- Small text y is `29` for the sample document's existing 28px headline and the new 16px caption.

- [x] **Step 3: Verify Playwright**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "baseline aligns mixed text baselines" --workers=1 --reporter=line
```

Expected: PASS.

## Task 5: Docs, Full Verification, Publish

- [x] **Step 1: Update docs**

Update `docs/product/penpot-maturity-benchmark.md` and `docs/superpowers/PLAN_STATUS.md` with landed horizontal flex baseline alignment and remaining unsupported baseline scopes.

- [x] **Step 2: Run focused and broad verification**

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "baseline"
pnpm --filter @layo/server test -- src/storage.test.ts -t "baseline"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "baseline aligns mixed text baselines" --workers=1 --reporter=line
pnpm --filter @layo/web typecheck
pnpm --filter @layo/server typecheck
pnpm typecheck
pnpm run check:penpot-maturity
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

- [ ] **Step 3: Publish, merge, cleanup**

Commit, push, create PR, merge, sync `main`, delete local/remote branch, prune worktrees, remove generated artifacts, and verify ports `5173` and `4317` are clear.
