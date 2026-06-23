# Web-Only Laptop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the editor as a web-only desktop experience with 1280px as the minimum laptop viewport and no page-level horizontal scroll.

**Architecture:** Keep the existing three-column editor shell and fixed 960x640 stage. At laptop width, the stage may scroll inside `.canvas-area`, but hidden collaboration upload controls must not expand the document viewport.

**Tech Stack:** React, Vite, CSS custom properties, Playwright CLI.

## Global Constraints

- Browser debugging and visual layout verification must use Playwright CLI.
- Minimum supported laptop viewport is `1280x800`.
- The app remains web-only; do not add mobile breakpoints or mobile-specific navigation.
- `.stage-frame` remains fixed at `960x640`; overflow belongs inside `.canvas-area`, not the page.
- Hidden file inputs must stay accessible to Playwright `setInputFiles` and button-triggered upload flows.

---

### Task 1: Laptop Viewport Regression Coverage

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Consumes: existing `data-testid="canvas-area"`, `data-testid="stage-frame"`, and `data-testid="team-manifest-file"`.
- Produces: a Playwright regression test that fails when a 1280px laptop viewport can scroll the whole page horizontally.

- [x] **Step 1: Write the Playwright regression test**

Add this test to `apps/web/e2e/editor-mvp.spec.ts`:

```ts
test("web editor keeps laptop viewport overflow inside the canvas area", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-area"]') as HTMLElement | null;
    const stage = document.querySelector('[data-testid="stage-frame"]') as HTMLElement | null;

    if (!canvas || !stage) {
      throw new Error("layout nodes missing");
    }

    window.scrollTo(1000, 0);
    const pageScrollXAfterAttempt = window.scrollX;
    window.scrollTo(0, 0);

    return {
      pageScrollXAfterAttempt,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      canvasClientWidth: canvas.clientWidth,
      canvasScrollWidth: canvas.scrollWidth,
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      stageHeight: Math.round(stage.getBoundingClientRect().height)
    };
  });

  expect(metrics.pageScrollXAfterAttempt).toBe(0);
  expect(metrics.documentScrollWidth).toBe(metrics.viewportWidth);
  expect(metrics.canvasScrollWidth).toBeGreaterThan(metrics.canvasClientWidth);
  expect(metrics.stageWidth).toBe(960);
  expect(metrics.stageHeight).toBe(640);
});
```

- [x] **Step 2: Verify regression coverage**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "web editor keeps laptop viewport overflow inside the canvas area" --reporter=line --workers=1
```

Observed on 2026-06-17: PASS because the hidden input CSS override was already present in this branch when verification ran.

### Task 2: Hidden Upload Input Layout Fix

**Files:**
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `.visually-hidden` and `.team-panel input` CSS rules.
- Produces: hidden inputs remain one pixel and no longer inherit full-width team-panel control styling.

- [x] **Step 1: Apply minimal CSS override**

Add this rule after the general form control rules in `apps/web/src/styles.css`:

```css
.team-panel input.visually-hidden {
  width: var(--editor-border-hairline);
  height: var(--editor-border-hairline);
  padding: 0;
  border: 0;
}
```

- [x] **Step 2: Verify GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "web editor keeps laptop viewport overflow inside the canvas area" --reporter=line --workers=1
```

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-17-web-only-laptop-layout.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2.
- Produces: checked plan steps and focused verification evidence.

- [x] **Step 1: Run focused e2e**

Run:

```bash
pnpm test:e2e
```

Expected: PASS.

- [x] **Step 2: Run web checks**

Run:

```bash
pnpm --filter @layo/web test
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web build
```

Expected: all pass.

- [x] **Step 3: Mark this plan complete**

Change every checkbox in this plan from `- [ ]` to `- [x]` after the expected verification commands pass.
