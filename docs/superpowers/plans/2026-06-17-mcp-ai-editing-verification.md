# MCP AI Editing Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that an AI client can connect to Layo through MCP, inspect a canvas, apply deterministic edits, validate the document, and find the edited result.

**Architecture:** Keep MCP in `apps/server` because the official TypeScript MCP SDK owns the client/server transport. Keep deterministic document mutation in the existing agent-control/storage layer, which already sits over the Rust-owned document model boundary used by the editor. Add only test and metadata hardening unless verification exposes a missing behavior.

**Tech Stack:** TypeScript, Vitest, `@modelcontextprotocol/sdk@1.29.0`, Fastify storage utilities, existing Rust `editor-core` verification through `cargo test --workspace`.

---

### Task 1: Add MCP Client Integration Coverage

**Files:**
- Create: `apps/server/src/mcp.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createMcpServer } from "./mcp";
import { FileStorage } from "./storage";

describe("MCP AI editing workflow", () => {
  test("advertises read/write safety annotations for agent tools", async () => {
    const { client, server } = await createConnectedMcpPair();
    const tools = await client.listTools();
    await client.close();
    await server.close();

    const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

    expect(byName.get("inspect_canvas")?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get("find_nodes")?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get("validate_document")?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get("apply_agent_commands")?.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @layo/server test -- src/mcp.test.ts`

Expected: FAIL because existing MCP tools do not yet expose the asserted tool annotations.

- [x] **Step 3: Extend the test to call real MCP tools**

Add a second test that connects `Client` and `createMcpServer()` with `InMemoryTransport.createLinkedPair()`, then calls `inspect_canvas`, `apply_agent_commands`, `find_nodes`, and `validate_document`.

- [x] **Step 4: Run test again**

Run: `pnpm --filter @layo/server test -- src/mcp.test.ts`

Expected: the annotation test still fails until Task 2 lands; the live MCP edit-flow test should pass or expose the real missing connection behavior.

### Task 2: Add Agent-Safe MCP Tool Metadata

**Files:**
- Modify: `apps/server/src/mcp.ts`

- [x] **Step 1: Add minimal annotations to read-only tools**

Add this config property to `list_files`, `get_file_metadata`, `get_design_context`, `export_code`, `inspect_canvas`, `find_nodes`, `validate_document`, `get_change_summary`, and `list_components`:

```ts
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}
```

- [x] **Step 2: Add minimal annotations to write tools**

Add this config property to `apply_agent_commands`, `update_node_geometry`, `set_fill`, `update_text`, `create_rectangle`, `create_text`, `create_component`, `create_component_instance`, and `detach_instance`:

```ts
annotations: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
}
```

- [x] **Step 3: Run the MCP integration test**

Run: `pnpm --filter @layo/server test -- src/mcp.test.ts`

Expected: PASS.

### Task 3: Start Verification

**Files:**
- No source changes expected.

- [x] **Step 1: Run server tests**

Run: `pnpm --filter @layo/server test`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [x] **Step 3: Run Rust core tests**

Run: `cargo test --workspace`

Expected: PASS, confirming the Rust document/relay crates still compile and pass.

- [x] **Step 4: Run Playwright CLI only if browser rendering needs confirmation**

Run after starting the local server/web app: `pnpm test:e2e`

Expected: PASS. Browser debugging and visual verification must use Playwright CLI per `AGENTS.md`.

### Task 4: Persist Stdio MCP Move And Component UI Verification

**Files:**
- Create: `apps/web/e2e/mcp-stdio.spec.ts`
- Modify: `package.json`

- [x] **Step 1: Add the Playwright CLI regression test**

The test resets the local sample file, spawns a Node MCP client from `apps/server`, connects to the stdio MCP server with `StdioClientTransport`, applies this command batch, and then opens the web editor:

```ts
[
  { type: "create_text", parentId: "page-1", id: "mcp-stdio-source" },
  { type: "update_geometry", nodeId: "mcp-stdio-source", x: 260, y: 520, width: 300, height: 52 },
  { type: "create_component", nodeId: "mcp-stdio-source", componentId: "mcp-stdio-component" },
  { type: "create_component_instance", parentId: "page-1", definitionId: "mcp-stdio-component", instanceId: "mcp-stdio-instance", x: 620, y: 520 }
]
```

- [x] **Step 2: Verify focused test**

Run: `pnpm exec playwright test apps/web/e2e/mcp-stdio.spec.ts --reporter=line`

Expected: PASS. Actual result: PASS.

- [x] **Step 3: Add the test to `pnpm test:e2e`**

Run both editor MVP and stdio MCP UI specs:

```bash
playwright test apps/web/e2e/editor-mvp.spec.ts apps/web/e2e/mcp-stdio.spec.ts --workers=1 --reporter=line
```

- [x] **Step 4: Run full e2e and analyze failure**

Initial run without `--workers=1` failed because Playwright used two workers and both e2e files mutated the shared `sample-file` local storage. The existing editor MVP tests reset the sample file while the stdio MCP test expected its just-created component to remain visible.

- [x] **Step 5: Fix verification plan and retry**

Set `--workers=1` in `pnpm test:e2e` because these e2e tests share the local-first sample file storage.

Run: `pnpm test:e2e`

Expected: PASS. Actual result: PASS, 9 tests.
