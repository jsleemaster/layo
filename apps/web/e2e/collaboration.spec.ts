import { expect, test } from "@playwright/test";
import { rm } from "node:fs/promises";

test("relay team syncs document edits between two browser contexts", async ({ browser }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto("http://127.0.0.1:5173/");
    await pageB.goto("http://127.0.0.1:5173/");

    await pageA.getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await pageA.getByRole("button", { name: "Relay" }).click();
    await expect(pageA.getByTestId("presence-list")).toContainText("Local user");
    await expect(pageA.getByTestId("team-status")).toContainText("synced", { timeout: 8000 });

    await pageA.getByRole("button", { name: "Export" }).click();
    const manifest = await pageA.getByTestId("team-manifest").inputValue();
    expect(manifest).toContain("websocket");

    await pageB.getByTestId("team-manifest").fill(manifest);
    await pageB.getByRole("button", { name: "Import" }).click();
    await expect(pageB.getByTestId("presence-list")).toContainText("Local user");
    await expect(pageB.getByTestId("team-status")).toContainText("synced", { timeout: 8000 });

    await pageA.getByRole("button", { name: "Create text" }).click();
    await expect(pageA.getByRole("button", { name: "Text 3" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Text 3" })).toBeVisible({ timeout: 8000 });

    await pageB.getByRole("button", { name: "Text 3" }).click();
    await expect(pageA.getByTestId("presence-list")).toContainText("text-3", { timeout: 8000 });

    const team = JSON.parse(manifest) as { teamId: string };
    const agentNodeId = `agent-collab-${Date.now()}`;
    const agentNodeName = `Agent Collab ${Date.now()}`;
    const agentResponse = await pageA.request.post(
      "http://127.0.0.1:4317/files/sample-file/agent/commands",
      {
        data: {
          dryRun: false,
          collaboration: {
            teamId: team.teamId,
            documentId: "sample-file",
            relayUrl: "ws://127.0.0.1:4327"
          },
          commands: [
            {
              type: "create_text",
              parentId: "page-1",
              id: agentNodeId,
              name: agentNodeName,
              value: "Agent wrote into the relay room",
              x: 420,
              y: 360,
              width: 280,
              height: 48,
              fill: "#111827",
              fontSize: 20,
              fontFamily: "Inter"
            }
          ]
        }
      }
    );
    expect(agentResponse.ok()).toBeTruthy();
    await expect(pageB.getByRole("button", { name: agentNodeName })).toBeVisible({ timeout: 8000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
