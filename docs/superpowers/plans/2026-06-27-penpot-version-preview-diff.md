# Penpot Version Preview Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a Penpot-inspired saved-version preview and current-file diff summary before restore.

**Architecture:** Reuse the existing file-version read route and the existing `/files/:fileId/agent/change-summary` route instead of creating a separate diff engine. The web API helper fetches a version snapshot, compares it with the current editor document, and the file panel shows a Korean-first preview card with create/change/delete counts and restore/close actions.

**Tech Stack:** Vite React, Vitest, Playwright CLI, existing Fastify HTTP routes.

---

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/workspace-basics/#file-history-versions
- Capability: Penpot lets users preview a saved version in a view-only mode and then exit or restore it.
- Layo decision: adapt. Layo first adds a saved-version preview card and current-file diff summary in the file panel. Full canvas view-only preview, pinned controls, retention controls, and branch review remain later maturity gaps.
- Maturity gate: team workflow and failure loop in `docs/product/penpot-maturity-benchmark.md`.

## Minimal Change Ladder

1. The behavior is needed because `docs/product/penpot-maturity-benchmark.md` still lists visual diff and version preview controls as collaboration maturity gaps.
2. Layo already has immutable version snapshots through `readFileVersion`.
3. Layo already has HTTP change summaries through `/files/:fileId/agent/change-summary`.
4. The UI can reuse the existing file-version panel and restore flow.
5. New code is limited to one web API helper, a preview card, styles, focused tests, and docs.

## File Map

- Modify: `apps/web/src/document-api.ts`
  - Add `FileVersionChangeSummary` and `summarizeDocumentChanges`.
- Modify: `apps/web/src/document-api.test.ts`
  - Add RED/GREEN coverage for the new change-summary helper.
- Modify: `apps/web/src/App.tsx`
  - Add preview state, preview action, close action, restore-from-preview action, and version preview card rendering.
- Modify: `apps/web/src/styles.css`
  - Add compact preview/diff card styles inside the existing file-version panel.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage that saves a version, changes text, previews the saved version, sees changed-node counts, closes the preview, and restores from the preview.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Record the landed basic preview/diff summary and remaining gaps.
- Modify: `docs/product/figma-migration-roadmap.md`
  - Record version preview/diff summary in the browser editor posture.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Add completion evidence after verification.

## Tasks

### Task 1: RED API Helper Test

**Files:**
- Modify: `apps/web/src/document-api.test.ts`

- [x] Add a test named `summarizes document changes through the agent change-summary route`.
- [x] The test should call:

```ts
await summarizeDocumentChanges("sample-file", beforeDocument, afterDocument, fetcher as typeof fetch);
```

- [x] Expected request:

```ts
[
  expect.stringContaining("/files/sample-file/agent/change-summary"),
  "POST"
]
```

- [x] Expected response:

```ts
{
  createdNodeIds: ["new-node"],
  updatedNodeIds: ["text-1"],
  removedNodeIds: ["old-node"],
  unchangedNodeCount: 2,
  changedNodeIds: ["new-node", "text-1", "old-node"]
}
```

- [x] Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "summarizes document changes"
```

Expected: FAIL because `summarizeDocumentChanges` does not exist yet.

### Task 2: GREEN API Helper

**Files:**
- Modify: `apps/web/src/document-api.ts`

- [x] Export `FileVersionChangeSummary`.
- [x] Export `summarizeDocumentChanges(fileId, before, after, fetcher)` that POSTs `{ before, after }` to `/files/:fileId/agent/change-summary`.
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "summarizes document changes"
```

Expected: PASS.

### Task 3: RED Browser Preview Test

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] Add a Playwright test named `file version history previews saved version differences before restore`.
- [x] Flow:
  - create an empty project,
  - save `검토 전`,
  - change `text-1` through the inspector to `변경된 헤드라인`,
  - click `검토 전 미리보기`,
  - expect `data-testid="file-version-preview"` to contain `현재 파일과 비교`,
  - expect it to contain `변경 1`,
  - expect it to contain `text-1`,
  - close preview and verify it hides,
  - open preview again and restore from the preview.
- [x] Run with local dev servers:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "file version history previews saved version differences before restore" --workers=1 --reporter=line
```

Expected: FAIL because the preview button/card does not exist yet.

### Task 4: GREEN Browser Preview UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] Import `readFileVersion`, `summarizeDocumentChanges`, and `FileVersionChangeSummary`.
- [x] Add preview state:

```ts
const [fileVersionPreview, setFileVersionPreview] = useState<FileVersionPreviewState | null>(null);
```

- [x] Add `previewCurrentFileVersion(version)` that reads the saved snapshot, compares it to `editorRef.current.document`, and stores the summary.
- [x] Add a `미리보기` button next to each version row.
- [x] Add a preview card with:
  - version message,
  - saved time/source,
  - `현재 파일과 비교`,
  - `생성 N · 변경 N · 삭제 N`,
  - changed node ids,
  - `미리보기 닫기`,
  - `이 버전 복원`.
- [x] Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "summarizes document changes"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "file version history previews saved version differences before restore" --workers=1 --reporter=line
```

Expected: PASS.

### Task 5: Docs And Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: `docs/superpowers/plans/2026-06-27-penpot-version-preview-diff.md`

- [x] Update product docs with the landed basic preview/diff summary and remaining full Penpot gaps.
- [x] Run focused checks:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "file version|summarizes document changes"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "file version history" --workers=1 --reporter=line
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web build
git diff --check
```

- [x] Run broader gates before PR:

```bash
pnpm typecheck
pnpm run check:penpot-maturity
pnpm test
pnpm test:e2e
```

- [x] PR body must include the Penpot reference, minimal-change ladder decision, RED/GREEN evidence, and remaining risks.

## Execution Evidence

- RED web API: `pnpm --filter @layo/web test -- src/document-api.test.ts -t "summarizes document changes"` failed with `summarizeDocumentChanges is not a function`.
- RED Playwright CLI: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "file version history previews saved version differences before restore" --workers=1 --reporter=line` failed waiting for `검토 전 미리보기`.
- RED server: `pnpm --filter @layo/server test -- src/storage.test.ts -t "changed descendants"` failed with `updatedNodeIds` equal to `['frame-1', 'text-1']`, proving parent containers were double-counted when a child changed.
- GREEN focused web API: `pnpm --filter @layo/web test -- src/document-api.test.ts -t "summarizes document changes"`.
- GREEN focused server: `pnpm --filter @layo/server test -- src/storage.test.ts -t "changed descendants"`.
- GREEN focused Playwright CLI: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "file version history previews saved version differences before restore" --workers=1 --reporter=line`.
- GREEN file-version Playwright CLI: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "file version history" --workers=1 --reporter=line`.
- Direct Playwright CLI interaction proof: the focused test opened the file panel, saved `검토 전`, edited the headline to `변경된 헤드라인`, clicked `검토 전 미리보기`, verified `현재 파일과 비교`, `변경 1`, and `text-1`, closed the preview, reopened it, clicked `이 버전 복원`, and verified the headline restored to `Layo`.
- Focused gates: `pnpm --filter @layo/web typecheck`, `pnpm --filter @layo/server typecheck`, `pnpm --filter @layo/web build`, `pnpm run check:penpot-maturity`, and `git diff --check`.
- Broad gates: `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e`.

## Remaining Penpot Gaps

- This slice is not full Penpot parity. Full canvas-level view-only version preview, pinned version controls, retention controls, comments, and branch/review/merge workflows remain open team-product maturity gaps.
