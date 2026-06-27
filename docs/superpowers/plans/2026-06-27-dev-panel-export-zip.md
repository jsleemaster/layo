# Dev Panel Export ZIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-inspired ZIP packaging to Layo's Inspector Dev tab export review so checked artifacts download as one review archive instead of separate files.

**Architecture:** Keep node export preset metadata unchanged. Add a browser-safe no-compression ZIP writer that mirrors the existing server archive format without `Buffer`, then teach DevPanel to collect included review artifacts as `Blob` objects and download one ZIP. Existing single-layer preset download remains unchanged.

**Tech Stack:** TypeScript, React, Vite, Vitest, Playwright CLI, browser Blob APIs.

---

## Global Constraints

- Browser debugging and e2e verification use Playwright CLI.
- Work happens in `/Users/leeo/jsleemaster/layo/.worktrees/dev-panel-export-zip` on `codex/dev-panel-export-zip`.
- Penpot references:
  - https://help.penpot.app/user-guide/export-import/exporting-layers/
  - https://help.penpot.app/user-guide/export-import/export-import-files/
- Minimal-change decision: reuse existing export review rows and explicit-node SVG/PDF/raster generation. New code is limited to browser ZIP assembly and the DevPanel review download path.
- This slice closes developer-handoff ZIP packaging for reviewed artifacts. Complex nested/image export fidelity, richer annotations, webhooks/API stories, and repo component mappings remain later gaps.

## Penpot Comparison

Penpot supports reviewing multiple export artifacts before export and treats file exchange as ZIP-based open packaging. Layo adopts the reviewed-artifact packaging behavior inside the existing Inspector Dev tab: checked review artifacts should download as a single `.zip` archive containing exactly those files.

## Files

- Create: `apps/web/src/zip-archive.ts`
- Create: `apps/web/src/zip-archive.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: RED Browser ZIP Writer

- [x] Create `apps/web/src/zip-archive.test.ts` with tests that call `createZipBlob` and parse the resulting ZIP central directory.
- [x] Test cases:
  - `createZipBlob([{ path: "text-1.svg", data: new Blob(["<svg/>"], { type: "image/svg+xml" }) }, { path: "exports/text-1@2x.png", data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) }])`
  - assert the Blob type is `application/zip`
  - assert parsed entries are exactly `text-1.svg` and `exports/text-1@2x.png`
  - assert entry contents match `<svg/>` and bytes `[1, 2, 3]`
  - assert duplicate paths reject with `duplicate archive path`
  - assert `../unsafe.svg` rejects with `unsafe archive path`
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/zip-archive.test.ts
```

Observed: FAIL because `apps/web/src/zip-archive.ts` did not exist.

## Task 2: GREEN Browser ZIP Writer

- [x] Add `apps/web/src/zip-archive.ts` with:
  - `export interface ZipBlobEntry { path: string; data: Blob; }`
  - `export async function createZipBlob(entries: ZipBlobEntry[]): Promise<Blob>`
  - path normalization that rejects empty paths, null bytes, backslashes, absolute paths, `.` and `..`
  - duplicate-path rejection
  - ZIP store method headers and CRC32 over `Uint8Array`
  - output `new Blob(parts, { type: "application/zip" })`
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/zip-archive.test.ts
```

Observed: PASS.

## Task 3: RED Playwright ZIP Review Download

- [x] Extend the existing Playwright flow named `inspector dev panel reviews page export presets when no layer is selected`:
  - leave both page artifacts checked
  - click `dev-panel-export-review-download`
  - assert exactly one download named `페이지-1-export-review.zip`
  - read the downloaded file and assert it starts with `PK`
  - parse central directory entries and assert they are exactly `rectangle-page-review.svg` and `text-1@page.png`
  - assert status says `2개 export preset ZIP 다운로드됨`
  - then uncheck the SVG row, click download again, and assert the second ZIP contains only `text-1@page.png`
  - assert status says `1/2개 export preset ZIP 다운로드됨`
- [x] Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel reviews page export presets when no layer is selected" --workers=1 --reporter=line
```

Observed: FAIL because the current review path downloaded `text-1@page.png` instead of `페이지-1-export-review.zip`.

## Task 4: Implement DevPanel Review ZIP Download

- [x] Import `createZipBlob` into `apps/web/src/App.tsx`.
- [x] Add a small artifact helper inside `DevPanel`:
  - `async exportReviewItemToBlob(item): Promise<Blob | null>`
  - SVG returns `new Blob([svgForNode(node)], { type: "image/svg+xml" })`
  - PDF returns `new Blob([pdfForNode(node)], { type: "application/pdf" })`
  - raster formats call `onDownloadNodeRaster(format, scale, nodeId, filename, { download: false })` after changing that callback to return a data URL when download is disabled
- [x] Update the `onDownloadNodeRaster` prop type to accept an optional `{ download?: boolean }` option.
- [x] Update the App-level callback so `{ download: false }` renders the target node to a data URL and returns it without calling `downloadDataUrl`.
- [x] Change `downloadSelectedExportReviewItems` to:
  - gather included artifacts
  - create one ZIP named `${pageName}-export-review.zip` for page review or `selected-layers-export-review.zip` for multi-selection
  - call `downloadBlob(zipBlob, zipName)`
  - keep existing empty-state behavior when all rows are excluded
  - set status to `N개 export preset ZIP 다운로드됨` or `N/M개 export preset ZIP 다운로드됨`
- [x] Run the focused Playwright test and ensure GREEN.

## Task 5: Documentation And Broad Verification

- [x] Update `docs/product/penpot-maturity-benchmark.md`:
  - Developer handoff current posture includes export review ZIP packaging
  - remaining gaps keep complex nested/image fidelity, richer annotations, webhooks/API stories, and repo component mappings
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

Observed: PASS for `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm --filter @layo/web typecheck`, `pnpm --filter @layo/web build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` with 112 passing tests, and `git diff --check`. The focused page ZIP Playwright CLI flow passed in normal and `--headed` modes. The first full e2e run exposed the old multi-selection review expectation still looking for individual PNG downloads; that failed case was updated to assert `selected-layers-export-review.zip`, then the focused multi-selection Playwright CLI flow and full `pnpm test:e2e` rerun passed.

## Task 6: Ship And Clean Up

- [ ] Commit as `feat: add dev panel export review zip`.
- [ ] Push `codex/dev-panel-export-zip`.
- [ ] Create PR through GitHub REST without adding reviewers.
- [ ] Merge PR through GitHub REST after verifying files and mergeability.
- [ ] Stop local servers, update `main`, delete the remote/local feature branch, remove the worktree, prune worktrees, and verify ports.
