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
    expect(byName.get("import_design_tokens")?.annotations).toMatchObject({
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
