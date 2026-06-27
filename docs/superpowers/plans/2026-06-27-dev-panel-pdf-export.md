# Dev Panel PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-inspired selected-layer PDF export to the visible Inspector Dev tab.

**Architecture:** Add a deterministic single-layer PDF generator next to the existing SVG generator. Keep the raster export path for PNG/JPEG/WEBP unchanged; PDF uses a Blob download because it is a vector/document artifact rather than a canvas raster crop. The first slice supports selected text and shape layers with node id/name metadata and a valid single-page PDF; complex nested/image/vector fidelity remains a documented future gap.

**Tech Stack:** React, Vite, Playwright CLI, minimal PDF object generation, PDF byte/signature inspection.

---

## Penpot Comparison

Reference capability: Penpot exporting layers supports export presets with scale, suffix, and file formats including PNG, JPEG, WEBP, SVG, and PDF. Penpot documents that PDF/SVG exports are vector formats while not all SVG advanced features are supported.

Layo decision: **adapt**. Layo already exposes SVG, PNG, JPEG, WEBP, and raster scale options in the Inspector Dev tab. This slice adds selected-layer PDF export as a deterministic single-layer handoff artifact.

Maturity gate: **Developer handoff** in `docs/product/penpot-maturity-benchmark.md`.

Remaining after this slice: persistent multi-export presets, nested/image SVG/PNG/JPEG/WEBP/PDF fidelity, richer ready-for-dev annotations, webhooks/API stories, and repo component mappings.

## Files

- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Tasks

### Task 1: Lock PDF Export With Playwright

- [x] Add a Playwright test named `inspector dev panel downloads the selected layer as pdf`.
- [x] In the test, create a project, select `헤드라인`, open the `개발` tab, click `dev-panel-download-pdf`, and capture the download.
- [x] Assert the suggested filename is `text-1.pdf`.
- [x] Read the downloaded file and assert:
  - first five bytes decode to `%PDF-`
  - the file contains `/Type /Page`
  - the file contains `/Title (헤드라인)`
  - the file ends with `%%EOF`
- [x] Assert `dev-panel-asset-status` reports `헤드라인 PDF 다운로드됨`.
- [x] Run the focused test and verify it fails because the PDF download button does not exist yet:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel downloads the selected layer as pdf" --workers=1 --reporter=line
```

### Task 2: Add A Minimal Single-Layer PDF Generator

- [x] Add a `pdfEscapeString(value: string)` helper near the SVG helpers that escapes `\`, `(`, and `)`.
- [x] Add a `pdfColorOperands(fill: string)` helper that converts `#rrggbb` fills to normalized RGB operands and falls back to black for unsupported fills.
- [x] Add a `pdfForNode(node: RendererNode)` helper that returns a valid `%PDF-1.4` string with:
  - catalog, pages, single page, content stream, and info objects
  - page size based on `Math.max(1, Math.round(node.size.width/height))`
  - metadata title set to the selected node name
  - an uncompressed content stream so tests can inspect text/metadata
- [x] For text nodes, write a Helvetica text operation using the node content value and font size.
- [x] For non-text nodes, write a filled rectangle using the node fill and selected dimensions.

### Task 3: Add The Dev Panel PDF Action

- [x] Add `downloadSelectedPdf` inside `DevPanel`.
- [x] Add a `PDF 다운로드` button with `data-testid="dev-panel-download-pdf"` beside the other asset actions.
- [x] Use `downloadBlob(new Blob([pdfForNode(selectedNode)], { type: "application/pdf" }), `${selectedNode.id}.pdf`)`.
- [x] Set success status to `${selectedNode.name} PDF 다운로드됨` and failure status to `PDF 다운로드 실패`.
- [x] Run focused Dev panel Playwright tests and verify:
  - PDF test passes.
  - SVG/PNG/JPEG/WEBP tests still pass.
  - raster scale test still passes.

### Task 4: Update Maturity Documentation

- [x] Update `docs/product/penpot-maturity-benchmark.md` so Developer handoff says selected-layer PDF export exists.
- [x] Reduce the highest-risk Developer handoff gap from PDF exports to persistent multi-export presets plus nested fidelity, annotations, webhooks/API, and repo mappings.
- [x] Add this plan to `docs/superpowers/PLAN_STATUS.md` with verification evidence.
- [x] Run:

```bash
pnpm run check:penpot-maturity
```

### Task 5: Verify, Ship, Merge, And Clean Up

- [x] Run focused Playwright CLI.
- [x] Run `pnpm run check:design-rules`.
- [x] Run web typecheck and build.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:e2e`.
- [x] Run `git diff --check`.
- [ ] Commit as `feat: add dev panel pdf export`.
- [ ] Push `codex/dev-panel-pdf-export`.
- [ ] Create a PR through GitHub REST.
- [ ] Merge the PR through GitHub REST.
- [ ] Follow `docs/process/post-merge-cleanup.md`: update `main`, delete remote/local branch, remove the worktree, prune worktrees, and verify ports.

## Verification

- RED: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel downloads the selected layer as pdf" --workers=1 --reporter=line` failed before implementation because `dev-panel-download-pdf` did not exist.
- GREEN focused: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel downloads the selected layer as pdf" --workers=1 --reporter=line` passed.
- Focused regression: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel" --workers=1 --reporter=line` passed with 8 tests.
- Focused regression: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "right-click menu copies object styles and exports the selected object as PNG" --workers=1 --reporter=line` passed.
- Docs gates: `pnpm run check:penpot-maturity` and `pnpm run check:design-rules` passed.
- Web gates: `pnpm --filter @layo/web typecheck` and `pnpm --filter @layo/web build` passed.
- Full gates: `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` passed; Playwright CLI reported 109 passed tests.
- Formatting gate: `git diff --check` passed.
