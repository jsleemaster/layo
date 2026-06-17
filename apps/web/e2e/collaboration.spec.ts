import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("relay team syncs document edits between two browser contexts", async ({ browser }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-manifest-"));

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  let contextBClosed = false;
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
    expect(manifest).toContain('"schemaVersion": 1');

    await pageB.getByTestId("team-manifest").fill("{ broken");
    await pageB.getByRole("button", { name: "Import" }).click();
    await expect(pageB.getByTestId("team-manifest-status")).toContainText(/manifest import failed/i);

    const downloadPromise = pageA.waitForEvent("download");
    await pageA.getByRole("button", { name: "Download" }).click();
    const download = await downloadPromise;
    const downloadedManifestPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(downloadedManifestPath);
    const downloadedManifest = await readFile(downloadedManifestPath, "utf8");
    expect(downloadedManifest).toContain('"schemaVersion": 1');
    const downloadedManifestJson = JSON.parse(downloadedManifest) as {
      relayToken?: string;
      memberToken?: string;
      sync?: { token?: string; memberToken?: string };
    };
    expect(downloadedManifestJson.relayToken).toBeUndefined();
    expect(downloadedManifestJson.memberToken).toBeUndefined();
    expect(downloadedManifestJson.sync?.token).toBeUndefined();
    expect(downloadedManifestJson.sync?.memberToken).toBeUndefined();

    await pageB.getByTestId("team-manifest-file").setInputFiles(downloadedManifestPath);
    await expect(pageB.getByTestId("presence-list")).toContainText("Local user");
    await expect(pageB.getByTestId("team-status")).toContainText("synced", { timeout: 8000 });
    await expect(pageB.getByTestId("team-manifest-status")).toContainText("Loaded");

    await pageA.getByRole("button", { name: "Create text" }).click();
    await expect(pageA.getByRole("button", { name: "Text 3" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "Text 3" })).toBeVisible({ timeout: 8000 });

    await pageB.getByRole("button", { name: "Text 3" }).click();
    await expect(pageA.getByTestId("presence-list")).toContainText("text-3", { timeout: 8000 });
    await expect(pageA.getByTestId("remote-selection")).toHaveAttribute("data-selected-node-id", "text-3", {
      timeout: 8000
    });

    const stageBox = await pageB.getByTestId("stage-frame").boundingBox();
    expect(stageBox).not.toBeNull();
    await pageB.mouse.move(stageBox!.x + 320, stageBox!.y + 240);
    await expect(pageA.getByTestId("remote-cursor")).toBeVisible({ timeout: 8000 });
    const cursorBeforeZoom = await pageA.getByTestId("remote-cursor").boundingBox();
    await pageA.getByRole("button", { name: "Zoom in" }).click();
    await expect(pageA.getByTestId("remote-cursor")).toBeVisible({ timeout: 8000 });
    const cursorAfterZoom = await pageA.getByTestId("remote-cursor").boundingBox();
    expect(cursorBeforeZoom?.x).not.toBe(cursorAfterZoom?.x);
    await pageA.getByRole("button", { name: "Pan right" }).click();
    await expect(pageA.getByTestId("remote-cursor")).toBeVisible({ timeout: 8000 });
    const cursorAfterPan = await pageA.getByTestId("remote-cursor").boundingBox();
    expect(cursorAfterZoom?.x).not.toBe(cursorAfterPan?.x);

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

    await contextB.close();
    contextBClosed = true;
    await expect(pageA.getByTestId("remote-cursor")).toHaveCount(0, { timeout: 8000 });
  } finally {
    await contextA.close();
    if (!contextBClosed) {
      await contextB.close();
    }
    await rm(downloadDir, { force: true, recursive: true });
  }
});
