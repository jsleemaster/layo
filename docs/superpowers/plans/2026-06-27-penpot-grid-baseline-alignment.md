# Penpot Grid Baseline Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot/CSS-inspired row baseline alignment for grid children so mixed text sizes in the same grid row align by text baseline instead of all starting at the cell top.

**Architecture:** Reuse the existing `layout.align_items = "baseline"` field, Inspector select, MCP/HTTP `set_layout` path, and web/server grid solvers. Compute a baseline offset per grid row for children whose effective vertical alignment is `baseline`; children with an explicit `layout_item.align_self` override keep their own start/center/end/stretch behavior.

**Tech Stack:** TypeScript web/server layout solvers, Vitest, Playwright CLI, Penpot maturity docs.

---

## Reference

- Penpot Flexible Layouts documents Flex and Grid Layouts as code-aligned layout primitives with align, justify, gap, padding, margin, and sizing controls: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Penpot README frames Penpot as an open-source team design platform with CSS Grid and Flex Layout as code-aligned primitives: https://github.com/penpot/penpot
- Layo already serializes `align_items: "baseline"` and has Inspector/MCP support for setting it; current grid placement treats `baseline` like `start`.

## Scope

- Adopt: row-level grid baseline sharing for effective `align_items: "baseline"`.
- Behavior: each grid row computes its own baseline offset from children in that row; mixed text sizes align by baseline while independent rows remain independent.
- Preserve: grid auto placement, manual placement, spans, named areas, row/column gaps, padding, margins, fill/stretch sizing, `justify_items`, and per-child `align_self` overrides.
- Defer: vertical writing-mode baseline and full CSS baseline behavior for multi-row baseline sharing groups.

## File Structure

- Modify: `apps/web/src/editor-state.test.ts`
  - Add RED/GREEN coverage for two mixed-text grid rows.
- Modify: `apps/web/src/editor-state.ts`
  - Add per-row grid baseline offset and reuse it for effective baseline children.
- Modify: `apps/server/src/storage.test.ts`
  - Add server agent command coverage for deterministic grid baseline positions.
- Modify: `apps/server/src/layout.ts`
  - Mirror the web row baseline solver.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for selecting grid + baseline in Inspector and checking mixed-text rows.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move grid row baseline alignment to landed layout posture and leave vertical baseline/deeper resizing as remaining gaps.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Track this slice and verification.

## Task 1: RED Web State Test

- [x] **Step 1: Add failing grid baseline state test**

Add `grid layout baseline aligns mixed text per row` near the existing grid layout tests in `apps/web/src/editor-state.test.ts`.

Fixture:
- `frame-1` size `300 x 180`, grid layout, two columns, two rows, `align_items: "baseline"`, `justify_content: "start"`, `row_gap: 20`, `column_gap: 0`, and 20px padding.
- `text-1`: 32px text size `90 x 48` in row 1, column 1.
- `caption-1`: 16px text size `80 x 24` in row 1, column 2.
- `label-1`: 16px text size `80 x 24` in row 2, column 1.
- `subtitle-1`: 32px text size `90 x 48` in row 2, column 2.

Expected:
- Row 1: `text-1` at `{ x: 20, y: 20 }`, `caption-1` at `{ x: 150, y: 33 }`.
- Row 2: `label-1` at `{ x: 20, y: 113 }`, `subtitle-1` at `{ x: 150, y: 100 }`.
- Baselines match per row: `20 + 26 === 33 + 13` and `113 + 13 === 100 + 26`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "grid layout baseline"
```

Expected: FAIL because current grid `baseline` placement resolves to top/start.

## Task 2: Implement Web Grid Baseline

- [x] **Step 1: Add row baseline helper in web solver**

In `apps/web/src/editor-state.ts`, inside `relayoutGridChildren`, collect child layout entries after stretch sizing and before transform assignment. Add a `rowBaselines` map keyed by placement row:

```ts
const rowBaselines = new Map<number, number>();
for (const entry of entries) {
  if (entry.alignSelf === "baseline") {
    const baseline = entry.margin.top + nodeBaselineOffset(entry.child);
    rowBaselines.set(entry.placement.row, Math.max(rowBaselines.get(entry.placement.row) ?? 0, baseline));
  }
}
```

When assigning `y`, use:

```ts
const rowBaseline = alignSelf === "baseline" ? rowBaselines.get(row) : undefined;
const y =
  rowBaseline === undefined
    ? layout.padding.top + rowStarts[row] + margin.top + gridAxisOffset(alignSelf, innerHeight, child.size.height)
    : layout.padding.top + rowStarts[row] + rowBaseline - nodeBaselineOffset(child);
```

- [x] **Step 2: Verify web GREEN**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "grid layout baseline"
```

Expected: PASS.

## Task 3: Server Parity

- [x] **Step 1: Add server RED test**

Add `agent commands apply grid baseline alignment per row` in `apps/server/src/storage.test.ts` with the same grid layout and expected positions. Use `dryRun: true` and create the three extra text nodes through agent commands.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "grid baseline"
```

Expected: FAIL until `apps/server/src/layout.ts` mirrors the web row baseline solver.

- [x] **Step 3: Implement server parity**

Apply the same row baseline collection and `y` positioning in `apps/server/src/layout.ts`.

- [x] **Step 4: Verify server GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "grid baseline"
```

Expected: PASS.

## Task 4: Playwright CLI Proof

- [x] **Step 1: Add focused e2e test**

Add `inspector grid baseline aligns mixed text per row` in `apps/web/e2e/editor-mvp.spec.ts`.

Flow:
- Create a project from empty state.
- Use HTTP agent commands to add `caption-1`, `label-1`, and `subtitle-1` under `frame-1`.
- In Inspector, set the frame to horizontal-direction grid layout with two columns, two rows, `align_items: baseline`, `row_gap: 20`, `column_gap: 0`, 20px padding, and size `300 x 180`.
- Set `text-1` to `90 x 48`, `caption-1` to `80 x 24`, `label-1` to `80 x 24`, and `subtitle-1` to `90 x 48`.

Expected Inspector positions for the sample 28px headline baseline and 16px captions:
- `text-1`: `x=20`, `y=20`
- `caption-1`: `x=150`, `y=29`
- `label-1`: `x=20`, `y=113`
- `subtitle-1`: `x=150`, `y=100`

- [x] **Step 2: Verify Playwright CLI**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "grid baseline aligns mixed text per row" --workers=1 --reporter=line
```

Expected: PASS.

## Task 5: Docs, Full Verification, Publish

- [x] **Step 1: Update docs**

Update `docs/product/penpot-maturity-benchmark.md` and `docs/superpowers/PLAN_STATUS.md` with landed grid row baseline alignment and remaining vertical baseline/deeper resizing gaps.

- [x] **Step 2: Run focused and broad verification**

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "grid layout baseline"
pnpm --filter @layo/server test -- src/storage.test.ts -t "grid baseline"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "grid baseline aligns mixed text per row" --workers=1 --reporter=line
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

Commit, push, create PR, review PR patch, merge, sync `main`, delete local/remote branch, prune worktrees, remove generated artifacts, stop dev servers, and verify ports `5173` and `4317` are clear.
