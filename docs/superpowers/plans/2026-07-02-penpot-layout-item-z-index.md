# Penpot Layout Item Z-Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for completed tracking.

**Goal:** Add Penpot/CSS-inspired layout-item z-index semantics so flex/grid children can control their paint and hit-test order while remaining inspectable, agent-editable, persisted, and exportable.

**Architecture:** Adapt Penpot flexible-layout positioning to Layo by extending the existing `layout_item` contract with optional integer `z_index`. Document child order stays stable as the fallback order; same-parent canvas paint and hit-test paths sort by effective z-index without mutating saved children.

**Tech Stack:** TypeScript renderer contracts, web editor reducer/canvas, Fastify server storage and MCP schemas, Rust serde model and generated bindings, code export, Vitest, Playwright CLI e2e, GitHub Actions verification.

---

## Penpot Maturity Check

Penpot Flexible Layout documentation lists `z-index` as a flex child positioning property and frames flex/grid output around CSS standards. Layo **adapts** that capability as `layout_item.z_index` instead of adding a separate stacking model. The field belongs to saved layout-item metadata because it affects visible canvas order, selected-layer handoff, and agent-generated code.

## RED/GREEN Evidence

- RED: Full Verification `28584961406` failed in `apps/web/src/layout-item-z-index.test.ts` because `set_node_layout_item` stripped `z_index` and hit-testing still preferred document order.
- GREEN: Full Verification `28585629788` passed Penpot/design gates, typecheck, web build, core tests, and Playwright CLI e2e.
- Direct browser interaction proof is covered by `apps/web/e2e/layout-item-z-index.spec.ts`: create a project, enable layout, select a child, set `inspector-layout-item-z-index` to `7`, then verify Dev panel CSS and structure include the value.

## Files

- Modified: `packages/renderer/src/index.ts`
- Modified: `apps/server/src/storage.ts`
- Modified: `crates/editor-core/src/model.rs`
- Modified: `crates/editor-core/bindings/NodeLayoutItem.ts`
- Modified: `apps/server/src/mcp.ts`
- Modified: `apps/server/src/layout.ts`
- Modified: `apps/server/src/code-export.ts`
- Added: `apps/server/src/code-export-z-index.test.ts`
- Modified: `apps/web/src/editor-state.ts`
- Added: `apps/web/src/layout-item-z-index.test.ts`
- Modified: `apps/web/src/App.tsx`
- Added: `apps/web/e2e/layout-item-z-index.spec.ts`
- Modified: `docs/product/penpot-maturity-benchmark.md`
- Modified: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Add z-index to the saved layout-item contract

- [x] Extend renderer, server storage, Rust model, generated binding, and MCP schema with optional `z_index`.
- [x] Normalize finite z-index values to integers and drop missing or invalid values.
- [x] Add focused unit coverage that persists `layout_item.z_index` through editor commands and server code-export structures.

## Task 2: Make canvas paint and hit-test order respect z-index

- [x] Add a failing web regression where overlapping siblings keep document order for equal z-index but a higher `z_index` paints later and wins selection.
- [x] Implement a stable same-parent paint order helper without mutating saved child order.
- [x] Use the same order for root page children and nested children.

## Task 3: Expose z-index in the human editor

- [x] Add a Korean-first Inspector layout-item numeric control for z-index.
- [x] Persist changes through the existing `set_node_layout_item` and server `set_layout_item` path.
- [x] Allow clearing the input to remove the z-index override.

## Task 4: Export z-index for developer handoff

- [x] Emit `z-index: <value>;` in generated CSS when a node has `layout_item.z_index`.
- [x] Preserve the value in selected-layer structure metadata.
- [x] Add Playwright e2e coverage that sets z-index in the Inspector and verifies Dev panel CSS/structure.

## Task 5: Document and verify

- [x] Update the Penpot maturity benchmark to record layout-item z-index as closed and keep deeper layout gaps explicit.
- [x] Mark this plan active in `PLAN_STATUS.md`, then complete it after PR verification.
- [x] Run Full Verification on the PR branch head.
- [x] Record direct Playwright CLI interaction notes and remaining limitations in the PR body.
