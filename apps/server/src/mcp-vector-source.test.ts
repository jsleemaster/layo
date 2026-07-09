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

describe("MCP vector source agent command", () => {
  test("lets MCP clients persist Penpot path vector source metadata", async () => {
    const { client, storage } = await connectMcpClient();
    await storage.writeFile("vector-source-file", createVectorSourceFile());

    const vectorSource = {
      origin: "penpot",
      shapeId: "penpot-path-1",
      shapeType: "path",
      bounds: { x: 0, y: 0, width: 128, height: 96 },
      pathData: "M0 0 H128 V96 H0 Z",
      fillRule: "evenodd"
    };

    const persisted = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "vector-source-file",
          dryRun: false,
          commands: [
            {
              type: "set_vector_source",
              nodeId: "penpot-vector-image",
              vectorSource
            }
          ]
        }
      })
    );

    expect(persisted.result).toMatchObject({
      persisted: true,
      audit: {
        commandTypes: ["set_vector_source"],
        changedNodeIds: ["penpot-vector-image"]
      },
      changeSummary: {
        updatedNodeIds: ["penpot-vector-image"]
      },
      validation: { ok: true, issueCount: 0 }
    });

    const inspection = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "vector-source-file" }
      })
    );
    const imageNode = inspection.inspection.nodes.find((node: { id: string }) => node.id === "penpot-vector-image");
    expect(imageNode.vectorSource).toEqual(vectorSource);
  });
});

async function connectMcpClient() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-mcp-vector-source-"));
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

function createVectorSourceFile(): DesignFile {
  return {
    id: "vector-source-file",
    name: "Vector source file",
    version: 1,
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "penpot-vector-image",
            kind: "image",
            name: "Imported Penpot path bridge",
            transform: { x: 24, y: 32, rotation: 0 },
            size: { width: 128, height: 96 },
            style: {
              fill: "#2563eb",
              stroke: null,
              stroke_width: 0,
              opacity: 1
            },
            content: {
              type: "image",
              asset_id: "asset-penpot-vector",
              natural_width: 128,
              natural_height: 96,
              fit_mode: "fill"
            },
            children: []
          }
        ]
      }
    ]
  };
}

function parseToolJson(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const first = content?.[0];

  expect(first).toMatchObject({ type: "text" });
  return JSON.parse(first?.text ?? "null");
}
