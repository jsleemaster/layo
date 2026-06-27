import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

async function openFilePanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일", exact: true }).click();
  await expect(page.getByTestId("project-status")).toBeVisible();
}

async function openTeamPanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀", exact: true }).click();
  await expect(page.getByTestId("team-name")).toBeVisible();
}

async function openLayersPanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어", exact: true }).click();
  await expect(page.getByRole("button", { name: "헤드라인" })).toBeVisible();
}

async function createProjectFromEmptyState(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await openFilePanel(page);
  await expect(page.getByTestId("project-status")).toContainText("저장된 프로젝트 없음");
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const projectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  return projectPayload.project.currentDocumentId as string;
}

test("team panel shows live collaboration controls only in the collaboration tab", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");
  await openTeamPanel(page);

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
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-manifest-"));

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  let contextBClosed = false;
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const documentId = await createProjectFromEmptyState(pageA);
    await pageB.goto("http://127.0.0.1:5173/");
    await openLayersPanel(pageB);

    await openTeamPanel(pageA);
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

    await openTeamPanel(pageB);
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
    await openLayersPanel(pageA);
    await openLayersPanel(pageB);
    await expect(pageA.getByRole("button", { name: "텍스트 3" })).toBeVisible();
    await expect(pageB.getByRole("button", { name: "텍스트 3" })).toBeVisible({ timeout: 8000 });

    await pageB.getByRole("button", { name: "텍스트 3" }).click();
    await openTeamPanel(pageA);
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
      `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
      {
        data: {
          dryRun: false,
          collaboration: {
            teamId: team.teamId,
            documentId,
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

test("two editors keep independent node move and text edits", async ({ browser }) => {
  await rm(".layo/files/sample-file.json", { force: true });
  await rm("apps/server/.layo/files/sample-file.json", { force: true });
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-manifest-"));

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    await createProjectFromEmptyState(firstPage);
    await secondPage.goto("http://127.0.0.1:5173/");

    await openTeamPanel(firstPage);
    await firstPage.getByRole("tab", { name: "실시간 협업" }).click();
    await firstPage.getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await firstPage.getByRole("button", { name: "협업 팀 만들기" }).click();
    await expect(firstPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await firstPage.getByRole("tab", { name: "팀 설정" }).click();
    const downloadPromise = firstPage.waitForEvent("download");
    await firstPage.getByRole("button", { name: "파일로 저장" }).click();
    const download = await downloadPromise;
    const downloadedManifestPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(downloadedManifestPath);

    await openTeamPanel(secondPage);
    await secondPage.getByRole("tab", { name: "팀 설정" }).click();
    await secondPage.getByTestId("team-manifest-file").setInputFiles(downloadedManifestPath);
    await expect(secondPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await openLayersPanel(firstPage);
    await openLayersPanel(secondPage);
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByRole("button", { name: "헤드라인" }).click();

    await firstPage.getByTestId("inspector-x").fill("96");
    await secondPage.getByTestId("inspector-text").fill("Concurrent headline");

    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("96", { timeout: 8000 });
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("Concurrent headline", {
      timeout: 8000
    });
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("96", { timeout: 8000 });
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("Concurrent headline", {
      timeout: 8000
    });
  } finally {
    await firstContext.close();
    await secondContext.close();
    await rm(downloadDir, { force: true, recursive: true });
  }
});

test("five team members join a relay room and observe concurrent edits", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const members = [
    { userId: "member-1", displayName: "팀원 1", color: "#2563eb", role: "owner" },
    { userId: "member-2", displayName: "팀원 2", color: "#059669", role: "editor" },
    { userId: "member-3", displayName: "팀원 3", color: "#d97706", role: "editor" },
    { userId: "member-4", displayName: "팀원 4", color: "#7c3aed", role: "editor" },
    { userId: "member-5", displayName: "팀원 5", color: "#dc2626", role: "editor" }
  ] as const;

  try {
    await createProjectFromEmptyState(pages[0]);
    await Promise.all(
      pages.slice(1).map(async (page) => {
        await page.goto("http://127.0.0.1:5173/");
        await openLayersPanel(page);
      })
    );

    await openTeamPanel(pages[0]);
    await pages[0].getByRole("tab", { name: "실시간 협업" }).click();
    await pages[0].getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await pages[0].getByRole("button", { name: "협업 팀 만들기" }).click();
    await expect(pages[0].getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await pages[0].getByRole("tab", { name: "팀 설정" }).click();
    await pages[0].getByRole("button", { name: "설정 내보내기" }).click();
    const baseManifest = JSON.parse(await pages[0].getByTestId("team-manifest").inputValue()) as Record<
      string,
      unknown
    >;
    const memberManifests = members.map((member) =>
      JSON.stringify({
        ...baseManifest,
        currentUserId: member.userId,
        members,
        permissions: {
          canEdit: true,
          canInvite: member.role === "owner"
        }
      })
    );

    await Promise.all(
      pages.map(async (page, index) => {
        await openTeamPanel(page);
        await page.getByRole("tab", { name: "팀 설정" }).click();
        await page.getByTestId("team-manifest").fill(memberManifests[index]);
        await page.getByRole("button", { name: "설정 가져오기" }).click();
        await expect(page.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });
        await expect(page.getByTestId("presence-list")).toContainText(members[index].displayName, {
          timeout: 8000
        });
      })
    );

    for (const member of members) {
      await expect(pages[0].getByTestId("presence-list")).toContainText(member.displayName, {
        timeout: 8000
      });
    }

    await Promise.all([openLayersPanel(pages[0]), openLayersPanel(pages[1]), openLayersPanel(pages[4])]);
    await Promise.all([
      pages[0].getByRole("button", { name: "헤드라인" }).click(),
      pages[1].getByRole("button", { name: "헤드라인" }).click(),
      pages[4].getByRole("button", { name: "헤드라인" }).click()
    ]);

    await Promise.all([
      pages[0].getByTestId("inspector-x").fill("96"),
      pages[1].getByTestId("inspector-text").fill("5인 동시 편집"),
      pages[2].getByRole("button", { name: "사각형 만들기" }).click(),
      pages[3].getByRole("button", { name: "텍스트 만들기" }).click(),
      pages[4].getByTestId("inspector-y").fill("72")
    ]);

    for (const page of pages) {
      await openLayersPanel(page);
      await expect(page.getByRole("button", { name: /^사각형 \d+$/ })).toHaveCount(1, { timeout: 8000 });
      await expect(page.getByRole("button", { name: /^텍스트 \d+$/ })).toHaveCount(1, { timeout: 8000 });
      await page.getByRole("button", { name: "헤드라인" }).click();
      await expect(page.getByTestId("inspector-x")).toHaveValue("96", { timeout: 8000 });
      await expect(page.getByTestId("inspector-y")).toHaveValue("72", { timeout: 8000 });
      await expect(page.getByTestId("inspector-text")).toHaveValue("5인 동시 편집", {
        timeout: 8000
      });
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("encrypted relay team syncs document edits without exporting the passphrase", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await createProjectFromEmptyState(pageA);
    await pageB.goto("http://127.0.0.1:5173/");
    await openLayersPanel(pageB);

    await openTeamPanel(pageA);
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

    await openTeamPanel(pageB);
    await pageB.getByRole("tab", { name: "실시간 협업" }).click();
    await pageB.getByTestId("team-e2ee-passphrase").fill("correct horse battery staple");
    await pageB.getByRole("tab", { name: "팀 설정" }).click();
    await pageB.getByTestId("team-manifest").fill(manifest);
    await pageB.getByRole("button", { name: "설정 가져오기" }).click();
    await expect(pageB.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await pageA.getByRole("button", { name: "텍스트 만들기" }).click();
    await openLayersPanel(pageB);
    await expect(pageB.getByRole("button", { name: "텍스트 3" })).toBeVisible({ timeout: 8000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
