# Penpot File Version Visual Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render saved file versions as a safe read-only canvas with explicit exit and restore controls.

**Architecture:** Preserve the live `EditorState` and keep the fetched saved `RendererDocument` in separate preview state. Derive the displayed canvas document from that state, suppress all editing overlays and mutation entry points, and reuse the existing recovery-safe restore route.

**Tech Stack:** React, TypeScript, react-konva, Fastify file-version APIs, Vitest, Playwright CLI.

---

### Task 1: Record the current Penpot comparison

**Files:**
- Create: `docs/superpowers/specs/2026-07-16-penpot-file-version-visual-preview-design.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] Verify current Penpot `develop` and official saved-version preview docs.
- [x] Record the adopt/adapt/diverge decision and exact missing Layo behavior.
- [x] Obtain independent design review and repair actionable findings.

### Task 2: Write the browser RED

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] Extend the saved-version preview scenario with distinct saved/current canvas colors.
- [x] Require a named read-only banner, saved canvas pixels, inert mutation controls, safe Exit, and recovery-safe Restore.
- [x] Run the focused Playwright CLI scenario and retain the exact failure as RED evidence.
- [x] Add request-race, in-progress interaction cancellation, and collaboration restore convergence coverage.

Run: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts -g "file version history previews the saved canvas in read-only mode" --workers=1 --reporter=line`

### Task 3: Implement isolated read-only preview

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Add focused unit tests only if new pure preview policy helpers are extracted.

- [x] Store the complete saved document in preview state.
- [x] Derive canvas/layer display from the preview document without replacing the live editor.
- [x] Add the Korean read-only banner with Exit and Restore.
- [x] Disable Konva node interaction, editing overlays, editor chrome, Inspector mutation, keyboard mutation, paste, drop, and context menus.
- [x] Separate viewport-only updates from centrally guarded editor mutations and reject stale preview reads.
- [x] Publish restore results through the active collaboration document before accepting later edits.
- [x] Preserve viewport pan/zoom and live-document recovery on Exit.
- [x] Keep restore on the existing server recovery path.

### Task 4: Verify product behavior

**Files:**
- Verify: `apps/web/e2e/editor-mvp.spec.ts`
- Verify: `apps/web/src/document-api.test.ts`
- Verify: `apps/server/src/storage.test.ts`
- Verify: `apps/server/src/http.test.ts`

- [x] Run focused web tests and the focused Playwright CLI scenario to GREEN.
- [x] Perform a direct live Playwright CLI pass: enter preview, inspect visual state, attempt a mutation, zoom/pan, exit, and restore.
- [x] Run typecheck, web build, Core tests, Rust workspace tests, and the complete Playwright CLI suite.
- [x] Feed every failure back into the exact failed case.
- [x] Preserve every document-level design-system field through Yjs and complete snapshot persistence.
- [x] Prove collaborative structural Undo/Redo preserves later remote edits in two browsers.
- [x] Serialize all same-file document writes with version Save/Restore and cover delayed requests.
- [x] Delete cancelled uploaded assets only when no current document or saved version references them.
- [x] Isolate HTTP, browser, and MCP E2E storage behind one marker-owned temporary root.
- [x] Merge independent stale complete snapshots; reject divergent reorders and reorder/insertion placement conflicts.
- [x] Store Yjs design-system collections per ID, retain document version, and deduplicate same-ID concurrent insertion.
- [x] Serialize asset reference cleanup with document/version writes and retain component-variant assets.
- [x] Make Restore a mutation barrier; serialize project-ID persistence; reject stale success, error, and version-list responses.
- [x] Restore the last accepted project ID when an in-flight stale persistence finishes and its replacement request fails.
- [x] Restrict MCP stdio test subprocesses to an explicit environment allowlist.

### Task 5: Document, review, PR, and merge

**Files:**
- Create: `docs/product/penpot-file-version-visual-preview-delta.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [x] Record RED/GREEN evidence, current Penpot source, exact product delta, and remaining risks.
- [x] Obtain independent exact-head code review and resolve every actionable finding.
- [ ] Open the PR with failure mode, verification, and deliberate divergence.
- [ ] Merge only after exact-head checks pass.
- [ ] Run post-merge cleanup and publish the completed-plan MD cleanup state.
