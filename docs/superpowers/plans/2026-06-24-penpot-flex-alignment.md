# Penpot Flex Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the first Penpot layout-maturity gap by adding Flex-like `align_items` and `justify_content` semantics to Layo auto layout across document types, web state, server agent commands, code export metadata, and Inspector controls.

**Architecture:** Extend the existing `NodeLayout` contract rather than introducing a separate layout engine. Keep the first slice single-line flex only: vertical/horizontal flow, fixed `gap`, fixed padding, cross-axis `align_items`, and main-axis `justify_content`; grid, wrap, margins, absolute positioning, and fit/fill sizing remain later Penpot-maturity gaps. Server and web relayout functions must produce the same coordinates for the same document.

**Tech Stack:** TypeScript, React, Vitest, Playwright, Rust serde/ts-rs, existing Layo layout helpers.

---

## Penpot Reference

Penpot Flexible Layouts, last checked 2026-06-24:

- Flex Layout is based on CSS Flexbox and supports direction, align, justify, gap, padding, margin, and sizing.
- Grid Layout is based on CSS Grid and remains a later maturity gap.
- Penpot Inspect exposes layout code/specifications, so Layo must keep layout metadata available through code export and MCP/HTTP inspection.

Source: https://help.penpot.app/user-guide/designing/flexible-layouts/

## Scope

This plan adopts these Penpot Flex semantics now:

- `align_items`: `start`, `center`, `end`, `stretch`
- `justify_content`: `start`, `center`, `end`, `space_between`, `space_around`, `space_evenly`

This plan intentionally defers:

- wrapping,
- row and column gap split,
- margin,
- absolute/static layout item controls,
- z-index,
- fit/fill sizing controls,
- CSS Grid.

## Files

- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/layout.ts`
- Modify: `apps/server/src/code-export.ts`
- Modify: `apps/server/src/code-export.test.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/tests/document_model.rs`
- Modify generated bindings under `crates/editor-core/bindings/`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/figma-migration-roadmap.md`

### Task 1: RED Web Layout State Coverage

- [x] **Step 1: Add failing editor-state tests**

Add tests in `apps/web/src/editor-state.test.ts` proving:

```ts
test("auto layout centers children on the cross axis and distributes them on the main axis", () => {
  const document = sampleDocument();
  const frame = findNodeById(document, "frame-1");
  if (!frame) throw new Error("frame missing");
  frame.layout = {
    mode: "auto",
    direction: "vertical",
    gap: 12,
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    align_items: "center",
    justify_content: "space_between"
  };
  frame.children.push({
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

  expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 80, y: 20 });
  expect(findNodeById(relaid.document, "rectangle-1")?.transform).toMatchObject({ x: 150, y: 220 });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
```

Expected: FAIL because `NodeLayout` does not support `align_items` or `justify_content`, or because relayout ignores them.

### Task 2: GREEN Shared Layout Contract And Solver

- [x] **Step 1: Extend TypeScript layout types**

Add to `NodeLayout` in `packages/renderer/src/index.ts` and `apps/server/src/storage.ts`:

```ts
align_items: "start" | "center" | "end" | "stretch";
justify_content: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
```

- [x] **Step 2: Extend normalization and relayout**

Update `normalizeNodeLayout`, `relayoutNode`, and undo child snapshots in both `apps/web/src/editor-state.ts` and `apps/server/src/layout.ts` so the same document produces the same child positions and stretch sizes.

- [x] **Step 3: Verify GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
```

Expected: PASS.

### Task 3: Server, Rust, Export, And UI Coverage

- [x] **Step 1: Add server and export tests**

Add coverage that agent `set_layout` accepts the new properties, applies the same layout positions, and exports them in `implementationSpec.structure.layout`.

- [x] **Step 2: Add Rust round-trip and compatibility coverage**

Update `NodeLayout` in Rust and ensure JSON with `align_items` and `justify_content` round-trips. Preserve older layout JSON by defaulting missing `align_items` and `justify_content` to `start`.

- [x] **Step 3: Add Inspector controls and e2e proof**

Add Korean-first Inspector controls for cross-axis alignment and main-axis distribution. Add a Playwright test that selects a frame, sets auto layout center/space-between, and verifies child positions through visible geometry fields or canvas-derived document state.

- [x] **Step 4: Verify full slice**

Run:

```bash
pnpm run check:penpot-maturity
pnpm --filter @layo/web test -- src/editor-state.test.ts
pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts
cargo test --workspace
pnpm typecheck
pnpm test
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "auto layout alignment" --workers=1 --reporter=line
DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "auto layout alignment controls" --workers=1 --reporter=line
```

Expected: all pass.

Actual verification on 2026-06-24:

- `pnpm run check:penpot-maturity`: passed.
- `pnpm --filter @layo/web test -- src/editor-state.test.ts`: 12 files / 82 tests passed.
- `pnpm --filter @layo/server test -- src/storage.test.ts src/code-export.test.ts`: 5 files / 41 tests passed.
- `cargo test -p editor-core`: 26 lib tests, 7 command/context tests, 7 document-model tests passed.
- `pnpm typecheck`: passed across workspace packages.
- `pnpm --filter @layo/web build`: passed.
- `pnpm test`: passed, including design/deployment/process checks, workspace tests, and `cargo test --workspace`.
- `cargo test --workspace`: passed.
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "auto layout alignment controls" --workers=1 --reporter=line`: 1 test passed.
- `DEBUG=pw:api pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "auto layout alignment controls" --workers=1 --reporter=line`: 1 test passed and logged the direct UI sequence: project creation, frame selection, Inspector layout select changes, rectangle creation, and coordinate assertions.
- Headed Playwright CLI was attempted, but the local browser target closed before interaction in this desktop environment. The headless Playwright CLI interaction pass above is the browser-visible verification evidence for this slice.

## Self-Review

Spec coverage:

- Penpot comparison captured.
- First Flex property gap selected.
- Document model, web, server, export, Rust, UI, and verification covered.

Placeholder scan:

- No TBD/TODO/fill-later language.

Type consistency:

- The same property names, `align_items` and `justify_content`, are used in TypeScript, Rust JSON, server storage, and exported structures.
