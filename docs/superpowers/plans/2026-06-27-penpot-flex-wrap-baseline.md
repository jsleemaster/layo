# Penpot Flex Wrap Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot/CSS-inspired baseline alignment inside each horizontal wrapped flex line so mixed text sizes align per row instead of only in single-line auto layout.

**Architecture:** Reuse the existing wrapped flex line model in the web and server layout solvers. Compute a per-line baseline offset for horizontal `wrap` layouts when `align_items` is `baseline`; unsupported vertical and grid baseline semantics remain explicit later gaps.

**Tech Stack:** TypeScript renderer/editor/server layout, Vitest, Playwright CLI, Penpot maturity docs.

---

## Reference

- Penpot Flexible Layouts documents Flex Layout as based on CSS Flexbox and exposes direction, align, justify, gap, padding, margin, and sizing controls: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Penpot README frames Penpot as an open-source team design platform with CSS Grid and Flex Layout as code-aligned primitives: https://github.com/penpot/penpot
- Layo maturity docs still list vertical/wrapped/grid baseline alignment as a layout maturity gap after PR #100 landed single-line horizontal baseline alignment.

## Scope

- Adopt: `layout.align_items = "baseline"` for each horizontal wrapped flex line.
- Behavior: every wrapped row computes its own baseline from that row's children; large and small text align by baseline within the row while row gaps and `align_content` still position rows.
- Preserve: line wrapping, row/column gaps, child margins, reverse row flow, fit/fill sizing, server agent command parity, Inspector option from PR #100, and existing single-line baseline behavior.
- Defer: vertical writing-mode baseline, grid baseline alignment, and deeper resize semantics.

## File Structure

- Modify: `apps/web/src/editor-state.test.ts`
  - Add RED/GREEN coverage for baseline alignment in two wrapped rows.
- Modify: `apps/web/src/editor-state.ts`
  - Add per-line baseline positioning in `relayoutWrappedChildren`.
- Modify: `apps/server/src/storage.test.ts`
  - Add server agent command coverage proving deterministic wrapped-row baseline positions.
- Modify: `apps/server/src/layout.ts`
  - Mirror the web wrapped baseline line solver.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for selecting wrap + baseline in Inspector and observing each row's mixed text baselines.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move horizontal wrapped flex baseline alignment to landed layout posture.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Track this slice and verification.

## Task 1: RED Web State Test

- [x] **Step 1: Add wrapped row baseline test**

Add `baseline alignment applies per wrapped horizontal flex line` near existing wrap tests in `apps/web/src/editor-state.test.ts`.

Fixture:
- `frame-1` size `240 x 180`, horizontal auto layout, `wrap: "wrap"`, `align_items: "baseline"`, `align_content: "start"`, `gap: 10`, `row_gap: 12`, and 20px padding.
- First row: `text-1` as 32px text size `90 x 48`, plus `caption-1` as 16px text size `80 x 24`.
- Second row: `label-1` as 16px text size `80 x 24`, plus `subtitle-1` as 32px text size `90 x 48`.

Expected after relayout:
- Row 1: `text-1` at `{ x: 20, y: 20 }`, `caption-1` at `{ x: 120, y: 33 }`.
- Row 2: `label-1` at `{ x: 20, y: 93 }`, `subtitle-1` at `{ x: 110, y: 80 }`.
- Baselines match per row: `20 + 26 === 33 + 13` and `93 + 13 === 80 + 26`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "wrapped horizontal flex line"
```

Expected: FAIL because wrapped layouts currently treat `baseline` like start.

## Task 2: Implement Web Wrapped Baseline

- [x] **Step 1: Add per-line baseline offset**

In `apps/web/src/editor-state.ts`, inside `relayoutWrappedChildren`, compute:

```ts
const baselineOffset =
  !isVertical && layout.align_items === "baseline"
    ? Math.max(...line.children.map((entry) => entry.metrics.crossBefore + nodeBaselineOffset(entry.child)))
    : null;
```

Use it for `crossAxisPosition`:

```ts
const crossAxisPosition =
  baselineOffset === null
    ? crossAxisLineOffset(...)
    : crossCursor + baselineOffset - nodeBaselineOffset(child);
```

- [x] **Step 2: Verify GREEN web state**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "wrapped horizontal flex line"
```

Expected: PASS.

## Task 3: Server Parity

- [x] **Step 1: Add server storage RED test**

Add `agent commands apply wrapped flex baseline alignment per line` in `apps/server/src/storage.test.ts` with the same geometry and expected positions.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "wrapped flex baseline"
```

Expected: FAIL until `apps/server/src/layout.ts` mirrors the web line baseline solver.

- [x] **Step 3: Implement server parity**

Apply the same per-line baseline calculation in `apps/server/src/layout.ts`.

- [x] **Step 4: Verify server GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "wrapped flex baseline"
```

Expected: PASS.

## Task 4: Playwright CLI Proof

- [x] **Step 1: Add focused e2e test**

Add `inspector wrapped auto layout baseline aligns each row` in `apps/web/e2e/editor-mvp.spec.ts`.

Flow:
- Create a project from empty state.
- Use HTTP agent commands to add three text children under `frame-1` with mixed font sizes.
- In Inspector, set the frame to horizontal auto layout, wrap, baseline alignment, 20px padding, `gap: 10`, `row_gap: 12`, and size `240 x 180`.
- Set `text-1` to `90 x 48`, `caption-1` to `80 x 24`, `label-1` to `80 x 24`, and `subtitle-1` to `90 x 48`.

Expected Inspector positions:
- `text-1`: `x=20`, `y=20`
- `caption-1`: `x=120`, `y=29` for the sample 28px title baseline and 16px caption.
- `label-1`: `x=20`, `y=93`
- `subtitle-1`: `x=110`, `y=80`

- [x] **Step 2: Verify Playwright**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "wrapped auto layout baseline aligns each row" --workers=1 --reporter=line
```

Expected: PASS.

## Task 5: Docs, Full Verification, Publish

- [x] **Step 1: Update docs**

Update `docs/product/penpot-maturity-benchmark.md` and `docs/superpowers/PLAN_STATUS.md` with landed horizontal wrapped flex baseline alignment and remaining vertical/grid baseline gaps.

- [x] **Step 2: Run focused and broad verification**

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "wrapped horizontal flex line"
pnpm --filter @layo/server test -- src/storage.test.ts -t "wrapped flex baseline"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "wrapped auto layout baseline aligns each row" --workers=1 --reporter=line
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

Commit, push, create PR, merge, sync `main`, delete local/remote branch, prune worktrees, remove generated artifacts, stop dev servers, and verify ports `5173` and `4317` are clear.
