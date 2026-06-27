# Dev Panel Export Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-inspired persistent selected-layer export presets to Layo's document model, MCP/HTTP agent surface, and visible Inspector Dev tab.

**Architecture:** Store export presets on each design node as `export_presets`, not in transient React state. Reuse the existing `apply_agent_commands` path for persistence and agent edits, the existing Dev panel SVG/PDF generators, and the existing Konva selected raster crop path for PNG/JPEG/WEBP preset downloads. Keep this slice scoped to selected-layer presets and batch download from the Dev panel; page-level export selection review remains a later gap.

**Tech Stack:** TypeScript, React, Vite, Fastify, MCP, Rust serde/ts-rs model, Playwright CLI.

---

## Penpot Comparison

Reference capability: Penpot lets users create export presets on selected layers. A layer can have many presets, each with size, suffix, and file format. Penpot also exposes those presets in view/code mode and can export multiple preset artifacts in one action.

Source: https://help.penpot.app/user-guide/export-import/exporting-layers/

Layo decision: **adapt**. Layo keeps deterministic local-first document metadata and agent commands, while adding the same core user value: saved per-layer presets and batch export from the Dev panel.

Maturity gate: **Developer handoff** in `docs/product/penpot-maturity-benchmark.md`.

Remaining after this slice: multi-selection/page-level export review, zip packaging of batch exports, nested/image SVG/PNG/JPEG/WEBP/PDF fidelity, richer ready-for-dev annotations, webhooks/API integration stories, and repo component mappings.

## Files

- Modify: `packages/renderer/src/index.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/tests/document_model.rs`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/mcp.test.ts`
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Tasks

### Task 1: RED Model And Agent Tests

- [x] Add a Rust JSON round-trip assertion in `crates/editor-core/tests/document_model.rs` that a node preserves:

```json
"export_presets": [
  { "id": "preset-png-3x", "format": "png", "scale": 3, "suffix": "@3x" },
  { "id": "preset-svg", "format": "svg", "scale": 1, "suffix": "" }
]
```

- [x] Add `apps/server/src/storage.test.ts` coverage named `persists node export presets through agent commands`:
  - use `storage.applyAgentCommands("sample-file", { dryRun: false, commands: [{ type: "set_export_presets", nodeId: "text-1", presets: [...] }] })`
  - assert `persisted.validation.ok === true`
  - assert `persisted.audit.commandTypes` contains `set_export_presets`
  - assert `persisted.preview.pages[0].children[0].children[0].export_presets` contains PNG 3x and SVG presets
  - call `storage.inspectCanvas("sample-file")` or `storage.readFile("sample-file")` and assert the persisted node still has the same presets
- [x] Add `apps/server/src/mcp.test.ts` coverage named `lets an MCP client set node export presets`:
  - create a project
  - call `apply_agent_commands` with `set_export_presets`
  - inspect canvas
  - assert `inspection.nodes.find((node) => node.id === "text-1").exportPresets` exposes the saved presets
- [x] Run focused tests and verify RED:

```bash
cargo test -p editor-core export_preset_metadata_round_trips_through_json
pnpm --filter @layo/server test -- src/storage.test.ts src/mcp.test.ts -t "export presets"
```

Expected: fail because `export_presets` and `set_export_presets` do not exist yet.

### Task 2: Add Persistent Export Preset Contracts

- [x] Add renderer types:

```ts
export type ExportPresetFormat = "png" | "jpeg" | "webp" | "svg" | "pdf";

export interface NodeExportPreset {
  id: string;
  format: ExportPresetFormat;
  scale: number;
  suffix: string;
}
```

- [x] Add optional `export_presets?: NodeExportPreset[];` to `RendererNode`.
- [x] Add matching server storage types and Rust structs/enums.
- [x] Add validation for preset format and positive scale in `validateNode`.
- [x] Add `AgentNodeSummary.exportPresets?: NodeExportPreset[]`.
- [x] Add `AgentCommand` variant `{ type: "set_export_presets"; nodeId: string; presets: NodeExportPreset[] }`.
- [x] Normalize presets by trimming suffix/id, keeping formats to `png|jpeg|webp|svg|pdf`, coercing scale to at least `1`, and removing `export_presets` when the list is empty.
- [x] Add MCP zod schema for `set_export_presets`.
- [x] Run focused server/Rust tests and verify GREEN.

### Task 3: RED Web State And Playwright Tests

- [x] Add `apps/web/src/editor-state.test.ts` coverage named `sets selected node export presets with undo and redo`:
  - create editor state from a document with selected `text-1`
  - execute `set_node_export_presets`
  - assert presets are on `text-1`
  - undo and assert presets are removed
  - redo and assert presets return
- [x] Add Playwright CLI coverage named `inspector dev panel saves and batch-downloads selected layer export presets`:
  - create a project
  - select `헤드라인`
  - open the Dev tab
  - add a PNG 3x preset with suffix `@hero`
  - add an SVG 1x preset with empty suffix
  - assert both presets are visible
  - fetch `GET /files/:documentId` and assert `text-1.export_presets` contains both presets
  - click batch download and assert `text-1@hero.png` and `text-1.svg` downloads
  - reload the page and assert the presets are still visible for `헤드라인`
- [x] Run focused web tests and verify RED:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "export presets"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel saves and batch-downloads selected layer export presets" --workers=1 --reporter=line
```

Expected: fail because the editor command and Dev panel UI do not exist yet.

### Task 4: Implement Dev Panel Preset UI

- [x] Add `set_node_export_presets` to `EditorCommand` and `applyCommand`.
- [x] Add a helper for setting selected node presets and preserving undo/redo.
- [x] Add `persistNodeExportPresets(fileId, nodeId, presets)` in `App.tsx` using `POST /files/:fileId/agent/commands`.
- [x] Extend `DevPanel` props:
  - `onExportPresetsChange(nodeId, presets)`
  - `onDownloadRaster(format, scale, filename)`
- [x] Add Dev panel controls:
  - format select with `PNG`, `JPEG`, `WEBP`, `SVG`, `PDF`
  - scale segmented buttons `1x`, `2x`, `3x`
  - suffix input
  - `프리셋 추가` button
  - preset list with remove buttons
  - `프리셋 모두 다운로드` button
- [x] Use filenames `${node.id}${suffix}.${extension}`, with `jpg` for JPEG.
- [x] For batch download:
  - raster presets call the existing Konva crop path
  - SVG presets call `svgForNode`
  - PDF presets call `pdfForNode`
  - success status is `${count}개 export preset 다운로드됨`
- [x] Run focused web tests and verify GREEN.

### Task 5: Documentation And Broad Verification

- [x] Update `docs/product/penpot-maturity-benchmark.md`:
  - Developer handoff current posture includes persistent selected-layer export presets
  - remaining gaps move to multi-selection/page-level export review, zip packaging, nested/image fidelity, annotations, webhooks/API, and repo mappings
- [x] Add a completed row to `docs/superpowers/PLAN_STATUS.md`.
- [x] Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm --filter @layo/server typecheck
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:collab
git diff --check
```

### Task 6: Ship And Clean Up

- [ ] Commit as `feat: add dev panel export presets`.
- [ ] Push `codex/dev-panel-export-presets`.
- [ ] Create PR through GitHub REST without adding reviewers.
- [ ] Merge PR through GitHub REST after verifying changed files and mergeability.
- [ ] Follow `docs/process/post-merge-cleanup.md` using REST instead of `gh`: verify PR merged, update `main`, delete remote/local feature branch, remove the worktree, prune worktrees, and verify ports.
