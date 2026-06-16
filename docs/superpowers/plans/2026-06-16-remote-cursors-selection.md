# Remote Cursors And Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not used because the repository instructions only allow them when explicitly authorized.

**Goal:** Show other collaboration participants' cursors and selected node outlines on top of the editor canvas.

**Architecture:** Extend shared awareness presence with a per-tab `sessionId`, document-space cursor coordinates, viewport metadata, and selected node bounds. Keep relay behavior unchanged because awareness already carries ephemeral presence. Render remote overlays as a pointer-events-none layer above the Konva stage so labels remain readable and Playwright can verify them.

**Tech Stack:** TypeScript, React, react-konva, Yjs awareness, Vitest, Playwright CLI.

---

### Task 1: Presence Contract

**Files:**
- Modify: `packages/collaboration/src/awareness.ts`
- Test: `packages/collaboration/src/awareness.test.ts`

- [ ] **Step 1: Write the failing test**

Add expectations that `createPresenceState` returns `sessionId`, `viewport`, and `selectedNodeBounds`, and that cursor/bounds coordinates are tagged as document-space.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @canvas-mcp-editor/collaboration test -- src/awareness.test.ts`
Expected: FAIL because the new fields are not in the schema yet.

- [ ] **Step 3: Write minimal implementation**

Extend `CollaborationPresence` and the zod schema with:
- `sessionId: string`
- `cursor: { x: number; y: number; space: "document" } | null`
- `viewport: { x: number; y: number; scale: number } | null`
- `selectedNodeBounds: { x: number; y: number; width: number; height: number; rotation: number; space: "document" } | null`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @canvas-mcp-editor/collaboration test -- src/awareness.test.ts`
Expected: PASS.

### Task 2: Overlay Geometry Utilities

**Files:**
- Create: `apps/web/src/collaboration/remote-overlays.ts`
- Test: `apps/web/src/collaboration/remote-overlays.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- filtering remote presence by `sessionId`, not `userId`
- converting document cursor coordinates to screen coordinates through viewport pan/zoom
- deriving selected node bounds from document geometry
- throttling cursor publishes

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/remote-overlays.test.ts`
Expected: FAIL because the utility module does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement pure helpers:
- `getRemotePresence(presence, localSessionId)`
- `documentPointToViewport(point, viewport)`
- `getSelectedNodeBounds(document, nodeId)`
- `shouldPublishCursor(previous, next, nowMs)`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/remote-overlays.test.ts`
Expected: PASS.

### Task 3: Session Identity And Presence Publishing

**Files:**
- Modify: `apps/web/src/collaboration/collab-session.ts`
- Test: `apps/web/src/collaboration/collab-session.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that a collaboration session exposes a stable local presence with a generated `sessionId`, and that provider initial presence receives the same `sessionId`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/collab-session.test.ts`
Expected: FAIL because the session does not expose local presence/session identity yet.

- [ ] **Step 3: Write minimal implementation**

Generate a local `sessionId` once per session, include it in initial presence, and expose `getLocalPresence()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/collab-session.test.ts`
Expected: PASS.

### Task 4: App Overlay Rendering

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Wire presence updates**

On pointer movement over the stage, publish document-space cursor plus viewport through the active collaboration session with throttling.

- [ ] **Step 2: Wire selection bounds**

When selection changes or synced document changes, publish selected node bounds for the local session.

- [ ] **Step 3: Render overlay**

Render remote cursor labels and remote selection outlines in an absolutely positioned overlay above the stage. Use `data-testid` attributes for e2e verification.

### Task 5: End-To-End Verification

**Files:**
- Modify: `apps/web/e2e/collaboration.spec.ts`

- [ ] **Step 1: Add e2e assertions**

In the two-browser collaboration test, move page A's pointer and select a node, then assert page B sees the remote cursor and selection outline. Pan/zoom one page and assert the remote overlay remains visible at the transformed location.

- [ ] **Step 2: Run targeted checks**

Run:
- `pnpm --filter @canvas-mcp-editor/collaboration test -- src/awareness.test.ts`
- `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/remote-overlays.test.ts src/collaboration/collab-session.test.ts`
- `pnpm typecheck`
- `pnpm test:e2e:collab`

Expected: all pass.

### Self-Review

- Spec coverage: Covers objective 3 cursor coordinates, viewport basis, selection bounds, local-user filtering, throttling, small-screen-safe overlay, and two-browser e2e verification.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Uses `sessionId`, `cursor.space`, `viewport`, and `selectedNodeBounds` consistently across shared presence and web overlay code.
