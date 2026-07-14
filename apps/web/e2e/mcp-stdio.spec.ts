import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("stdio MCP edits move a node, create a component instance, and render in the editor", async ({ page }) => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });

  const result = await runStdioMcpEdit();

  expect(result).toMatchObject({
    sourceNodeId: "mcp-stdio-source",
    componentId: "mcp-stdio-component",
    instanceId: "mcp-stdio-instance",
    sourceBounds: { x: 260, y: 520, width: 300, height: 52 },
    instanceBounds: { x: 620, y: 520, width: 300, height: 52 },
    componentCount: 1,
    validationOk: true,
    validationIssueCount: 0
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "레이어" }).click();

  await page.getByRole("button", { name: /MCP stdio 이동 원본/ }).click();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트");
  await expect(page.getByTestId("inspector-x")).toHaveValue("260");
  await expect(page.getByTestId("inspector-y")).toHaveValue("520");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("52");

  await page.getByRole("button", { name: /MCP stdio 컴포넌트 인스턴스/ }).click();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("520");
});

async function runStdioMcpEdit() {
  const script = String.raw`
    import { Client } from "@modelcontextprotocol/sdk/client/index.js";
    import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

    const fileId = "mcp-stdio-file";
    const sourceNodeId = "mcp-stdio-source";
    const componentId = "mcp-stdio-component";
    const instanceId = "mcp-stdio-instance";
    const client = new Client({ name: "playwright-stdio-mcp", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["mcp"],
      cwd: process.cwd()
    });

    function parseToolJson(result) {
      const first = result.content?.[0];
      if (!first || first.type !== "text") {
        throw new Error("expected text tool result");
      }
      if (result.isError) {
        throw new Error(first.text);
      }
      return JSON.parse(first.text);
    }

    try {
      await client.connect(transport);
      parseToolJson(await client.callTool({
        name: "create_project",
        arguments: {
          projectId: "mcp-stdio-project",
          name: "MCP stdio 프로젝트",
          documentId: fileId,
          documentName: "MCP stdio 문서"
        }
      }));
      parseToolJson(await client.callTool({
        name: "apply_agent_commands",
        arguments: {
          fileId,
          dryRun: false,
          commands: [
            {
              type: "create_text",
              parentId: "page-1",
              id: sourceNodeId,
              name: "MCP stdio 이동 원본",
              value: "MCP stdio 이동 원본",
              x: 96,
              y: 380,
              width: 260,
              height: 48,
              fontSize: 24
            },
            {
              type: "update_geometry",
              nodeId: sourceNodeId,
              x: 260,
              y: 520,
              width: 300,
              height: 52
            },
            {
              type: "create_component",
              nodeId: sourceNodeId,
              componentId,
              name: "MCP stdio 컴포넌트"
            },
            {
              type: "create_component_instance",
              parentId: "page-1",
              definitionId: componentId,
              instanceId,
              x: 620,
              y: 520
            }
          ]
        }
      }));

      const source = parseToolJson(await client.callTool({
        name: "find_nodes",
        arguments: { fileId, id: sourceNodeId }
      })).nodes[0];
      const instance = parseToolJson(await client.callTool({
        name: "find_nodes",
        arguments: { fileId, id: instanceId }
      })).nodes[0];
      const inspection = parseToolJson(await client.callTool({
        name: "inspect_canvas",
        arguments: { fileId }
      })).inspection;

      console.log(JSON.stringify({
        sourceNodeId,
        componentId,
        instanceId,
        sourceBounds: source.bounds,
        instanceBounds: instance.bounds,
        componentCount: inspection.componentCount,
        validationOk: inspection.validation.ok,
        validationIssueCount: inspection.validation.issueCount
      }));
    } finally {
      await client.close().catch(() => undefined);
    }
  `;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: path.join(process.cwd(), "apps/server"),
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
}


test("stdio MCP manages only the authenticated member's file-backed account tokens", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "layo-mcp-stdio-tokens-"));
  const membersFile = path.join(root, "members.json");
  const otherToken = {
    id: "other-existing",
    name: "Other automation",
    tokenHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    createdAt: "2026-07-13T12:00:00.000Z"
  };
  await writeFile(
    membersFile,
    JSON.stringify([
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "owner-member-token"
      },
      {
        userId: "other-user",
        role: "editor",
        teamIds: ["team-alpha"],
        token: "other-member-token",
        tokens: [otherToken]
      }
    ]),
    "utf8"
  );

  try {
    const result = await runStdioTokenManagement(membersFile);
    expect(result.created.token).toMatch(/^layo_pat_/);
    expect(result.created.metadata).toMatchObject({ name: "Stdio deploy automation" });
    expect(result.listed).toEqual({ tokens: [result.created.metadata] });
    expect(result.revoked.metadata).toMatchObject({
      id: result.created.metadata.id,
      revokedAt: expect.any(String)
    });

    const persistedText = await readFile(membersFile, "utf8");
    const persisted = JSON.parse(persistedText);
    const owner = persisted.find((member) => member.userId === "owner-user");
    const other = persisted.find((member) => member.userId === "other-user");
    expect(owner.tokens).toEqual([
      expect.objectContaining({
        id: result.created.metadata.id,
        name: "Stdio deploy automation",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        revokedAt: expect.any(String)
      })
    ]);
    expect(persistedText).not.toContain(result.created.token);
    expect(owner.tokens[0]).not.toHaveProperty("token");
    expect(other.tokens).toEqual([otherToken]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function runStdioTokenManagement(membersFile) {
  const script = String.raw`
    import { Client } from "@modelcontextprotocol/sdk/client/index.js";
    import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

    const client = new Client({ name: "playwright-stdio-token-mcp", version: "1.0.0" });
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry) => typeof entry[1] === "string")
    );
    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["mcp"],
      cwd: process.cwd(),
      env
    });

    function parseToolJson(result) {
      const first = result.content?.[0];
      if (!first || first.type !== "text") {
        throw new Error("expected text tool result");
      }
      if (result.isError) {
        throw new Error(first.text);
      }
      return JSON.parse(first.text);
    }

    try {
      await client.connect(transport);
      const created = parseToolJson(await client.callTool({
        name: "create_account_token",
        arguments: { name: "Stdio deploy automation", expiresInDays: 30 }
      }));
      const listed = parseToolJson(await client.callTool({
        name: "list_account_tokens",
        arguments: {}
      }));
      const revoked = parseToolJson(await client.callTool({
        name: "revoke_account_token",
        arguments: { tokenId: created.metadata.id }
      }));
      console.log(JSON.stringify({ created, listed, revoked }));
    } finally {
      await client.close().catch(() => undefined);
    }
  `;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: path.join(process.cwd(), "apps/server"),
    env: {
      ...process.env,
      LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: membersFile,
      LAYO_MCP_USER_ID: "owner-user",
      LAYO_MCP_MEMBER_TOKEN: "owner-member-token"
    },
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout.trim().split("\\n").at(-1) ?? "{}");
}
