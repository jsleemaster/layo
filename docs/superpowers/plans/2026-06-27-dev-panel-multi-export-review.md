# Dev Panel Multi Export Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-inspired multi-selection export review surface to Layo's Inspector Dev tab so users can review, exclude, and download selected-layer export preset artifacts.

**Architecture:** Keep saved export preset metadata unchanged. Add a small web helper that turns selected nodes into deterministic review items, then extend the Dev panel to show a review list whenever multiple selected nodes have presets. Reuse the existing selected-node SVG/PDF helpers and selected raster crop path, expanded to target an explicit node id for multi-selection artifacts.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright CLI.

## Global Constraints

- Browser debugging and e2e verification use Playwright CLI.
- Work happens in `/Users/leeo/jsleemaster/layo/.worktrees/dev-panel-export-review` on `codex/dev-panel-export-review`.
- Penpot reference: https://help.penpot.app/user-guide/export-import/exporting-layers/
- This slice closes multi-selection export review; zip packaging remains a later developer-handoff gap.

---

## Penpot Comparison

Penpot's exporting-layers flow lets users review all selected export entries before export and exclude entries they do not want. Layo adapts that into the existing Inspector Dev tab instead of a separate modal: when multiple selected nodes have saved export presets, the Dev tab lists the resulting artifacts with checkboxes and downloads only checked items.

## Files

- Create: `apps/web/src/export-presets.ts`
- Create: `apps/web/src/export-presets.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: RED Review Item Helper

- [x] Create `apps/web/src/export-presets.test.ts` with a failing test:
  - call `buildExportPresetReviewItems([textNode, imageNode])`
  - text node has PNG suffix `@hero` and SVG suffix `""`
  - image node has JPEG suffix `@thumb`
  - assert item keys, labels, node ids, and filenames are:
    - `text-1@hero.png`
    - `text-1.svg`
    - `image-1@thumb.jpg`
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/export-presets.test.ts
```

Expected: FAIL because `apps/web/src/export-presets.ts` does not exist.

## Task 2: GREEN Review Item Helper

- [x] Add `apps/web/src/export-presets.ts`:
  - export `ExportPresetReviewItem`
  - export `exportPresetExtension(format)`
  - export `buildExportPresetReviewItems(nodes)`
  - skip nodes without `export_presets`
  - produce stable keys `${node.id}:${preset.id}`
  - use `jpg` for JPEG filenames
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/export-presets.test.ts
```

Expected: PASS.

## Task 3: RED Playwright Multi-Selection Review

- [x] Add Playwright CLI coverage named `inspector dev panel reviews multi-selection export presets before download`:
  - create a project
  - use HTTP agent commands to create `rectangle-review` named `검사기`, save PNG preset on `text-1`, and save SVG preset on `rectangle-review`
  - select both layers with Shift-click
  - open Dev tab
  - assert review list shows `헤드라인 PNG 3x text-1@hero.png` and `검사기 SVG 1x rectangle-review.svg`
  - uncheck the rectangle SVG row
  - click review download
  - assert only `text-1@hero.png` downloads
  - assert status says `1/2개 export preset 다운로드됨`
- [x] Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel reviews multi-selection export presets before download" --workers=1 --reporter=line
```

Expected: FAIL because the review list does not exist.

## Task 4: Implement Dev Panel Review UI

- [x] Extend `DevPanel` props with `selectedNodes: RendererNode[]` and explicit-node raster downloader:

```ts
onDownloadNodeRaster(format, scale, nodeId, filename): string | null
```

- [x] Add selected-node review state:
  - `excludedReviewItemKeys: string[]`
  - reset it when selected node ids change
- [x] Render a `dev-panel-export-review` card when `buildExportPresetReviewItems(selectedNodes).length > 0`.
- [x] Add one checkbox row per review item with:
  - `data-testid="dev-panel-export-review-row-${item.key}"`
  - `data-testid="dev-panel-export-review-toggle-${item.key}"`
- [x] Add `data-testid="dev-panel-export-review-download"` button that downloads only checked items.
- [x] Use explicit node id export for raster formats and node-local SVG/PDF helpers for vector formats.
- [x] Run the focused Playwright test and ensure GREEN.

## Task 5: Documentation And Broad Verification

- [x] Update `docs/product/penpot-maturity-benchmark.md`:
  - Developer handoff current posture includes multi-selection export review
  - remaining developer-handoff gaps keep page-level export review, zip packaging, nested/image fidelity, annotations, webhooks/API, repo mappings
- [x] Add a completed row to `docs/superpowers/PLAN_STATUS.md`.
- [x] Run:

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

## Task 6: Ship And Clean Up

- [ ] Commit as `feat: add dev panel multi-export review`.
- [ ] Push `codex/dev-panel-export-review`.
- [ ] Create PR through GitHub REST without adding reviewers.
- [ ] Merge PR through GitHub REST after verifying files and mergeability.
- [ ] Stop local servers, update `main`, delete the remote/local feature branch, remove the worktree, prune worktrees, and verify ports.
