# Penpot Layout Item Z-Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot/CSS-inspired layout-item z-index semantics so flex/grid children can control their paint and hit-test order while remaining inspectable, agent-editable, persisted, and exportable.

**Architecture:** Adapt Penpot flexible-layout positioning to Layo by extending the existing `layout_item` contract with optional integer `z_index`. Keep document child order stable as the fallback order, and sort only the render/export paint path by effective z-index within the same parent.

**Tech Stack:** TypeScript renderer contracts, web editor reducer/canvas, Fastify server storage and MCP schemas, Rust serde model and generated bindings, code export, Vitest, Playwright CLI e2e, GitHub Actions verification.

---

## Penpot Maturity Check

Penpot Flexible Layout documentation lists `z-index` as a flex child positioning property and frames flex/grid output around CSS standards. Layo will **adapt** that capability as `layout_item.z_index` instead of adding a separate stacking model. The field belongs to saved layout-item metadata because it affects visible canvas order, selected-layer handoff, and agent-generated code.

## Files

- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/bindings/NodeLayoutItem.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/layout.ts`
- Modify: `apps/server/src/code-export.ts`
- Modify: `apps/server/src/code-export.test.ts`
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Add z-index to the saved layout-item contract

- [ ] Extend renderer, server storage, Rust model, generated binding, and MCP schema with optional `z_index`.
- [ ] Normalize finite z-index values to integers and drop missing or invalid values.
- [ ] Add focused unit coverage that persists `layout_item.z_index` through editor commands and server code-export structures.

## Task 2: Make canvas paint and hit-test order respect z-index

- [ ] Add a failing web regression where overlapping siblings keep document order for equal z-index but a higher `z_index` paints later and wins selection.
- [ ] Implement a stable same-parent paint order helper without mutating saved child order.
- [ ] Use the same order for root page children and nested children.

## Task 3: Expose z-index in the human editor

- [ ] Add a Korean-first Inspector layout-item numeric control for z-index.
- [ ] Persist changes through the existing `set_node_layout_item` and server `set_layout_item` path.
- [ ] Allow clearing the input to remove the z-index override.

## Task 4: Export z-index for developer handoff

- [ ] Emit `z-index: <value>;` in generated CSS when a node has `layout_item.z_index`.
- [ ] Preserve the value in selected-layer structure metadata.
- [ ] Add Playwright e2e coverage that sets z-index in the Inspector and verifies Dev panel CSS/structure.

## Task 5: Document and verify

- [ ] Update the Penpot maturity benchmark to record layout-item z-index as closed and keep deeper layout gaps explicit.
- [ ] Mark this plan active in `PLAN_STATUS.md`, then complete it after PR verification.
- [ ] Run focused tests, Full Verification, Storage Restore Drill, and Storage Backup Retention on the PR head.
- [ ] Record direct Playwright CLI interaction notes and remaining limitations in the PR body.
