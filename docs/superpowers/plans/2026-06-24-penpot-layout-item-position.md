# Penpot Layout Item Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the next Penpot Flex layout gap by adding saved `layout_item.position` semantics so selected children can stay in the flex flow with `static` or be excluded from auto layout with `absolute`.

**Architecture:** Keep the existing single-line auto-layout solver and extend `layout_item` with a `position: "static" | "absolute"` discriminator. Static children continue to participate in flow exactly as today; absolute children keep their existing transform and size, are skipped by flow spacing, and remain inspectable/mutable through editor, MCP/HTTP, code export, Rust JSON, and Inspector controls.

**Tech Stack:** TypeScript, React, Vitest, Playwright CLI, Rust serde/ts-rs, existing Layo layout helpers.

**Process note:** DietrichGebert/ponytail was evaluated on 2026-06-24. It is an agent-rule/plugin project, not a Layo runtime dependency, so this slice applies its useful part as a minimal-change rule in `AGENTS.md`: reuse existing primitives first while keeping validation and Playwright proof intact.

---

## Penpot Reference

Penpot Flexible Layouts, checked 2026-06-24:

- Position static is the default for flex elements and includes the element in the flex flow.
- Absolute positioning excludes the element from the Flex layout flow and allows free positioning inside the layout container.
- Penpot documents z-index alongside positioning, but this slice only adopts the static/absolute flow behavior.

Source: https://help.penpot.app/user-guide/designing/flexible-layouts/

## Scope

This plan adopts:

- `layout_item.position`: `"static" | "absolute"` on `RendererNode` / `DesignNode` / Rust `NodeLayoutItem`.
- `set_node_layout_item` and `set_layout_item` support for position while preserving existing margins.
- Auto-layout solver support that excludes absolute children from flow and stretch resizing.
- Inspector control for selected node position.
- Agent inspect/export surfaces that expose `layout_item.position`.

This plan intentionally defers:

- z-index ordering,
- absolute-position drag handles or special overlays,
- wrap and align-content,
- row/column gap split,
- fit/fill layout sizing,
- CSS Grid.

## Files

- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/layout.ts`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/code-export.test.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/src/lib.rs`
- Modify: `crates/editor-core/tests/document_model.rs`
- Modify generated bindings under `crates/editor-core/bindings/`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

### Task 1: RED Web Layout Position Coverage

- [x] **Step 1: Add failing editor-state tests**

Add a test in `apps/web/src/editor-state.test.ts` proving that an absolute child is excluded from vertical flow and keeps its geometry:

```ts
test("auto layout excludes absolute layout items from flow", () => {
  const document = sampleDocument();
  const frame = findNodeById(document, "frame-1");
  expect(frame).toBeTruthy();
  frame!.layout = {
    mode: "auto",
    direction: "vertical",
    gap: 12,
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    align_items: "start",
    justify_content: "start"
  };
  const text = findNodeById(document, "text-1");
  expect(text).toBeTruthy();
  text!.layout_item = { position: "absolute", margin: { top: 10, right: 8, bottom: 14, left: 6 } };
  text!.transform = { x: 140, y: 160, rotation: 0 };
  frame!.children.push({
    id: "rectangle-1",
    kind: "rectangle",
    name: "사각형",
    transform: { x: 0, y: 0, rotation: 0 },
    size: { width: 120, height: 40 },
    style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
    content: { type: "empty" },
    children: []
  });

  const relaid = executeEditorCommand(createEditorState(document), {
    type: "update_node_geometry",
    nodeId: "rectangle-1",
    patch: { width: 120 }
  });

  expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 140, y: 160 });
  expect(findNodeById(relaid.document, "rectangle-1")?.transform).toMatchObject({ x: 20, y: 20 });
});
```

Add a command/undo test proving `position` is persisted:

```ts
test("sets layout item position through an editor command and supports undo", () => {
  const updated = executeEditorCommand(createEditorState(sampleDocument()), {
    type: "set_node_layout_item",
    nodeId: "text-1",
    layoutItem: { position: "absolute", margin: { top: 10, right: 8, bottom: 14, left: 6 } }
  });

  expect(findNodeById(updated.document, "text-1")?.layout_item).toEqual({
    position: "absolute",
    margin: { top: 10, right: 8, bottom: 14, left: 6 }
  });

  const undone = undo(updated);
  expect(findNodeById(undone.document, "text-1")?.layout_item).toBeUndefined();
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
```

Expected: FAIL because `layout_item.position` is not typed and the solver still includes all children in flow.

### Task 2: GREEN Shared Position Contract And Solver

- [x] **Step 1: Extend TypeScript node types**

Update `NodeLayoutItem` in renderer and server storage:

```ts
export interface NodeLayoutItem {
  position?: "static" | "absolute";
  margin: LayoutSpacing;
}
```

- [x] **Step 2: Normalize position and skip absolute children**

Update web and server `normalizeNodeLayoutItem` so invalid/missing position becomes `"static"`. Update `relayoutNode` so only static children contribute to `childMetrics`, `childCount`, distributed gaps, and stretch sizing. Absolute children keep their `transform` and `size`.

- [x] **Step 3: Verify GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
```

Expected: PASS.

### Task 3: Server, Rust, Export, And UI Coverage

- [x] **Step 1: Add server command tests**

Extend `apps/server/src/storage.test.ts` so an agent sets `layout_item.position = "absolute"` on `text-1`, creates another child, and verifies `text-1` keeps its free position while the new child moves to the first flow slot.

- [x] **Step 2: Add export coverage**

Update `apps/server/src/code-export.test.ts` fixture expectations so `implementationSpec.structure.layout_item.position` appears for positioned nodes.

- [x] **Step 3: Add Rust serialization coverage**

Add `position: Option<LayoutItemPosition>` or an equivalent serde-safe Rust field to `NodeLayoutItem`, export it from `lib.rs`, regenerate bindings, and update JSON round-trip coverage for `layout_item.position`.

- [x] **Step 4: Add Inspector controls and e2e proof**

Add Korean-first `위치` control under `레이아웃 아이템` with test id `inspector-layout-item-position` and options:

- `static`: `흐름`
- `absolute`: `절대`

Add Playwright coverage that selects a frame, enables auto layout, selects a child, switches it to absolute, sets X/Y, creates another child, and verifies the absolute child keeps X/Y while the next child takes the first auto-layout position.

- [x] **Step 5: Verify full slice**

Run:

```bash
pnpm run check:penpot-maturity
pnpm --filter @layo/web test -- src/editor-state.test.ts
pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts
cargo test -p editor-core
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
cargo test --workspace
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "layout item position" --workers=1 --reporter=line
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "layout item position" --workers=1 --reporter=line


## Verification Results

Completed 2026-06-24.

- RED confirmed before implementation:
  - `pnpm --filter @layo/web test -- src/editor-state.test.ts` failed because absolute children still flowed and `position` was not preserved.
  - `pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts` failed because server auto layout still flowed absolute children.
  - `cargo test -p editor-core layout_metadata_round_trips_through_json` failed before `LayoutItemPosition` existed.
- GREEN verification passed:
  - `pnpm run check:penpot-maturity`
  - `pnpm --filter @layo/web test -- src/editor-state.test.ts`
  - `pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts`
  - `cargo test -p editor-core layout_metadata_round_trips_through_json`
  - `cargo test -p editor-core`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `cargo test --workspace`
  - `git diff --check`
  - `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "layout item position" --workers=1 --reporter=line`
  - `DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "layout item position" --workers=1 --reporter=line`
  - `pnpm test:e2e`
