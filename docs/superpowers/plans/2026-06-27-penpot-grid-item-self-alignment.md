# Penpot Grid Item Self Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-like per-grid-item horizontal and vertical self alignment to Layo.

**Architecture:** Store optional `layout_item.justify_self` and `layout_item.align_self` fields on child nodes. Grid layout solvers in web and server inherit container `justify_items` / `align_items` when those fields are unset, and override positioning or stretch sizing when the selected grid child sets them.

**Tech Stack:** TypeScript, React inspector UI, Fastify agent commands, Rust `editor-core`, ts-rs bindings, Vitest, Node test runner, Playwright CLI.

---

## Penpot Reference

- Source: Penpot Flexible Layouts, Grid Layout > Cell properties, `Align self (vertically and horizontally): Start, center, end, stretch`: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Decision: Adopt the concept, adapt it into Layo's deterministic `layout_item` metadata and MCP/HTTP command surface.
- Maturity gate: Layout maturity and developer handoff.

## Failure Case

Layo currently supports container-level grid item alignment through `layout.justify_items` and `layout.align_items`, but a selected grid child cannot override those values for itself. When the container stretches all grid children, one child cannot remain fixed-size and align to the end/center of its cell, and an AI agent cannot persist that intent in `set_layout_item`.

## File Map

- Modify: `packages/renderer/src/index.ts`
  - Add renderer-facing optional `justify_self` and `align_self` fields.
- Modify: `apps/server/src/storage.ts`
  - Add storage and agent-command `NodeLayoutItem` fields.
- Modify: `apps/server/src/mcp.ts`
  - Allow MCP `set_layout_item` to receive the new fields.
- Modify: `apps/web/src/editor-state.ts`
  - Normalize the new fields and apply them in the web grid solver.
- Modify: `apps/server/src/layout.ts`
  - Normalize the new fields and apply them in the server grid solver.
- Modify: `apps/web/src/App.tsx`
  - Add selected-grid-child inspector controls for horizontal and vertical self alignment.
- Modify: `crates/editor-core/src/model.rs`
  - Add Rust model fields and enum.
- Modify: `crates/editor-core/src/lib.rs`
  - Export the new enum.
- Modify: `crates/editor-core/bindings/NodeLayoutItem.ts`
  - Regenerate or update bindings after Rust model changes.
- Create: `crates/editor-core/bindings/LayoutSelfAlignment.ts`
  - Generated TypeScript enum binding.
- Modify: `apps/web/src/editor-state.test.ts`
  - Add deterministic web relayout coverage.
- Modify: `apps/server/src/storage.test.ts`
  - Add agent-command server relayout coverage.
- Modify: `apps/server/src/code-export.test.ts`
  - Ensure dev handoff preserves self alignment metadata.
- Modify: `crates/editor-core/tests/document_model.rs`
  - Ensure JSON round-trip preserves self alignment metadata.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI inspector coverage.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move per-item self alignment from open gap to current posture.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record the active and completed plan state.

## Acceptance Criteria

- [ ] A grid child can set `layout_item.justify_self` to `start`, `center`, `end`, or `stretch`.
- [ ] A grid child can set `layout_item.align_self` to `start`, `center`, `end`, or `stretch`.
- [ ] Missing self-alignment fields inherit container grid alignment.
- [ ] `stretch` expands only the relevant axis after margins and min/max constraints.
- [ ] Web and server relayout produce the same deterministic geometry.
- [ ] MCP/HTTP `set_layout_item` accepts and persists the fields.
- [ ] Rust JSON round-trip preserves the fields.
- [ ] Code export preserves the fields in `implementationSpec.structure.layout_item`.
- [ ] The right inspector shows the controls only for children of grid containers.
- [ ] Playwright CLI proves the visible inspector workflow and resulting geometry.

## Tasks

### Task 1: RED Coverage

**Files:**
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/code-export.test.ts`
- Modify: `crates/editor-core/tests/document_model.rs`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Create: `docs/superpowers/plans/2026-06-27-penpot-grid-item-self-alignment.md`

- [x] **Step 1: Write failing web relayout test**

Add `grid layout item self alignment overrides container stretch`. It creates a 320x160 two-column grid with container `justify_items: "stretch"` and `align_items: "stretch"`, then sets a 40x40 text child to `justify_self: "end"` and `align_self: "center"`. Expected geometry is `x=120`, `y=60`, `width=40`, `height=40`.

- [ ] **Step 2: Verify web RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "grid layout item self alignment"
```

Expected: FAIL because current grid solver stretches the child to the whole cell and ignores the new item-level fields.

- [x] **Step 3: Write failing server agent-command test**

Add `agent commands apply grid item self alignment deterministically`. It uses `set_layout_item` with `justify_self: "stretch"` and `align_self: "stretch"` while the container is `start` aligned. Expected geometry is `x=10`, `y=10`, `width=150`, `height=140`.

- [ ] **Step 4: Verify server RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "grid item self alignment"
```

Expected: FAIL because current server normalization drops the self-alignment fields and the solver leaves the child at 40x40.

- [x] **Step 5: Write failing contract and e2e tests**

Update Rust JSON and code export expectations and add a Playwright CLI inspector test for `inspector-layout-item-justify-self` and `inspector-layout-item-align-self`.

### Task 2: Implement Document Contracts

**Files:**
- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/src/lib.rs`
- Modify: `crates/editor-core/bindings/NodeLayoutItem.ts`
- Create: `crates/editor-core/bindings/LayoutSelfAlignment.ts`

- [ ] **Step 1: Add TypeScript fields**

Add to both renderer and server `NodeLayoutItem`:

```ts
justify_self?: "start" | "center" | "end" | "stretch";
align_self?: "start" | "center" | "end" | "stretch";
```

- [ ] **Step 2: Add MCP schema fields**

Add optional zod enums with the same values to `nodeLayoutItemSchema`.

- [ ] **Step 3: Add Rust enum and fields**

Add `LayoutSelfAlignment` with `Start`, `Center`, `End`, and `Stretch`, then add optional `justify_self` and `align_self` fields to `NodeLayoutItem`.

- [ ] **Step 4: Regenerate or update bindings**

Run:

```bash
cargo test -p editor-core layout_metadata_round_trips_through_json -- --nocapture
```

Expected: Rust tests pass and ts-rs bindings include `LayoutSelfAlignment`.

### Task 3: Implement Grid Solvers

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/server/src/layout.ts`

- [ ] **Step 1: Normalize self alignment**

Extend `normalizeNodeLayoutItem` to preserve valid `justify_self` and `align_self` values and omit invalid values.

- [ ] **Step 2: Apply per-item alignment**

In each grid child loop:

```ts
const justifySelf = layoutItem.justify_self ?? justifyItems;
const alignSelf = layoutItem.align_self ?? layout.align_items;
```

Use those values for stretch sizing and axis offsets.

- [ ] **Step 3: Verify focused unit tests**

Run the web and server focused tests from Task 1. Expected: PASS.

### Task 4: Implement Inspector Controls

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [ ] **Step 1: Add child-grid controls**

Inside the selected-grid-child layout item section, add two selects:

```tsx
data-testid="inspector-layout-item-justify-self"
data-testid="inspector-layout-item-align-self"
```

Each select supports `inherit`, `start`, `center`, `end`, and `stretch`.

- [ ] **Step 2: Verify Playwright CLI**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "inspector grid item self alignment overrides container stretch" --workers=1 --reporter=line
```

Expected: PASS after implementation.

### Task 5: Full Verification, PR, Merge, Cleanup

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [ ] **Step 1: Update docs**

Move per-item self alignment from open layout gap to current posture and record the plan status.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm --filter @layo/web typecheck
pnpm --filter @layo/server typecheck
pnpm typecheck
pnpm run check:penpot-maturity
cargo test -p editor-core
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

- [ ] **Step 3: Commit, push, PR, merge**

Commit with `feat: add grid item self alignment`, push, create PR, review/merge.

- [ ] **Step 4: Post-merge cleanup**

Run the repository cleanup process: sync `main`, delete merged feature branch refs, prune worktrees, remove generated artifacts, verify ports `5173` and `4317` are clear, and confirm clean status.
