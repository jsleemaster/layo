# Figma Core Delete And Duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Figma-like selected-layer Delete/Backspace and Cmd/Ctrl+D duplicate behavior after documenting the broader Figma core interaction rules.

**Architecture:** Keep document mutations in `apps/web/src/editor-state.ts` as explicit command helpers, then route keyboard shortcuts in `apps/web/src/App.tsx`. Reuse the existing `delete_node` command for undoable deletion and add a duplicate helper that clones the selected node into the same parent with a deterministic new id and selected result.

**Tech Stack:** React 19, react-konva/Konva, Vitest, Playwright CLI, TypeScript.

## Global Constraints

- Browser debugging and visual verification must use Playwright CLI.
- Figma reference behavior comes from official Figma Help/Learn docs.
- User-facing UI stays Korean-first.
- Do not add dependencies.
- Do not implement multi-selection, clipboard paste, or snap guides in this slice.
- Do not touch unrelated dirty files in the root workspace.

---

### Task 1: Document Figma Core Interaction Rules

**Files:**
- Create: `docs/product/figma-core-interaction-rules.md`
- Modify: `docs/product/figma-feature-inventory.md`
- Modify: `docs/product/figma-migration-roadmap.md`

**Interfaces:**
- Consumes: official Figma Help/Learn sources.
- Produces: a stable product reference for core interaction parity.

- [x] **Step 1: Add product rule document**

Create `docs/product/figma-core-interaction-rules.md` with source URLs, rule matrix, current Canvas state, adoption decisions, and immediate order.

- [x] **Step 2: Link the rule document from product docs**

Add the document to the feature inventory source set and roadmap immediate implementation order so future Figma parity work starts from this rule matrix.

### Task 2: Selected Node Delete Helper

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

**Interfaces:**
- Consumes: `EditorState`, `findNodeById`, `executeEditorCommand`, existing `delete_node` command.
- Produces: `deleteSelectedNode(state: EditorState): EditorState`.

- [x] **Step 1: Write the failing test**

Add a test named `deletes the selected node and restores it with undo`:

```ts
const initial = setSelection(createEditorState(sampleDocument()), "text-1");

const deleted = deleteSelectedNode(initial);

expect(findNodeById(deleted.document, "text-1")).toBeNull();
expect(deleted.selection.nodeId).toBeNull();
expect(findNodeById(undo(deleted).document, "text-1")?.name).toBe("헤드라인");
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts --grep "deletes the selected node"`

Expected: FAIL because `deleteSelectedNode` is not exported.

- [x] **Step 3: Implement minimal helper**

Find the selected node and its parent id, then call `executeEditorCommand` with `{ type: "delete_node", parentId, node }`. Return the original state if there is no selected node, missing node, or missing parent.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts --grep "deletes the selected node"`

Expected: PASS.

### Task 3: Selected Node Duplicate Helper

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

**Interfaces:**
- Consumes: `EditorState`, `findNodeById`, `executeEditorCommand`, existing `create_node` command.
- Produces: `duplicateSelectedNode(state: EditorState): EditorState`.

- [x] **Step 1: Write the failing test**

Add a test named `duplicates the selected node into the same parent and selects the duplicate`:

```ts
const initial = setSelection(createEditorState(sampleDocument()), "text-1");

const duplicated = duplicateSelectedNode(initial);
const duplicate = findNodeById(duplicated.document, "text-1-copy-1");

expect(duplicate?.name).toBe("헤드라인 복사본");
expect(duplicate?.transform).toMatchObject({ x: 32, y: 40 });
expect(duplicated.selection.nodeId).toBe("text-1-copy-1");
expect(findNodeById(undo(duplicated).document, "text-1-copy-1")).toBeNull();
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts --grep "duplicates the selected node"`

Expected: FAIL because `duplicateSelectedNode` is not exported.

- [x] **Step 3: Implement minimal helper**

Clone the selected node, generate an unused id by appending `-copy-N`, name it with `복사본` or `복사본 N`, keep geometry unchanged for non-top-level objects, and create it in the same parent through `executeEditorCommand`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts --grep "duplicates the selected node"`

Expected: PASS.

### Task 4: Keyboard Routing

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Consumes: `deleteSelectedNode`, `duplicateSelectedNode`, existing keyboard shortcut router.
- Produces: Delete/Backspace and Cmd/Ctrl+D shortcuts outside editable fields.

- [x] **Step 1: Write failing Playwright test**

Add a test named `Figma-like edit shortcuts duplicate and delete selected layers`:

```ts
await page.getByRole("button", { name: "헤드라인" }).click();
await page.keyboard.press("Control+D");
await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
await expect(page.getByTestId("inspector-text")).toHaveValue("캔버스 MCP 에디터");

await page.keyboard.press("Backspace");
await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toHaveCount(0);
await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

await page.keyboard.press("Control+Z");
await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
```

- [x] **Step 2: Run e2e to verify it fails**

Run: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "Figma-like edit shortcuts" --reporter=line`

Expected: FAIL because the shortcuts are not wired.

- [x] **Step 3: Implement keyboard routing**

Import both helpers in `App.tsx`. In the window keydown handler, after undo/redo handling and before Escape, route Cmd/Ctrl+D to duplicate the selected node, and Delete/Backspace without command modifier to delete the selected node. Keep `isEditableKeyboardTarget` guard unchanged.

- [x] **Step 4: Run e2e to verify it passes**

Run: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "Figma-like edit shortcuts" --reporter=line`

Expected: PASS.

### Task 5: Regression Verification And PR

**Files:**
- Test existing suites only.

- [x] **Step 1: Run focused checks**

Run:

```bash
pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts
pnpm test:e2e
```

Expected: PASS.

- [x] **Step 2: Run full checks**

Run:

```bash
pnpm typecheck
pnpm --filter @canvas-mcp-editor/web build
pnpm test
pnpm test:e2e:collab
```

Expected: PASS.

- [x] **Step 3: Commit and open PR**

Run:

```bash
git add docs/product/figma-core-interaction-rules.md docs/product/figma-feature-inventory.md docs/product/figma-migration-roadmap.md docs/superpowers/plans/2026-06-17-figma-core-delete-duplicate.md apps/web/src/editor-state.ts apps/web/src/editor-state.test.ts apps/web/src/App.tsx apps/web/e2e/editor-mvp.spec.ts
git commit -m "Add Figma-like delete and duplicate shortcuts"
git push -u origin codex/figma-core-interaction-rules
gh pr create --base main --head codex/figma-core-interaction-rules --title "Add Figma core delete and duplicate shortcuts"
```

Expected: PR opens successfully. Merge only after checks and repository policy allow it, or with explicit user direction.
