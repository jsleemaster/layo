import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createMcpServer } from "./mcp";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;
let activeClient: Client | undefined;
let activeServer: ReturnType<typeof createMcpServer> | undefined;

afterEach(async () => {
  await activeClient?.close().catch(() => undefined);
  await activeServer?.close().catch(() => undefined);
  activeClient = undefined;
  activeServer = undefined;

  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("MCP AI editing workflow", () => {
  test("advertises read/write safety annotations for agent tools", async () => {
    const client = await connectMcpClient();

    const tools = await client.listTools();
    const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

    expect(byName.get("inspect_canvas")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("find_nodes")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("validate_document")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("apply_agent_commands")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
  });

  test("lets an MCP client inspect, edit, find, and validate a design file", async () => {
    const client = await connectMcpClient();

    const inspection = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "sample-file" }
      })
    );
    expect(inspection.inspection).toMatchObject({
      nodeCount: 2,
      componentCount: 0
    });

    const dryRun = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "sample-file",
          dryRun: true,
          commands: [
            {
              type: "create_text",
              parentId: "page-1",
              id: "mcp-agent-note",
              name: "MCP 에이전트 메모",
              value: "MCP로 AI 편집",
              x: 112,
              y: 380,
              width: 260,
              height: 48
            }
          ]
        }
      })
    );
    expect(dryRun.result).toMatchObject({
      persisted: false,
      audit: {
        dryRun: true,
        commandTypes: ["create_text"],
        changedNodeIds: ["mcp-agent-note"]
      }
    });

    const afterDryRun = parseToolJson(
      await client.callTool({
        name: "find_nodes",
        arguments: { fileId: "sample-file", text: "MCP로 AI 편집" }
      })
    );
    expect(afterDryRun.nodes).toEqual([]);

    const persisted = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "sample-file",
          dryRun: false,
          commands: [
            {
              type: "create_text",
              parentId: "page-1",
              id: "mcp-agent-note",
              name: "MCP 에이전트 메모",
              value: "MCP로 AI 편집",
              x: 112,
              y: 380,
              width: 260,
              height: 48
            }
          ]
        }
      })
    );
    expect(persisted.result).toMatchObject({
      persisted: true,
      audit: {
        dryRun: false,
        commandTypes: ["create_text"],
        changedNodeIds: ["mcp-agent-note"]
      }
    });

    const found = parseToolJson(
      await client.callTool({
        name: "find_nodes",
        arguments: { fileId: "sample-file", text: "MCP로 AI 편집" }
      })
    );
    expect(found.nodes.map((node: { id: string }) => node.id)).toEqual(["mcp-agent-note"]);

    const validation = parseToolJson(
      await client.callTool({
        name: "validate_document",
        arguments: { fileId: "sample-file" }
      })
    );
    expect(validation.validation).toMatchObject({ ok: true, issueCount: 0 });
  });
});

async function connectMcpClient() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-mcp-"));
  activeClient = new Client({ name: "canvas-mcp-editor-test", version: "1.0.0" });
  activeServer = createMcpServer(new FileStorage(tempRoot));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    activeClient.connect(clientTransport),
    activeServer.connect(serverTransport)
  ]);

  return activeClient;
}

function parseToolJson(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const first = content?.[0];

  expect(first).toMatchObject({ type: "text" });
  return JSON.parse(first?.text ?? "null");
}
