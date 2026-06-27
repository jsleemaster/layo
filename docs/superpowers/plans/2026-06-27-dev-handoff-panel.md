# Dev Handoff Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible Penpot-style Dev panel to the right Inspector so selected layers expose developer-ready specs, CSS, HTML, and structure from existing Layo inspect/export surfaces.

**Architecture:** Keep the server as the source of truth for generated code by reusing `/files/:fileId/export/code`. Add a typed web helper, fetch the code export for the current document when the Dev tab is open, and render a read-only selected-layer handoff panel next to existing Design/Prototype tabs. The first slice intentionally avoids copy-to-clipboard and asset-download workflows; it closes the visibility gap without inventing a separate handoff data model.

**Tech Stack:** React, TypeScript, Vite, Vitest, Playwright CLI, Fastify HTTP export route.

---

## Penpot Reference

Penpot's Dev tools expose a right-sidebar Inspect mode for spacing, sizes, colors, typography, border radius, layout data, CSS, SVG, HTML, and asset/code handoff. Layo adapts that benchmark by making selected-layer handoff visible inside the Inspector and backed by deterministic Layo code export data.

## Files

- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/document-api.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Create: `docs/superpowers/plans/2026-06-27-dev-handoff-panel.md`

## Task 1: Web API Helper

- [x] **Step 1: Write the failing web API test**

Add a test to `apps/web/src/document-api.test.ts` that imports `exportCode` and verifies it calls `/files/sample-file/export/code?moduleBasePath=.%2Felements`, then returns the `export` payload with `html`, `css`, `elements`, `implementationSpec`, and `indexModule`.

- [x] **Step 2: Run the web API test to verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "exports developer handoff code"
```

Expected: fail because `exportCode` is not exported from `document-api.ts`.

- [x] **Step 3: Implement the web API helper**

Add typed interfaces for the code export shape used by the UI and implement:

```ts
export async function exportCode(
  fileId: string,
  options: ExportCodeOptions = {},
  fetcher: typeof fetch = fetch
): Promise<CodeExportPayload> {
  const searchParams = new URLSearchParams();
  if (options.moduleBasePath) {
    searchParams.set("moduleBasePath", options.moduleBasePath);
  }
  const suffix = searchParams.toString() ? `?${searchParams}` : "";
  const response = await fetcher(apiUrl(`/files/${fileId}/export/code${suffix}`));
  const payload = await readDocumentJson(response);
  return (payload as { export: CodeExportPayload }).export;
}
```

- [x] **Step 4: Run the web API test to verify GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "exports developer handoff code"
```

Expected: pass.

## Task 2: Inspector Dev Tab UI

- [x] **Step 1: Write the failing Playwright CLI test**

Add a test to `apps/web/e2e/editor-mvp.spec.ts`:

1. Create a project.
2. Select `헤드라인`.
3. Click the Inspector `개발` tab.
4. Assert the Dev panel shows selected node id/name/kind, dimensions, fill, HTML, CSS, and structure snippets.
5. Change selection to `랜딩 프레임` and assert the panel updates to that node.

Use test ids:

- `inspector-tab-dev`
- `dev-panel`
- `dev-panel-status`
- `dev-panel-selected-node`
- `dev-panel-specs`
- `dev-panel-css`
- `dev-panel-html`
- `dev-panel-structure`

- [x] **Step 2: Run Playwright CLI to verify RED**

Run with the dev server active:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel" --workers=1 --reporter=line
```

Expected: fail because the `개발` tab and `dev-panel` do not exist.

- [x] **Step 3: Implement the Inspector Dev tab**

Update `apps/web/src/App.tsx` to:

- import `exportCode` and the code export types.
- add `InspectorTab = "design" | "prototype" | "dev"`.
- add `inspectorTab`, `codeExport`, `codeExportStatus`, and `lastCodeExportFileId` state.
- make `InspectorHeader` tabs clickable and expose `data-testid="inspector-tab-design"`, `inspector-tab-prototype`, and `inspector-tab-dev`.
- fetch code export when the Dev tab is selected and a current document exists.
- render a read-only `DevPanel` for the selected node.
- keep the existing Design tab behavior unchanged.
- render a small prototype placeholder only under the Prototype tab instead of mixing it with Design controls.

- [x] **Step 4: Run Playwright CLI to verify GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel" --workers=1 --reporter=line
```

Expected: pass.

## Task 3: Documentation And Gates

- [x] **Step 1: Update product maturity docs**

Update `docs/product/penpot-maturity-benchmark.md` so Developer handoff no longer says the visible Dev panel is missing. Record the remaining gaps: copy controls, asset downloads, richer annotations, and code mapping maturity.

- [x] **Step 2: Update plan status**

Add an entry to `docs/superpowers/PLAN_STATUS.md` with the implementation and verification evidence.

- [x] **Step 3: Run focused and broad gates**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel" --workers=1 --reporter=line
pnpm run check:penpot-maturity
pnpm typecheck
pnpm --filter @layo/web build
git diff --check
```

Expected: all pass.

- [x] **Step 4: Commit, push, PR, merge, cleanup**

Commit the changed files, push `codex/dev-handoff-panel`, create a PR with GitHub REST API, merge it, delete the remote/local branch, remove the worktree, stop any dev server used by Playwright, and verify main is clean.
