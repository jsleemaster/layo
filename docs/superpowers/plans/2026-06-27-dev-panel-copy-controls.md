# Dev Panel Copy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-inspired copy controls to the visible Inspector Dev tab so selected-layer CSS, HTML, and exported structure can be copied directly from Layo.

**Architecture:** Keep the server code export as the source of truth and add browser-only clipboard actions around the existing selected-node snippets. The UI remains Korean-first, stores only transient copy status in React state, and proves the behavior through Playwright CLI clipboard assertions.

**Tech Stack:** React, Vite, Playwright CLI, Layo HTTP code export, GitHub Actions compatible pnpm gates.

---

## Penpot Comparison

Reference capability: Penpot Dev tools expose inspect/code handoff information, including CSS and SVG/HTML-like code access and asset export, so developers can move selected design information into implementation without reinterpreting the canvas.

Layo decision: **adapt**. Layo already generates CSS, HTML, and structured code metadata from its own HTTP export surface. This slice adds copy actions for those existing artifacts rather than introducing a separate code mode or asset download pipeline.

Maturity gate: **Developer handoff** in `docs/product/penpot-maturity-benchmark.md`.

Remaining after this slice: SVG/asset downloads, richer ready-for-dev annotations, webhooks/API integration stories, and repo component mappings.

## Files

- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Tasks

### Task 1: Lock The Clipboard Behavior With Playwright

- [x] Add a Playwright test named `inspector dev panel copies generated handoff snippets to the clipboard`.
- [x] In the test, create a project, select `헤드라인`, open the `개발` tab, grant clipboard read/write permissions for `http://127.0.0.1:5173`, and click three copy buttons:
  - `dev-panel-copy-css`
  - `dev-panel-copy-html`
  - `dev-panel-copy-structure`
- [x] Assert the clipboard contains `.node-text-1` and `font-size` after CSS copy.
- [x] Assert the clipboard contains `data-node-id="text-1"` after HTML copy.
- [x] Assert the clipboard contains `"id": "text-1"` after structure copy.
- [x] Assert `dev-panel-copy-status` reports `CSS 복사됨`, `HTML 복사됨`, and `구조 복사됨`.
- [x] Run the focused test and verify it fails because the copy controls do not exist yet:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel copies generated handoff snippets to the clipboard" --workers=1 --reporter=line
```

### Task 2: Add Copy Controls To The Dev Panel

- [x] Add transient copy status state inside `DevPanel`.
- [x] Add an async copy helper that writes to `navigator.clipboard.writeText`.
- [x] Render one compact copy button beside each snippet header:
  - `CSS 복사`
  - `HTML 복사`
  - `구조 복사`
- [x] Disable each button while its snippet is empty.
- [x] Render `dev-panel-copy-status` as an aria-live status line.
- [x] Run the focused Playwright test and verify it passes.

### Task 3: Keep The UI Aligned With Design Rules

- [x] Add CSS for snippet headers and compact copy buttons using existing design tokens.
- [x] Avoid raw visual values that violate `pnpm run check:design-rules`.
- [x] Run:

```bash
pnpm run check:design-rules
```

### Task 4: Update Maturity Documentation

- [x] Update `docs/product/penpot-maturity-benchmark.md` so Developer handoff says CSS/HTML/structure copy controls exist.
- [x] Remove copy controls from the current highest-risk Developer handoff gap and leave SVG/asset downloads, richer annotations, webhooks/API stories, and repo component mappings.
- [x] Add this plan to `docs/superpowers/PLAN_STATUS.md` with verification evidence.
- [x] Run:

```bash
pnpm run check:penpot-maturity
```

### Task 5: Verify, Ship, Merge, And Clean Up

- [x] Run focused Playwright CLI.
- [x] Run web typecheck and build.
- [x] Run `pnpm test`.
- [x] Run `pnpm test:e2e`.
- [x] Run `git diff --check`.
- [ ] Commit as `feat: add dev panel copy controls`.
- [ ] Push `codex/dev-panel-copy-controls`.
- [ ] Create a PR through GitHub REST.
- [ ] Merge the PR through GitHub REST.
- [ ] Follow `docs/process/post-merge-cleanup.md`: update `main`, delete remote/local branch, remove the worktree, prune worktrees, and verify ports.
