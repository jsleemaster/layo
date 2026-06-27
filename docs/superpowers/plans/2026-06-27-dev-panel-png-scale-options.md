# Dev Panel PNG Scale Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-inspired 1x/2x/3x PNG scale options to the visible Inspector Dev tab.

**Architecture:** Keep the existing object context-menu PNG export unchanged, but make the App-owned selected-node PNG helper accept a pixel ratio and optional filename. The Dev panel owns a small asset-scale UI state and passes the selected scale to the callback because the Inspector is the visible developer handoff surface.

**Tech Stack:** React, Vite, React Konva, Playwright CLI, PNG IHDR byte inspection.

---

## Penpot Comparison

Reference capability: Penpot export presets let users choose asset formats and scales for design-object export from the design/dev workflow.

Layo decision: **adapt**. Layo already exposes selected-layer PNG download from the Dev tab; this slice adds explicit PNG scale choices and proves that the downloaded bitmap dimensions change.

Maturity gate: **Developer handoff** in `docs/product/penpot-maturity-benchmark.md`.

Remaining after this slice: nested/image SVG/PNG fidelity, multi-format export presets beyond PNG scale, richer ready-for-dev annotations, webhooks/API stories, and repo component mappings.

## Files

- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Tasks

### Task 1: Lock PNG Scale Selection With Playwright

- [x] Add helper functions near the existing Dev panel e2e tests:
  - `pngDimensions(buffer: Buffer): { width: number; height: number }`
  - assert PNG signature before reading width/height from bytes 16-23.
- [x] Add a Playwright test named `inspector dev panel downloads png assets at the selected scale`.
- [x] In the test, create a project, select `헤드라인`, open the `개발` tab, download the default PNG, then choose `3x` and download again.
- [x] Assert the default filename remains `text-1.png`.
- [x] Assert the 3x filename is `text-1@3x.png`.
- [x] Assert the 3x PNG width and height are larger than the default PNG dimensions.
- [x] Assert `dev-panel-asset-status` reports `헤드라인 PNG 3x 다운로드됨`.
- [x] Run the focused test and verify it fails because `dev-panel-png-scale-3x` does not exist yet:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel downloads png assets at the selected scale" --workers=1 --reporter=line
```

### Task 2: Add Dev Panel Scale State And Controls

- [x] Add `type PngExportScale = 1 | 2 | 3` and `const PNG_EXPORT_SCALES = [1, 2, 3] as const` near `DevPanel`.
- [x] Change `onDownloadPng` to accept `(scale: PngExportScale) => string | null`.
- [x] Add `const [pngScale, setPngScale] = useState<PngExportScale>(2)` in `DevPanel`.
- [x] Render a `role="radiogroup"` scale picker with buttons:
  - `data-testid="dev-panel-png-scale-1x"`
  - `data-testid="dev-panel-png-scale-2x"`
  - `data-testid="dev-panel-png-scale-3x"`
- [x] Keep 2x selected by default to preserve the previous Dev panel PNG behavior.
- [x] Pass `pngScale` into `onDownloadPng`.

### Task 3: Apply Scale To PNG Export

- [x] Change `downloadSelectionPngFromState` to accept `scale = 2` and optional `filename`.
- [x] Use `pixelRatio: scale` in `stage.toDataURL`.
- [x] Keep context-menu export calling the helper without a custom filename so `rectangle-4.png` remains unchanged.
- [x] Change `downloadSelectedNodePngFromDevPanel(scale)` to use:
  - `text-1.png` at 2x for backwards compatibility
  - `text-1@1x.png` or `text-1@3x.png` when the user selects 1x or 3x
- [x] Return existing `${node.name} PNG 다운로드됨` status at default 2x and `${node.name} PNG ${scale}x 다운로드됨` for explicit non-default scales.
- [x] Run the focused Playwright test and verify it passes.

### Task 4: Update Maturity Documentation

- [x] Update `docs/product/penpot-maturity-benchmark.md` so Developer handoff says selected-layer PNG scale options exist.
- [x] Remove generic asset scale options from the highest-risk Developer handoff gap and leave multi-format presets, nested/image fidelity, annotations, webhooks/API, and repo mappings.
- [x] Add this plan to `docs/superpowers/PLAN_STATUS.md` with verification evidence.
- [x] Run:

```bash
pnpm run check:penpot-maturity
```

### Task 5: Verify, Ship, Merge, And Clean Up

- [x] Run focused Playwright CLI.
- [x] Run `pnpm run check:design-rules`.
- [x] Run web typecheck and build.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:e2e`.
- [x] Run `git diff --check`.
- [ ] Commit as `feat: add dev panel png scale options`.
- [ ] Push `codex/dev-panel-png-scale-options`.
- [ ] Create a PR through GitHub REST.
- [ ] Merge the PR through GitHub REST.
- [ ] Follow `docs/process/post-merge-cleanup.md`: update `main`, delete remote/local branch, remove the worktree, prune worktrees, and verify ports.
