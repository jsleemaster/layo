# Editor MVP Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current rendered shell into a directly usable first editor MVP with selectable nodes, drag movement, resize handles, inspector editing, undo/redo, pan/zoom, create-node actions, persistence APIs, and editable MCP tools.

**Architecture:** Keep document mutations as explicit commands with inverses. The web app uses a pure TypeScript editor-state module for fast UI tests and deterministic interaction behavior; the Rust core remains the authoritative model direction and gets matching command coverage for geometry/style/text mutations. The local server persists document JSON and exposes the same edit surface over HTTP and MCP.

**Tech Stack:** React 19, Vite, React Konva, Vitest, Playwright CLI, Fastify, MCP SDK, TypeScript, Rust editor-core.

---

## MVP Acceptance Criteria

- A user can select a node from the layer panel or canvas.
- A selected node can be moved by dragging it on the canvas.
- A selected node can be resized with a visible resize handle.
- The inspector can edit `x`, `y`, `width`, `height`, fill, and text content where applicable.
- Undo and redo reverse and restore move, resize, style, text, and create-node commands.
- Canvas zoom and pan controls visibly affect the stage.
- The app can create a rectangle and text node inside the first page.
- The server can persist document edits through HTTP.
- MCP exposes write tools for create node, update geometry, set fill, and update text.
- Verification is direct: unit tests, typecheck, production build, and a Playwright CLI browser flow against the running app.

## File Structure

- Modify `apps/web/src/App.tsx`: compose panels, toolbar, canvas, inspector, and command dispatch.
- Create `apps/web/src/editor-state.ts`: pure document lookup, command application, undo/redo, viewport, and creation helpers.
- Create `apps/web/src/editor-state.test.ts`: TDD coverage for command behavior.
- Modify `apps/web/src/styles.css`: editor layout, toolbar, inspector, selected layer state, and controls using design tokens.
- Modify `apps/server/src/storage.ts`: add persistent write and document edit helpers.
- Modify `apps/server/src/storage.test.ts`: verify write/update behavior.
- Modify `apps/server/src/http.ts`: add PATCH/POST edit endpoints.
- Modify `apps/server/src/http.test.ts`: verify edit endpoints change persisted files.
- Modify `apps/server/src/mcp.ts`: add write tools backed by storage edit helpers.
- Modify `crates/editor-core/src/commands.rs`: add style/text command coverage if needed for parity.
- Modify `crates/editor-core/tests/commands_and_context.rs`: verify command inverses for added Rust commands.

## Task 1: Web Command Model

**Files:**
- Create: `apps/web/src/editor-state.ts`
- Create: `apps/web/src/editor-state.test.ts`

- [ ] **Step 1: Write failing command tests**

Add tests that prove:

```ts
const state = createEditorState(document);
const moved = executeEditorCommand(state, {
  type: "update_node_geometry",
  nodeId: "text-1",
  patch: { x: 72, y: 96 }
});
expect(findNodeById(moved.document, "text-1")?.transform).toMatchObject({ x: 72, y: 96 });
expect(findNodeById(undo(moved).document, "text-1")?.transform).toMatchObject({ x: 32, y: 40 });
```

Run:

```bash
pnpm --filter @layo/web test -- editor-state.test.ts
```

Expected: FAIL because `editor-state.ts` does not exist.

- [ ] **Step 2: Implement minimal pure command model**

Implement:

```ts
createEditorState(document)
findNodeById(document, nodeId)
executeEditorCommand(state, command)
undo(state)
redo(state)
setSelection(state, nodeId)
setViewport(state, patch)
```

Commands:

```ts
update_node_geometry
set_fill
update_text
create_node
```

- [ ] **Step 3: Verify command tests pass**

Run:

```bash
pnpm --filter @layo/web test -- editor-state.test.ts
```

Expected: PASS.

## Task 2: Interactive Canvas UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/editor-state.test.ts`

- [ ] **Step 1: Add failing state-level tests for create, resize clamp, zoom, and pan**

Add tests that verify rectangle/text creation, resize minimums, zoom range, and pan offsets.

Run:

```bash
pnpm --filter @layo/web test -- editor-state.test.ts
```

Expected: FAIL until command support is complete.

- [ ] **Step 2: Implement UI bindings**

Update `App.tsx` so the UI has:

```text
toolbar: select tool, pan tool, create rectangle, create text, undo, redo, zoom out, zoom in
left panel: layer buttons that select nodes
canvas: selectable/draggable nodes, selected outline, bottom-right resize handle
right inspector: x, y, width, height, fill, text value
```

- [ ] **Step 3: Verify web unit tests pass**

Run:

```bash
pnpm --filter @layo/web test
```

Expected: PASS.

## Task 3: Persistent Server Edits

**Files:**
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/http.test.ts`

- [ ] **Step 1: Write failing storage and HTTP tests**

Add tests proving:

```ts
await storage.updateNodeGeometry("sample-file", "text-1", { x: 88, y: 99 });
expect((await storage.readFile("sample-file")).pages[0].children[0].children[0].transform)
  .toMatchObject({ x: 88, y: 99 });
```

and HTTP:

```ts
await server.inject({
  method: "PATCH",
  url: "/files/sample-file/nodes/text-1/geometry",
  payload: { x: 88, y: 99 }
});
```

Run:

```bash
pnpm --filter @layo/server test
```

Expected: FAIL until storage/http edit methods exist.

- [ ] **Step 2: Implement storage edit helpers and HTTP routes**

Add:

```text
FileStorage.writeFile(fileId, document)
FileStorage.updateNodeGeometry(fileId, nodeId, patch)
FileStorage.setNodeFill(fileId, nodeId, fill)
FileStorage.updateText(fileId, nodeId, value)
FileStorage.createNode(fileId, parentId, input)
```

Add HTTP routes:

```text
PATCH /files/:fileId/nodes/:nodeId/geometry
PATCH /files/:fileId/nodes/:nodeId/fill
PATCH /files/:fileId/nodes/:nodeId/text
POST /files/:fileId/nodes
```

- [ ] **Step 3: Verify server tests pass**

Run:

```bash
pnpm --filter @layo/server test
```

Expected: PASS.

## Task 4: MCP Write Tools

**Files:**
- Modify: `apps/server/src/mcp.ts`

- [ ] **Step 1: Add MCP write tools**

Add:

```text
create_rectangle
create_text
update_node_geometry
set_fill
update_text
```

Each tool returns structured JSON with `fileId`, `nodeId`, and the updated node or created node.

- [ ] **Step 2: Verify server typecheck covers MCP schemas**

Run:

```bash
pnpm --filter @layo/server typecheck
```

Expected: PASS.

## Task 5: Rust Command Parity

**Files:**
- Modify: `crates/editor-core/src/commands.rs`
- Modify: `crates/editor-core/tests/commands_and_context.rs`

- [ ] **Step 1: Write failing Rust command tests**

Add tests proving style and text commands return inverse commands and mutate the document.

Run:

```bash
cargo test -p editor-core commands_and_context
```

Expected: FAIL until commands exist.

- [ ] **Step 2: Implement Rust commands**

Add:

```rust
Command::SetFill { node_id, fill }
Command::UpdateText { node_id, value }
```

- [ ] **Step 3: Verify Rust command tests pass**

Run:

```bash
cargo test -p editor-core commands_and_context
```

Expected: PASS.

## Task 6: Direct Runtime Verification

**Files:**
- No source files unless verification finds defects.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm --filter @layo/web build
```

Expected: PASS.

- [ ] **Step 2: Run the local app**

Start:

```bash
pnpm --filter @layo/server dev
pnpm --filter @layo/web dev
```

- [ ] **Step 3: Verify with Playwright CLI**

Use Playwright CLI, not inferred testing:

```bash
npx playwright screenshot --wait-for-timeout=1000 http://127.0.0.1:5173 /tmp/layo-mvp.png
```

Then run a Playwright CLI script that:

```text
opens the app
selects Headline
changes x/y/width/height in inspector
uses undo and redo
clicks create rectangle
clicks zoom in
takes a screenshot
```

Expected: visible UI reflects each action, and screenshot is non-empty.

## Completion Rule

Do not call this MVP complete unless the source contains the features above and the full checks plus Playwright CLI runtime verification have been run successfully against the current worktree.
