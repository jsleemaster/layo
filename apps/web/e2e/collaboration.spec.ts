import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetE2eStorage } from "./test-storage";

test.beforeEach(async () => {
  await resetE2eStorage();
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
  await expect(page.getByRole("button", { name: "멤버 토큰 적용" })).toHaveCount(0);
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
  await expect(page.getByTestId("member-token")).toBeVisible();
  await expect(page.getByRole("button", { name: "멤버 토큰 적용" })).toBeVisible();
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
  let releaseOriginatingPut = () => {};
  let originatingPutRoute: ((route: Route) => Promise<void>) | null = null;
  let originatingPutPattern: string | null = null;

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

    let markOriginatingPutStarted = () => {};
    const originatingPutStarted = new Promise<void>((resolve) => {
      markOriginatingPutStarted = resolve;
    });
    const originatingPutRelease = new Promise<void>((resolve) => {
      releaseOriginatingPut = resolve;
    });
    let markOriginatingPutCompleted = () => {};
    const originatingPutCompleted = new Promise<void>((resolve) => {
      markOriginatingPutCompleted = resolve;
    });
    let heldOriginatingPut = false;
    originatingPutPattern = `**/files/${documentId}`;
    originatingPutRoute = async (route: Route) => {
      if (route.request().method() === "PUT" && !heldOriginatingPut) {
        heldOriginatingPut = true;
        markOriginatingPutStarted();
        await originatingPutRelease;
      }
      await route.continue();
      markOriginatingPutCompleted();
    };
    await pageA.route(originatingPutPattern, originatingPutRoute);

    await openLayersPanel(pageA);
    await openLayersPanel(pageB);
    await pageA.getByRole("button", { name: "랜딩 프레임" }).click();
    await pageB.getByRole("button", { name: "랜딩 프레임" }).click();
    await pageA.getByTestId("inspector-x").fill("101");
    await originatingPutStarted;
    await expect(pageB.getByTestId("inspector-x")).toHaveValue("101", { timeout: 8000 });

    const serverBaseResponse = await pageB.request.get(
      `http://127.0.0.1:4317/files/${documentId}`
    );
    const serverBaseDocument = (await serverBaseResponse.json()).file;
    const serverEditedDocument = structuredClone(serverBaseDocument);
    serverEditedDocument.pages[0].children[0].children[0].content.value = "서버 독립 편집";
    const serverEditResponse = await pageB.request.put(
      `http://127.0.0.1:4317/files/${documentId}`,
      { data: { baseDocument: serverBaseDocument, document: serverEditedDocument } }
    );
    expect(serverEditResponse.ok()).toBeTruthy();

    await openFilePanel(pageB);
    await pageB.getByTestId("file-version-message").fill("원격 수신 시점");
    await pageB.getByRole("button", { name: "현재 버전 저장" }).click();
    await expect(pageB.getByTestId("file-version-status")).toContainText("원격 수신 시점 저장됨");
    const versionsResponse = await pageB.request.get(
      `http://127.0.0.1:4317/files/${documentId}/versions`
    );
    const versions = (await versionsResponse.json()).versions as Array<{
      versionId: string;
      message: string;
    }>;
    const remoteVersion = versions.find((version) => version.message === "원격 수신 시점");
    expect(remoteVersion).toBeTruthy();
    const remoteVersionResponse = await pageB.request.get(
      `http://127.0.0.1:4317/files/${documentId}/versions/${remoteVersion!.versionId}`
    );
    const remoteVersionDocument = (await remoteVersionResponse.json()).version.document;
    const remoteFrame = remoteVersionDocument.pages[0].children.find(
      (node: { id: string }) => node.id === "frame-1"
    );
    const remoteHeadline = remoteFrame.children.find(
      (node: { id: string }) => node.id === "text-1"
    );
    releaseOriginatingPut();
    await originatingPutCompleted;
    expect(remoteFrame.transform.x).toBe(101);
    expect(remoteHeadline.content.value).toBe("서버 독립 편집");

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
    releaseOriginatingPut();
    if (originatingPutPattern && originatingPutRoute) {
      await pageA.unroute(originatingPutPattern, originatingPutRoute);
    }
    await contextA.close();
    if (!contextBClosed) {
      await contextB.close();
    }
    await rm(downloadDir, { force: true, recursive: true });
  }
});

test("two editors keep independent node move and text edits", async ({ browser }) => {
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

test("general collaborative snapshot persistence converges a newer room edit after reversed PUTs", async ({
  browser
}) => {
  test.setTimeout(60_000);
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-persistence-manifest-"));
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const freshContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const freshPage = await freshContext.newPage();
  const heldPuts: Array<{
    actor: "first" | "second";
    baseX: number;
    documentX: number;
    release: () => void;
    completed: Promise<number>;
  }> = [];

  const frameX = (document: {
    pages: Array<{ children: Array<{ id: string; transform: { x: number } }> }>;
  }) => {
    const frame = document.pages[0]?.children.find((node) => node.id === "frame-1");
    if (!frame) {
      throw new Error("frame-1 missing from persistence snapshot");
    }
    return frame.transform.x;
  };
  const holdFirstPut = (actor: "first" | "second") => {
    let held = false;
    return async (route: Route) => {
      if (route.request().method() !== "PUT" || held) {
        await route.fallback();
        return;
      }
      held = true;
      const payload = route.request().postDataJSON() as {
        baseDocument: Parameters<typeof frameX>[0];
        document: Parameters<typeof frameX>[0];
      };
      let release = () => {};
      const releaseGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markCompleted = (_status: number) => {};
      const completed = new Promise<number>((resolve) => {
        markCompleted = resolve;
      });
      heldPuts.push({
        actor,
        baseX: frameX(payload.baseDocument),
        documentX: frameX(payload.document),
        release,
        completed
      });
      await releaseGate;
      const response = await route.fetch();
      await route.fulfill({ response });
      markCompleted(response.status());
    };
  };
  let firstPutRoute: ReturnType<typeof holdFirstPut> | null = null;
  let secondPutRoute: ReturnType<typeof holdFirstPut> | null = null;
  let persistenceRoutePattern: string | null = null;

  try {
    const documentId = await createProjectFromEmptyState(firstPage);
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
    const manifestPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(manifestPath);

    await openTeamPanel(secondPage);
    await secondPage.getByRole("tab", { name: "팀 설정" }).click();
    await secondPage.getByTestId("team-manifest-file").setInputFiles(manifestPath);
    await expect(secondPage.getByTestId("team-status")).toContainText("동기화됨", {
      timeout: 8000
    });

    await openLayersPanel(firstPage);
    await openLayersPanel(secondPage);
    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await secondPage.getByRole("button", { name: "랜딩 프레임" }).click();
    const initialX = Number(await firstPage.getByTestId("inspector-x").inputValue());

    firstPutRoute = holdFirstPut("first");
    secondPutRoute = holdFirstPut("second");
    persistenceRoutePattern = `**/files/${documentId}`;
    await firstPage.route(persistenceRoutePattern, firstPutRoute);
    await secondPage.route(persistenceRoutePattern, secondPutRoute);

    await firstPage.getByTestId("inspector-x").fill("101");
    await expect.poll(() => heldPuts.length).toBe(1);
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("101", { timeout: 8000 });

    await secondPage.getByTestId("inspector-x").fill("202");
    await expect.poll(() => heldPuts.length).toBe(2);
    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("202", { timeout: 8000 });

    const olderPut = heldPuts.find((request) => request.actor === "first");
    const newerPut = heldPuts.find((request) => request.actor === "second");
    expect(olderPut).toMatchObject({ baseX: initialX, documentX: 101 });
    expect(newerPut).toMatchObject({ baseX: 101, documentX: 202 });

    newerPut!.release();
    expect(await newerPut!.completed).toBe(400);
    olderPut!.release();
    await olderPut!.completed;

    await expect
      .poll(async () => {
        const response = await firstPage.request.get(
          `http://127.0.0.1:4317/files/${documentId}`
        );
        return frameX((await response.json()).file);
      })
      .toBe(202);
    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("202");
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("202");

    const serverText = "Server convergence headline";
    const serverEdit = await firstPage.request.post(
      `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
      {
        data: {
          dryRun: false,
          commands: [{ type: "update_text", nodeId: "text-1", value: serverText }]
        }
      }
    );
    expect(serverEdit.ok()).toBeTruthy();

    await firstPage.getByTestId("inspector-x").fill("303");
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("303", { timeout: 8000 });
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue(serverText, { timeout: 8000 });
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue(serverText, { timeout: 8000 });

    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await secondPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await firstPage.keyboard.press("Control+z");
    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("202");
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("202", { timeout: 8000 });
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue(serverText);
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue(serverText);

    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await secondPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await firstPage.keyboard.press("Control+Shift+z");
    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("303");
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("303", { timeout: 8000 });
    const persistedAfterRedo = await firstPage.request.get(
      `http://127.0.0.1:4317/files/${documentId}`
    );
    const persistedDocument = (await persistedAfterRedo.json()).file as {
      pages: Array<{ children: Array<{
        id: string;
        transform: { x: number };
        children: Array<{ id: string; content: { type: string; value?: string } }>;
      }> }>;
    };
    const persistedFrame = persistedDocument.pages[0]?.children.find((node) => node.id === "frame-1");
    expect(persistedFrame?.transform.x).toBe(303);
    expect(persistedFrame?.children.find((node) => node.id === "text-1")?.content).toMatchObject({
      type: "text",
      value: serverText
    });

    await freshPage.goto("http://127.0.0.1:5173/");
    await openLayersPanel(freshPage);
    await freshPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(freshPage.getByTestId("inspector-x")).toHaveValue("303");
  } finally {
    for (const heldPut of heldPuts) {
      heldPut.release();
    }
    if (persistenceRoutePattern && firstPutRoute) {
      await firstPage.unroute(persistenceRoutePattern, firstPutRoute);
    }
    if (persistenceRoutePattern && secondPutRoute) {
      await secondPage.unroute(persistenceRoutePattern, secondPutRoute);
    }
    await firstContext.close();
    await secondContext.close();
    await freshContext.close();
    await rm(downloadDir, { force: true, recursive: true });
  }
});

test("collaborative restore persists independent remote edits and aborts conflicting ones", async ({ browser }) => {
  test.setTimeout(90_000);
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-restore-manifest-"));
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const freshContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const freshPage = await freshContext.newPage();

  try {
    const documentId = await createProjectFromEmptyState(firstPage);
    const primaryProjectId = await firstPage.getByTestId("project-switcher").inputValue();
    const alternateProjectResponse = await firstPage.request.post("http://127.0.0.1:4317/projects", {
      data: { name: "협업 복원 전환 대상", documentName: "전환 대상 문서" }
    });
    expect(alternateProjectResponse.ok()).toBeTruthy();
    const alternateProjectId = (await alternateProjectResponse.json()).project.projectId as string;
    const setSavedFill = await firstPage.request.post(
      `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
      {
        data: {
          dryRun: false,
          commands: [{ type: "set_fill", nodeId: "frame-1", fill: "#16a34a" }]
        }
      }
    );
    expect(setSavedFill.ok()).toBeTruthy();
    const savedVersion = await firstPage.request.post(
      `http://127.0.0.1:4317/files/${documentId}/versions`,
      { data: { message: "협업 복원 기준" } }
    );
    expect(savedVersion.ok()).toBeTruthy();
    const setCurrentFill = await firstPage.request.post(
      `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
      {
        data: {
          dryRun: false,
          commands: [{ type: "set_fill", nodeId: "frame-1", fill: "#2563eb" }]
        }
      }
    );
    expect(setCurrentFill.ok()).toBeTruthy();

    await firstPage.reload();
    await secondPage.goto("http://127.0.0.1:5173/");
    await openFilePanel(secondPage);
    await secondPage.getByTestId("project-switcher").selectOption(primaryProjectId);
    await expect(secondPage.getByTestId("project-switcher")).toHaveValue(primaryProjectId);
    await openTeamPanel(firstPage);
    await firstPage.getByRole("tab", { name: "실시간 협업" }).click();
    await firstPage.getByTestId("relay-url").fill("ws://127.0.0.1:4327");
    await firstPage.getByRole("button", { name: "협업 팀 만들기" }).click();
    await expect(firstPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await firstPage.getByRole("tab", { name: "팀 설정" }).click();
    const downloadPromise = firstPage.waitForEvent("download");
    await firstPage.getByRole("button", { name: "파일로 저장" }).click();
    const download = await downloadPromise;
    const manifestPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(manifestPath);

    await openTeamPanel(secondPage);
    await secondPage.getByRole("tab", { name: "팀 설정" }).click();
    await secondPage.getByTestId("team-manifest-file").setInputFiles(manifestPath);
    await expect(secondPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    let markRestoreResponsePending = () => {};
    const restoreResponsePending = new Promise<void>((resolve) => {
      markRestoreResponsePending = resolve;
    });
    let releaseRestoreResponse = () => {};
    const restoreResponseRelease = new Promise<void>((resolve) => {
      releaseRestoreResponse = resolve;
    });
    const restoreRoutePattern = `**/files/${documentId}/versions/*/restore`;
    await firstPage.route(restoreRoutePattern, async (route) => {
      const response = await route.fetch();
      markRestoreResponsePending();
      await restoreResponseRelease;
      await route.fulfill({ response });
    });

    let remoteWriteAttempted = () => {};
    const remoteWrite = new Promise<void>((resolve) => {
      remoteWriteAttempted = resolve;
    });
    await secondPage.route(`**/files/${documentId}/agent/commands`, async (route) => {
      const body = route.request().postDataJSON() as {
        commands?: Array<{ type?: string }>;
      };
      if (body.commands?.some((command) => command.type === "update_text")) {
        remoteWriteAttempted();
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      await route.continue();
    });

    type PersistedRestoreSnapshot = {
      baseDocument: {
        pages: Array<{
          children: Array<{
            transform: { x: number };
            style: { fill: string };
            children: Array<{ content: { value: string } }>;
          }>;
        }>;
      };
      document: {
        pages: Array<{
          children: Array<{
            transform: { x: number };
            style: { fill: string };
            children: Array<{ content: { value: string } }>;
          }>;
        }>;
      };
    };
    const persistedRestoreSnapshots: PersistedRestoreSnapshot[] = [];
    let markRestorePersistencePending = () => {};
    const restorePersistencePending = new Promise<void>((resolve) => {
      markRestorePersistencePending = resolve;
    });
    let releaseRestorePersistence = () => {};
    const restorePersistenceRelease = new Promise<void>((resolve) => {
      releaseRestorePersistence = resolve;
    });
    let delayNextRestorePersistence = true;
    await firstPage.route(`**/files/${documentId}`, async (route) => {
      if (route.request().method() === "PUT") {
        persistedRestoreSnapshots.push(route.request().postDataJSON() as PersistedRestoreSnapshot);
        if (delayNextRestorePersistence) {
          delayNextRestorePersistence = false;
          markRestorePersistencePending();
          await restorePersistenceRelease;
        }
      }
      await route.continue();
    });

    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await openFilePanel(firstPage);
    await expect(firstPage.getByTestId("file-version-list")).toContainText("협업 복원 기준");
    await firstPage.getByRole("button", { name: "협업 복원 기준 복원" }).click();
    await restoreResponsePending;

    await openLayersPanel(secondPage);
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByTestId("inspector-text").fill("복원 중 원격 편집");
    await remoteWrite;
    await openLayersPanel(firstPage);
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("복원 중 원격 편집", {
      timeout: 8000
    });

    releaseRestoreResponse();
    await restorePersistencePending;
    await secondPage.getByTestId("inspector-text").fill("최종 저장 중 원격 편집");
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("최종 저장 중 원격 편집", {
      timeout: 8000
    });
    const concurrentGeometry = await firstPage.request.patch(
      `http://127.0.0.1:4317/files/${documentId}/nodes/frame-1/geometry`,
      { data: { x: 144 } }
    );
    expect(concurrentGeometry.ok()).toBeTruthy();
    releaseRestorePersistence();
    await expect.poll(() => persistedRestoreSnapshots[0]).toMatchObject({
      baseDocument: {
        pages: [{ children: [{ style: { fill: "#16a34a" }, children: [{ content: { value: "Layo" } }] }] }]
      },
      document: {
        pages: [
          {
            children: [
              { style: { fill: "#16a34a" }, children: [{ content: { value: "복원 중 원격 편집" } }] }
            ]
          }
        ]
      }
    });
    await expect.poll(() => persistedRestoreSnapshots.at(-1)).toMatchObject({
      baseDocument: {
        pages: [
          {
            children: [
              { transform: { x: 144 }, children: [{ content: { value: "복원 중 원격 편집" } }] }
            ]
          }
        ]
      },
      document: {
        pages: [
          {
            children: [
              { transform: { x: 144 }, children: [{ content: { value: "최종 저장 중 원격 편집" } }] }
            ]
          }
        ]
      }
    });
    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(firstPage.getByTestId("inspector-x")).toHaveValue("144");
    await secondPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(secondPage.getByTestId("inspector-x")).toHaveValue("144");
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("최종 저장 중 원격 편집");
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("최종 저장 중 원격 편집");

    await expect
      .poll(async () => {
        const response = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
        const file = (await response.json()).file;
        return {
          x: file.pages[0].children[0].transform.x,
          fill: file.pages[0].children[0].style.fill,
          text: file.pages[0].children[0].children[0].content.value
        };
      })
      .toEqual({ x: 144, fill: "#16a34a", text: "최종 저장 중 원격 편집" });

    await freshPage.goto("http://127.0.0.1:5173/");
    await openFilePanel(freshPage);
    await freshPage.getByTestId("project-switcher").selectOption(primaryProjectId);
    await expect(freshPage.getByTestId("project-switcher")).toHaveValue(primaryProjectId);
    await openLayersPanel(freshPage);
    await freshPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(freshPage.getByTestId("inspector-x")).toHaveValue("144");
    await expect(freshPage.getByTestId("inspector-fill")).toHaveValue("#16a34a");
    await freshPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(freshPage.getByTestId("inspector-text")).toHaveValue("최종 저장 중 원격 편집");

    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await firstPage.getByTestId("inspector-text").fill("최종 PUT 충돌 복원본");
    await openFilePanel(firstPage);
    await firstPage.getByTestId("file-version-message").fill("최종 PUT 충돌 기준");
    await firstPage.getByRole("button", { name: "현재 버전 저장" }).click();
    await expect(firstPage.getByTestId("file-version-status")).toContainText("최종 PUT 충돌 기준 저장됨");
    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await firstPage.getByTestId("inspector-fill").fill("#2563eb");
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await firstPage.getByTestId("inspector-text").fill("최종 PUT 충돌 전 현재 편집");
    await expect
      .poll(async () => {
        const response = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
        const file = (await response.json()).file;
        return {
          fill: file.pages[0].children[0].style.fill,
          text: file.pages[0].children[0].children[0].content.value
        };
      })
      .toEqual({ fill: "#2563eb", text: "최종 PUT 충돌 전 현재 편집" });

    let markFinalConflictRequestPending = () => {};
    const finalConflictRequestPending = new Promise<void>((resolve) => {
      markFinalConflictRequestPending = resolve;
    });
    let releaseFinalConflictRequest = () => {};
    const finalConflictRequestRelease = new Promise<void>((resolve) => {
      releaseFinalConflictRequest = resolve;
    });
    let markFinalConflictResponsePending = () => {};
    const finalConflictResponsePending = new Promise<void>((resolve) => {
      markFinalConflictResponsePending = resolve;
    });
    let releaseFinalConflictResponse = () => {};
    const finalConflictResponseRelease = new Promise<void>((resolve) => {
      releaseFinalConflictResponse = resolve;
    });
    let markCompensationRequestPending = () => {};
    const compensationRequestPending = new Promise<void>((resolve) => {
      markCompensationRequestPending = resolve;
    });
    let releaseCompensationRequest = () => {};
    const compensationRequestRelease = new Promise<void>((resolve) => {
      releaseCompensationRequest = resolve;
    });
    let finalConflictPersistenceCount = 0;
    const finalConflictPersistenceRoute = async (route: Route) => {
      if (route.request().method() === "PUT") {
        finalConflictPersistenceCount += 1;
        if (finalConflictPersistenceCount === 1) {
          markFinalConflictRequestPending();
          await finalConflictRequestRelease;
          const response = await route.fetch();
          markFinalConflictResponsePending();
          await finalConflictResponseRelease;
          await route.fulfill({ response });
          return;
        }
        if (finalConflictPersistenceCount === 2) {
          markCompensationRequestPending();
          await compensationRequestRelease;
          const response = await route.fetch();
          await route.fulfill({ response });
          return;
        }
      }
      await route.fallback();
    };
    await firstPage.route(`**/files/${documentId}`, finalConflictPersistenceRoute);

    await openFilePanel(firstPage);
    await firstPage.getByRole("button", { name: "최종 PUT 충돌 기준 복원" }).click();
    await finalConflictRequestPending;
    const serverConflict = await firstPage.request.patch(
      `http://127.0.0.1:4317/files/${documentId}/nodes/text-1/text`,
      { data: { value: "최종 PUT 서버 충돌 편집" } }
    );
    expect(serverConflict.ok()).toBeTruthy();
    releaseFinalConflictRequest();
    await finalConflictResponsePending;
    await openLayersPanel(secondPage);
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByTestId("inspector-text").fill("최종 PUT Yjs 충돌 편집");
    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("최종 PUT Yjs 충돌 편집", {
      timeout: 8000
    });
    releaseFinalConflictResponse();
    await compensationRequestPending;
    const compensationServerGeometry = await firstPage.request.patch(
      `http://127.0.0.1:4317/files/${documentId}/nodes/frame-1/geometry`,
      { data: { x: 288 } }
    );
    expect(compensationServerGeometry.ok()).toBeTruthy();
    releaseCompensationRequest();

    await openFilePanel(firstPage);
    await expect(firstPage.getByTestId("file-version-status")).toContainText(
      "동시 편집 충돌로 복원을 적용하지 않았습니다"
    );
    await expect
      .poll(async () => {
        const response = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
        const file = (await response.json()).file;
        return {
          x: file.pages[0].children[0].transform.x,
          fill: file.pages[0].children[0].style.fill,
          text: file.pages[0].children[0].children[0].content.value
        };
      })
      .toEqual({ x: 288, fill: "#2563eb", text: "최종 PUT Yjs 충돌 편집" });
    for (const page of [firstPage, secondPage]) {
      await openLayersPanel(page);
      await page.getByRole("button", { name: "랜딩 프레임" }).click();
      await expect(page.getByTestId("inspector-x")).toHaveValue("288");
      await expect(page.getByTestId("inspector-fill")).toHaveValue("#2563eb");
      await page.getByRole("button", { name: "헤드라인" }).click();
      await expect(page.getByTestId("inspector-text")).toHaveValue("최종 PUT Yjs 충돌 편집");
    }
    await firstPage.unroute(`**/files/${documentId}`, finalConflictPersistenceRoute);

    await firstPage.getByTestId("inspector-text").fill("충돌 복원본");
    await openFilePanel(firstPage);
    await firstPage.getByTestId("file-version-message").fill("협업 충돌 기준");
    await firstPage.getByRole("button", { name: "현재 버전 저장" }).click();
    await expect(firstPage.getByTestId("file-version-status")).toContainText("협업 충돌 기준 저장됨");
    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await firstPage.getByTestId("inspector-text").fill("충돌 전 현재 편집");
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("충돌 전 현재 편집", {
      timeout: 8000
    });

    await firstPage.unroute(restoreRoutePattern);
    let markConflictRestorePending = () => {};
    const conflictRestorePending = new Promise<void>((resolve) => {
      markConflictRestorePending = resolve;
    });
    let releaseConflictRestore = () => {};
    const conflictRestoreRelease = new Promise<void>((resolve) => {
      releaseConflictRestore = resolve;
    });
    await firstPage.route(restoreRoutePattern, async (route) => {
      const response = await route.fetch();
      markConflictRestorePending();
      await conflictRestoreRelease;
      await route.fulfill({ response });
    });
    persistedRestoreSnapshots.length = 0;

    await openFilePanel(firstPage);
    await firstPage.getByRole("button", { name: "협업 충돌 기준 복원" }).click();
    await conflictRestorePending;
    await secondPage.getByTestId("inspector-text").fill("충돌 중 원격 편집");
    await openLayersPanel(firstPage);
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("충돌 중 원격 편집", {
      timeout: 8000
    });

    releaseConflictRestore();
    await expect.poll(() => persistedRestoreSnapshots.at(-1)).toMatchObject({
      baseDocument: {
        pages: [
          { children: [{ children: [{ content: { value: "충돌 복원본" } }] }] }
        ]
      },
      document: {
        pages: [
          { children: [{ children: [{ content: { value: "충돌 중 원격 편집" } }] }] }
        ]
      }
    });
    await openFilePanel(firstPage);
    await expect(firstPage.getByTestId("file-version-status")).toContainText(
      "동시 편집 충돌로 복원을 적용하지 않았습니다"
    );
    await expect
      .poll(async () => {
        const response = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
        return (await response.json()).file.pages[0].children[0].children[0].content.value;
      })
      .toBe("충돌 중 원격 편집");

    await freshPage.reload();
    await openLayersPanel(freshPage);
    await freshPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(freshPage.getByTestId("inspector-text")).toHaveValue("충돌 중 원격 편집");

    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await firstPage.getByTestId("inspector-fill").fill("#16a34a");
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await firstPage.getByTestId("inspector-text").fill("프로젝트 전환 복원본");
    await openFilePanel(firstPage);
    await firstPage.getByTestId("file-version-message").fill("협업 프로젝트 전환 기준");
    await firstPage.getByRole("button", { name: "현재 버전 저장" }).click();
    await expect(firstPage.getByTestId("file-version-status")).toContainText(
      "협업 프로젝트 전환 기준 저장됨"
    );
    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await firstPage.getByTestId("inspector-fill").fill("#2563eb");
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await firstPage.getByTestId("inspector-text").fill("프로젝트 전환 전 현재 편집");
    await expect
      .poll(async () => {
        const response = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
        const file = (await response.json()).file;
        return {
          fill: file.pages[0].children[0].style.fill,
          text: file.pages[0].children[0].children[0].content.value
        };
      })
      .toEqual({ fill: "#2563eb", text: "프로젝트 전환 전 현재 편집" });

    let markProjectSwitchPersistencePending = () => {};
    const projectSwitchPersistencePending = new Promise<void>((resolve) => {
      markProjectSwitchPersistencePending = resolve;
    });
    let releaseProjectSwitchPersistence = () => {};
    const projectSwitchPersistenceRelease = new Promise<void>((resolve) => {
      releaseProjectSwitchPersistence = resolve;
    });
    let interceptProjectSwitchPersistence = true;
    const projectSwitchPersistenceRoute = async (route: Route) => {
      if (interceptProjectSwitchPersistence && route.request().method() === "PUT") {
        interceptProjectSwitchPersistence = false;
        markProjectSwitchPersistencePending();
        await projectSwitchPersistenceRelease;
      }
      await route.fallback();
    };
    await firstPage.route(`**/files/${documentId}`, projectSwitchPersistenceRoute);

    await openFilePanel(firstPage);
    await firstPage.getByRole("button", { name: "협업 프로젝트 전환 기준 복원" }).click();
    await projectSwitchPersistencePending;
    await openLayersPanel(secondPage);
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByTestId("inspector-text").fill("프로젝트 전환 중 원격 편집");
    await openLayersPanel(firstPage);
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("프로젝트 전환 중 원격 편집", {
      timeout: 8000
    });

    await openFilePanel(firstPage);
    await firstPage.getByTestId("project-switcher").selectOption(alternateProjectId);
    await openLayersPanel(secondPage);
    await secondPage.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(secondPage.getByTestId("inspector-fill")).toHaveValue("#2563eb");
    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("프로젝트 전환 중 원격 편집");

    releaseProjectSwitchPersistence();
    await expect
      .poll(async () => {
        const response = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
        const file = (await response.json()).file;
        return {
          fill: file.pages[0].children[0].style.fill,
          text: file.pages[0].children[0].children[0].content.value
        };
      })
      .toEqual({ fill: "#2563eb", text: "프로젝트 전환 중 원격 편집" });
    await expect(firstPage.getByTestId("project-status")).toContainText("협업 복원 전환 대상 불러옴");
    await expect(firstPage.getByTestId("project-switcher")).toHaveValue(alternateProjectId);
    await firstPage.unroute(`**/files/${documentId}`, projectSwitchPersistenceRoute);
  } finally {
    await firstContext.close();
    await secondContext.close();
    await freshContext.close();
    await rm(downloadDir, { force: true, recursive: true });
  }
});

test("collaborative structural undo preserves a later remote text edit", async ({ browser }) => {
  const downloadDir = await mkdtemp(join(tmpdir(), "canvas-history-manifest-"));
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();

  try {
    const documentId = await createProjectFromEmptyState(firstPage);
    const fileResponse = await firstPage.request.get(`http://127.0.0.1:4317/files/${documentId}`);
    const file = (await fileResponse.json()).file;
    const parentId = file.pages[0].children[0].id as string;
    const seeded = await firstPage.request.post(
      `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
      {
        data: {
          dryRun: false,
          commands: [
            { type: "create_path", parentId, ...pathCommand("history-left", "히스토리 왼쪽", 40) },
            { type: "create_path", parentId, ...pathCommand("history-right", "히스토리 오른쪽", 90) },
            {
              type: "create_boolean_path",
              nodeId: "history-boolean",
              name: "히스토리 불리언",
              operation: "union",
              sourceNodeIds: ["history-left", "history-right"]
            }
          ]
        }
      }
    );
    expect(seeded.ok()).toBeTruthy();
    await firstPage.reload();
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
    const manifestPath = join(downloadDir, download.suggestedFilename());
    await download.saveAs(manifestPath);

    await openTeamPanel(secondPage);
    await secondPage.getByRole("tab", { name: "팀 설정" }).click();
    await secondPage.getByTestId("team-manifest-file").setInputFiles(manifestPath);
    await expect(secondPage.getByTestId("team-status")).toContainText("동기화됨", { timeout: 8000 });

    await openLayersPanel(firstPage);
    await openLayersPanel(secondPage);
    await expect(secondPage.getByRole("button", { name: "히스토리 불리언" })).toBeVisible({ timeout: 8000 });
    await firstPage.getByRole("button", { name: "히스토리 불리언" }).click();
    await firstPage.getByRole("button", { name: "불리언 분리" }).click();
    await expect(firstPage.getByRole("button", { name: "히스토리 왼쪽" })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "히스토리 오른쪽" })).toBeVisible({ timeout: 8000 });

    await secondPage.getByRole("button", { name: "헤드라인" }).click();
    await secondPage.getByTestId("inspector-text").fill("원격 히스토리 보존");
    await firstPage.getByRole("button", { name: "헤드라인" }).click();
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("원격 히스토리 보존", {
      timeout: 8000
    });

    await firstPage.keyboard.press("Control+z");
    await expect(firstPage.getByRole("button", { name: "히스토리 불리언" })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "히스토리 불리언" })).toBeVisible({ timeout: 8000 });
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("원격 히스토리 보존");
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("원격 히스토리 보존");

    await firstPage.keyboard.press("Control+Shift+z");
    await expect(firstPage.getByRole("button", { name: "히스토리 왼쪽" })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "히스토리 오른쪽" })).toBeVisible({ timeout: 8000 });
    await expect(firstPage.getByTestId("inspector-text")).toHaveValue("원격 히스토리 보존");
    await expect(secondPage.getByTestId("inspector-text")).toHaveValue("원격 히스토리 보존");
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

function pathCommand(id: string, name: string, x: number) {
  return {
    id,
    name,
    x,
    y: 40,
    width: 100,
    height: 100,
    fill: "#0ea5e9",
    stroke: "#0f172a",
    strokeWidth: 1,
    pathData: "M0 0 H100 V100 H0 Z",
    fillRule: "nonzero" as const
  };
}

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
