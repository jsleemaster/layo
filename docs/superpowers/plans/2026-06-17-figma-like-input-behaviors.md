# Figma-Like Input Behaviors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the editor's most basic canvas input behavior with Figma expectations: selected layers nudge with arrow keys, wheel pans by default, modifier-wheel zooms, and Space-drag pans without moving selected layers.

**Architecture:** Keep geometry changes in `editor-state.ts` and keep browser event interpretation in `App.tsx`. Treat keyboard and wheel handling as input routing: if a layer is selected, arrow keys mutate the layer; if nothing is selected, arrow keys pan the viewport. Treat plain wheel as pan and modifier wheel as pointer-centered zoom.

**Tech Stack:** React 19, react-konva/Konva, Vitest, Playwright CLI, TypeScript.

## Global Constraints

- Browser debugging and visual verification must use Playwright CLI.
- Figma reference behavior comes from official Figma Help/Learn docs.
- User-facing UI stays Korean-first.
- Do not add dependencies.
- Do not implement destructive shortcuts such as Delete in this slice.
- Preserve prior wheel/keyboard tests by updating them to the Figma-like contract.

---

### Task 1: Selected-Layer Nudge State Helper

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

**Interfaces:**
- Consumes: `EditorState`, `executeEditorCommand`, selected node ids.
- Produces: `nudgeSelectedNode(state: EditorState, delta: { x: number; y: number }): EditorState`.

- [x] **Step 1: Write the failing test**

Add a test that selects `text-1`, nudges it by `{ x: 1, y: 0 }`, expects local transform `{ x: 33, y: 40 }`, and expects undo to restore `{ x: 32, y: 40 }`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "nudges the selected node"`

Expected: FAIL because `nudgeSelectedNode` is not exported.

- [x] **Step 3: Implement minimal helper**

If no node is selected, return state. If a selected node exists, call `executeEditorCommand` with `type: "update_node_geometry"` and a patch using the node's current local `transform.x/y` plus delta.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "nudges the selected node"`

Expected: PASS.

### Task 2: Figma-Like Browser Input Routing

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Consumes: `nudgeSelectedNode`, `panViewport`, `zoomViewportAtPoint`, `setViewport`, `undo`, `redo`, `setSelection`.
- Produces: Figma-like input routing for wheel, modifier-wheel, arrow keys, and Space-drag pan.

- [x] **Step 1: Write failing Playwright tests**

Add/adjust e2e coverage:
- Plain wheel keeps zoom at `100%`.
- Holding `Control` while wheeling up zooms to `125%`.
- With `헤드라인` selected, `ArrowRight` changes X from `32` to `33`; `Shift+ArrowDown` changes Y from `40` to `50`.
- With nothing selected, arrow keys pan instead of changing layer geometry.
- Holding Space and dragging on the selected text does not change selected text geometry.

- [x] **Step 2: Run e2e to verify it fails**

Run: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "Figma-like canvas input routing" --reporter=line`

Expected: FAIL because current code pans on arrow keys even with selection, zooms on plain wheel, and ignores Space-drag pan mode.

- [x] **Step 3: Implement minimal App routing**

Use selected-node state to route arrows to `nudgeSelectedNode` or `panViewport`. Change wheel handling so no modifier pans viewport and `Ctrl`/`Meta` wheel zooms. Track Space key with state/ref, disable node dragging while Space is down, and pan viewport from Stage pointer movement while Space drag is active.

- [x] **Step 4: Run e2e to verify it passes**

Run: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "Figma-like canvas input routing" --reporter=line`

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- Test existing suites only.

- [x] **Step 1: Run focused checks**

Run:
```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
pnpm test:e2e
```

Expected: PASS.

- [x] **Step 2: Run full checks**

Run:
```bash
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e:collab
```

Expected: PASS.

- [x] **Step 3: Commit**

Run:
```bash
git add docs/superpowers/plans/2026-06-17-figma-like-input-behaviors.md apps/web/src/editor-state.ts apps/web/src/editor-state.test.ts apps/web/src/App.tsx apps/web/e2e/editor-mvp.spec.ts
git commit -m "Align canvas input behavior with Figma basics"
```
