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
    expect(byName.get("export_design_tokens")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("export_file_archive")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("list_library_registry")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("review_library_registry_item")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("review_library_registry_tokens")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("import_design_tokens")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("list_code_component_mappings")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("set_code_component_mappings")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("import_file_archive")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("publish_library_registry_item")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("import_library_registry_item")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("import_library_registry_tokens")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("list_library_registry_token_subscriptions")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("list_library_registry_token_updates")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("list_library_registry_subscriptions")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("list_library_registry_updates")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(byName.get("update_library_registry_item")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
    expect(byName.get("update_library_registry_tokens")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    });
  });

  test("lets an MCP client manage project manifests", async () => {
    const client = await connectMcpClient();

    const listed = parseToolJson(
      await client.callTool({
        name: "list_projects",
        arguments: {}
      })
    );
    expect(listed.projects).toEqual([]);

    const created = parseToolJson(
      await client.callTool({
        name: "create_project",
        arguments: {
          projectId: "project-mcp",
          name: "MCP 프로젝트",
          documentId: "document-mcp",
          documentName: "MCP 문서"
        }
      })
    );
    expect(created.project).toMatchObject({
      projectId: "project-mcp",
      currentDocumentId: "document-mcp"
    });

    const renamed = parseToolJson(
      await client.callTool({
        name: "update_project",
        arguments: { projectId: "project-mcp", name: "MCP 리네임" }
      })
    );
    expect(renamed.project.name).toBe("MCP 리네임");

    const nextDocument = parseToolJson(
      await client.callTool({
        name: "create_project_document",
        arguments: { projectId: "project-mcp", documentId: "document-mcp-2", name: "두 번째 MCP 문서" }
      })
    );
    expect(nextDocument.project.currentDocumentId).toBe("document-mcp-2");

    const shared = parseToolJson(
      await client.callTool({
        name: "set_project_sharing",
        arguments: { projectId: "project-mcp", mode: "team", teamId: "team-mcp" }
      })
    );
    expect(shared.project.sharing).toEqual({ mode: "team", teamId: "team-mcp" });

    const duplicated = parseToolJson(
      await client.callTool({
        name: "duplicate_project",
        arguments: {
          projectId: "project-mcp",
          newProjectId: "project-mcp-copy",
          name: "MCP 복제",
          documentIdPrefix: "mcp-copy"
        }
      })
    );
    expect(duplicated.project).toMatchObject({
      projectId: "project-mcp-copy",
      name: "MCP 복제",
      currentDocumentId: "mcp-copy-document-mcp-2"
    });

    const deleted = parseToolJson(
      await client.callTool({
        name: "delete_project",
        arguments: { projectId: "project-mcp-copy" }
      })
    );
    expect(deleted.project.projectId).toBe("project-mcp-copy");
  });

  test("lets an MCP client inspect, edit, find, and validate a design file", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "sample-project",
        name: "테스트 프로젝트",
        documentId: "sample-file",
        documentName: "테스트 문서"
      }
    });

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

  test("lets an MCP client import and export DTCG design tokens", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "token-project",
        name: "토큰 프로젝트",
        documentId: "token-file",
        documentName: "토큰 문서"
      }
    });

    const imported = parseToolJson(
      await client.callTool({
        name: "import_design_tokens",
        arguments: {
          fileId: "token-file",
          tokens: {
            global: {
              Brand: {
                Primary: {
                  $type: "color",
                  $value: "#2563eb"
                }
              },
              Spacing: {
                Large: {
                  $type: "dimension",
                  $value: "32px"
                }
              }
            }
          }
        }
      })
    );
    expect(imported.tokens).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      },
      {
        id: "spacing-spacing-large",
        name: "Spacing / Large",
        type: "spacing",
        value: "32px"
      }
    ]);

    const exported = parseToolJson(
      await client.callTool({
        name: "export_design_tokens",
        arguments: { fileId: "token-file" }
      })
    );
    expect(exported.tokens).toMatchObject({
      $metadata: {
        tokenSetOrder: ["global"],
        activeThemes: []
      },
      global: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        },
        Spacing: {
          Large: {
            $type: "dimension",
            $value: "32px"
          }
        }
      }
    });
  });

  test("lets an MCP client save and list repo component mappings", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "mapping-project",
        name: "Mapping project",
        documentId: "mapping-file",
        documentName: "Mapping file"
      }
    });

    await client.callTool({
      name: "create_component",
      arguments: {
        fileId: "mapping-file",
        nodeId: "frame-1",
        componentId: "component-card",
        name: "Card"
      }
    });

    const saved = parseToolJson(
      await client.callTool({
        name: "set_code_component_mappings",
        arguments: {
          fileId: "mapping-file",
          mappings: [
            {
              id: "mapping-card",
              component_id: "component-card",
              package_name: "@repo/ui",
              import_path: "@repo/ui/card",
              export_name: "Card",
              import_mode: "named",
              props: [
                {
                  name: "title",
                  type: "string",
                  source_node_id: "text-1",
                  source_field: "text",
                  default_value: "Layo"
                }
              ],
              variant_props: [
                {
                  name: "surface",
                  type: "string",
                  variant_property: "surface",
                  default_value: "elevated"
                }
              ],
              docs_url: "https://repo.example/ui/card"
            }
          ]
        }
      })
    );
    expect(saved.mappings).toEqual([
      expect.objectContaining({ id: "mapping-card", component_id: "component-card" })
    ]);

    const listed = parseToolJson(
      await client.callTool({
        name: "list_code_component_mappings",
        arguments: { fileId: "mapping-file" }
      })
    );
    expect(listed.mappings[0]).toMatchObject({
      component_id: "component-card",
      import_path: "@repo/ui/card",
      export_name: "Card",
      variant_props: [
        {
          name: "surface",
          type: "string",
          variant_property: "surface",
          default_value: "elevated"
        }
      ]
    });
  });

  test("lets an MCP client export and import file archives", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "archive-project",
        name: "아카이브 프로젝트",
        documentId: "archive-file",
        documentName: "아카이브 문서"
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "archive-file",
        dryRun: false,
        commands: [
          {
            type: "update_text",
            nodeId: "text-1",
            value: "아카이브 원본"
          }
        ]
      }
    });

    const exported = parseToolJson(
      await client.callTool({
        name: "export_file_archive",
        arguments: { fileId: "archive-file" }
      })
    );

    expect(exported).toMatchObject({
      fileId: "archive-file",
      name: "아카이브 문서",
      assetCount: 0,
      mimeType: "application/vnd.layo.file-archive+zip",
      fileName: "archive-file.layo.zip"
    });
    expect(Buffer.from(exported.archiveBase64, "base64").subarray(0, 2).toString("utf8")).toBe("PK");

    const imported = parseToolJson(
      await client.callTool({
        name: "import_file_archive",
        arguments: {
          archiveBase64: exported.archiveBase64,
          fileId: "archive-copy",
          name: "아카이브 사본"
        }
      })
    );

    expect(imported.imported).toMatchObject({
      fileId: "archive-copy",
      name: "아카이브 사본",
      originalFileId: "archive-file",
      originalName: "아카이브 문서",
      assetCount: 0
    });

    const copied = parseToolJson(
      await client.callTool({
        name: "get_design_context",
        arguments: { fileId: "archive-copy" }
      })
    );
    expect(JSON.stringify(copied)).toContain("아카이브 원본");
  });

  test("lets an MCP client publish review and import registry libraries", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "library-project",
        name: "Library Project",
        documentId: "library-file",
        documentName: "Library File"
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-file",
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: {
              id: "color-brand-primary",
              name: "Brand / Primary",
              type: "color",
              value: "#2563eb"
            }
          },
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-card",
            name: "Library Card",
            width: 160,
            height: 96,
            fill: "#ffffff"
          },
          { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
          { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
        ]
      }
    });

    const published = parseToolJson(
      await client.callTool({
        name: "publish_library_registry_item",
        arguments: {
          fileId: "library-file",
          libraryId: "team-kit",
          name: "Team Kit"
        }
      })
    );
    expect(published.library).toMatchObject({
      libraryId: "team-kit",
      name: "Team Kit",
      sourceFileId: "library-file",
      sourceName: "Library File",
      componentCount: 1,
      tokenCount: 1,
      assetCount: 0
    });
    expect(published.library.publishedAt).toEqual(expect.any(String));

    const listed = parseToolJson(
      await client.callTool({
        name: "list_library_registry",
        arguments: {}
      })
    );
    expect(listed.libraries).toEqual([expect.objectContaining({ libraryId: "team-kit", name: "Team Kit" })]);

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "target-library-project",
        name: "Target Library Project",
        documentId: "target-library-file",
        documentName: "Target Library File"
      }
    });
    const review = parseToolJson(
      await client.callTool({
        name: "review_library_registry_item",
        arguments: {
          fileId: "target-library-file",
          libraryId: "team-kit"
        }
      })
    );
    expect(review.review).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      originalFileId: "library-file",
      originalName: "Library File",
      componentCount: 1,
      tokenCount: 1,
      components: [expect.objectContaining({ originalComponentId: "component-card", name: "Card", conflict: false })],
      tokens: [expect.objectContaining({ originalTokenId: "color-brand-primary", name: "Brand / Primary", conflict: false })]
    });

    const imported = parseToolJson(
      await client.callTool({
        name: "import_library_registry_item",
        arguments: {
          fileId: "target-library-file",
          libraryId: "team-kit",
          idPrefix: "team"
        }
      })
    );
    expect(imported.imported).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      componentCount: 1,
      tokenCount: 1,
      componentIdMap: {
        "component-card": "team-component-card"
      },
      tokenIdMap: {
        "color-brand-primary": "color-brand-primary"
      }
    });

    const target = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "target-library-file" }
      })
    );
    expect(target.inspection.components).toEqual([
      expect.objectContaining({ id: "team-component-card", name: "Card" })
    ]);
    expect(target.inspection.tokens).toEqual([
      expect.objectContaining({ id: "color-brand-primary", name: "Brand / Primary" })
    ]);
  });

  test("scopes registry library MCP list and imports to matching project teams", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "library-project",
        name: "Library Project",
        documentId: "library-file",
        documentName: "Library File"
      }
    });
    await client.callTool({
      name: "set_project_sharing",
      arguments: { projectId: "library-project", mode: "team", teamId: "team-alpha" }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-file",
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: {
              id: "color-brand-primary",
              name: "Brand / Primary",
              type: "color",
              value: "#2563eb"
            }
          },
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-card",
            name: "Library Card",
            width: 160,
            height: 96,
            fill: "#ffffff"
          },
          { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
          { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
        ]
      }
    });
    const published = parseToolJson(
      await client.callTool({
        name: "publish_library_registry_item",
        arguments: {
          fileId: "library-file",
          libraryId: "team-kit",
          name: "Team Kit"
        }
      })
    );
    expect(published.library).toMatchObject({ libraryId: "team-kit", teamId: "team-alpha" });

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "target-project",
        name: "Target Project",
        documentId: "target-file",
        documentName: "Target File"
      }
    });
    await client.callTool({
      name: "set_project_sharing",
      arguments: { projectId: "target-project", mode: "team", teamId: "team-alpha" }
    });
    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "other-project",
        name: "Other Project",
        documentId: "other-file",
        documentName: "Other File"
      }
    });
    await client.callTool({
      name: "set_project_sharing",
      arguments: { projectId: "other-project", mode: "team", teamId: "team-beta" }
    });

    const targetList = parseToolJson(
      await client.callTool({
        name: "list_library_registry",
        arguments: { fileId: "target-file" }
      })
    );
    expect(targetList.libraries).toEqual([
      expect.objectContaining({ libraryId: "team-kit", teamId: "team-alpha" })
    ]);

    const otherList = parseToolJson(
      await client.callTool({
        name: "list_library_registry",
        arguments: { fileId: "other-file" }
      })
    );
    expect(otherList.libraries).toEqual([]);

    const targetReview = parseToolJson(
      await client.callTool({
        name: "review_library_registry_item",
        arguments: {
          fileId: "target-file",
          libraryId: "team-kit"
        }
      })
    );
    expect(targetReview.review).toMatchObject({ libraryId: "team-kit", componentCount: 1 });

    const unauthorizedImport = await client.callTool({
        name: "import_library_registry_item",
        arguments: {
          fileId: "other-file",
          libraryId: "team-kit",
          idPrefix: "team"
        }
    });
    expect(unauthorizedImport).toMatchObject({
      isError: true,
      content: [expect.objectContaining({ text: expect.stringMatching(/not authorized/i) })]
    });
  });

  test("lets an MCP client review and import registry token bundles", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "library-token-project",
        name: "Library Token Project",
        documentId: "library-token-file",
        documentName: "Library Token File"
      }
    });
    await client.callTool({
      name: "import_design_tokens",
      arguments: {
        fileId: "library-token-file",
        tokens: {
          $metadata: {
            tokenSetOrder: ["base", "light", "dark"],
            activeTokenSets: ["base", "light"]
          },
          base: {
            Brand: {
              Primary: {
                $type: "color",
                $value: "#2563eb"
              }
            }
          },
          light: {
            Brand: {
              Primary: {
                $type: "color",
                $value: "#1d4ed8"
              }
            }
          },
          dark: {
            Brand: {
              Primary: {
                $type: "color",
                $value: "#93c5fd"
              }
            }
          }
        }
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-token-file",
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-brand",
              name: "Brand Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "light", "dark"]
            }
          }
        ]
      }
    });
    await client.callTool({
      name: "publish_library_registry_item",
      arguments: {
        fileId: "library-token-file",
        libraryId: "team-kit",
        name: "Team Kit"
      }
    });

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "target-token-project",
        name: "Target Token Project",
        documentId: "target-token-file",
        documentName: "Target Token File"
      }
    });
    await client.callTool({
      name: "import_design_tokens",
      arguments: {
        fileId: "target-token-file",
        tokens: {
          $metadata: {
            tokenSetOrder: ["legacy"],
            activeTokenSets: ["legacy"]
          },
          legacy: {
            Legacy: {
              Primary: {
                $type: "color",
                $value: "#111827"
              }
            }
          }
        }
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "target-token-file",
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-legacy",
              name: "Legacy Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["legacy"]
            }
          }
        ]
      }
    });

    const review = parseToolJson(
      await client.callTool({
        name: "review_library_registry_tokens",
        arguments: { fileId: "target-token-file", libraryId: "team-kit" }
      })
    );
    expect(review.review).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      tokenCount: 3,
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacesTokenCount: 1,
      replacesTokenSetCount: 1,
      replacesTokenThemeCount: 1,
      tokenThemes: [expect.objectContaining({ id: "theme-brand", token_set_ids: ["base", "light", "dark"] })]
    });

    const imported = parseToolJson(
      await client.callTool({
        name: "import_library_registry_tokens",
        arguments: { fileId: "target-token-file", libraryId: "team-kit" }
      })
    );
    expect(imported.imported).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      tokenCount: 3,
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacedTokenCount: 1,
      replacedTokenSetCount: 1,
      replacedTokenThemeCount: 1
    });

    const exported = parseToolJson(
      await client.callTool({
        name: "export_design_tokens",
        arguments: { fileId: "target-token-file" }
      })
    );
    expect(exported.tokens).toMatchObject({
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeThemes: ["theme-brand"]
      }
    });
    expect(exported.tokens.$themes).toEqual([
      {
        id: "theme-brand",
        name: "Brand Theme",
        group: "mode",
        selectedTokenSets: ["base", "light", "dark"]
      }
    ]);
  });

  test("lets an MCP client list and apply registry token bundle updates", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "library-token-project",
        name: "Library Token Project",
        documentId: "library-token-file",
        documentName: "Library Token File"
      }
    });
    await client.callTool({
      name: "import_design_tokens",
      arguments: {
        fileId: "library-token-file",
        tokens: {
          $metadata: {
            tokenSetOrder: ["base", "light", "dark"],
            activeTokenSets: ["base", "light"]
          },
          base: { Brand: { Primary: { $type: "color", $value: "#2563eb" } } },
          light: { Brand: { Primary: { $type: "color", $value: "#1d4ed8" } } },
          dark: { Brand: { Primary: { $type: "color", $value: "#93c5fd" } } }
        }
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-token-file",
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-brand",
              name: "Brand Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "light", "dark"]
            }
          }
        ]
      }
    });
    const firstPublish = parseToolJson(
      await client.callTool({
        name: "publish_library_registry_item",
        arguments: { fileId: "library-token-file", libraryId: "team-kit", name: "Team Kit" }
      })
    );

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "target-token-project",
        name: "Target Token Project",
        documentId: "target-token-file",
        documentName: "Target Token File"
      }
    });
    await client.callTool({
      name: "import_library_registry_tokens",
      arguments: { fileId: "target-token-file", libraryId: "team-kit" }
    });

    const subscriptions = parseToolJson(
      await client.callTool({
        name: "list_library_registry_token_subscriptions",
        arguments: { fileId: "target-token-file" }
      })
    );
    expect(subscriptions.subscriptions).toEqual([
      expect.objectContaining({
        libraryId: "team-kit",
        importedRegistryUpdatedAt: firstPublish.library.updatedAt,
        tokenCount: 3,
        tokenSetCount: 3,
        tokenThemeCount: 1
      })
    ]);
    const noUpdates = parseToolJson(
      await client.callTool({
        name: "list_library_registry_token_updates",
        arguments: { fileId: "target-token-file" }
      })
    );
    expect(noUpdates.updates).toEqual([]);

    await client.callTool({
      name: "import_design_tokens",
      arguments: {
        fileId: "library-token-file",
        tokens: {
          $metadata: {
            tokenSetOrder: ["base", "light", "dark", "contrast"],
            activeTokenSets: ["base", "dark"]
          },
          base: { Brand: { Primary: { $type: "color", $value: "#0ea5e9" } } },
          light: { Brand: { Primary: { $type: "color", $value: "#38bdf8" } } },
          dark: { Brand: { Primary: { $type: "color", $value: "#bae6fd" } } },
          contrast: { Brand: { Primary: { $type: "color", $value: "#082f49" } } }
        }
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-token-file",
        dryRun: false,
        commands: [
          {
            type: "upsert_token_theme",
            tokenTheme: {
              id: "theme-brand",
              name: "Brand Theme",
              group: "mode",
              enabled: true,
              token_set_ids: ["base", "dark"]
            }
          }
        ]
      }
    });
    const secondPublish = parseToolJson(
      await client.callTool({
        name: "publish_library_registry_item",
        arguments: { fileId: "library-token-file", libraryId: "team-kit", name: "Team Kit" }
      })
    );

    const updates = parseToolJson(
      await client.callTool({
        name: "list_library_registry_token_updates",
        arguments: { fileId: "target-token-file" }
      })
    );
    expect(updates.updates).toEqual([
      expect.objectContaining({
        libraryId: "team-kit",
        importedRegistryUpdatedAt: firstPublish.library.updatedAt,
        registryUpdatedAt: secondPublish.library.updatedAt,
        tokenCount: 4,
        tokenSetCount: 4,
        tokenThemeCount: 1
      })
    ]);

    const applied = parseToolJson(
      await client.callTool({
        name: "update_library_registry_tokens",
        arguments: { fileId: "target-token-file", libraryId: "team-kit" }
      })
    );
    expect(applied.imported).toMatchObject({
      libraryId: "team-kit",
      tokenCount: 4,
      tokenSetCount: 4,
      tokenThemeCount: 1
    });
    const exported = parseToolJson(
      await client.callTool({
        name: "export_design_tokens",
        arguments: { fileId: "target-token-file" }
      })
    );
    expect(exported.tokens).toMatchObject({
      $metadata: {
        tokenSetOrder: ["base", "light", "dark", "contrast"],
        activeThemes: ["theme-brand"]
      }
    });
    expect(exported.tokens.$themes).toEqual([
      {
        id: "theme-brand",
        name: "Brand Theme",
        group: "mode",
        selectedTokenSets: ["base", "dark"]
      }
    ]);
  });

  test("lets an MCP client list and apply registry library updates", async () => {
    const client = await connectMcpClient();
    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "library-project",
        name: "Library Project",
        documentId: "library-file",
        documentName: "Library File"
      }
    });
    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-file",
        dryRun: false,
        commands: [
          {
            type: "create_token",
            token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
          },
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-card",
            name: "Library Card",
            width: 160,
            height: 96,
            fill: "#ffffff"
          },
          { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
          { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
        ]
      }
    });
    const firstPublish = parseToolJson(
      await client.callTool({
        name: "publish_library_registry_item",
        arguments: { fileId: "library-file", libraryId: "team-kit", name: "Team Kit" }
      })
    );
    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "target-library-project",
        name: "Target Library Project",
        documentId: "target-library-file",
        documentName: "Target Library File"
      }
    });
    await client.callTool({
      name: "import_library_registry_item",
      arguments: { fileId: "target-library-file", libraryId: "team-kit", idPrefix: "team" }
    });

    const subscriptions = parseToolJson(
      await client.callTool({
        name: "list_library_registry_subscriptions",
        arguments: { fileId: "target-library-file" }
      })
    );
    expect(subscriptions.subscriptions).toEqual([
      expect.objectContaining({
        libraryId: "team-kit",
        importedRegistryUpdatedAt: firstPublish.library.updatedAt,
        componentIdMap: { "component-card": "team-component-card" }
      })
    ]);
    const noUpdates = parseToolJson(
      await client.callTool({
        name: "list_library_registry_updates",
        arguments: { fileId: "target-library-file" }
      })
    );
    expect(noUpdates.updates).toEqual([]);

    await client.callTool({
      name: "apply_agent_commands",
      arguments: {
        fileId: "library-file",
        dryRun: false,
        commands: [
          {
            type: "create_rectangle",
            parentId: "frame-1",
            id: "library-badge",
            name: "Library Badge",
            width: 80,
            height: 32,
            fill: "#2563eb"
          },
          { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
        ]
      }
    });
    const secondPublish = parseToolJson(
      await client.callTool({
        name: "publish_library_registry_item",
        arguments: { fileId: "library-file", libraryId: "team-kit", name: "Team Kit" }
      })
    );
    const updates = parseToolJson(
      await client.callTool({
        name: "list_library_registry_updates",
        arguments: { fileId: "target-library-file" }
      })
    );
    expect(updates.updates).toEqual([
      expect.objectContaining({
        libraryId: "team-kit",
        importedRegistryUpdatedAt: firstPublish.library.updatedAt,
        registryUpdatedAt: secondPublish.library.updatedAt,
        componentCount: 2
      })
    ]);

    const applied = parseToolJson(
      await client.callTool({
        name: "update_library_registry_item",
        arguments: { fileId: "target-library-file", libraryId: "team-kit" }
      })
    );
    expect(applied.imported).toMatchObject({
      libraryId: "team-kit",
      componentIdMap: {
        "component-card": "team-component-card",
        "component-badge": "team-component-badge"
      }
    });
    const inspection = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "target-library-file" }
      })
    );
    expect(inspection.inspection.components.map((component: { id: string }) => component.id)).toEqual([
      "team-component-card",
      "team-component-badge"
    ]);
  });

  test("lets an MCP client save, read, list, and restore file versions", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "history-project",
        name: "히스토리 프로젝트",
        documentId: "history-file",
        documentName: "히스토리 문서"
      }
    });

    const saved = parseToolJson(
      await client.callTool({
        name: "save_file_version",
        arguments: { fileId: "history-file", message: "검토 전" }
      })
    );
    expect(saved.version).toMatchObject({
      fileId: "history-file",
      message: "검토 전",
      source: "manual"
    });

    await client.callTool({
      name: "update_text",
      arguments: { fileId: "history-file", nodeId: "text-1", value: "MCP 복원 대상" }
    });

    const listed = parseToolJson(
      await client.callTool({
        name: "list_file_versions",
        arguments: { fileId: "history-file" }
      })
    );
    expect(listed.versions.map((item: { versionId: string }) => item.versionId)).toContain(
      saved.version.versionId
    );

    const read = parseToolJson(
      await client.callTool({
        name: "get_file_version",
        arguments: { fileId: "history-file", versionId: saved.version.versionId }
      })
    );
    expect(read.version.document.pages[0].children[0].children[0].content.value).toBe("Layo");

    const restored = parseToolJson(
      await client.callTool({
        name: "restore_file_version",
        arguments: { fileId: "history-file", versionId: saved.version.versionId }
      })
    );
    expect(restored.file.pages[0].children[0].children[0].content.value).toBe("Layo");
    expect(restored.recoveryVersion.source).toBe("restore");
  });

  test("lets an MCP client pin a file version", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "pinned-history-project",
        name: "고정 히스토리 프로젝트",
        documentId: "pinned-history-file",
        documentName: "고정 히스토리 문서"
      }
    });

    const saved = parseToolJson(
      await client.callTool({
        name: "save_file_version",
        arguments: { fileId: "pinned-history-file", message: "릴리즈 검토" }
      })
    );

    const pinned = parseToolJson(
      await client.callTool({
        name: "pin_file_version",
        arguments: {
          fileId: "pinned-history-file",
          versionId: saved.version.versionId,
          pinned: true
        }
      })
    );
    expect(pinned.version).toMatchObject({
      versionId: saved.version.versionId,
      pinned: true
    });

    const listed = parseToolJson(
      await client.callTool({
        name: "list_file_versions",
        arguments: { fileId: "pinned-history-file" }
      })
    );
    expect(listed.versions[0]).toMatchObject({
      versionId: saved.version.versionId,
      pinned: true
    });
  });

  test("lets an MCP client apply file version retention", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "retention-history-project",
        name: "정리 히스토리 프로젝트",
        documentId: "retention-history-file",
        documentName: "정리 히스토리 문서"
      }
    });

    const deletedCandidate = parseToolJson(
      await client.callTool({
        name: "save_file_version",
        arguments: { fileId: "retention-history-file", message: "삭제할 고정 버전" }
      })
    );
    await client.callTool({
      name: "pin_file_version",
      arguments: {
        fileId: "retention-history-file",
        versionId: deletedCandidate.version.versionId,
        pinned: true
      }
    });

    const deleted = parseToolJson(
      await client.callTool({
        name: "delete_file_version",
        arguments: {
          fileId: "retention-history-file",
          versionId: deletedCandidate.version.versionId
        }
      })
    );
    expect(deleted.version).toMatchObject({
      versionId: deletedCandidate.version.versionId,
      pinned: true,
      deleted: true
    });

    const protectedVersion = parseToolJson(
      await client.callTool({
        name: "save_file_version",
        arguments: { fileId: "retention-history-file", message: "릴리즈 기준" }
      })
    );
    await client.callTool({
      name: "pin_file_version",
      arguments: {
        fileId: "retention-history-file",
        versionId: protectedVersion.version.versionId,
        pinned: true
      }
    });
    const oldVersion = parseToolJson(
      await client.callTool({
        name: "save_file_version",
        arguments: { fileId: "retention-history-file", message: "오래된 작업" }
      })
    );
    await client.callTool({
      name: "update_text",
      arguments: { fileId: "retention-history-file", nodeId: "text-1", value: "최신 작업" }
    });
    const newestVersion = parseToolJson(
      await client.callTool({
        name: "save_file_version",
        arguments: { fileId: "retention-history-file", message: "최신 작업" }
      })
    );

    const pruned = parseToolJson(
      await client.callTool({
        name: "prune_file_versions",
        arguments: { fileId: "retention-history-file", keepUnpinned: 1 }
      })
    );
    expect(pruned.result.deletedVersions).toEqual([
      expect.objectContaining({ versionId: oldVersion.version.versionId, pinned: false })
    ]);

    const listed = parseToolJson(
      await client.callTool({
        name: "list_file_versions",
        arguments: { fileId: "retention-history-file" }
      })
    );
    expect(listed.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ versionId: protectedVersion.version.versionId, pinned: true }),
        expect.objectContaining({ versionId: newestVersion.version.versionId, pinned: false })
      ])
    );
  });

  test("lets an MCP client create, list, and resolve selected-node comments", async () => {
    const client = await connectMcpClient();
    const target = { userId: "사용자", displayName: "민지", role: "editor" } as const;

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "comment-project",
        name: "코멘트 프로젝트",
        documentId: "comment-file",
        documentName: "코멘트 문서"
      }
    });

    const created = parseToolJson(
      await client.callTool({
        name: "create_comment_thread",
        arguments: {
          fileId: "comment-file",
          nodeId: "text-1",
          body: "@민지 문구 확인 필요",
          authorName: "디자인 팀",
          mentionTargets: [target]
        }
      })
    );
    expect(created.thread).toMatchObject({
      fileId: "comment-file",
      nodeId: "text-1",
      nodeName: "헤드라인",
      body: "@민지 문구 확인 필요",
      mentions: ["민지"],
      mentionTargets: [target],
      readBy: ["디자인 팀"],
      replies: [],
      resolvedAt: null
    });

    const unread = parseToolJson(
      await client.callTool({
        name: "list_comment_threads",
        arguments: { fileId: "comment-file", viewerId: "사용자" }
      })
    );
    expect(unread.threads[0]).toMatchObject({
      threadId: created.thread.threadId,
      unread: true
    });

    const read = parseToolJson(
      await client.callTool({
        name: "mark_comment_thread_read",
        arguments: { fileId: "comment-file", threadId: created.thread.threadId, viewerId: "사용자" }
      })
    );
    expect(read.thread).toMatchObject({
      threadId: created.thread.threadId,
      unread: false,
      readBy: ["디자인 팀", "사용자"]
    });

    const replied = parseToolJson(
      await client.callTool({
        name: "add_comment_reply",
        arguments: {
          fileId: "comment-file",
          threadId: created.thread.threadId,
          body: "@민지 문구를 더 짧게 줄였어요",
          authorName: "개발 팀",
          mentionTargets: [target]
        }
      })
    );
    expect(replied.thread.replies).toEqual([
      expect.objectContaining({
        body: "@민지 문구를 더 짧게 줄였어요",
        authorName: "개발 팀",
        mentions: ["민지"],
        mentionTargets: [target]
      })
    ]);

    const listed = parseToolJson(
      await client.callTool({
        name: "list_comment_threads",
        arguments: { fileId: "comment-file" }
      })
    );
    expect(listed.threads.map((thread: { body: string }) => thread.body)).toEqual(["@민지 문구 확인 필요"]);
    expect(listed.threads[0].replies.map((reply: { body: string }) => reply.body)).toEqual([
      "@민지 문구를 더 짧게 줄였어요"
    ]);

    const notifications = parseToolJson(
      await client.callTool({
        name: "list_comment_notifications",
        arguments: { viewerId: "사용자" }
      })
    );
    expect(notifications.summary).toMatchObject({
      viewerId: "사용자",
      totalUnread: 1,
      totalMentions: 1,
      projects: [
        {
          projectId: "comment-project",
          unreadCount: 1,
          mentionCount: 1,
          files: [{ fileId: "comment-file", name: "코멘트 문서", unreadCount: 1, mentionCount: 1 }]
        }
      ]
    });

    const fileRead = parseToolJson(
      await client.callTool({
        name: "mark_file_comments_read",
        arguments: { fileId: "comment-file", viewerId: "사용자" }
      })
    );
    expect(fileRead.threads[0]).toMatchObject({
      threadId: created.thread.threadId,
      unread: false
    });

    const notificationsAfterRead = parseToolJson(
      await client.callTool({
        name: "list_comment_notifications",
        arguments: { viewerId: "사용자" }
      })
    );
    expect(notificationsAfterRead.summary).toMatchObject({
      totalUnread: 0,
      totalMentions: 0,
      projects: []
    });

    const resolved = parseToolJson(
      await client.callTool({
        name: "resolve_comment_thread",
        arguments: { fileId: "comment-file", threadId: created.thread.threadId }
      })
    );
    expect(resolved.thread.resolvedAt).toEqual(expect.any(String));

    const activity = parseToolJson(
      await client.callTool({
        name: "list_comment_activity",
        arguments: { viewerId: "사용자", limit: 3 }
      })
    );
    expect(activity.feed).toMatchObject({
      viewerId: "사용자",
      events: [
        {
          type: "resolved",
          projectId: "comment-project",
          projectName: "코멘트 프로젝트",
          fileId: "comment-file",
          fileName: "코멘트 문서",
          threadId: created.thread.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "사용자",
          body: "@민지 문구 확인 필요",
          mentions: ["민지"],
          mentionTargets: [target]
        },
        {
          type: "replied",
          projectId: "comment-project",
          projectName: "코멘트 프로젝트",
          fileId: "comment-file",
          fileName: "코멘트 문서",
          threadId: created.thread.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "개발 팀",
          body: "@민지 문구를 더 짧게 줄였어요",
          mentions: ["민지"],
          mentionTargets: [target]
        },
        {
          type: "created",
          projectId: "comment-project",
          projectName: "코멘트 프로젝트",
          fileId: "comment-file",
          fileName: "코멘트 문서",
          threadId: created.thread.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "디자인 팀",
          body: "@민지 문구 확인 필요",
          mentions: ["민지"],
          mentionTargets: [target]
        }
      ]
    });

    const active = parseToolJson(
      await client.callTool({
        name: "list_comment_threads",
        arguments: { fileId: "comment-file" }
      })
    );
    expect(active.threads).toEqual([]);
  });

  test("lists automatic file versions created by persisted MCP agent commands", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "auto-history-project",
        name: "자동 히스토리 프로젝트",
        documentId: "auto-history-file",
        documentName: "자동 히스토리 문서"
      }
    });

    for (const value of ["MCP 자동 1", "MCP 자동 2", "MCP 자동 3"]) {
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "auto-history-file",
          dryRun: false,
          commands: [{ type: "update_text", nodeId: "text-1", value }]
        }
      });
    }

    const listed = parseToolJson(
      await client.callTool({
        name: "list_file_versions",
        arguments: { fileId: "auto-history-file" }
      })
    );
    const autoVersion = listed.versions.find((version: { source: string }) => version.source === "auto");
    expect(autoVersion).toMatchObject({ message: "자동 저장", source: "auto" });
  });

  test("lets an MCP client bind spacing tokens to layout gap and padding", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "spacing-token-project",
        name: "간격 토큰 프로젝트",
        documentId: "spacing-token-file",
        documentName: "간격 토큰 문서"
      }
    });

    const persisted = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "spacing-token-file",
          dryRun: false,
          commands: [
            {
              type: "create_token",
              token: {
                id: "spacing-layout-large",
                name: "Layout / Large",
                type: "spacing",
                value: "32px"
              }
            },
            {
              type: "set_layout_spacing_token",
              nodeId: "frame-1",
              target: "all_gaps",
              tokenId: "spacing-layout-large"
            },
            {
              type: "set_layout_spacing_token",
              nodeId: "frame-1",
              target: "all_padding",
              tokenId: "spacing-layout-large"
            }
          ]
        }
      })
    );
    expect(persisted.result).toMatchObject({
      persisted: true,
      audit: {
        commandTypes: ["create_token", "set_layout_spacing_token", "set_layout_spacing_token"],
        changedNodeIds: ["spacing-layout-large", "frame-1"]
      },
      validation: { ok: true, issueCount: 0 }
    });

    const inspection = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "spacing-token-file" }
      })
    );
    const frame = inspection.inspection.nodes.find((node: { id: string }) => node.id === "frame-1");
    expect(frame.layout).toMatchObject({
      gap: 32,
      row_gap: 32,
      column_gap: 32,
      padding: {
        top: 32,
        right: 32,
        bottom: 32,
        left: 32
      },
      spacing_tokens: {
        gap: "spacing-layout-large",
        row_gap: "spacing-layout-large",
        column_gap: "spacing-layout-large",
        padding_top: "spacing-layout-large",
        padding_right: "spacing-layout-large",
        padding_bottom: "spacing-layout-large",
        padding_left: "spacing-layout-large"
      }
    });

    const validation = parseToolJson(
      await client.callTool({
        name: "validate_document",
        arguments: { fileId: "spacing-token-file" }
      })
    );
    expect(validation.validation).toMatchObject({ ok: true, issueCount: 0 });
  });

  test("lets an MCP client set node export presets", async () => {
    const client = await connectMcpClient();

    await client.callTool({
      name: "create_project",
      arguments: {
        projectId: "export-preset-project",
        name: "Export preset project",
        documentId: "export-preset-file",
        documentName: "Export preset file"
      }
    });

    const persisted = parseToolJson(
      await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId: "export-preset-file",
          dryRun: false,
          commands: [
            {
              type: "set_export_presets",
              nodeId: "text-1",
              presets: [
                { id: "preset-png-3x", format: "png", scale: 3, suffix: "@hero" },
                { id: "preset-svg", format: "svg", scale: 1, suffix: "" }
              ]
            }
          ]
        }
      })
    );
    expect(persisted.result).toMatchObject({
      persisted: true,
      audit: {
        commandTypes: ["set_export_presets"],
        changedNodeIds: ["text-1"]
      },
      validation: { ok: true, issueCount: 0 }
    });

    const inspection = parseToolJson(
      await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId: "export-preset-file" }
      })
    );
    const text = inspection.inspection.nodes.find((node: { id: string }) => node.id === "text-1");
    expect(text.exportPresets).toEqual([
      { id: "preset-png-3x", format: "png", scale: 3, suffix: "@hero" },
      { id: "preset-svg", format: "svg", scale: 1, suffix: "" }
    ]);
  });
});

async function connectMcpClient() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-mcp-"));
  activeClient = new Client({ name: "layo-test", version: "1.0.0" });
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
