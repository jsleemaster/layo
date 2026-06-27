# Penpot Style Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document-local reusable color and typography styles manageable team design-system assets, not only create/apply bindings.

**Architecture:** Adapt Penpot's library asset management model for Layo's local-first document model. Styles stay document-local `DesignStyle` records, while rename/delete and usage summaries are exposed through agent commands, validation/inspection, undoable web state, and the right Inspector.

**Tech Stack:** TypeScript, React, Fastify/Vitest, Playwright CLI, Rust model bindings only if the persisted schema changes.

---

## Penpot Reference

- Source: `https://help.penpot.app/user-guide/design-systems/assets/`
- Capability: Penpot asset libraries store colors and typography styles for reuse, and their library menus support rename, edit, duplicate, and delete.
- Layo decision: **Adapt**. This slice adopts rename/delete, usage counts, and safe binding cleanup. Duplicate, grouping, search/sort/filter, and library-wide drag organization remain later style-management gaps.

## Task 1: Server Agent Semantics

**Files:**
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/src/storage.test.ts`

- [x] Write a failing Vitest case in `apps/server/src/storage.test.ts` that creates a color style, binds it to `text-1`, renames the style, inspects usage count `1`, deletes the style, and verifies `text-1.style.fill_style` is cleared while `style.fill` remains materialized.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts -t "rename and delete reusable styles" --runInBand`; RED failed on missing inspection style usage data.
- [x] Add `rename_style` and `delete_style` to `AgentCommand` and `agentCommandSchema`.
- [x] Implement `rename_style` by updating the matching `DesignStyle.name` without changing id/type/value.
- [x] Implement `delete_style` by removing the style and clearing matching `style.fill_style` and text `content.typography_style` bindings recursively without reverting materialized visual values.
- [x] Add style usage summaries to `inspectCanvas()` as extra fields on each style: `usageCount` and `usedBy: Array<{ nodeId; nodeName; property }>` where property is `fill_style` or `typography_style`.
- [x] Re-run the focused server test; GREEN with 118 passing tests in the filtered server run.

## Task 2: Undoable Web State

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

- [x] Write a failing web state test that creates/applies a style, renames it, deletes it, verifies bindings are cleared, then undo/redo restores/removes both styles and bindings.
- [x] Run `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "manages reusable styles" --runInBand`; RED failed on unsupported commands returning no inverse.
- [x] Add `rename_style` and `delete_style` editor commands.
- [x] Implement both commands through `set_document_styles` inverse snapshots so undo/redo remains stable.
- [x] Re-run the focused web state test; GREEN with 147 passing tests in the filtered web run.

## Task 3: Inspector Management UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

- [x] Extend the existing Playwright test `right inspector creates and applies reusable styles` to rename `Brand / Primary` to `Brand / Accent`, verify the select updates, delete the style, verify the binding selector returns to `스타일 없음`, and verify persisted file JSON has no removed style.
- [x] Run Playwright CLI coverage for `right inspector creates and applies reusable styles`; the full `pnpm test:e2e -- --grep "right inspector creates and applies reusable styles"` invocation passed all 125 tests after the wrapper ignored grep.
- [x] Add UI callbacks `onRenameStyle` and `onDeleteStyle` to the Inspector.
- [x] Add a compact style management section that lists document styles with type label, usage count, rename input, and delete button.
- [x] Persist rename/delete through the existing agent command route.
- [x] Re-run the Playwright CLI flow; GREEN with 125 passing tests.

## Task 4: Docs And Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: `docs/superpowers/plans/2026-06-28-penpot-style-management.md`

- [x] Move style rename/delete/usage/binding cleanup from missing to baseline-present in the design-system maturity row.
- [x] Keep duplicate, grouping, search/sort/filter, richer theme/mode management, explicit variant property type authoring, advanced matrix editing, and hosted registry/sync as remaining gaps.
- [x] Run `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `pnpm test`, `pnpm test:e2e`, and `git diff --check`.
- [ ] Commit, push, create/update PR through GitHub REST, merge, then run post-merge cleanup without `gh`.
