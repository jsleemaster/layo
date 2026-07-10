# Penpot First-Class Path Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Penpot path-as-image bridge with first-class, editable path nodes that preserve geometry and winding semantics across import, deterministic agent edits, browser node editing, validation, undo/redo, inspect, and artifact export.

**Architecture:** Add a stable `path` node kind and `{ type: "path", path_data, fill_rule }` content contract to the Rust-owned document model and generated TypeScript bindings. Penpot imports map path shapes directly into that contract without synthesizing image assets. The web editor renders path content with Konva, exposes node editing through a dedicated path editor state, and persists mutations through one deterministic `set_path_data` command shared by HTTP and MCP.

**Tech Stack:** Rust/serde/ts-rs, TypeScript, Fastify, MCP SDK/Zod, React, react-konva/Konva.Path, Vitest, cargo test, Playwright CLI.

## Global Constraints

- Penpot is the open-source product reference: https://help.penpot.app/user-guide/designing/layers/ and https://github.com/penpot/penpot.
- Decision: adopt first-class editable paths; adapt persistence through Layo's deterministic local-first Rust model and typed agent commands.
- The existing SVG image bridge remains readable for backward compatibility, but new Penpot path imports must not create image assets.
- User-facing UI remains Korean-first.
- Every mutation supports inspect, dry-run, apply, validate, change summary, undo/redo, and MCP/HTTP parity.
- Deployment is lower priority and is not a merge gate.
- Do not claim boolean-operation parity in this plan; non-destructive union/difference/intersection/exclusion is the next path-system plan after direct path editing lands.

---

### Task 1: First-Class Path Document Contract

**Files:**
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/src/context.rs`
- Modify generated bindings: `crates/editor-core/bindings/NodeKind.ts`
- Modify generated bindings: `crates/editor-core/bindings/NodeContent.ts`
- Modify: `packages/renderer/src/index.ts`
- Test: `crates/editor-core/src/model.rs`
- Test: `packages/renderer/src/index.test.ts`

**Interfaces:**
- Produces: `NodeKind::Path` / `RendererNode.kind = "path"`.
- Produces: `NodeContent::Path { path_data: String, fill_rule: PathFillRule }`.
- Produces: `PathFillRule = "nonzero" | "evenodd"`.

- [ ] **Step 1: Write RED Rust and renderer round-trip tests**

Assert that this JSON round-trips without field loss:

```json
{
  "kind": "path",
  "content": {
    "type": "path",
    "path_data": "M0 0 H100 V100 H0 Z",
    "fill_rule": "evenodd"
  }
}
```

Run: `cargo test -p editor-core path_node_round_trip`
Expected: FAIL because `NodeKind::Path` and `NodeContent::Path` do not exist.

Run: `pnpm --filter @layo/renderer test -- path`
Expected: FAIL because `RendererNode` rejects `kind: "path"`.

- [ ] **Step 2: Add the path model types**

Add these serde/ts-rs contracts and include `Path` in `NodeKind`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PathFillRule {
    Nonzero,
    Evenodd,
}

#[serde(tag = "type", rename_all = "snake_case")]
pub enum NodeContent {
    Empty,
    Text { /* existing fields */ },
    Image { /* existing fields */ },
    Path {
        path_data: String,
        fill_rule: PathFillRule,
    },
}
```

Mirror the contract in `RendererNode["content"]`:

```ts
| {
    type: "path";
    path_data: string;
    fill_rule: "nonzero" | "evenodd";
  }
```

- [ ] **Step 3: Validate and regenerate bindings**

Run: `cargo test -p editor-core`
Expected: PASS and ts-rs binding tests regenerate `NodeKind.ts`, `NodeContent.ts`, and `PathFillRule.ts`.

Run: `pnpm --filter @layo/renderer test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/editor-core packages/renderer
git commit -m "feat: add first-class path document nodes"
```

### Task 2: Penpot Path Import Without Image Synthesis

**Files:**
- Modify: `apps/server/src/external-migration-base.ts`
- Modify: `apps/server/src/external-migration.ts`
- Test: `apps/server/src/external-migration.test.ts`
- Modify: `apps/web/e2e/external-migration-penpot-path.spec.ts`

**Interfaces:**
- Consumes: `RendererNode.kind = "path"` and path content from Task 1.
- Produces: imported Penpot path nodes with source fill, stroke, opacity, bounds, path data, and fill rule.
- Produces: zero imported assets for path-only Penpot files.

- [ ] **Step 1: Write the focused RED import test**

Create a Penpot ZIP fixture with one frame and one path. Assert:

```ts
expect(imported.file.pages[0].children[0].children[0]).toMatchObject({
  id: `penpot-${pathId}`,
  kind: "path",
  style: {
    fill: "#14b8a6",
    stroke: "#0f172a",
    stroke_width: 2,
    opacity: 0.8
  },
  content: {
    type: "path",
    path_data: "M4 20L16 4l12 16Z",
    fill_rule: "nonzero"
  }
});
expect(imported.importedAssets).toEqual([]);
```

Run: `pnpm --filter @layo/server test -- external-migration.test.ts`
Expected: FAIL because the mapper returns `kind: "image"` and a synthesized SVG asset.

- [ ] **Step 2: Map Penpot paths directly**

In the Penpot shape mapper, return:

```ts
{
  id: `penpot-${storageIdSegment(sourceId)}`,
  kind: "path",
  name,
  transform: { x, y, rotation },
  size: { width, height },
  style: {
    fill: firstVisibleSolidFill(shape) ?? "transparent",
    stroke: firstVisibleSolidStroke(shape),
    stroke_width: strokeWidthForShape(shape),
    opacity
  },
  content: {
    type: "path",
    path_data: pathDataForShape(shape),
    fill_rule: pathFillRuleForShape(shape) ?? "nonzero"
  },
  children: []
}
```

Remove only path-specific synthesized asset creation. Keep old saved image nodes readable.

- [ ] **Step 3: Update browser import proof**

Change both simple and even-odd path e2e expectations from generic image nodes to first-class path nodes. Assert no `/assets/penpot-asset-*-path-svg` dependency and verify the layer remains visible.

Run: `pnpm exec playwright test apps/web/e2e/external-migration-penpot-path.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/external-migration-base.ts apps/server/src/external-migration.ts apps/server/src/external-migration.test.ts apps/web/e2e/external-migration-penpot-path.spec.ts
git commit -m "feat: import Penpot paths as editable nodes"
```

### Task 3: Deterministic Path Mutation Through HTTP and MCP

**Files:**
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/src/agent-control.test.ts`
- Test: `apps/server/src/mcp-path.test.ts`
- Modify: `apps/server/src/code-export.ts`

**Interfaces:**
- Produces: `{ type: "set_path_data"; nodeId; pathData; fillRule }`.
- Produces: inspect `pathData` and `fillRule` on path summaries.
- Produces: code-export structure content `{ type: "path", pathData, fillRule }`.

- [ ] **Step 1: Write RED dry-run/apply and MCP tests**

Use this command:

```ts
{
  type: "set_path_data",
  nodeId: "penpot-path-1",
  pathData: "M0 0 H120 V80 H0 Z",
  fillRule: "evenodd"
}
```

Assert dry-run leaves storage unchanged, apply persists, validation is `ok`, `changeSummary.updatedNodeIds` contains the path, inspect returns the new content, and MCP accepts the same payload.

Run: `pnpm --filter @layo/server test -- agent-control.test.ts mcp-path.test.ts`
Expected: FAIL because the command and MCP schema do not exist.

- [ ] **Step 2: Implement one normalized command path**

Trim `pathData`, reject empty data, reject non-path nodes, normalize `fillRule` to the two enum values, and reuse the existing batch clone/validate/change-summary transaction.

- [ ] **Step 3: Verify server surfaces**

Run: `pnpm --filter @layo/server test && pnpm --filter @layo/server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src
git commit -m "feat: edit path data through agent commands"
```

### Task 4: Canvas and Artifact Fidelity

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/node-artifacts.ts`
- Test: `apps/web/src/node-artifacts-path.test.ts`
- Test: `apps/web/e2e/external-migration-penpot-path.spec.ts`

**Interfaces:**
- Consumes: first-class path content from Tasks 1-3.
- Produces: `Konva.Path` rendering using `data`, fill, stroke, strokeWidth, opacity, and even-odd fill.
- Produces: SVG/PDF/PNG/JPEG/WEBP export directly from path content.

- [ ] **Step 1: Write RED artifact and visible canvas tests**

Assert SVG emits `<path d="...">` with `fill-rule="evenodd"`; PDF emits path commands plus `f*`; browser canvas shows non-empty pixels inside the path and background pixels outside it.

Run: `pnpm --filter @layo/web test -- node-artifacts-path.test.ts`
Expected: FAIL because artifacts only discover path data through old image vector metadata.

- [ ] **Step 2: Render and export first-class paths**

Import `Path as KonvaPath` from `react-konva`. Render first-class path nodes before rectangle fallback, and teach `node-artifacts.ts` to read path data from `node.content.type === "path"`.

- [ ] **Step 3: Verify canvas and artifact behavior**

Run: `pnpm --filter @layo/web test && pnpm --filter @layo/web build`
Expected: PASS.

Run: `pnpm exec playwright test apps/web/e2e/external-migration-penpot-path.spec.ts --reporter=line`
Expected: PASS with visible canvas pixel checks and artifact checks.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src apps/web/e2e/external-migration-penpot-path.spec.ts
git commit -m "feat: render and export first-class paths"
```

### Task 5: Direct Path Node Editing, Undo, and Keyboard Access

**Files:**
- Create: `apps/web/src/path-editor.ts`
- Create: `apps/web/src/path-editor.test.ts`
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/app.css`
- Test: `apps/web/e2e/path-editing.spec.ts`

**Interfaces:**
- Produces: parsed path editor nodes with anchor, incoming control, outgoing control, closed state, and selected indices.
- Produces: enter edit mode by double-click or `Enter`; exit by `Escape`.
- Produces: drag anchors/handles, add node with `Shift++`, delete with `Delete`, corner with `X`, curve with `C`, join with `J`, merge with `Meta/Ctrl+J`, separate with `K`, move mode with `M`.
- Persists each completed interaction through `set_path_data` and records one undo entry.

- [ ] **Step 1: Write RED parser and interaction tests**

Cover M/L/H/V/C/Q/Z parsing, anchor movement, cubic control movement, close/open path state, command serialization, one undo/redo cycle, and keyboard focus behavior.

Run: `pnpm --filter @layo/web test -- path-editor.test.ts`
Expected: FAIL because the path editor module does not exist.

- [ ] **Step 2: Implement path editor state and geometry**

Use structured command arrays internally and serialize to SVG path data only at persistence boundaries. Keep unsupported A/S/T commands renderable but read-only until converted by an explicit edit action.

- [ ] **Step 3: Add Korean-first viewport controls**

Use icon buttons with tooltips for corner, curve, join, merge, and separate. Do not add explanatory feature text. Keep handles stable-size and keyboard focusable.

- [ ] **Step 4: Run direct Playwright CLI interaction proof**

Run: `pnpm exec playwright test apps/web/e2e/path-editing.spec.ts --reporter=line`
Expected: PASS after clicking a path, pressing `Enter`, dragging an anchor and a bezier handle, pressing `Delete`, undoing and redoing, and verifying visible geometry plus persisted `path_data`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/e2e/path-editing.spec.ts
git commit -m "feat: add direct path node editing"
```

### Task 6: Full Verification and Maturity Evidence

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-first-class-path-editing-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Records: Penpot reference, adopt decision, gate mapping, RED/GREEN run IDs, direct Playwright actions, and remaining boolean-operation gap.

- [ ] **Step 1: Run complete verification**

Run:

```bash
pnpm typecheck
pnpm test
cargo test --workspace
pnpm --filter @layo/web build
pnpm exec playwright test apps/web/e2e/external-migration-penpot-path.spec.ts apps/web/e2e/path-editing.spec.ts --reporter=line
```

Expected: all commands exit 0 with zero failed tests.

- [ ] **Step 2: Perform completion audit**

Verify first-class path import, no path SVG asset synthesis, inspect/dry-run/apply/validate/change summary, MCP/HTTP parity, undo/redo, keyboard path editing, canvas rendering, and SVG/PDF/raster output from current main-compatible state.

- [ ] **Step 3: Update maturity docs and commit**

```bash
git add docs/product docs/superpowers
git commit -m "docs: record first-class Penpot path maturity"
```
