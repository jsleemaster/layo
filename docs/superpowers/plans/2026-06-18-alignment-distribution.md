# Alignment And Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Figma-like alignment and distribution controls for multi-selected layers.

**Architecture:** Extend `editor-state.ts` with one batch geometry command and two pure helpers: `alignSelectedNodes` and `distributeSelectedNodes`. Wire Korean toolbar buttons in `App.tsx` so the UI delegates to state helpers and keeps undo/redo as one step per action.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright CLI, react-konva/Konva.

---

## Global Constraints

- Browser debugging and visual verification must use Playwright CLI.
- Use TDD: no production implementation before a failing test.
- Keep UI copy Korean-first.
- Do not add dependencies.
- Do not implement snap guides, multi-node drag, clipboard, or agent/MCP align commands in this slice.
- Preserve existing root checkout changes by working only in `.worktrees/alignment-distribution`.

### Task 1: State Helpers And Batch Geometry Command

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

- [x] **Step 1: Write failing state tests**

Add imports:

```ts
alignSelectedNodes,
distributeSelectedNodes,
setMultiSelection,
```

Add tests:

```ts
test("aligns selected nodes by document-space left edge across parents", () => {
  const initial = setMultiSelection(
    createEditorState(sampleDocumentWithTopLevelRectangle()),
    ["text-1", "rectangle-1"],
    "rectangle-1"
  );

  const aligned = alignSelectedNodes(initial, "left");

  expect(getNodeAbsolutePosition(aligned.document, "text-1")).toEqual({ x: 152, y: 120 });
  expect(findNodeById(aligned.document, "rectangle-1")?.transform).toMatchObject({ x: 152, y: 140 });
  expect(aligned.selection.nodeIds).toEqual(["text-1", "rectangle-1"]);
  expect(findNodeById(undo(aligned).document, "rectangle-1")?.transform).toMatchObject({ x: 180, y: 140 });
});

test("distributes selected nodes horizontally while keeping outer layers fixed", () => {
  const document = sampleDocumentWithTopLevelRectangle();
  document.pages[0]?.children.push({
    id: "text-2",
    kind: "text",
    name: "보조 텍스트",
    transform: { x: 760, y: 180, rotation: 0 },
    size: { width: 220, height: 44 },
    style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
    content: { type: "text", value: "보조 텍스트", font_size: 24, font_family: "Inter" },
    children: []
  });
  const initial = setMultiSelection(createEditorState(document), ["text-1", "rectangle-1", "text-2"], "text-2");

  const distributed = distributeSelectedNodes(initial, "horizontal");

  expect(getNodeAbsolutePosition(distributed.document, "text-1")).toEqual({ x: 152, y: 120 });
  expect(findNodeById(distributed.document, "rectangle-1")?.transform.x).toBe(506);
  expect(findNodeById(distributed.document, "text-2")?.transform.x).toBe(760);
  expect(distributed.selection.nodeIds).toEqual(["text-1", "rectangle-1", "text-2"]);
});
```

- [x] **Step 2: Verify state tests fail**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "aligns selected|distributes selected"
```

Expected: FAIL because `alignSelectedNodes`, `distributeSelectedNodes`, and `setMultiSelection` import usage are not fully available for this behavior.

- [x] **Step 3: Implement minimal state behavior**

Add exported types:

```ts
export type AlignmentMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributionMode = "horizontal" | "vertical";
```

Add command variant:

```ts
| {
    type: "update_nodes_geometry";
    patches: Array<{ nodeId: string; patch: GeometryPatch }>;
  }
```

Add helpers:

```ts
export function alignSelectedNodes(state: EditorState, mode: AlignmentMode): EditorState;
export function distributeSelectedNodes(state: EditorState, mode: DistributionMode): EditorState;
```

Implementation requirements:

- Use `selection.nodeIds` order.
- Compute document-space bounds.
- Convert target document-space positions back to each node's parent-relative `transform`.
- Keep selection unchanged.
- Use one `update_nodes_geometry` command so undo/redo are single-step.
- Return the original state when not enough valid layers are selected.

- [x] **Step 4: Verify state tests pass**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "aligns selected|distributes selected"
```

Expected: PASS.

### Task 2: Korean Toolbar Controls And E2E Coverage

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write failing Playwright test**

Add test `Figma-like alignment and distribution toolbar controls selected layers`.

Expected flow:

- reset sample file
- create rectangle and text
- set the second text X to `760`
- Shift-select headline, rectangle, and second text from the layer list
- click `왼쪽 정렬`
- inspect rectangle X equals `152`
- select all three again
- click `가로 분배`
- inspect rectangle X equals `506`

- [x] **Step 2: Verify Playwright test fails**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "alignment and distribution" --reporter=line
```

Expected: FAIL because toolbar buttons do not exist.

- [x] **Step 3: Wire toolbar controls**

Import `alignSelectedNodes` and `distributeSelectedNodes` in `App.tsx`.

Add toolbar buttons with these labels:

- `왼쪽 정렬`
- `가로 가운데 정렬`
- `오른쪽 정렬`
- `위쪽 정렬`
- `세로 가운데 정렬`
- `아래쪽 정렬`
- `가로 분배`
- `세로 분배`

Button enablement:

- Alignment enabled when `selectedNodeIds.length >= 2`.
- Distribution enabled when `selectedNodeIds.length >= 3`.

Button handlers:

```ts
onClick={() => updateViewportFromInteraction((current) => alignSelectedNodes(current, "left"))}
onClick={() => updateViewportFromInteraction((current) => distributeSelectedNodes(current, "horizontal"))}
```

- [x] **Step 4: Verify Playwright test passes**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "alignment and distribution" --reporter=line
```

Expected: PASS.

### Task 3: Docs, Regression, Direct UI Verification, PR

**Files:**
- Modify: `docs/product/figma-core-interaction-rules.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update docs**

Record that alignment and distribution are adopted for multi-selected layers. Keep snap guides and multi-node drag as next work.

- [x] **Step 2: Run full checks**

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

Result, 2026-06-18: PASS with `git diff --check`, `pnpm --filter @layo/web test -- src/editor-state.test.ts`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `pnpm test`, and `pnpm test:e2e:collab`.

- [x] **Step 3: Run direct headed Playwright CLI verification**

Use Playwright CLI against the actual live Vite port:

- click `헤드라인`
- create/select multiple layers
- click `왼쪽 정렬`
- click `가로 분배`
- confirm Korean toolbar labels and resulting inspector positions
- capture screenshot path

Result, 2026-06-18: PASS with `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --headed --workers=1 --reporter=line`. The direct headed run covered toolbar clicks, Shift multi-selection, keyboard shortcuts, wheel zoom/pan, marquee area selection, and component drag checks. Screenshot: `/tmp/canvas-mcp-alignment-distribution-toolbar.png`.

- [ ] **Step 4: Commit, push, PR, merge**

Stage only intended files, commit, push `codex/alignment-distribution`, open PR, and merge. If review rules block normal merge and the user has already approved authority, use admin merge.
