import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { FileStorage, type DesignFile, type DesignNode } from "./storage.js";

function countNodes(nodes: DesignNode[] = []): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

export function createMcpServer(storage = new FileStorage()) {
  const server = new McpServer({
    name: "canvas-mcp-editor",
    version: "0.1.0"
  });

  server.registerTool(
    "list_files",
    {
      description: "List local Canvas MCP Editor design files available to inspect.",
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await storage.listFiles(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_file_metadata",
    {
      description: "Get page and node counts for a local design file.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => {
      const file = (await storage.readFile(fileId)) as DesignFile;
      const nodeCount = file.pages.reduce((total, page) => total + countNodes(page.children), 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: file.id,
                name: file.name,
                pageCount: file.pages.length,
                nodeCount
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.registerTool(
    "get_design_context",
    {
      description: "Return the raw document JSON for a design file so an agent can inspect pages and nodes.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await storage.readFile(fileId), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_node_geometry",
    {
      description: "Update a node's x, y, width, and height in a local design file.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        nodeId: z.string().describe("Node id to update"),
        x: z.number().optional().describe("New local x position"),
        y: z.number().optional().describe("New local y position"),
        width: z.number().optional().describe("New width"),
        height: z.number().optional().describe("New height")
      }
    },
    async ({ fileId, nodeId, x, y, width, height }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              nodeId,
              node: await storage.updateNodeGeometry(fileId, nodeId, { x, y, width, height })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "set_fill",
    {
      description: "Set a node's fill color in a local design file.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        nodeId: z.string().describe("Node id to update"),
        fill: z.string().describe("CSS color value to store in the node style")
      }
    },
    async ({ fileId, nodeId, fill }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              nodeId,
              node: await storage.setNodeFill(fileId, nodeId, fill)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "update_text",
    {
      description: "Update a text node's visible string in a local design file.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        nodeId: z.string().describe("Text node id to update"),
        value: z.string().describe("New text value")
      }
    },
    async ({ fileId, nodeId, value }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              nodeId,
              node: await storage.updateText(fileId, nodeId, value)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "create_rectangle",
    {
      description: "Create a rectangle node under a page or frame parent.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        parentId: z.string().describe("Page or frame parent id"),
        id: z.string().describe("Stable node id"),
        name: z.string().default("Rectangle").describe("Layer name"),
        x: z.number().default(180),
        y: z.number().default(140),
        width: z.number().default(160),
        height: z.number().default(96),
        fill: z.string().default("#e0f2fe")
      }
    },
    async ({ fileId, parentId, id, name, x, y, width, height, fill }) => {
      const node: DesignNode = {
        id,
        kind: "rectangle",
        name,
        transform: { x, y, rotation: 0 },
        size: { width, height },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                fileId,
                parentId,
                node: await storage.createNode(fileId, parentId, node)
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.registerTool(
    "create_text",
    {
      description: "Create a text node under a page or frame parent.",
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        parentId: z.string().describe("Page or frame parent id"),
        id: z.string().describe("Stable node id"),
        name: z.string().default("Text").describe("Layer name"),
        value: z.string().default("New text"),
        x: z.number().default(220),
        y: z.number().default(180),
        width: z.number().default(220),
        height: z.number().default(44),
        fill: z.string().default("#111827"),
        fontSize: z.number().default(24),
        fontFamily: z.string().default("Inter")
      }
    },
    async ({ fileId, parentId, id, name, value, x, y, width, height, fill, fontSize, fontFamily }) => {
      const node: DesignNode = {
        id,
        kind: "text",
        name,
        transform: { x, y, rotation: 0 },
        size: { width, height },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "text", value, font_size: fontSize, font_family: fontFamily },
        children: []
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                fileId,
                parentId,
                node: await storage.createNode(fileId, parentId, node)
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
