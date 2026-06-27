# Dev Panel Ready Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ready-for-dev annotations to Layo's structured code export and visible Inspector Dev Panel so selected layers expose implementation-ready geometry, content, style, layout, component, and asset notes.

**Architecture:** Reuse the existing `CodeStructureNode` contract because Dev Panel selection already resolves a selected node inside exported structure. The server will attach deterministic annotation rows to every structure node, and the web UI will render and copy the selected node's annotations from that same payload. This adapts Penpot's Inspect handoff capability while preserving Layo's MCP/HTTP code-export surface.

**Tech Stack:** TypeScript, Vitest, React, Playwright CLI, existing Layo HTTP code-export API.

---

### Task 1: Server Code Export Annotations

**Files:**
- Modify: `apps/server/src/code-export.ts`
- Modify: `apps/server/src/code-export.test.ts`

- [x] **Step 1: Write the failing test**

Add a Vitest case to `apps/server/src/code-export.test.ts`:

```ts
test("exports ready-for-dev annotations for code structures", () => {
  const fixture = tossFixture() as any;
  fixture.tokens = [
    { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#3182f6" },
    { id: "spacing-layout-lg", name: "Layout / Lg", type: "spacing", value: "32px" }
  ];
  fixture.pages[0].children[0].style.fill_token = "color-brand-primary";
  fixture.pages[0].children[0].layout = {
    mode: "auto",
    direction: "vertical",
    align_items: "center",
    justify_content: "center",
    gap: 32,
    row_gap: 32,
    column_gap: 32,
    padding: { top: 32, right: 32, bottom: 32, left: 32 },
    spacing_tokens: {
      gap: "spacing-layout-lg",
      row_gap: "spacing-layout-lg",
      column_gap: "spacing-layout-lg",
      padding_top: "spacing-layout-lg",
      padding_right: "spacing-layout-lg",
      padding_bottom: "spacing-layout-lg",
      padding_left: "spacing-layout-lg"
    }
  };

  const result = exportDesignToCode(fixture);
  const button = result.elements.find((element) => element.id === "tds-button-primary");

  expect(button?.structure.annotations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "tds-button-primary-geometry",
        label: "크기/위치",
        value: "240 x 56 · X 64, Y 120"
      }),
      expect.objectContaining({
        id: "tds-button-primary-style",
        label: "스타일",
        detail: "fill token color-brand-primary maps to var(--layo-token-color-brand-primary)"
      }),
      expect.objectContaining({
        id: "tds-button-primary-layout",
        label: "레이아웃",
        detail: "spacing token spacing-layout-lg is used for gap and padding"
      })
    ])
  );
  expect(button?.structure.children[0].annotations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "tds-button-label-content",
        label: "콘텐츠",
        value: "\"송금하기\" · 18px Arial"
      })
    ])
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @layo/server test -- src/code-export.test.ts
```

Expected: FAIL because `structure.annotations` is missing.

- [x] **Step 3: Implement annotations**

In `apps/server/src/code-export.ts`, add a `CodeHandoffAnnotation` interface, add `annotations: CodeHandoffAnnotation[]` to `CodeStructureNode`, and set `annotations: handoffAnnotationsFor(node, tokenMap)` inside `structureFor`.

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @layo/server test -- src/code-export.test.ts
```

Expected: PASS.

### Task 2: Inspector Dev Panel Annotation UI

**Files:**
- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write the failing Playwright test**

Extend `inspector dev panel shows selected layer handoff specs and code` to assert:

```ts
await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("크기/위치");
await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("260 x 48");
await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("콘텐츠");
await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("\"Layo\"");
```

Extend the clipboard test to click `dev-panel-copy-annotations` and assert the clipboard contains `크기/위치` and `text-1`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel shows selected layer handoff specs and code|inspector dev panel copies generated handoff snippets to the clipboard" --reporter=line
```

Expected: FAIL because the annotation card and copy button do not exist.

- [x] **Step 3: Implement UI**

Add the annotation type to `document-api.ts`. In `DevPanel`, derive `annotationSnippet` from `codeStructure.annotations`, render a `dev-panel-ready-annotations` block before assets, and wire `dev-panel-copy-annotations` to the existing copy status.

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel shows selected layer handoff specs and code|inspector dev panel copies generated handoff snippets to the clipboard" --reporter=line
```

Expected: PASS.

### Task 3: Product Docs And Full Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update product maturity docs**

Move Developer handoff from "richer ready-for-dev annotations remain immature" to "structured ready-for-dev annotation rows exist in HTTP code export and visible Dev Panel".

- [x] **Step 2: Run repository gates**

Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass.

- [x] **Step 3: Commit and merge**

Commit with:

```bash
git add apps/server/src/code-export.ts apps/server/src/code-export.test.ts apps/web/src/document-api.ts apps/web/src/App.tsx apps/web/src/styles.css apps/web/e2e/editor-mvp.spec.ts docs/product/penpot-maturity-benchmark.md docs/superpowers/PLAN_STATUS.md docs/superpowers/plans/2026-06-27-dev-panel-ready-annotations.md
git commit -m "feat: add dev panel ready annotations"
```

Push, create PR, merge, and run the post-merge cleanup process.

## Verification Evidence

- RED server: `pnpm --filter @layo/server test -- src/code-export.test.ts` failed on missing `structure.annotations`.
- GREEN server: `pnpm --filter @layo/server test -- src/code-export.test.ts` passed with 101 server-package tests.
- RED web: Playwright CLI failed on missing `dev-panel-ready-annotations` and `dev-panel-copy-annotations`.
- GREEN web focused: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel shows selected layer handoff specs and code|inspector dev panel copies generated handoff snippets to the clipboard" --reporter=line` passed 2 tests.
- Product gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm --filter @layo/web build`, and `pnpm typecheck` passed.
- Full gates: `pnpm test`, `pnpm test:e2e`, `git diff --check`, and headed Playwright CLI Dev Panel check passed.
