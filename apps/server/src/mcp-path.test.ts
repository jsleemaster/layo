import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createMcpServer } from "./mcp";
import { FileStorage, type DesignFile } from "./storage";

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

describe("MCP first-class path agent command", () => {
  test("dry-runs and persists path geometry with inspect and validation evidence", async () => {
    const { client, storage } = await connectMcpClient();
    await storage.writeFile("path-file", createPathFile());

    const command = {
      type: "set_path_data",
      nodeId: "penpot-path-1",
      pathData: "M0 0 H120 V80 H0 Z",
      fillRule: "evenodd"
    };

    const dryRun = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "path-file",
          dryRun: true,
          commands: [command]
        }
      })
    );

    expect(dryRun.result).toMatchObject({
      persisted: false,
      audit: {
        commandTypes: ["set_path_data"],
        changedNodeIds: ["penpot-path-1"]
      },
      changeSummary: {
        updatedNodeIds: ["penpot-path-1"]
      },
      validation: { ok: true, issueCount: 0 }
    });
    expect(findInspectedPath(dryRun.result.inspection)).toMatchObject({
      pathData: command.pathData,
      fillRule: "evenodd"
    });

    const unchanged = await storage.readFile("path-file");
    expect(findPathNode(unchanged).content).toEqual({
      type: "path",
      path_data: "M0 0 H100 V100 H0 Z",
      fill_rule: "nonzero"
    });

    const applied = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "path-file",
          dryRun: false,
          commands: [command]
        }
      })
    );

    expect(applied.result).toMatchObject({
      persisted: true,
      audit: {
        commandTypes: ["set_path_data"],
        changedNodeIds: ["penpot-path-1"]
      },
      changeSummary: {
        updatedNodeIds: ["penpot-path-1"]
      },
      validation: { ok: true, issueCount: 0 }
    });

    const inspection = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "path-file" }
      })
    );
    expect(findInspectedPath(inspection.inspection)).toMatchObject({
      id: "penpot-path-1",
      kind: "path",
      pathData: command.pathData,
      fillRule: "evenodd"
    });

    const persisted = await storage.readFile("path-file");
    expect(findPathNode(persisted).content).toEqual({
      type: "path",
      path_data: command.pathData,
      fill_rule: "evenodd"
    });
  });
});

async function connectMcpClient() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-mcp-path-"));
  const storage = new FileStorage(tempRoot);
  activeClient = new Client({ name: "layo-test", version: "1.0.0" });
  activeServer = createMcpServer(storage);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    activeClient.connect(clientTransport),
    activeServer.connect(serverTransport)
  ]);

  return { client: activeClient, storage };
}

function createPathFile(): DesignFile {
  return {
    id: "path-file",
    name: "Path file",
    version: 1,
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "penpot-path-1",
            kind: "path",
            name: "Imported Penpot path",
            transform: { x: 24, y: 32, rotation: 0 },
            size: { width: 100, height: 100 },
            style: {
              fill: "#2563eb",
              stroke: "#0f172a",
              stroke_width: 2,
              opacity: 1
            },
            content: {
              type: "path",
              path_data: "M0 0 H100 V100 H0 Z",
              fill_rule: "nonzero"
            },
            children: []
          }
        ]
      }
    ]
  };
}

function findPathNode(file: DesignFile) {
  const node = file.pages[0].children[0];
  expect(node.kind).toBe("path");
  return node;
}

function findInspectedPath(inspection: { nodes: Array<{ id: string }> }) {
  return inspection.nodes.find((node) => node.id === "penpot-path-1");
}

function parseToolJson(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const first = content?.[0];

  expect(first).toMatchObject({ type: "text" });
  return JSON.parse(first?.text ?? "null");
}
