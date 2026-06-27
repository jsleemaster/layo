import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { FileStorage, type CodeComponentMapping, type DesignFile, type DesignNode } from "./storage.js";

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

const commentMentionTargetSchema = z.object({
  userId: z.string().describe("Stable team member id"),
  displayName: z.string().describe("Team member display name"),
  role: z.enum(["owner", "editor", "viewer"]).describe("Team member role")
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
  spacing_tokens: z
    .object({
      gap: z.string().nullable().optional(),
      row_gap: z.string().nullable().optional(),
      column_gap: z.string().nullable().optional(),
      padding_top: z.string().nullable().optional(),
      padding_right: z.string().nullable().optional(),
      padding_bottom: z.string().nullable().optional(),
      padding_left: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
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

const designTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["color", "spacing", "typography"]),
  value: z.string()
});

const designTokenThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string().optional(),
  enabled: z.boolean(),
  token_set_ids: z.array(z.string()).default([])
});

const designStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["color", "typography"]),
  value: z.string()
});

const nodeExportPresetSchema = z.object({
  id: z.string(),
  format: z.enum(["png", "jpeg", "webp", "svg", "pdf"]),
  scale: z.number().positive(),
  suffix: z.string().default("")
});

const codeComponentMappingPropSchema = z.object({
  name: z.string().describe("Code prop name, for example title or label"),
  type: z.literal("string"),
  source_node_id: z.string().describe("Design text node id that supplies this prop"),
  source_field: z.literal("text"),
  default_value: z.string().describe("Default prop value from the design source")
});

const codeComponentMappingVariantPropSchema = z.object({
  name: z.string().describe("Code variant prop name, for example tone or size"),
  type: z.literal("string"),
  variant_property: z.string().describe("Layo component variant property name"),
  default_value: z.string().describe("Fallback value when the component has no matching variant property")
});

const codeComponentMappingSchema = z.object({
  id: z.string().describe("Stable mapping id"),
  component_id: z.string().describe("Layo component definition id"),
  package_name: z.string().optional().describe("Optional package display name"),
  import_path: z.string().describe("Repository import path"),
  export_name: z.string().describe("Code component export name"),
  import_mode: z.enum(["named", "default"]).describe("Whether the import is named or default"),
  props: z.array(codeComponentMappingPropSchema).default([]),
  variant_props: z.array(codeComponentMappingVariantPropSchema).default([]),
  docs_url: z.string().optional().describe("Optional component documentation URL")
});

const nodeStyleSchema = z.object({
  fill: z.string().describe("CSS fill color"),
  fill_token: z.string().nullable().optional().describe("Optional fill token binding"),
  fill_style: z.string().nullable().optional().describe("Optional reusable fill style binding"),
  stroke: z.string().nullable().describe("CSS stroke color or null for no stroke"),
  stroke_width: z.number().min(0).describe("Stroke width in pixels"),
  opacity: z.number().min(0).max(1).describe("Layer opacity from 0 to 1")
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
    type: z.literal("set_node_style"),
    nodeId: z.string(),
    style: nodeStyleSchema
  }),
  z.object({
    type: z.literal("create_token"),
    token: designTokenSchema
  }),
  z.object({
    type: z.literal("create_style"),
    style: designStyleSchema
  }),
  z.object({
    type: z.literal("rename_style"),
    styleId: z.string(),
    name: z.string()
  }),
  z.object({
    type: z.literal("duplicate_style"),
    styleId: z.string(),
    newStyleId: z.string(),
    name: z.string()
  }),
  z.object({
    type: z.literal("delete_style"),
    styleId: z.string()
  }),
  z.object({
    type: z.literal("upsert_token_theme"),
    tokenTheme: designTokenThemeSchema
  }),
  z.object({
    type: z.literal("delete_token_theme"),
    tokenThemeId: z.string()
  }),
  z.object({
    type: z.literal("reorder_token_theme"),
    tokenThemeId: z.string(),
    direction: z.enum(["up", "down"])
  }),
  z.object({
    type: z.literal("reorder_token_theme_set"),
    tokenThemeId: z.string(),
    tokenSetId: z.string(),
    direction: z.enum(["up", "down"])
  }),
  z.object({
    type: z.literal("set_token_set_enabled"),
    tokenSetId: z.string(),
    enabled: z.boolean()
  }),
  z.object({
    type: z.literal("set_token_theme_enabled"),
    tokenThemeId: z.string(),
    enabled: z.boolean()
  }),
  z.object({
    type: z.literal("set_fill_token"),
    nodeId: z.string(),
    tokenId: z.string()
  }),
  z.object({
    type: z.literal("set_fill_style"),
    nodeId: z.string(),
    styleId: z.string()
  }),
  z.object({
    type: z.literal("set_text_typography_token"),
    nodeId: z.string(),
    tokenId: z.string()
  }),
  z.object({
    type: z.literal("set_text_typography_style"),
    nodeId: z.string(),
    styleId: z.string()
  }),
  z.object({
    type: z.literal("set_layout_spacing_token"),
    nodeId: z.string(),
    target: z.enum(["all_gaps", "all_padding"]),
    tokenId: z.string()
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
    type: z.literal("combine_components_as_variants"),
    componentId: z.string(),
    nodeIds: z.array(z.string()).min(2),
    propertyName: z.string().optional()
  }),
  z.object({
    type: z.literal("set_export_presets"),
    nodeId: z.string(),
    presets: z.array(nodeExportPresetSchema)
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
    "export_file_archive",
    {
      description:
        "Export a Layo design file and referenced image assets as a base64-encoded portable ZIP archive.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files")
      }
    },
    async ({ fileId }) => {
      const exported = await storage.exportFileArchive(fileId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                fileId: exported.fileId,
                name: exported.name,
                assetCount: exported.assetCount,
                mimeType: exported.mimeType,
                fileName: exported.fileName,
                manifest: exported.manifest,
                archiveBase64: exported.archive.toString("base64")
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
    "import_file_archive",
    {
      description:
        "Import a base64-encoded Layo file archive into local storage, optionally assigning a new file id or name.",
      annotations: writeToolAnnotations,
      inputSchema: {
        archiveBase64: z.string().describe("Base64 ZIP payload returned by export_file_archive"),
        fileId: z.string().optional().describe("Optional safe file id for the imported document"),
        name: z.string().optional().describe("Optional display name for the imported document")
      }
    },
    async ({ archiveBase64, fileId, name }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              imported: await storage.importFileArchive(Buffer.from(archiveBase64, "base64"), {
                fileId,
                name
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
    "export_design_tokens",
    {
      description: "Export document-local Layo design tokens as W3C/DTCG JSON.",
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
              tokens: await storage.exportTokensDtcg(fileId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "list_file_versions",
    {
      description: "List saved local version snapshots for a Layo design file without returning full document payloads.",
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
              versions: await storage.listFileVersions(fileId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "save_file_version",
    {
      description: "Save the current local design file as a named version snapshot for later recovery.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        message: z.string().optional().describe("Human-readable reason for this saved version")
      }
    },
    async ({ fileId, message }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              version: await storage.saveFileVersion(fileId, { message })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "get_file_version",
    {
      description: "Read one saved Layo file version snapshot, including its document JSON for preview or comparison.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        versionId: z.string().describe("Saved version id returned by list_file_versions")
      }
    },
    async ({ fileId, versionId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              version: await storage.readFileVersion(fileId, versionId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "pin_file_version",
    {
      description: "Pin or unpin a saved Layo file version so important recovery checkpoints stay visible first.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        versionId: z.string().describe("Saved version id returned by list_file_versions"),
        pinned: z.boolean().optional().describe("Set false to unpin the version")
      }
    },
    async ({ fileId, versionId, pinned }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              version: await storage.setFileVersionPinned(fileId, versionId, pinned !== false)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "delete_file_version",
    {
      description: "Delete one saved Layo file version, including pinned versions when explicitly requested.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        versionId: z.string().describe("Saved version id returned by list_file_versions")
      }
    },
    async ({ fileId, versionId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              version: await storage.deleteFileVersion(fileId, versionId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "prune_file_versions",
    {
      description: "Delete old unpinned Layo file versions while preserving pinned recovery checkpoints.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        keepUnpinned: z.number().int().min(0).optional().describe("Newest unpinned versions to keep")
      }
    },
    async ({ fileId, keepUnpinned }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              result: await storage.pruneFileVersions(fileId, { keepUnpinned: keepUnpinned ?? 10 })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "restore_file_version",
    {
      description:
        "Restore a saved Layo file version. The current document is first saved as a recovery snapshot.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        versionId: z.string().describe("Saved version id returned by list_file_versions")
      }
    },
    async ({ fileId, versionId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              ...(await storage.restoreFileVersion(fileId, versionId))
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "list_comment_threads",
    {
      description: "List selected-node comment threads for a Layo design file.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        includeResolved: z.boolean().optional().describe("Include resolved comment threads"),
        viewerId: z.string().optional().describe("Optional viewer id used to compute unread state")
      }
    },
    async ({ fileId, includeResolved, viewerId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              threads: await storage.listCommentThreads(fileId, { includeResolved, viewerId })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "create_comment_thread",
    {
      description: "Create a comment thread attached to one selected Layo canvas node.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        nodeId: z.string().describe("Canvas node id to attach the comment to"),
        body: z.string().describe("Comment body"),
        authorName: z.string().optional().describe("Display name for the comment author"),
        mentionTargets: z.array(commentMentionTargetSchema).optional().describe("Resolved team members mentioned by this comment")
      }
    },
    async ({ fileId, nodeId, body, authorName, mentionTargets }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              thread: await storage.createCommentThread(fileId, { nodeId, body, authorName, mentionTargets })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "list_comment_notifications",
    {
      description: "List project and file unread comment notification counts for a Layo viewer.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        viewerId: z.string().optional().describe("Viewer id used to compute unread comment notifications")
      }
    },
    async ({ viewerId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              summary: await storage.listCommentNotifications({ viewerId })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "list_comment_activity",
    {
      description: "List recent retained comment activity events across Layo projects and files.",
      annotations: readOnlyToolAnnotations,
      inputSchema: {
        viewerId: z.string().optional().describe("Viewer id returned with the activity feed"),
        limit: z.number().optional().describe("Maximum number of recent activity events to return")
      }
    },
    async ({ viewerId, limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              feed: await storage.listCommentActivity({ viewerId, limit })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "resolve_comment_thread",
    {
      description: "Resolve one selected-node comment thread for a Layo design file.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        threadId: z.string().describe("Comment thread id returned by list_comment_threads")
      }
    },
    async ({ fileId, threadId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              thread: await storage.resolveCommentThread(fileId, threadId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "mark_comment_thread_read",
    {
      description: "Mark one selected-node comment thread as read for a Layo viewer.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        threadId: z.string().describe("Comment thread id returned by list_comment_threads"),
        viewerId: z.string().optional().describe("Viewer id to add to the thread read state")
      }
    },
    async ({ fileId, threadId, viewerId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              thread: await storage.markCommentThreadRead(fileId, threadId, { viewerId })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "mark_file_comments_read",
    {
      description: "Mark every active comment thread in one Layo design file as read for a viewer.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        viewerId: z.string().optional().describe("Viewer id to add to each active thread read state")
      }
    },
    async ({ fileId, viewerId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              threads: await storage.markFileCommentsRead(fileId, { viewerId })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "add_comment_reply",
    {
      description: "Add a reply to one selected-node comment thread for a Layo design file.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        threadId: z.string().describe("Comment thread id returned by list_comment_threads"),
        body: z.string().describe("Reply body"),
        authorName: z.string().optional().describe("Display name for the reply author"),
        mentionTargets: z.array(commentMentionTargetSchema).optional().describe("Resolved team members mentioned by this reply")
      }
    },
    async ({ fileId, threadId, body, authorName, mentionTargets }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              thread: await storage.addCommentReply(fileId, threadId, { body, authorName, mentionTargets })
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "import_design_tokens",
    {
      description: "Import W3C/DTCG design tokens into a saved Layo document.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        tokens: z.record(z.string(), z.unknown()).describe("W3C/DTCG token JSON document")
      }
    },
    async ({ fileId, tokens }) => {
      const result = await storage.importTokensDtcg(fileId, tokens);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                fileId,
                file: result.file,
                tokens: result.tokens,
                tokenSets: result.tokenSets,
                tokenThemes: result.tokenThemes
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
        fontFamily: z.string().default("Inter"),
        writingMode: z.enum(["horizontal_tb", "vertical_rl", "vertical_lr"]).optional()
      }
    },
    async ({ fileId, parentId, id, name, value, x, y, width, height, fill, fontSize, fontFamily, writingMode }) => {
      const content: DesignNode["content"] = { type: "text", value, font_size: fontSize, font_family: fontFamily };
      if (writingMode) {
        content.writing_mode = writingMode;
      }
      const node: DesignNode = {
        id,
        kind: "text",
        name,
        transform: { x, y, rotation: 0 },
        size: { width, height },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content,
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
    "list_code_component_mappings",
    {
      description: "List saved repo component mappings for a local design file.",
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
              mappings: await storage.listCodeComponentMappings(fileId)
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "set_code_component_mappings",
    {
      description: "Replace saved repo component mappings for a local design file.",
      annotations: writeToolAnnotations,
      inputSchema: {
        fileId: z.string().describe("Design file id returned by list_files"),
        mappings: z.array(codeComponentMappingSchema).describe("Repo component mappings to persist")
      }
    },
    async ({ fileId, mappings }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              fileId,
              mappings: await storage.setCodeComponentMappings(
                fileId,
                mappings as CodeComponentMapping[]
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
