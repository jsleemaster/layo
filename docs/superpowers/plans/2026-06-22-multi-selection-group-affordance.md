# Multi-Selection Group Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clear group-level affordance for multi-selected canvas objects: combined bounding box and combined dimensions.

**Architecture:** Reuse the existing `getSelectionBoundsForNodeIds` absolute-bound calculation and `selectionChromeOverlay` DOM layer. Keep resize handles single-selection only in this slice, so this task prepares the UI contract for later multi-selection bounding-box resize without changing resize behavior yet.

**Tech Stack:** React, TypeScript, Vite, Playwright e2e, existing Layo design tokens.

## Global Constraints

- Follow `AGENTS.md`: browser/debug verification must use Playwright CLI.
- Follow `DESIGN.md`: use semantic design tokens; keep the editor quiet, precise, compact, and Korean-first.
- Follow Product Design audit evidence in `docs/product/audits/2026-06-22-product-design-audit/`.
- Use TDD: add failing Playwright coverage before production code.
- Do not add multi-selection resize behavior in this slice.

---

### Task 1: Multi-Selection Group Chrome

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/product/figma-core-interaction-rules.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Consumes: `getSelectionBoundsForNodeIds(document, nodeIds): SelectionBounds | null`
- Produces: DOM `data-testid="multi-selection-bounds"` and existing `data-testid="selection-size-badge"` for multi-selection dimensions.

- [x] **Step 1: Write the failing e2e test**

Add a Playwright test that creates a rectangle and a text node, Shift-selects three layers, and expects:

```ts
await expect(page.getByTestId("multi-selection-bounds")).toBeVisible();
await expect(page.getByTestId("selection-size-badge")).toHaveText("288 x 116");
await expect(page.getByTestId("resize-handle-top-left")).toHaveCount(0);
await expect(page.getByTestId("resize-handle-bottom-right")).toHaveCount(0);
await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();
```

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "multi-selection group bounds" --reporter=line
```

Expected: FAIL because `multi-selection-bounds` does not exist.

- [x] **Step 3: Implement minimal UI**

In `apps/web/src/App.tsx`:

- Let `selectionChromeOverlay` compute when `selectedNodeIds.length > 0`.
- Include an `isMultiSelection` flag in `SelectionChromeOverlay`.
- Render resize handles only when `!selectionChromeOverlay.isMultiSelection`.
- Render a group outline div when `selectionChromeOverlay.isMultiSelection`.

In `apps/web/src/styles.css`:

- Add `.multi-selection-bounds` using the selection token, transparent fill, and stable absolute dimensions.

- [x] **Step 4: Run GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "multi-selection group bounds" --reporter=line
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "resize handles|multi-selection group bounds|alignment and distribution" --reporter=line
```

Expected: PASS.

- [x] **Step 5: Verify and document**

Run:

```bash
pnpm typecheck
pnpm test:e2e
pnpm --filter @layo/web build
pnpm test
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "multi-selection group bounds" --headed --workers=1 --reporter=line
```

Expected: all pass. Then update docs and complete PR flow outside this plan file.

Verification completed before PR:

- `git diff --check`
- `pnpm run check:design-rules`
- `pnpm --dir apps/web exec vitest run src/editor-state.test.ts`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "multi-selection group bounds" --reporter=line`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "multi-selection group bounds|resize handles|alignment and distribution|Figma-like multi-selection" --reporter=line`
- `pnpm typecheck`
- `pnpm test:e2e`
- `pnpm --filter @layo/web build`
- `pnpm test`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "multi-selection group bounds" --headed --workers=1 --reporter=line`

## Product Design Queue

Implement the remaining audit items as separate goals after this task:

1. Inspector alignment/distribution visual grouping, tooltips, and disabled contrast.
2. Top toolbar tooltips, active state, and tool grouping.
3. Frame spacing guide label placement and padding-vs-spacing distinction.
4. Default sample document typography and realistic component sample.
5. Stage fit-to-selection/fit-to-frame affordance after snap settings are clearer.
