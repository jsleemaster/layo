# Canvas Mouse And Keyboard Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-pass canvas mouse and keyboard interactions so users can zoom with the mouse, use standard zoom/undo/redo shortcuts, pan with arrow keys, and clear selection with Escape.

**Architecture:** Keep document mutations in `editor-state.ts` and keep browser event handling in `App.tsx`. Pointer-centered zoom is a state helper so wheel and keyboard zoom can share the same viewport math. Playwright CLI remains the rendered-browser verification path.

**Tech Stack:** React 19, react-konva/Konva, Vitest, Playwright CLI, TypeScript.

## Global Constraints

- Browser debugging and visual verification must use Playwright CLI.
- User-facing UI stays Korean-first.
- Do not add dependencies for this interaction layer.
- Do not implement destructive keyboard shortcuts such as Delete until a reviewed delete UX exists.
- Preserve existing toolbar buttons and existing document editing behavior.

---

### Task 1: Pointer-Centered Viewport Math

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

**Interfaces:**
- Consumes: `EditorState`, `setViewport`, existing viewport shape `{ scale, x, y }`.
- Produces: `zoomViewportAtPoint(state: EditorState, delta: number, point: { x: number; y: number }): EditorState`.

- [ ] **Step 1: Write the failing test**

Add a test asserting that zooming at screen point `{ x: 400, y: 300 }` changes scale while keeping the same document coordinate under the pointer.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "zooms around a viewport point"`

Expected: FAIL because `zoomViewportAtPoint` is not exported.

- [ ] **Step 3: Write minimal implementation**

Implement `zoomViewportAtPoint` by converting the pointer from screen coordinates into document coordinates before changing scale, then set `x` and `y` so that document coordinate remains under the same pointer.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @layo/web test -- src/editor-state.test.ts --grep "zooms around a viewport point"`

Expected: PASS.

### Task 2: Browser Mouse And Keyboard Actions

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Consumes: `zoomViewportAtPoint`, `panViewport`, `setViewport`, `undo`, `redo`, `setSelection`.
- Produces: wheel zoom on `.stage-frame`; window-level keyboard shortcuts that ignore input, textarea, select, and contenteditable targets.

- [ ] **Step 1: Write the failing Playwright tests**

Add e2e coverage for:
- wheel up over the canvas increases the readout from `100%` to `125%`.
- `Control+=`, `Control+-`, and `Control+0` zoom in, zoom out, and reset.
- `Escape` clears selected node inspector.
- `Control+Z` and `Control+Shift+Z` undo and redo a text edit after focus leaves the text area.

- [ ] **Step 2: Run e2e to verify it fails**

Run: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "mouse wheel and keyboard shortcuts" --reporter=line`

Expected: FAIL because the current app only supports toolbar actions.

- [ ] **Step 3: Write minimal implementation**

Add wheel handling to `stage-frame` and a `window.keydown` effect in `App.tsx`. Use the viewport center for keyboard zoom, pointer position for wheel zoom, `panViewport` for arrow keys, `setViewport(... scale: 1, x: 0, y: 0)` for reset, `undo`/`redo` for command shortcuts, and `setSelection(null)` for Escape.

- [ ] **Step 4: Run e2e to verify it passes**

Run: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "mouse wheel and keyboard shortcuts" --reporter=line`

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- Test: existing test suites only.

**Interfaces:**
- Consumes: all behavior from Tasks 1-2.
- Produces: validated local branch.

- [ ] **Step 1: Run focused checks**

Run:
```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 2: Run full checks**

Run:
```bash
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e:collab
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:
```bash
git add docs/superpowers/plans/2026-06-17-canvas-mouse-keyboard-interactions.md apps/web/src/editor-state.ts apps/web/src/editor-state.test.ts apps/web/src/App.tsx apps/web/e2e/editor-mvp.spec.ts
git commit -m "Add canvas mouse and keyboard interactions"
```
