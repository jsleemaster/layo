# Multi Select Area Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Figma-like Shift-click multi-selection and drag area selection to Layo.

**Architecture:** Extend `EditorSelection` with an ordered `nodeIds` list while preserving `nodeId` as the primary selection for existing commands. Add pure editor-state helpers for toggle and bounds selection, then route Shift-click and empty-canvas drag interactions through `App.tsx`. Render a DOM area selection overlay so Playwright and direct live UI verification can prove the visible behavior.

**Tech Stack:** React 19, react-konva/Konva, Vitest, Playwright CLI, TypeScript.

## Global Constraints

- Browser debugging and visual verification must use Playwright CLI.
- Editor/browser behavior changes require direct live UI interaction verification after automated checks.
- User-facing web UI stays Korean-first.
- Do not add dependencies.
- Do not implement multi-node move, align/distribute, copy/paste, snap guides, or rotation-aware marquee geometry in this slice.
- Preserve existing single-selection behavior and existing root workspace changes.

---

### Task 1: Multi-Selection State Helpers

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

**Interfaces:**
- Produces: `EditorSelection.nodeIds: string[]`
- Produces: `toggleSelection(state: EditorState, nodeId: string): EditorState`
- Produces: `setMultiSelection(state: EditorState, nodeIds: string[], primaryNodeId?: string | null): EditorState`
- Produces: `selectNodesInBounds(state: EditorState, bounds: SelectionBounds, mode?: "replace" | "add"): EditorState`

- [x] **Step 1: Write failing state tests**

Add tests for:

```ts
test("tracks primary and multi-selected nodes together", () => {
  const selected = setSelection(createEditorState(sampleDocument()), "text-1");

  expect(selected.selection.nodeId).toBe("text-1");
  expect(selected.selection.nodeIds).toEqual(["text-1"]);
});

test("toggles nodes into and out of multi-selection", () => {
  const initial = setSelection(createEditorState(sampleDocument()), "text-1");

  const added = toggleSelection(initial, "frame-1");
  expect(added.selection.nodeId).toBe("frame-1");
  expect(added.selection.nodeIds).toEqual(["text-1", "frame-1"]);

  const removed = toggleSelection(added, "frame-1");
  expect(removed.selection.nodeId).toBe("text-1");
  expect(removed.selection.nodeIds).toEqual(["text-1"]);
});

test("selects fully enclosed nodes in document bounds without selecting their parent frame", () => {
  const document = sampleDocumentWithTopLevelRectangle();

  const selected = selectNodesInBounds(createEditorState(document), {
    x: 150,
    y: 110,
    width: 300,
    height: 150
  });

  expect(selected.selection.nodeId).toBe("rectangle-1");
  expect(selected.selection.nodeIds).toEqual(["text-1", "rectangle-1"]);
});
```

- [x] **Step 2: Verify tests fail**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "multi-selection|fully enclosed"
```

Expected: FAIL because `nodeIds`, `toggleSelection`, and `selectNodesInBounds` do not exist.

- [x] **Step 3: Implement state helpers**

Add selection normalization helpers that keep only existing node ids, preserve insertion order, and derive `nodeId` from the primary id or the last selected id. Add area-selection collection using document-space node bounds and full containment. Skip descendants of component instances.

- [x] **Step 4: Verify tests pass**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "multi-selection|fully enclosed"
```

Expected: PASS.

### Task 2: App Shift-Click And Area Selection Routing

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Consumes: `toggleSelection`, `selectNodesInBounds`, `selection.nodeIds`
- Produces: `data-testid="area-selection-box"` DOM overlay while dragging.

- [x] **Step 1: Write failing Playwright test**

Add a test named `Figma-like multi-selection supports Shift-click and area selection`.

Expected user flow:
- reset sample file
- click `헤드라인`
- click `사각형 만들기`
- Shift-click `헤드라인`
- expect `헤드라인` and `사각형 3` layer buttons to have `is-selected`
- expect inspector text `2개 레이어 선택됨`
- press Escape and see empty selection message
- drag an empty-canvas area around the text and rectangle
- expect `area-selection-box` to appear while dragging
- release and expect the same two layers selected

- [x] **Step 2: Verify Playwright test fails**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "Figma-like multi-selection" --reporter=line
```

Expected: FAIL because Shift-click and the area selection box are not implemented.

- [x] **Step 3: Implement UI routing**

Update `renderNode` and layer-list buttons to call `onSelect(nodeId, additive)` where additive is true when Shift is held. Render selected outlines for every id in `selection.nodeIds`, but render the resize handle only for the primary selected node. Add stage mouse handlers that start/update/finish area selection from empty canvas drags. Render a DOM overlay for the active selection rectangle.

- [x] **Step 4: Verify Playwright test passes**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "Figma-like multi-selection" --reporter=line
```

Expected: PASS.

### Task 3: Documentation, Regression Checks, Direct UI Verification

**Files:**
- Modify: `docs/product/figma-core-interaction-rules.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update product docs**

Record that Shift-click and drag area selection are adopted for this slice, while multi-node move/align/distribute remain next work.

- [x] **Step 2: Run focused and full checks**

Run:

```bash
git diff --check
pnpm --filter @layo/web test -- src/editor-state.test.ts
pnpm test:e2e
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e:collab
```

Expected: PASS.

- [x] **Step 3: Run direct live UI interaction pass**

Using Playwright CLI against `http://127.0.0.1:5173/`, directly perform:
- click `헤드라인`
- click `사각형 만들기`
- Shift-click `헤드라인`
- drag an empty-canvas selection rectangle around both nodes
- record visible selected layer count and screenshot path

- [x] **Step 4: Commit, push, PR, merge**

Stage only intended files, commit, push `codex/multi-select-area-selection`, open PR, and merge after checks or explicit policy override.
