import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { FileStorage, type DesignFile, type DesignNode } from "./storage.js";

function countNodes(nodes: DesignNode[] = []): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

const agentFindSchema = {
  id: z.string().optional().describe("Node id substring to match"),
  name: z.string().optional().describe("Node name substring to match"),
  kind: z
    .enum(["frame", "rectangle", "text", "image", "component", "component_instance"])
    .optional()
    .describe("Node kind to match"),
  text: z.string().optional().describe("Text content substring to match"),
  componentDefinitionId: z.string().optional().describe("Component definition id to match")
};

const gridTrackSchema = z.object({
  type: z.enum(["px", "fr", "auto"]),
  value: z.number().optional()
});

const gridAreaSchema = z.object({
  name: z.string(),
  column: z.number(),
  row: z.number(),
  column_span: z.number(),
  row_span: z.number()
});

const nodeLayoutSchema = z.object({
  mode: z.enum(["none", "auto", "grid"]),
  direction: z.enum(["horizontal", "horizontal_reverse", "vertical", "vertical_reverse"]),
  wrap: z.enum(["nowrap", "wrap"]).optional(),
  align_items: z.enum(["start", "center", "end", "stretch", "baseline"]).default("start"),
  justify_content: z.enum(["start", "center", "end", "space_between", "space_around", "space_evenly"]).default("start"),
  justify_items: z.enum(["start", "center", "end", "stretch"]).optional(),
  align_content: z.enum(["start", "center", "end", "space_between", "space_around", "space_evenly"]).optional(),
  width_sizing: z.enum(["fixed", "fit"]).optional(),
  height_sizing: z.enum(["fixed", "fit"]).optional(),
  min_width: z.number().optional(),
  max_width: z.number().optional(),
  min_height: z.number().optional(),
  max_height: z.number().optional(),
  gap: z.number(),
  row_gap: z.number().optional(),
  column_gap: z.number().optional(),
  grid_columns: z.number().optional(),
  grid_rows: z.number().optional(),
  grid_column_tracks: z.array(gridTrackSchema).optional(),
  grid_row_tracks: z.array(gridTrackSchema).optional(),
  grid_areas: z.array(gridAreaSchema).optional(),
  padding: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number()
  })
});

const nodeLayoutItemSchema = z.object({
  position: z.enum(["static", "absolute"]).optional(),
  width_sizing: z.enum(["fixed", "fill"]).optional(),
  height_sizing: z.enum(["fixed", "fill"]).optional(),
  justify_self: z.enum(["start", "center", "end", "stretch"]).optional(),
  align_self: z.enum(["start", "center", "end", "stretch"]).optional(),
  min_width: z.number().optional(),
  max_width: z.number().optional(),
  min_height: z.number().optional(),
  max_height: z.number().optional(),
  grid_area: z.string().optional(),
  grid_column: z.number().optional(),
  grid_row: z.number().optional(),
  grid_column_span: z.number().optional(),
  grid_row_span: z.number().optional(),
  margin: z.object({
    top: z.number().default(0),
    right: z.number().default(0),
    bottom: z.number().default(0),
    left: z.number().default(0)
  })
});

const nodeConstraintsSchema = z.object({
  horizontal: z.enum(["left", "right", "left_right", "center", "scale"]),
  vertical: z.enum(["top", "bottom", "top_bottom", "center", "scale"])
});

const agentCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_geometry"),
    nodeId: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  }),
  z.object({
    type: z.literal("set_fill"),
    nodeId: z.string(),
    fill: z.string()
  }),
  z.object({
    type: z.literal("update_text"),
    nodeId: z.string(),
    value: z.string()
  }),
  z.object({
    type: z.literal("create_rectangle"),
    parentId: z.string(),
    id: z.string(),
    name: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    fill: z.string().optional()
  }),
  z.object({
    type: z.literal("create_text"),
    parentId: z.string(),
    id: z.string(),
    name: z.string().optional(),
    value: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    fill: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional()
  }),
  z.object({
    type: z.literal("create_component"),
    nodeId: z.string(),
    componentId: z.string(),
    name: z.string()
  }),
  z.object({
    type: z.literal("set_layout"),
    nodeId: z.string(),
    layout: nodeLayoutSchema
  }),
  z.object({
    type: z.literal("set_layout_item"),
    nodeId: z.string(),
    layoutItem: nodeLayoutItemSchema
  }),
  z.object({
    type: z.literal("set_constraints"),
    nodeId: z.string(),
    constraints: nodeConstraintsSchema
  }),
  z.object({
    type: z.literal("create_component_instance"),
    parentId: z.string(),
    definitionId: z.string(),
    instanceId: z.string(),
    x: z.number().optional(),
    y: z.number().optional()
  }),
  z.object({
    type: z.literal("detach_instance"),
    nodeId: z.string()
  })
]);

const agentCollaborationSchema = z.object({
  teamId: z.string().describe("Team manifest id for the collaboration room"),
  documentId: z.string().describe("Document id in the collaboration room"),
  relayUrl: z.string().describe("Self-hosted collaboration relay websocket URL"),
  token: z.string().optional().describe("Optional relay gate token"),
  userId: z.string().optional().describe("Optional team member id for relay member authorization"),
  memberToken: z.string().optional().describe("Optional team member token for relay member authorization")
});

const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const writeToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};

export function createMcpServer(storage = new FileStorage()) {
  const server = new McpServer({
    name: "layo",
    version: "0.1.0"
  });

  server.registerTool(
    "list_files",
    {
      description: "List local Layo design files available to inspect.",
      annotations: readOnlyToolAnnotations,
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
    "list_projects",
    {
      description: "List local Layo projects and their document membership.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ projects: await storage.listProjects() }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a saved project manifest and its initial design document.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().optional().describe("Optional safe project id"),
        name: z.string().optional().describe("Project display name"),
        documentId: z.string().optional().describe("Optional safe initial document id"),
        documentName: z.string().optional().describe("Initial design document name")
      }
    },
    async ({ projectId, name, documentId, documentName }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: await storage.createProject({ projectId, name, documentId, documentName })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "get_project",
    {
      description: "Read a saved project manifest by id.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects")
      }
    },
    async ({ projectId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ project: await storage.readProject(projectId) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_project",
    {
      description: "Rename a project or switch its current document.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects"),
        name: z.string().optional().describe("New project display name"),
        currentDocumentId: z.string().optional().describe("Existing project document id to open by default")
      }
    },
    async ({ projectId, name, currentDocumentId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: await storage.updateProject(projectId, { name, currentDocumentId })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "create_project_document",
    {
      description: "Create a new design document inside an existing project.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects"),
        documentId: z.string().optional().describe("Optional safe document id"),
        name: z.string().optional().describe("Document display name")
      }
    },
    async ({ projectId, documentId, name }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: await storage.createProjectDocument(projectId, { documentId, name })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "set_project_sharing",
    {
      description: "Set a project sharing reference to private or a team manifest id.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects"),
        mode: z.enum(["private", "team"]),
        teamId: z.string().optional().describe("Required when mode is team")
      }
    },
    async ({ projectId, mode, teamId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: await storage.setProjectSharing(
                projectId,
                mode === "team" ? { mode: "team", teamId: teamId ?? "" } : { mode: "private" }
              )
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "duplicate_project",
    {
      description: "Duplicate a saved project and copy its documents into new local document ids.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Source project id returned by list_projects"),
        newProjectId: z.string().optional().describe("Optional safe id for the duplicated project"),
        name: z.string().optional().describe("Duplicated project display name"),
        documentIdPrefix: z
          .string()
          .optional()
          .describe("Optional safe prefix applied to copied document ids")
      }
    },
    async ({ projectId, newProjectId, name, documentIdPrefix }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: await storage.duplicateProject(projectId, {
                projectId: newProjectId,
                name,
                documentIdPrefix
              })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "delete_project",
    {
      description:
        "Delete a saved project manifest and local documents that are not referenced by another project.",
      annotations: writeToolAnnotations,
      inputSchema: {
        projectId: z.string().describe("Project id returned by list_projects")
      }
    },
    async ({ projectId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ project: await storage.deleteProject(projectId) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_file_metadata",
    {
      description: "Get page and node counts for a local design file.",
      annotations: readOnlyToolAnnotations,
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
      annotations: readOnlyToolAnnotations,
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
    "export_code",
    {
      description:
        "Export a design file as generated CSS, rendered HTML, per-element JS modules, and an index module.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        moduleBasePath: z
          .string()
          .default(".")
          .describe("Relative module path used by generated index imports")
      }
    },
    async ({ fileId, moduleBasePath }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              export: await storage.exportCode(fileId, { moduleBasePath })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "inspect_canvas",
    {
      description: "Return an agent-friendly canvas summary, component summary, node summaries, and validation status.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              inspection: await storage.inspectCanvas(fileId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "find_nodes",
    {
      description: "Find canvas nodes by id, name, kind, text content, or component definition id.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        ...agentFindSchema
      }
    },
    async ({ fileId, id, name, kind, text, componentDefinitionId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              nodes: await storage.findNodes(fileId, { id, name, kind, text, componentDefinitionId })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "apply_agent_commands",
    {
      description: "Dry-run or persist a batch of deterministic agent edit commands.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        dryRun: z.boolean().default(true).describe("When true, return preview without writing"),
        collaboration: agentCollaborationSchema
          .optional()
          .describe("Optional team-owned relay target for collaborative document mutation"),
        commands: z.array(agentCommandSchema).min(1).describe("Agent edit commands to apply in order")
      }
    },
    async ({ fileId, dryRun, collaboration, commands }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              result: await storage.applyAgentCommands(fileId, { dryRun, collaboration, commands })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "validate_document",
    {
      description: "Validate a design file for agent-safe structural invariants.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              validation: await storage.validateDocument(fileId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "get_change_summary",
    {
      description: "Compare two design document snapshots and summarize changed node ids.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        before: z.unknown().describe("DesignFile JSON snapshot before edits"),
        after: z.unknown().describe("DesignFile JSON snapshot after edits")
      }
    },
    async ({ fileId, before, after }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              summary: await storage.getChangeSummary(
                fileId,
                before as DesignFile,
                after as DesignFile
              )
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "update_node_geometry",
    {
      description: "Update a node's x, y, width, and height in a local design file.",
      annotations: writeToolAnnotations,
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
      annotations: writeToolAnnotations,
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
      annotations: writeToolAnnotations,
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
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        parentId: z.string().describe("Page or frame parent id"),
        id: z.string().describe("Stable node id"),
        name: z.string().default("사각형").describe("Layer name"),
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
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        parentId: z.string().describe("Page or frame parent id"),
        id: z.string().describe("Stable node id"),
        name: z.string().default("텍스트").describe("Layer name"),
        value: z.string().default("새 텍스트"),
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

  server.registerTool(
    "list_components",
    {
      description: "List component definitions stored in a local design file.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              components: await storage.listComponents(fileId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "create_component",
    {
      description: "Convert an existing node into a reusable component definition.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        nodeId: z.string().describe("Existing node id to convert into a component"),
        componentId: z.string().describe("Stable component definition id"),
        name: z.string().describe("Component definition name")
      }
    },
    async ({ fileId, nodeId, componentId, name }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              nodeId,
              component: await storage.createComponent(fileId, nodeId, { componentId, name })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "create_component_instance",
    {
      description: "Create a linked component instance from an existing component definition.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        parentId: z.string().describe("Page or frame parent id"),
        definitionId: z.string().describe("Component definition id"),
        instanceId: z.string().describe("Stable instance root node id"),
        x: z.number().default(520),
        y: z.number().default(140)
      }
    },
    async ({ fileId, parentId, definitionId, instanceId, x, y }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              parentId,
              node: await storage.createComponentInstance(fileId, {
                parentId,
                definitionId,
                instanceId,
                x,
                y
              })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "detach_instance",
    {
      description: "Detach a component instance node so it becomes a normal editable frame.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        nodeId: z.string().describe("Component instance root node id")
      }
    },
    async ({ fileId, nodeId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              nodeId,
              node: await storage.detachInstance(fileId, nodeId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
