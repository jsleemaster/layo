import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resetE2eStorage } from "./test-storage";

const execFileAsync = promisify(execFile);
const MCP_STDIO_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "PNPM_HOME",
  "COREPACK_HOME",
  "LAYO_STORAGE_DIR",
  "LAYO_LIBRARY_REGISTRY_MEMBERS_FILE",
  "LAYO_MCP_USER_ID",
  "LAYO_MCP_MEMBER_TOKEN"
] as const;

function mcpStdioEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  // Purpose: keep unrelated CI and deployment credentials out of MCP subprocesses.
  const environment: NodeJS.ProcessEnv = {};
  for (const name of MCP_STDIO_ENV_ALLOWLIST) {
    const value = process.env[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return { ...environment, ...overrides };
}

test("stdio MCP edits move a node, create a component instance, and render in the editor", async ({ page }) => {
  await resetE2eStorage();

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
    const environment = {};
    for (const name of ${JSON.stringify(MCP_STDIO_ENV_ALLOWLIST)}) {
      if (process.env[name] !== undefined) environment[name] = process.env[name];
    }
    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["mcp"],
      cwd: process.cwd(),
      env: environment
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
    env: mcpStdioEnvironment(),
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
}


test("stdio MCP refuses file-backed account token mutation without reviewed shared authorization", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "layo-mcp-stdio-tokens-"));
  const membersFile = path.join(root, "members.json");
  await writeFile(
    membersFile,
    JSON.stringify([
      {
        userId: "owner-user",
        role: "owner",
        teamIds: ["team-alpha"],
        token: "owner-member-token"
      }
    ]),
    "utf8"
  );
  const baseSnapshot = await readFile(membersFile, "utf8");

  try {
    const result = await runStdioTokenManagement(membersFile);
    expect(result.attempted).toMatchObject({
      isError: true,
      content: [
        expect.objectContaining({
          text: expect.stringMatching(
            /shared PostgreSQL authorization.*REVIEW_SIGNING_KEY/
          )
        })
      ]
    });
    expect(result.listed).toEqual({ tokens: [] });
    expect(await readFile(membersFile, "utf8")).toBe(baseSnapshot);
    await expect(readFile(`${membersFile}.tokens.json`, "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function runStdioTokenManagement(membersFile) {
  const script = String.raw`
    import { Client } from "@modelcontextprotocol/sdk/client/index.js";
    import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

    const client = new Client({ name: "playwright-stdio-token-mcp", version: "1.0.0" });
    const env = {};
    for (const name of ${JSON.stringify(MCP_STDIO_ENV_ALLOWLIST)}) {
      if (process.env[name] !== undefined) env[name] = process.env[name];
    }
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
      const attempted = await client.callTool({
        name: "create_account_token",
        arguments: { name: "Stdio deploy automation", expiresInDays: 30 }
      });
      const listed = parseToolJson(await client.callTool({
        name: "list_account_tokens",
        arguments: {}
      }));
      console.log(JSON.stringify({ attempted, listed }));
    } finally {
      await client.close().catch(() => undefined);
    }
  `;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: path.join(process.cwd(), "apps/server"),
    env: mcpStdioEnvironment({
      LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: membersFile,
      LAYO_MCP_USER_ID: "owner-user",
      LAYO_MCP_MEMBER_TOKEN: "owner-member-token"
    }),
    maxBuffer: 1024 * 1024
  });

  return JSON.parse(stdout.trim().split("\\n").at(-1) ?? "{}");
}
