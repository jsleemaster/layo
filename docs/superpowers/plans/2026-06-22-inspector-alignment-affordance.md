# Inspector Alignment Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the right Inspector alignment and distribution controls scan like a professional design tool surface by separating groups, adding reliable tooltips, and exposing disabled state clearly.

**Architecture:** Keep the existing alignment/distribution command callbacks and selection rules. Refactor only `InspectorAlignmentControls` markup and tokenized CSS, then lock behavior with Playwright e2e coverage.

**Tech Stack:** React, TypeScript, Vite, Playwright e2e, existing Layo design tokens.

## Global Constraints

- Follow `AGENTS.md`: browser/debug verification must use Playwright CLI.
- Follow `DESIGN.md`: use semantic design tokens; keep the editor quiet, precise, compact, and Korean-first.
- Follow Product Design audit evidence in `docs/product/audits/2026-06-22-product-design-audit/`.
- Use TDD: add failing Playwright coverage before production code.
- Do not change alignment or distribution geometry behavior in this slice.

---

### Task 1: Inspector Control Grouping And Tooltips

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/product/audits/2026-06-22-product-design-audit/notes.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Produces: DOM `data-testid="inspector-align-group"` and `data-testid="inspector-distribute-group"`.
- Keeps: Existing button accessible names such as `검사기 왼쪽 맞춤` and `검사기 가로 간격 균등`.

- [x] **Step 1: Write the failing e2e test**

Add a Playwright test that selects the default headline and expects:

```ts
await expect(page.getByTestId("inspector-align-group").getByRole("button")).toHaveCount(6);
await expect(page.getByTestId("inspector-distribute-group").getByRole("button")).toHaveCount(2);
await expect(page.getByRole("button", { name: "검사기 왼쪽 맞춤" })).toHaveAttribute("title", "왼쪽 맞춤");
await expect(page.getByRole("button", { name: "검사기 가로 간격 균등" })).toBeDisabled();
await expect(page.getByRole("button", { name: "검사기 가로 간격 균등" })).toHaveClass(/is-disabled/);
```

Then select three layers and expect the distribution button to be enabled and no longer carry `is-disabled`.

- [x] **Step 2: Run RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector alignment controls expose grouped tooltips" --reporter=line
```

Expected: FAIL because grouped test ids and title attributes do not exist yet. A first attempt exposed that the test must select a layer before inspecting controls; after selecting `헤드라인`, the RED failure was the missing `inspector-align-group`.

- [x] **Step 3: Implement minimal UI**

In `apps/web/src/App.tsx`:

- Split the eight buttons into two semantic groups: align and distribute.
- Add title attributes matching the Korean action names.
- Add `is-disabled` class when each button is disabled.
- Preserve existing `aria-label` values and click callbacks.

In `apps/web/src/styles.css`:

- Add compact `.inspector-control-groups`, `.inspector-control-group`, `.inspector-control-label`, and disabled button styling with tokens only.

- [x] **Step 4: Run GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector alignment controls expose grouped tooltips" --reporter=line
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "alignment and distribution|inspector alignment controls expose grouped tooltips" --reporter=line
```

Expected: PASS.

- [x] **Step 5: Verify and document**

Run:

```bash
git diff --check
pnpm run check:design-rules
pnpm --filter @layo/web typecheck
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector alignment controls expose grouped tooltips" --headed --workers=1 --reporter=line
pnpm typecheck
pnpm test:e2e
pnpm --filter @layo/web build
pnpm test
```

Expected: all pass. Then update docs and complete PR flow outside this plan file.

Verification completed before PR:

- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector alignment controls expose grouped tooltips" --reporter=line`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "alignment and distribution|inspector alignment controls expose grouped tooltips" --reporter=line`
- `git diff --check`
- `pnpm run check:design-rules`
- `pnpm typecheck`
- `pnpm test:e2e`
- `pnpm --filter @layo/web build`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector alignment controls expose grouped tooltips" --headed --workers=1 --reporter=line`
- `pnpm --dir apps/web exec vitest run src/collaboration/encrypted-provider.test.ts`
- `pnpm --dir apps/web exec vitest run`
- `pnpm test`

The verification loop also stabilized `apps/web/src/collaboration/encrypted-provider.test.ts` by forwarding all encrypted frames after a captured start index, matching relay behavior instead of assuming the first encrypted frame is always the update frame.

## Product Design Queue

Remaining audit items after this task:

1. Top toolbar tooltips, active state, and tool grouping.
2. Frame spacing guide label placement and padding-vs-spacing distinction.
3. Default sample document typography and realistic component sample.
4. Stage fit-to-selection/fit-to-frame affordance after snap settings are clearer.
