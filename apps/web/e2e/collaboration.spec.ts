import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("team panel shows live collaboration controls only in the collaboration tab", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  await expect(page.getByTestId("team-name")).toBeVisible();
  await expect(page.getByTestId("relay-url")).toHaveCount(0);
  await expect(page.getByTestId("relay-token")).toHaveCount(0);
  await expect(page.getByTestId("member-token")).toHaveCount(0);
  await expect(page.getByTestId("team-e2ee-toggle")).toHaveCount(0);
  await expect(page.getByTestId("team-e2ee-passphrase")).toHaveCount(0);
  await expect(page.getByTestId("team-manifest-url")).toHaveCount(0);
  await expect(page.getByTestId("team-manifest")).toHaveCount(0);

  await page.getByRole("tab", { name: "실시간 협업" }).click();
  await expect(page.getByLabel("협업 서버 주소")).toBeVisible();
  await expect(page.getByLabel("서버 접속 토큰")).toBeVisible();
  await expect(page.getByLabel("멤버 인증 토큰")).toBeVisible();
  await expect(page.getByLabel("종단간 암호화")).toBeVisible();
  await expect(page.getByLabel("공유 암호")).toBeVisible();
  await expect(page.getByTestId("relay-url")).toBeVisible();
  await expect(page.getByTestId("relay-token")).toBeVisible();
  await expect(page.getByTestId("member-token")).toBeVisible();
  await expect(page.getByTestId("team-e2ee-toggle")).toBeVisible();
  await expect(page.getByTestId("team-e2ee-passphrase")).toBeVisible();
  await expect(page.getByTestId("team-manifest-url")).toHaveCount(0);
  await expect(page.getByTestId("team-manifest")).toHaveCount(0);

  await page.getByRole("tab", { name: "팀 설정" }).click();
  await expect(page.getByTestId("relay-url")).toHaveCount(0);
  await expect(page.getByLabel("팀 설정 URL")).toBeVisible();
  await expect(page.getByTestId("team-manifest-url")).toBeVisible();
  await expect(page.getByTestId("team-manifest")).toBeVisible();
});

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

    await pageA.getByRole("tab", { name: "실시간 협업" }).click();
    await pageA.getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await pageA.getByRole("button", { name: "협업 팀 만들기" }).click();
    await expect(pageA.getByTestId("presence-list")).toContainText("로컬 사용자");
    await expect(pageA.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await pageA.getByRole("tab", { name: "팀 설정" }).click();
    await pageA.getByRole("button", { name: "설정 내보내기" }).click();
    const manifest = await pageA.getByTestId("team-manifest").inputValue();
    expect(manifest).toContain("websocket");
    expect(manifest).toContain('"schemaVersion": 1');

    await pageB.getByRole("tab", { name: "팀 설정" }).click();
    await pageB.getByTestId("team-manifest").fill("{ broken");
    await pageB.getByRole("button", { name: "설정 가져오기" }).click();
    await expect(pageB.getByTestId("team-manifest-status")).toContainText("팀 설정 가져오기 실패");

    const downloadPromise = pageA.waitForEvent("download");
    await pageA.getByRole("button", { name: "파일로 저장" }).click();
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
    await expect(pageB.getByTestId("presence-list")).toContainText("로컬 사용자");
    await expect(pageB.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });
    await expect(pageB.getByTestId("team-manifest-status")).toContainText("불러옴");

    await pageA.getByRole("button", { name: "텍스트 만들기" }).click();
    await expect(pageA.getByRole("button", { name: "텍스트 3" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "텍스트 3" })).toBeVisible({ timeout: 8000 });

    await pageB.getByRole("button", { name: "텍스트 3" }).click();
    await expect(pageA.getByTestId("presence-list")).toContainText("text-3", { timeout: 8000 });
    await expect(pageA.getByTestId("remote-selection")).toHaveAttribute("data-selected-node-id", "text-3", {
      timeout: 8000
    });

    const stageBox = await pageB.getByTestId("stage-frame").boundingBox();
    expect(stageBox).not.toBeNull();
    await pageB.mouse.move(stageBox!.x + 320, stageBox!.y + 240);
    await expect(pageA.getByTestId("remote-cursor")).toBeVisible({ timeout: 8000 });
    const cursorBeforeZoom = await pageA.getByTestId("remote-cursor").boundingBox();
    await pageA.getByRole("button", { name: "확대" }).click();
    await expect(pageA.getByTestId("remote-cursor")).toBeVisible({ timeout: 8000 });
    const cursorAfterZoom = await pageA.getByTestId("remote-cursor").boundingBox();
    expect(cursorBeforeZoom?.x).not.toBe(cursorAfterZoom?.x);
    await pageA.getByRole("button", { name: "오른쪽으로 이동" }).click();
    await expect(pageA.getByTestId("remote-cursor")).toBeVisible({ timeout: 8000 });
    const cursorAfterPan = await pageA.getByTestId("remote-cursor").boundingBox();
    expect(cursorAfterZoom?.x).not.toBe(cursorAfterPan?.x);

    const team = JSON.parse(manifest) as { teamId: string };
    const agentNodeId = `agent-collab-${Date.now()}`;
    const agentNodeName = `에이전트 협업 ${Date.now()}`;
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
              value: "에이전트가 릴레이 방에 쓴 텍스트",
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

test("encrypted relay team syncs document edits without exporting the passphrase", async ({ browser }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto("http://127.0.0.1:5173/");
    await pageB.goto("http://127.0.0.1:5173/");

    await pageA.getByRole("tab", { name: "실시간 협업" }).click();
    await pageA.getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await pageA.getByTestId("team-e2ee-toggle").check();
    await pageA.getByTestId("team-e2ee-passphrase").fill("correct horse battery staple");
    await pageA.getByRole("button", { name: "협업 팀 만들기" }).click();
    await expect(pageA.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await pageA.getByRole("tab", { name: "팀 설정" }).click();
    await pageA.getByRole("button", { name: "설정 내보내기" }).click();
    const manifest = await pageA.getByTestId("team-manifest").inputValue();
    expect(manifest).toContain('"mode": "shared-key"');
    expect(manifest).toContain('"algorithm": "AES-GCM"');
    expect(manifest).not.toContain("correct horse battery staple");

    await pageB.getByRole("tab", { name: "실시간 협업" }).click();
    await pageB.getByTestId("team-e2ee-passphrase").fill("correct horse battery staple");
    await pageB.getByRole("tab", { name: "팀 설정" }).click();
    await pageB.getByTestId("team-manifest").fill(manifest);
    await pageB.getByRole("button", { name: "설정 가져오기" }).click();
    await expect(pageB.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await pageA.getByRole("button", { name: "텍스트 만들기" }).click();
    await expect(pageB.getByRole("button", { name: "텍스트 3" })).toBeVisible({ timeout: 8000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
