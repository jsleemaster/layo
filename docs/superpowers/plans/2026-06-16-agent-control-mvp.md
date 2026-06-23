# Agent Control MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic agent-control layer so agents can inspect, search, batch-edit, dry-run, validate, summarize, and visually verify Layo files.

**Architecture:** Put pure agent-control behavior in a new server module so storage, HTTP, and MCP share one implementation. Storage remains the persistence boundary; HTTP and MCP expose the same semantics. Playwright verifies rendered output after an HTTP agent command writes a change.

**Tech Stack:** TypeScript, Vitest, Fastify, MCP SDK, React/Vite runtime, Playwright CLI.

---

## File Structure

- Create `apps/server/src/agent-control.ts`: pure document summary, node search, validation, change summary, and batch command application.
- Modify `apps/server/src/storage.ts`: expose methods that read/write files through `agent-control.ts`.
- Modify `apps/server/src/storage.test.ts`: TDD coverage for agent inspection, search, validation, dry-run batch, persisted batch, and change summaries.
- Modify `apps/server/src/http.ts`: add `/agent/*` HTTP routes.
- Modify `apps/server/src/http.test.ts`: verify routes and dry-run persistence behavior.
- Modify `apps/server/src/mcp.ts`: add matching MCP tools.
- Modify `apps/web/e2e/editor-mvp.spec.ts`: use HTTP agent batch to create visible text, then verify it in browser.
- Modify `README.md`: document the agent-control API shape.

## Task 1: Pure Agent Control Module

**Files:**
- Create: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add tests that call `storage.inspectCanvas`, `storage.findNodes`, `storage.validateDocument`, `storage.applyAgentCommands`, and `storage.getChangeSummary`.

Expected test behaviors:
- `inspectCanvas("sample-file")` returns file id, node count, page summaries, component count, and zero validation issues.
- `findNodes("sample-file", { text: "Canvas" })` returns `text-1`.
- `applyAgentCommands(..., dryRun: true)` returns a preview containing a new node but persisted file does not contain that node.
- `applyAgentCommands(..., dryRun: false)` persists the new node.
- `getChangeSummary` returns created ids for a before/after pair.

Run:

```bash
pnpm --filter @layo/server test -- storage.test.ts
```

Expected: FAIL because the methods do not exist.

- [ ] **Step 2: Implement pure types and summaries**

Create `agent-control.ts` with exported types:

```ts
export interface AgentNodeSummary {
  id: string;
  name: string;
  kind: DesignNode["kind"];
  path: string[];
  text?: string;
  componentDefinitionId?: string;
  bounds: { x: number; y: number; width: number; height: number };
}
```

Implement `inspectCanvas(document)`, `findNodes(document, query)`, and internal tree traversal helpers.

- [ ] **Step 3: Implement validation and change summary**

Implement:

```ts
export function validateDocument(document: DesignFile): DocumentValidation
export function getChangeSummary(before: DesignFile, after: DesignFile): ChangeSummary
```

Validation checks unique ids, positive sizes, opacity range, content/kind consistency, and component reference integrity.

- [ ] **Step 4: Implement batch command application**

Implement:

```ts
export function applyAgentCommandsToDocument(
  document: DesignFile,
  commands: AgentCommand[]
): { document: DesignFile; changedNodeIds: string[] }
```

Supported command types:
- `update_geometry`
- `set_fill`
- `update_text`
- `create_rectangle`
- `create_text`
- `create_component`
- `create_component_instance`
- `detach_instance`

Apply to a cloned document first. Throw before returning if any command is invalid.

- [ ] **Step 5: Add storage wrapper methods**

Modify `FileStorage`:

```ts
inspectCanvas(fileId: string): Promise<CanvasInspection>
findNodes(fileId: string, query: AgentFindQuery): Promise<AgentNodeSummary[]>
validateDocument(fileId: string): Promise<DocumentValidation>
getChangeSummary(fileId: string, before: DesignFile, after: DesignFile): Promise<ChangeSummary>
applyAgentCommands(fileId: string, input: AgentBatchInput): Promise<AgentBatchResult>
```

For `dryRun: true`, do not call `writeFile`. For `dryRun: false`, write the preview document after all commands succeed.

- [ ] **Step 6: Verify storage tests pass**

Run:

```bash
pnpm --filter @layo/server test -- storage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/agent-control.ts apps/server/src/storage.ts apps/server/src/storage.test.ts
git commit -m "feat: add agent control storage layer"
```

## Task 2: HTTP Agent Routes

**Files:**
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/http.test.ts`

- [ ] **Step 1: Write failing HTTP route tests**

Add tests for:

```text
GET  /files/:fileId/agent/inspect
POST /files/:fileId/agent/find
POST /files/:fileId/agent/commands
GET  /files/:fileId/agent/validate
POST /files/:fileId/agent/change-summary
```

Expected: FAIL with 404.

- [ ] **Step 2: Add routes**

Wire each route to the storage methods from Task 1. Route bodies:

```ts
find: AgentFindQuery
commands: AgentBatchInput
change-summary: { before: DesignFile; after: DesignFile }
```

- [ ] **Step 3: Verify HTTP tests pass**

Run:

```bash
pnpm --filter @layo/server test -- http.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/http.ts apps/server/src/http.test.ts
git commit -m "feat: expose agent control http routes"
```

## Task 3: MCP Agent Tools

**Files:**
- Modify: `apps/server/src/mcp.ts`

- [ ] **Step 1: Add MCP tools**

Add:

```text
inspect_canvas
find_nodes
apply_agent_commands
validate_document
get_change_summary
```

Use Zod schemas that match the HTTP inputs.

- [ ] **Step 2: Verify server typecheck**

Run:

```bash
pnpm --filter @layo/server typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/mcp.ts
git commit -m "feat: add agent control mcp tools"
```

## Task 4: Browser Verification Flow

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Extend Playwright test**

In the existing Playwright e2e, call the HTTP agent command endpoint to create a text node named `Agent Note`, reload or wait for the app to fetch the document, and assert the text is visible in the rendered editor.

Run requires both dev servers:

```bash
pnpm --filter @layo/server dev
pnpm --filter @layo/web dev
pnpm test:e2e
```

Expected before HTTP route work: FAIL. Expected after Tasks 1-3: PASS.

- [ ] **Step 2: Document agent workflow**

Update README with:

```text
1. inspect_canvas / GET /files/:fileId/agent/inspect
2. find_nodes / POST /files/:fileId/agent/find
3. dry-run apply_agent_commands
4. persist apply_agent_commands
5. validate_document
6. Playwright CLI browser verification
```

- [ ] **Step 3: Verify full suite**

Run:

```bash
pnpm test && pnpm typecheck && pnpm --filter @layo/web build && pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/editor-mvp.spec.ts README.md
git commit -m "test: verify agent control browser flow"
```

## Self-Review

- Spec coverage: The plan covers inspect, find, batch, dry-run, validation, change summary, audit response, HTTP/MCP exposure, and Playwright visual verification.
- Scope: No durable audit log, natural-language parser, or UI approval surface is included.
- Type consistency: HTTP, MCP, and storage share `agent-control.ts` types.
