# Dev Panel Page Export Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-inspired page-level export review surface to Layo's Inspector Dev tab so users can review, exclude, and download every export preset on the current page when no layer is selected.

**Architecture:** Keep saved node export preset metadata unchanged. Add a small helper that builds review rows from a `RendererDocument` page tree, then reuse the existing Dev panel review card for the page scope. Raster/vector downloads keep the explicit-node export paths added for multi-selection review.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright CLI.

## Global Constraints

- Browser debugging and e2e verification use Playwright CLI.
- Work happens in `/Users/leeo/jsleemaster/layo/.worktrees/dev-panel-page-export-review` on `codex/dev-panel-page-export-review`.
- Penpot reference: https://help.penpot.app/user-guide/export-import/exporting-layers/
- This slice closes page-level export review; zip packaging remains a later developer-handoff gap.

---

## Penpot Comparison

Penpot's export flow includes all export presets in the page when the user launches export with nothing selected, then shows a review step where artifacts can be checked, inspected, or excluded. Layo adapts that into the existing Inspector Dev tab: when no layer is selected, the Dev tab should show a page-scoped export review list for every node on the current page that has saved export presets.

## Files

- Modify: `apps/web/src/export-presets.ts`
- Modify: `apps/web/src/export-presets.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: RED Page Review Helper

- [x] Add a failing test to `apps/web/src/export-presets.test.ts`:
  - import `buildPageExportPresetReviewItems`
  - create a `RendererDocument` with `page-1`, frame `frame-1`, text `text-1`, rectangle `rectangle-1`
  - text has PNG suffix `@page`
  - rectangle has SVG suffix `""`
  - assert returned filenames are `text-1@page.png` and `rectangle-1.svg`
  - assert item labels are `헤드라인 PNG 2x` and `검사기 SVG 1x`
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/export-presets.test.ts
```

Observed: FAIL because `buildPageExportPresetReviewItems` was not exported.

## Task 2: GREEN Page Review Helper

- [x] Add `buildPageExportPresetReviewItems(document, pageId?)` to `apps/web/src/export-presets.ts`.
- [x] The function should:
  - choose `pageId` when provided or the first page otherwise
  - walk nested page children depth-first
  - reuse `buildExportPresetReviewItems(flattenedNodes)`
  - return an empty list if the page does not exist
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/export-presets.test.ts
```

Observed: PASS.

## Task 3: RED Playwright Page Export Review

- [x] Add Playwright CLI coverage named `inspector dev panel reviews page export presets when no layer is selected`:
  - create a project
  - use HTTP agent commands to create `rectangle-page-review` named `검사기`
  - save a PNG preset on `text-1` with suffix `@page`
  - save an SVG preset on `rectangle-page-review`
  - reload, open the file panel, press `Escape` so nothing is selected
  - open the Dev tab
  - assert page-level review list shows `페이지 export review`, `헤드라인 PNG 2x`, `text-1@page.png`, `검사기 SVG 1x`, and `rectangle-page-review.svg`
  - uncheck the SVG row
  - click review download
  - assert only `text-1@page.png` downloads
  - assert status says `1/2개 export preset 다운로드됨`
- [x] Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel reviews page export presets when no layer is selected" --workers=1 --reporter=line
```

Observed: FAIL because no page-level review was rendered when nothing was selected.

## Task 4: Implement Page-Level Dev Panel Review

- [x] Extend `DevPanel` props with:

```ts
pageName: string;
pageExportNodes: RendererNode[];
```

- [x] Compute review scope:
  - multi-selection: existing selected-node review items
  - no selected node: `buildExportPresetReviewItems(pageExportNodes)`
  - single selected node: no page review card
- [x] Add a visible scope label in the review card:

```tsx
<span data-testid="dev-panel-export-review-scope">페이지 export review · {pageName}</span>
```

- [x] In the no-selection Dev panel branch, keep the empty-state copy and render the page review card inside a `dev-panel-asset-card` when page review items exist.
- [x] Make `downloadExportReviewItem` resolve nodes from the active review node set, not only selected nodes.
- [x] Run the focused Playwright test and ensure GREEN.

## Task 5: Documentation And Broad Verification

- [x] Update `docs/product/penpot-maturity-benchmark.md`:
  - Developer handoff current posture includes page-level export review
  - remaining developer-handoff gaps keep zip packaging, nested/image fidelity, annotations, webhooks/API, repo mappings
- [x] Add a completed row to `docs/superpowers/PLAN_STATUS.md`.
- [x] Run fresh final verification:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
git diff --check
```

Observed: PASS for `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm --filter @layo/web typecheck`, `pnpm --filter @layo/web build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` with 112 passing tests, and `git diff --check`. The focused Playwright CLI page export review also passed in both normal and `--headed` modes.

## Task 6: Ship And Clean Up

- [ ] Commit as `feat: add dev panel page-export review`.
- [ ] Push `codex/dev-panel-page-export-review`.
- [ ] Create PR through GitHub REST without adding reviewers.
- [ ] Merge PR through GitHub REST after verifying files and mergeability.
- [ ] Stop local servers, update `main`, delete the remote/local feature branch, remove the worktree, prune worktrees, and verify ports.
