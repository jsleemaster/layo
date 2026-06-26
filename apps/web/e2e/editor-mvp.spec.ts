import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

async function openFilePanel(page: Page) {
  await page.getByRole("button", { name: "파일" }).click();
}

async function openEmptyEditor(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await expect(page.getByTestId("project-status")).toContainText("저장된 프로젝트 없음");
}

function floatingToolbarZoom(page: Page, label: string) {
  return page.getByTestId("floating-toolbar").getByText(label);
}

test("opens with a Figma-like assets panel and keeps project controls behind the file rail", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  await expect(page.getByTestId("asset-panel")).toBeVisible();
  await expect(page.getByRole("heading", { name: "에셋" })).toBeVisible();
  await expect(page.getByTestId("asset-search")).toHaveAttribute("placeholder", "모든 라이브러리 검색");
  await expect(page.getByText("아직 라이브러리가 없습니다.")).toBeVisible();
  await expect(page.getByText("iOS 18 and iPadOS 18")).toBeVisible();
  await expect(page.getByText("visionOS 26")).toBeVisible();
  await expect(page.getByTestId("asset-library-card")).toHaveCount(6);
  const firstLibraryCard = page.getByTestId("asset-library-card").filter({ hasText: "iOS 18 and iPadOS 18" });
  await expect(firstLibraryCard.getByTestId("asset-library-thumbnail")).toHaveAttribute(
    "aria-label",
    "iOS 18 and iPadOS 18 라이브러리 미리보기"
  );
  await expect(firstLibraryCard.getByText("156개의 컴포넌트")).toBeVisible();
  await expect(firstLibraryCard.getByText("템플릿 24개")).toBeVisible();
  await expect(page.getByTestId("layer-panel")).toBeHidden();
  await expect(page.getByTestId("project-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: "에셋" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "파일" }).click();
  await expect(page.getByTestId("project-panel")).toBeVisible();
  await expect(page.getByTestId("layer-panel")).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toBeHidden();

  await page.getByRole("button", { name: "에셋" }).click();
  await expect(page.getByTestId("asset-panel")).toBeVisible();
  await expect(page.getByTestId("project-panel")).toBeHidden();
});

test("editor chrome uses the generated Layo brand logo assets", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  const brandLogo = page.getByTestId("layo-brand-logo");
  await expect(brandLogo).toBeVisible();
  await expect(brandLogo).toHaveAttribute("src", /layo-logo-mark\.png$/);
  await expect(brandLogo).toHaveJSProperty("complete", true);

  const naturalSize = await brandLogo.evaluate((node) => ({
    width: (node as HTMLImageElement).naturalWidth,
    height: (node as HTMLImageElement).naturalHeight
  }));
  expect(naturalSize.width).toBeGreaterThan(0);
  expect(naturalSize.height).toBeGreaterThan(0);

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/assets/brand/layo-logo-mark.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/assets/brand/layo-logo-mark.png"
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
});

async function createProjectFromEmptyState(page: Page) {
  await openEmptyEditor(page);
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const projectId = await page.getByTestId("project-switcher").inputValue();
  expect(projectId).not.toBe("");
  expect(projectId).not.toBe("sample-project");
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  return {
    projectId,
    documentId: projectPayload.project.currentDocumentId as string
  };
}

async function createNamedProject(page: Page, name: string) {
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const projectId = await page.getByTestId("project-switcher").inputValue();
  await page.getByTestId("project-name").fill(name);
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByTestId("project-status")).toContainText(`${name} 저장됨`);
  return projectId;
}

async function createImageDataTransfer(
  page: Page,
  name: string,
  size: { width: number; height: number } = { width: 16, height: 12 },
  fillColor = "#2563eb"
) {
  return page.evaluateHandle(async ({ fileName, imageSize, color }) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas context missing");
    }
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(4, 3, 8, 6);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error("png blob missing"));
        }
      }, "image/png");
    });
    const file = new File([blob], fileName, { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    return dataTransfer;
  }, { fileName: name, imageSize: size, color: fillColor });
}

async function createImageUploadFile(
  page: Page,
  name: string,
  size: { width: number; height: number },
  fillColor: string
) {
  const payload = await page.evaluate(async ({ fileName, imageSize, color }) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas context missing");
    }
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(4, 3, 8, 6);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error("png blob missing"));
        }
      }, "image/png");
    });
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    return { name: fileName, mimeType: "image/png", bytes };
  }, { fileName: name, imageSize: size, color: fillColor });

  return {
    name: payload.name,
    mimeType: payload.mimeType,
    buffer: Buffer.from(payload.bytes)
  };
}

function flattenNodeKinds(nodes: Array<{ kind: string; children: unknown[] }>): string[] {
  return nodes.flatMap((node) => [
    node.kind,
    ...flattenNodeKinds(node.children as Array<{ kind: string; children: unknown[] }>)
  ]);
}

async function findCanvasColorBounds(page: Page, color: { r: number; g: number; b: number }) {
  return page.evaluate((targetColor) => {
    const colorDistance = (red: number, green: number, blue: number) =>
      Math.abs(red - targetColor.r) + Math.abs(green - targetColor.g) + Math.abs(blue - targetColor.b);
    let bestBounds: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      count: number;
    } | null = null;

    for (const canvas of Array.from(document.querySelectorAll("canvas"))) {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || canvas.width === 0 || canvas.height === 0) {
        continue;
      }

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let count = 0;

      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          if (pixels[index + 3] < 200) {
            continue;
          }
          if (colorDistance(pixels[index], pixels[index + 1], pixels[index + 2]) > 8) {
            continue;
          }

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          count += 1;
        }
      }

      if (!count || (bestBounds && bestBounds.count >= count)) {
        continue;
      }

      const rect = canvas.getBoundingClientRect();
      bestBounds = {
        left: rect.left + minX / (canvas.width / rect.width),
        top: rect.top + minY / (canvas.height / rect.height),
        right: rect.left + maxX / (canvas.width / rect.width),
        bottom: rect.top + maxY / (canvas.height / rect.height),
        count
      };
    }

    if (!bestBounds) {
      throw new Error("target canvas color was not visible");
    }

    return bestBounds;
  }, color);
}

test("creates, reopens, and team-links a saved project", async ({ page }) => {
  await openEmptyEditor(page);

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const createdProjectId = await page.getByTestId("project-switcher").inputValue();
  expect(createdProjectId).not.toBe("sample-project");
  await expect(page.getByTestId("project-name")).toHaveValue(/새 프로젝트/);

  const projectsResponse = await page.request.get("http://127.0.0.1:4317/projects");
  expect(projectsResponse.ok()).toBeTruthy();
  const projectsPayload = await projectsResponse.json();
  expect(projectsPayload.projects.map((project: { projectId: string }) => project.projectId)).toContain(
    createdProjectId
  );

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(createdProjectId);

  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");

  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${createdProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  expect((await projectResponse.json()).project.sharing).toMatchObject({ mode: "team" });
});

test("filters projects and keeps recently opened projects first", async ({ page }) => {
  await openEmptyEditor(page);
  const alphaProjectId = await createNamedProject(page, "검색 알파");
  const betaProjectId = await createNamedProject(page, "검색 베타");
  await createNamedProject(page, "검색 감마");

  await page.getByTestId("project-search").fill("베타");
  await expect(page.getByTestId("project-filter-summary")).toContainText("1개 프로젝트");
  await expect(page.getByTestId("project-switcher").locator("option")).toHaveText(["검색 베타"]);
  await page.getByTestId("project-switcher").selectOption(betaProjectId);
  await expect(page.getByTestId("project-status")).toContainText("검색 베타 불러옴");

  await page.getByTestId("project-search").fill("");
  await page.getByTestId("project-switcher").selectOption(alphaProjectId);
  await expect(page.getByTestId("project-status")).toContainText("검색 알파 불러옴");
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(alphaProjectId);
  await expect(page.getByTestId("project-switcher").locator("option").first()).toHaveText("검색 알파");
});

test("duplicates and deletes a saved project from the project panel", async ({ page }) => {
  await rm(".layo/projects", { recursive: true, force: true });
  await rm(".layo/files", { recursive: true, force: true });
  await rm("apps/server/.layo/projects", { recursive: true, force: true });
  await rm("apps/server/.layo/files", { recursive: true, force: true });

  await openEmptyEditor(page);
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const sourceProjectId = await page.getByTestId("project-switcher").inputValue();

  await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
  await expect(page.getByTestId("project-status")).toContainText("프로젝트 복제됨");
  const duplicatedProjectId = await page.getByTestId("project-switcher").inputValue();
  expect(duplicatedProjectId).not.toBe(sourceProjectId);
  await expect(page.getByTestId("project-name")).toHaveValue(/사본/);

  const projectsAfterDuplicate = await page.request.get("http://127.0.0.1:4317/projects");
  expect(projectsAfterDuplicate.ok()).toBeTruthy();
  const duplicatePayload = await projectsAfterDuplicate.json();
  expect(duplicatePayload.projects.map((project: { projectId: string }) => project.projectId)).toEqual(
    expect.arrayContaining([sourceProjectId, duplicatedProjectId])
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "현재 프로젝트 삭제" }).click();
  await expect(page.getByTestId("project-status")).toContainText("프로젝트 삭제됨");
  await expect(page.getByTestId("project-switcher")).not.toHaveValue(duplicatedProjectId);

  const deletedProject = await page.request.get(
    `http://127.0.0.1:4317/projects/${duplicatedProjectId}`
  );
  expect(deletedProject.status()).toBe(404);
});

test("inserts image files from drop and clipboard paste", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const dropTransfer = await createImageDataTransfer(page, "drop-image.png");
  await stageFrame.dispatchEvent("dragover", {
    dataTransfer: dropTransfer,
    clientX: stageBox.x + 260,
    clientY: stageBox.y + 220
  });
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: dropTransfer,
    clientX: stageBox.x + 260,
    clientY: stageBox.y + 220
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await expect(page.locator(".node-summary span")).toHaveText("이미지");
  await expect(page.getByTestId("selection-size-badge")).toBeVisible();

  const pasteTransfer = await createImageDataTransfer(page, "paste-image.png");
  await page.evaluate((dataTransfer) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: dataTransfer });
    window.dispatchEvent(event);
  }, pasteTransfer);

  await expect(page.getByRole("button", { name: "이미지 4" })).toBeVisible();

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const nodeKinds = flattenNodeKinds(filePayload.file.pages[0].children);
  expect(nodeKinds.filter((kind) => kind === "image")).toHaveLength(2);
});

test("canvas editor MVP supports Korean-first select, inspect, edit, undo, create, and zoom", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다시 실행" })).toHaveCount(0);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("32");

  const canvas = page.getByTestId("canvas-area");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("canvas area was not visible");
  }
  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 162, stageBox.y + 130);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 202, stageBox.y + 160);
  await page.mouse.up();
  await expect(page.getByTestId("inspector-x")).toHaveValue("72");
  await expect(page.getByTestId("inspector-y")).toHaveValue("70");

  const bottomRightHandleBox = await page.getByTestId("resize-handle-bottom-right").boundingBox();
  if (!bottomRightHandleBox) {
    throw new Error("bottom-right resize handle was not visible");
  }
  const bottomRightHandleCenter = {
    x: bottomRightHandleBox.x + bottomRightHandleBox.width / 2,
    y: bottomRightHandleBox.y + bottomRightHandleBox.height / 2
  };

  await page.mouse.move(bottomRightHandleCenter.x, bottomRightHandleCenter.y);
  await page.mouse.down();
  await page.mouse.move(bottomRightHandleCenter.x + 70, bottomRightHandleCenter.y + 60);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-width").inputValue()))
    .toBeGreaterThan(260);
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-height").inputValue()))
    .toBeGreaterThan(48);

  await page.getByTestId("inspector-x").fill("96");
  await page.getByTestId("inspector-y").fill("112");
  await page.getByTestId("inspector-width").fill("300");
  await page.getByTestId("inspector-height").fill("60");
  await page.getByTestId("inspector-text").fill("검증된 MVP 헤드라인");

  await expect(page.getByTestId("inspector-x")).toHaveValue("96");
  await expect(page.getByTestId("inspector-y")).toHaveValue("112");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("60");
  await expect(page.getByTestId("inspector-text")).toHaveValue("검증된 MVP 헤드라인");

  await page.getByRole("button", { name: "확대" }).focus();
  await page.keyboard.press("Control+Z");
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByTestId("inspector-text")).toHaveValue("검증된 MVP 헤드라인");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "컴포넌트 만들기" }).click();
  await expect(page.getByRole("button", { name: /랜딩 프레임 .* 컴포넌트/ })).toBeVisible();

  await page.getByRole("button", { name: "인스턴스 만들기" }).click();
  await expect(page.getByRole("button", { name: /랜딩 프레임 컴포넌트 인스턴스 .* 인스턴스/ })).toBeVisible();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");

  await page.getByRole("button", { name: "인스턴스 분리" }).click();
  await expect(page.locator(".node-summary span")).toHaveText("프레임");

  await page.getByRole("button", { name: "확대" }).click();
  await expect(floatingToolbarZoom(page, "125%")).toBeVisible();

  const agentId = `agent-note-${Date.now()}`;
  const agentName = `에이전트 메모 ${Date.now()}`;
  const agentValue = "에이전트가 만든 검증 텍스트";
  const agentResponse = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
    {
      data: {
        dryRun: false,
        commands: [
          {
            type: "create_text",
            parentId: "page-1",
            id: agentId,
            name: agentName,
            value: agentValue,
            x: 96,
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
  const agentResult = await agentResponse.json();
  expect(agentResult.result.audit.changedNodeIds).toEqual([agentId]);

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByRole("button", { name: agentName })).toBeVisible();
  await page.getByRole("button", { name: agentName }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue(agentValue);

  await page.screenshot({ path: "/tmp/layo-mvp-verified.png", fullPage: true });
});

test("web editor fills the available work area with a neutral infinite canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEmptyEditor(page);
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-area"]') as HTMLElement | null;
    const stage = document.querySelector('[data-testid="stage-frame"]') as HTMLElement | null;

    if (!canvas || !stage) {
      throw new Error("layout nodes missing");
    }

    window.scrollTo(1000, 0);
    const pageScrollXAfterAttempt = window.scrollX;
    window.scrollTo(0, 0);

    return {
      pageScrollXAfterAttempt,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      canvasClientWidth: canvas.clientWidth,
      canvasClientHeight: canvas.clientHeight,
      canvasScrollWidth: canvas.scrollWidth,
      canvasScrollHeight: canvas.scrollHeight,
      canvasBackground: getComputedStyle(canvas).backgroundColor,
      stageBackground: getComputedStyle(stage).backgroundColor,
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      stageHeight: Math.round(stage.getBoundingClientRect().height)
    };
  });

  expect(metrics.pageScrollXAfterAttempt).toBe(0);
  expect(metrics.documentScrollWidth).toBe(metrics.viewportWidth);
  expect(metrics.canvasScrollWidth).toBe(metrics.canvasClientWidth);
  expect(metrics.canvasScrollHeight).toBe(metrics.canvasClientHeight);
  expect(metrics.canvasBackground).toBe("rgb(238, 242, 246)");
  expect(metrics.stageBackground).toBe("rgba(0, 0, 0, 0)");
  expect(metrics.stageWidth).toBe(metrics.canvasClientWidth);
  expect(metrics.stageHeight).toBe(metrics.canvasClientHeight);
});

test("left sidebar can collapse from the top toolbar", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await expect(page.getByRole("heading", { name: "파일" })).toBeVisible();
  await page.getByRole("button", { name: "왼쪽 사이드바 접기" }).click();
  await expect(page.getByRole("heading", { name: "파일" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "헤드라인" })).toHaveCount(0);
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  await page.getByRole("button", { name: "왼쪽 사이드바 펼치기" }).click();
  await expect(page.getByRole("heading", { name: "파일" })).toBeVisible();
  await expect(page.getByRole("button", { name: "헤드라인" })).toBeVisible();
});

test("component toolbar actions use component-style icons instead of letter labels", async ({ page }) => {
  await openEmptyEditor(page);

  await expect(page.getByRole("button", { name: "컴포넌트 만들기" })).not.toHaveText("C");
  await expect(page.getByRole("button", { name: "인스턴스 만들기" })).not.toHaveText("I");
  await expect(page.getByRole("button", { name: "인스턴스 분리" })).not.toHaveText("D");
});

test("Figma-like editor shell separates rail, rulers, floating toolbar, and inspector sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEmptyEditor(page);

  await expect(page.getByTestId("editor-rail")).toBeVisible();
  await expect(page.getByTestId("editor-rail").getByRole("button", { name: "파일" })).toBeVisible();
  await expect(page.getByTestId("editor-rail").getByRole("button", { name: "에셋" })).toBeVisible();
  await expect(page.getByTestId("editor-rail").getByRole("button", { name: "레이어" })).toBeVisible();

  await expect(page.getByTestId("canvas-ruler-horizontal")).toBeVisible();
  await expect(page.getByTestId("canvas-ruler-vertical")).toBeVisible();

  const floatingToolbar = page.getByTestId("floating-toolbar");
  await expect(floatingToolbar).toBeVisible();
  const toolbarBox = await floatingToolbar.boundingBox();
  const workspaceBox = await page.locator(".editor-workspace").boundingBox();
  if (!toolbarBox || !workspaceBox) {
    throw new Error("editor shell geometry was not visible");
  }
  const toolbarCenterX = toolbarBox.x + toolbarBox.width / 2;
  const workspaceCenterX = workspaceBox.x + workspaceBox.width / 2;
  expect(toolbarBox?.y).toBeGreaterThan(760);
  expect(Math.abs(toolbarCenterX - workspaceCenterX)).toBeLessThan(4);

  await expect(page.getByTestId("inspector-tabs")).toBeVisible();
  await expect(page.getByTestId("inspector-action-strip")).toBeVisible();
  await expect(page.getByTestId("inspector-avatar")).toBeVisible();
  await expect(page.getByTestId("inspector-zoom-readout")).toHaveText("100%");
  await expect(page.getByRole("button", { name: "미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
  await expect(page.getByTestId("inspector-section-frame")).toBeVisible();
  await expect(page.getByTestId("inspector-section-presets")).toBeVisible();
  await expect(page.getByTestId("inspector-section-presets")).toContainText("프레젠테이션");
  await expect(page.getByTestId("inspector-section-presets")).toContainText("소셜 미디어");
  await expect(page.getByTestId("inspector-section-presets")).toContainText("아카이브");

  const canvasBackground = await page.getByTestId("canvas-area").evaluate((node) =>
    getComputedStyle(node).backgroundColor
  );
  expect(canvasBackground).not.toBe("rgb(255, 255, 255)");
});

test("left rail switches active panels and top file bar preserves file context", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await expect(page.getByTestId("top-file-bar")).toBeVisible();
  await expect(page.getByTestId("top-file-project")).toContainText("새 프로젝트");
  await expect(page.getByTestId("top-file-document")).toContainText("새 문서");
  await expect(page.getByTestId("top-file-share")).toContainText("비공개");

  await page.getByTestId("editor-rail").getByRole("button", { name: "에셋" }).click();
  await expect(page.getByTestId("asset-panel")).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toContainText("팀 라이브러리");
  await expect(page.getByTestId("layer-panel")).toHaveCount(0);
  await expect(page.getByTestId("team-panel")).toHaveCount(0);

  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await expect(page.getByTestId("layer-panel")).toBeVisible();
  await expect(page.getByTestId("layer-panel").getByRole("button", { name: "헤드라인" })).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toHaveCount(0);
  await expect(page.getByTestId("team-panel")).toHaveCount(0);

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await expect(page.getByTestId("team-panel")).toBeVisible();
  await expect(page.getByTestId("team-name")).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toHaveCount(0);
  await expect(page.getByTestId("layer-panel")).toHaveCount(0);

  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveValue(/새 프로젝트/);
});

test("right-click objects and images expose common context menu commands", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  await page.mouse.click(stageBox.x + 170, stageBox.y + 135, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "잘라내기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "복사", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "붙여넣기", exact: true })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "여기에 붙여넣기" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "복제" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "삭제" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "맨 앞으로 가져오기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "앞으로 가져오기", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "뒤로 보내기", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "맨 뒤로 보내기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "컴포넌트 만들기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "인스턴스 만들기" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "인스턴스 분리" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "왼쪽 맞춤" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "아래쪽 맞춤" })).toBeEnabled();

  await menu.getByRole("menuitem", { name: "복제" }).click();
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();

  const imageTransfer = await createImageDataTransfer(page, "context-image.png");
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 320,
    clientY: stageBox.y + 260
  });
  await expect(page.getByRole("button", { name: "이미지 4" })).toBeVisible();

  await page.mouse.click(stageBox.x + 320, stageBox.y + 260, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "잘라내기" }).click();
  await expect(page.getByRole("button", { name: "이미지 4" })).toHaveCount(0);

  await page.mouse.click(stageBox.x + 380, stageBox.y + 320, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "여기에 붙여넣기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "여기에 붙여넣기" }).click();
  await expect(page.getByRole("button", { name: /이미지 4 복사본/ })).toBeVisible();
});

test("right-click menu presents Figma-like shortcut hints and grouped sections", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  await page.mouse.click(stageBox.x + 170, stageBox.y + 135, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();

  await expect(menu.getByTestId("object-context-menu-section")).toHaveCount(7);
  await expect(menu.getByTestId("object-context-menu-section").first()).toHaveAttribute(
    "aria-label",
    "클립보드"
  );
  await expect(menu.getByRole("menuitem", { name: "복사", exact: true })).toContainText("⌘C");
  await expect(menu.getByRole("menuitem", { name: "붙여넣기", exact: true })).toContainText("⌘V");
  await expect(menu.getByRole("menuitem", { name: "복제" })).toContainText("⌘D");
  await expect(menu.getByRole("menuitem", { name: "삭제" })).toContainText("Delete");
  await expect(menu.getByRole("menuitem", { name: "그룹으로 묶기" })).toContainText("⌘G");
  await expect(menu.getByRole("menuitem", { name: "그룹 해제" })).toContainText("⇧⌘G");
  await expect(menu.getByRole("menuitem", { name: "왼쪽 맞춤" })).toContainText("⌥A");
  await expect(menu.getByRole("menuitem", { name: "가운데 맞춤", exact: true })).toContainText("⌥H");
  await expect(menu.getByRole("menuitem", { name: "오른쪽 맞춤" })).toContainText("⌥D");
  await expect(menu.getByRole("menuitem", { name: "위쪽 맞춤" })).toContainText("⌥W");
  await expect(menu.getByRole("menuitem", { name: "세로 가운데 맞춤" })).toContainText("⌥V");
  await expect(menu.getByRole("menuitem", { name: "아래쪽 맞춤" })).toContainText("⌥S");
  await expect(menu.getByTestId("context-menu-shortcut")).toHaveCount(19);
});

test("right-click image menu restores the uploaded original size", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(page, "large-context-image.png", {
    width: 720,
    height: 480
  });
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "원본 크기로 맞춤" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "원본 크기로 맞춤" }).click();

  await expect(page.getByTestId("inspector-width")).toHaveValue("720");
  await expect(page.getByTestId("inspector-height")).toHaveValue("480");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("720 x 480");
});

test("right-click image menu replaces the image asset while keeping geometry", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(
    page,
    "replace-original.png",
    { width: 720, height: 480 },
    "#2563eb"
  );
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "이미지 바꾸기" })).toBeEnabled();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: "이미지 바꾸기" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(
    await createImageUploadFile(page, "replace-next.png", { width: 300, height: 900 }, "#16a34a")
  );

  await expect(page.getByTestId("project-status")).toContainText("이미지 3 이미지 바뀜");
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await page.getByRole("button", { name: "이미지 3" }).click();
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");
  const reloadedStageBox = await stageFrame.boundingBox();
  if (!reloadedStageBox) {
    throw new Error("stage frame was not visible after reload");
  }

  await page.mouse.click(reloadedStageBox.x + 420, reloadedStageBox.y + 320, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "원본 크기로 맞춤" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "원본 크기로 맞춤" }).click();

  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("900");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("300 x 900");
});

test("right-click image menu switches between fill and fit sizing modes", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(
    page,
    "wide-fill-fit.png",
    { width: 900, height: 300 },
    "#2563eb"
  );
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("300");
  await page.getByTestId("inspector-height").fill("300");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("300");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "이미지 맞춤" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "이미지 맞춤" }).click();
  await expect(page.getByTestId("project-status")).toContainText("이미지 3 이미지 맞춤");

  const fittedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fittedResponse.ok()).toBeTruthy();
  const fittedPayload = await fittedResponse.json();
  const fittedImage = fittedPayload.file.pages[0].children.find((node: { id: string }) => node.id === "image-3");
  expect(fittedImage.content.fit_mode).toBe("fit");

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await page.getByRole("button", { name: "이미지 3" }).click();

  const reloadedStageBox = await stageFrame.boundingBox();
  if (!reloadedStageBox) {
    throw new Error("stage frame was not visible after reload");
  }
  await page.mouse.click(reloadedStageBox.x + 420, reloadedStageBox.y + 320, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "이미지 채우기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "이미지 채우기" }).click();

  const filledResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(filledResponse.ok()).toBeTruthy();
  const filledPayload = await filledResponse.json();
  const filledImage = filledPayload.file.pages[0].children.find((node: { id: string }) => node.id === "image-3");
  expect(filledImage.content.fit_mode).toBe("fill");
});

test("right-click menu locks and hides objects while layer state remains recoverable", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  await expect(rectangleLayer).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");

  await page.mouse.click(stageBox.x + 240, stageBox.y + 190, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "잠그기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "숨기기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "잠그기" }).click();

  const lockedRectangleLayer = page.getByRole("button", { name: /사각형 3.*잠김/ });
  await expect(lockedRectangleLayer).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");
  await page.mouse.move(stageBox.x + 240, stageBox.y + 190);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 300, stageBox.y + 240);
  await page.mouse.up();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "잠금 해제" }).click();
  await expect(page.getByRole("button", { name: /^사각형 3$/ })).toBeVisible();

  await page.mouse.click(stageBox.x + 240, stageBox.y + 190, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "숨기기" }).click();
  await expect(page.getByRole("button", { name: /사각형 3.*숨김/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.mouse.click(stageBox.x + 240, stageBox.y + 190);
  await expect(page.getByRole("button", { name: /사각형 3.*숨김/ })).not.toHaveClass(/is-selected/);

  await page.getByRole("button", { name: /사각형 3.*숨김/ }).click();
  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "표시" }).click();
  await expect(page.getByRole("button", { name: /^사각형 3$/ })).toBeVisible();
});

test("right-click menu groups, renames, and ungroups selected objects", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();

  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await firstRectangle.click();
  await page.keyboard.down("Shift");
  await secondRectangle.click();
  await page.keyboard.up("Shift");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "그룹으로 묶기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "그룹으로 묶기" }).click();

  await expect(page.getByRole("button", { name: /그룹 5/ })).toBeVisible();

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("레이어 이름");
    await dialog.accept("헤더 그룹");
  });
  await menu.getByRole("menuitem", { name: "이름 변경" }).click();
  await expect(page.getByRole("button", { name: /^헤더 그룹/ })).toBeVisible();

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "그룹 해제" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "그룹 해제" }).click();

  await expect(page.getByRole("button", { name: /^헤더 그룹/ })).toHaveCount(0);
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();
});

test("right-click menu frames the selected objects", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();

  await page.getByRole("button", { name: "사각형 3" }).click();
  await page.keyboard.down("Shift");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await page.keyboard.up("Shift");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "선택 영역 프레임 만들기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "선택 영역 프레임 만들기" }).click();

  await expect(page.getByRole("button", { name: /프레임 5/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();

  const selectedFrame = page.getByRole("button", { name: /프레임 5/ });
  await expect(selectedFrame).toHaveClass(/is-selected/);
});

test("right-click menu supports expanded selection, transform, zoom, and export actions", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-x").fill("420");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "전체 선택" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "같은 종류 선택" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "선택 영역 확대" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "가로 뒤집기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "세로 뒤집기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "코드로 내보내기" })).toBeEnabled();

  await menu.getByRole("menuitem", { name: "같은 종류 선택" }).click();
  await expect(page.locator(".node-summary strong")).toHaveText("2개 레이어 선택됨");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "가로 뒤집기" }).click();
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("420");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "전체 선택" }).click();
  await expect(page.locator(".node-summary strong")).toHaveText("3개 레이어 선택됨");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "선택 영역 확대" }).click();
  await expect(page.getByTestId("floating-toolbar").locator(".zoom-readout")).not.toHaveText("100%");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "코드로 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^layo-code-export-.*\.json$/);
  await expect(page.getByTestId("project-status")).toContainText("코드 내보내기 완료");
});

test("right-click menu copies object styles and exports the selected object as PNG", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#f97316");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#38bdf8");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "스타일 복사" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "스타일 복사" }).click();
  await expect(page.getByTestId("project-status")).toContainText("사각형 3 스타일 복사됨");

  await page.getByRole("button", { name: "사각형 4" }).click();
  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "스타일 붙여넣기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "스타일 붙여넣기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("사각형 4 스타일 적용됨");

  await expect(page.getByTestId("inspector-fill")).toHaveValue("#f97316");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "PNG로 내보내기" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "PNG로 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("rectangle-4.png");
  await expect(page.getByTestId("project-status")).toContainText("사각형 4 PNG 내보내기 완료");
});

test("Figma-like canvas input routing nudges layers, pans canvas, and zooms with modifiers", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 360, stageBox.y + 260);
  await page.mouse.wheel(0, -300);
  await expect(floatingToolbarZoom(page, "100%")).toBeVisible();

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect(floatingToolbarZoom(page, "125%")).toBeVisible();

  await page.keyboard.press("Control+=");
  await expect(floatingToolbarZoom(page, "150%")).toBeVisible();
  await page.keyboard.press("Control+-");
  await expect(floatingToolbarZoom(page, "125%")).toBeVisible();
  await page.keyboard.press("Control+0");
  await expect(floatingToolbarZoom(page, "100%")).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("inspector-x")).toHaveValue("33");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByTestId("inspector-y")).toHaveValue("50");

  await page.keyboard.down("Space");
  await page.mouse.move(stageBox.x + 160, stageBox.y + 130);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 220, stageBox.y + 160);
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.getByTestId("inspector-x")).toHaveValue("33");
  await expect(page.getByTestId("inspector-y")).toHaveValue("50");

  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");
  await page.getByTestId("inspector-text").fill("키보드 단축키 검증");
  await expect(page.getByTestId("inspector-text")).toHaveValue("키보드 단축키 검증");

  await page.mouse.click(stageBox.x + 40, stageBox.y + 40);
  await page.keyboard.press("Control+Z");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.mouse.click(stageBox.x + 40, stageBox.y + 40);
  await page.keyboard.press("Control+Shift+Z");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("키보드 단축키 검증");

  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();
});

test("text layers enter inline edit mode on double click", async ({ page }) => {
  await createProjectFromEmptyState(page);

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.dblclick(stageBox.x + 170, stageBox.y + 135);

  const inlineEditor = page.getByTestId("inline-text-editor");
  await expect(inlineEditor).toBeVisible();
  await expect(inlineEditor).toBeFocused();
  await expect(inlineEditor).toHaveValue("Layo");

  await inlineEditor.fill("더블클릭으로 바로 수정");
  await expect(page.getByTestId("inspector-text")).toHaveValue("더블클릭으로 바로 수정");

  await page.keyboard.press("Escape");
  await expect(inlineEditor).toHaveCount(0);
  await expect(page.getByTestId("inspector-text")).toHaveValue("더블클릭으로 바로 수정");
});

test("empty text inspector field renders as a single underline with placeholder", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  const textField = page.getByTestId("inspector-text");

  await textField.fill("");

  await expect(textField).toHaveValue("");
  await expect(textField).toHaveAttribute("placeholder", "텍스트 입력");
  await expect(textField).toHaveCSS("border-top-width", "0px");
  await expect(textField).toHaveCSS("border-bottom-width", "1px");
});

test("Figma-like edit shortcuts duplicate and delete selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+D");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toHaveCount(0);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.keyboard.press("Control+Z");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
});

test("Figma-like object clipboard copies and pastes selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");

  const firstPaste = page.getByRole("button", { name: "헤드라인 복사본" });
  await expect(firstPaste).toBeVisible();
  await expect(firstPaste).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-x")).toHaveValue("56");
  await expect(page.getByTestId("inspector-y")).toHaveValue("64");
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.keyboard.press("Control+V");
  const secondPaste = page.getByRole("button", { name: "헤드라인 복사본 2" });
  await expect(secondPaste).toBeVisible();
  await expect(secondPaste).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-x")).toHaveValue("80");
  await expect(page.getByTestId("inspector-y")).toHaveValue("88");

  await page.keyboard.press("Control+Z");
  await expect(secondPaste).toHaveCount(0);
  await expect(firstPaste).toBeVisible();
});

test("Figma-like object clipboard cuts selected layers with the menu shortcut", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+X");

  await expect(page.getByRole("button", { name: "헤드라인" })).toHaveCount(0);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.keyboard.press("Control+V");
  const pastedLayer = page.getByRole("button", { name: "헤드라인 복사본" });
  await expect(pastedLayer).toBeVisible();
  await expect(pastedLayer).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");
});

test("Figma-like grouping shortcuts mirror object menu grouping", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();

  await firstRectangle.click();
  await secondRectangle.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Control+G");
  const groupLayer = page.getByRole("button", { name: /그룹 \d+/ });
  await expect(groupLayer).toBeVisible();
  await expect(groupLayer).toHaveClass(/is-selected/);

  await page.keyboard.press("Control+Shift+G");
  await expect(groupLayer).toHaveCount(0);
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();
});

test("Figma-like alignment shortcuts mirror object menu alignment", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("760");
  await expect(page.getByTestId("inspector-x")).toHaveValue("760");

  await rectangleLayer.click({ modifiers: ["Shift"] });
  await headlineLayer.click({ modifiers: ["Shift"] });
  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Alt+A");
  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("152");
});

test("Figma-like selection shortcuts mirror object menu selection and fit actions", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();

  await firstRectangle.click();
  await page.keyboard.press("Control+Shift+A");
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
  await expect(firstRectangle).toHaveClass(/is-selected/);
  await expect(secondRectangle).toHaveClass(/is-selected/);

  await page.keyboard.press("Control+A");
  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Shift+1");
  await expect(page.getByTestId("floating-toolbar").locator(".zoom-readout")).not.toHaveText("100%");
});

test("Figma-like style and rename shortcuts mirror object menu edit actions", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#f97316");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#38bdf8");

  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await firstRectangle.click();
  await page.keyboard.press("Control+Alt+C");

  await secondRectangle.click();
  await page.keyboard.press("Control+Alt+V");
  await expect(page.getByRole("button", { name: "사각형 3 복사본" })).toHaveCount(0);
  await expect(secondRectangle).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#f97316");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("레이어 이름");
    await dialog.accept("단축키 레이어");
  });
  await page.keyboard.press("Control+R");
  await expect(page.getByRole("button", { name: /^단축키 레이어/ })).toBeVisible();
});

test("Figma-like multi-selection supports Shift-click and area selection", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  await expect(rectangleLayer).toBeVisible();

  await page.keyboard.down("Shift");
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 100, stageBox.y + 70);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 240, stageBox.y + 180);
  await expect(page.getByTestId("area-selection-box")).toBeVisible();
  await page.mouse.move(stageBox.x + 455, stageBox.y + 262);
  await page.mouse.up();

  await expect(page.getByTestId("area-selection-box")).toHaveCount(0);
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
});

test("Figma-like multi-selection drags together and shows snap guides", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const targetLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(targetLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("480");
  await page.getByTestId("inspector-y").fill("130");
  await expect(page.getByTestId("inspector-x")).toHaveValue("480");

  await rectangleLayer.click();
  await page.keyboard.down("Shift");
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(targetLayer).not.toHaveClass(/is-selected/);
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 220, stageBox.y + 180);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 285, stageBox.y + 180);
  await expect(page.getByTestId("snap-guide-vertical")).toBeVisible();
  await page.mouse.up();

  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
  await expect(page.getByTestId("snap-guide-vertical")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();
  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("245");
  await headlineLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("97");
});

test("multi-selection drag preview preserves sub-pixel movement while zoomed", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  await expect(rectangleLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("40");
  await page.getByTestId("inspector-y").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("40");
  await expect(page.getByTestId("inspector-y")).toHaveValue("40");

  for (let index = 0; index < 12; index += 1) {
    await page.getByRole("button", { name: "확대" }).click();
  }
  await expect(floatingToolbarZoom(page, "400%")).toBeVisible();

  await rectangleLayer.click();
  await page.keyboard.down("Shift");
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(headlineLayer).toHaveClass(/is-selected/);

  const beforeDrag = await findCanvasColorBounds(page, { r: 224, g: 242, b: 254 });
  await page.mouse.move(beforeDrag.left + 80, beforeDrag.top + 80);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.left + 83, beforeDrag.top + 80);
  await page.waitForTimeout(100);

  const duringDrag = await findCanvasColorBounds(page, { r: 224, g: 242, b: 254 });
  expect(duringDrag.left).toBeGreaterThanOrEqual(beforeDrag.left + 2.75);
  expect(duringDrag.left).toBeLessThan(beforeDrag.left + 3.25);

  await page.mouse.up();
});

test("Figma-like alignment and distribution inspector controls selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await expect(page.getByRole("button", { name: "왼쪽 정렬" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "가로 분배" })).toHaveCount(0);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("760");
  await expect(page.getByTestId("inspector-x")).toHaveValue("760");

  await page.keyboard.down("Shift");
  await rectangleLayer.click();
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(helperTextLayer).toHaveClass(/is-selected/);
  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();

  await page.getByRole("button", { name: "검사기 왼쪽 맞춤" }).click();
  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("152");

  await page.keyboard.press("Control+Z");
  await helperTextLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("760");

  await page.keyboard.down("Shift");
  await rectangleLayer.click();
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "검사기 가로 간격 균등" }).click();

  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("506");
});

test("inspector alignment controls expose grouped tooltips and disabled distribution state", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "헤드라인" }).click();

  await expect(page.getByTestId("inspector-align-group").getByRole("button")).toHaveCount(6);
  await expect(page.getByTestId("inspector-distribute-group").getByRole("button")).toHaveCount(2);

  const leftAlign = page.getByRole("button", { name: "검사기 왼쪽 맞춤" });
  const horizontalDistribute = page.getByRole("button", { name: "검사기 가로 간격 균등" });
  await expect(leftAlign).toBeEnabled();
  await expect(leftAlign).toHaveAttribute("title", "왼쪽 맞춤");
  await expect(horizontalDistribute).toBeDisabled();
  await expect(horizontalDistribute).toHaveAttribute("title", "가로 간격 균등");
  await expect(horizontalDistribute).toHaveClass(/is-disabled/);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await headlineLayer.click();
  await rectangleLayer.click({ modifiers: ["Shift"] });
  await helperTextLayer.click({ modifiers: ["Shift"] });

  await expect(horizontalDistribute).toBeEnabled();
  await expect(horizontalDistribute).not.toHaveClass(/is-disabled/);
});

test("multi-selection group bounds show combined dimensions without resize handles", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await headlineLayer.click();
  await rectangleLayer.click({ modifiers: ["Shift"] });
  await helperTextLayer.click({ modifiers: ["Shift"] });

  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();
  await expect(page.getByTestId("multi-selection-bounds")).toBeVisible();
  await expect(page.getByTestId("selection-size-badge")).toHaveText("288 x 116");
  await expect(page.getByTestId("resize-handle-top-left")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-bottom-right")).toHaveCount(0);
});

test("Figma-like measurement overlay and inspector alignment controls selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  await expect(rectangleLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("620");
  await page.getByTestId("inspector-y").fill("130");
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");

  await headlineLayer.click();
  await page.getByRole("button", { name: "검사기 오른쪽 맞춤" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("160");

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 640, stageBox.y + 150);
  await expect(page.getByTestId("measurement-overlay")).toBeVisible();
  await expect(page.getByTestId("measurement-size-label")).toHaveText("160 x 96");
  await expect(page.getByTestId("measurement-distance-horizontal")).toContainText("80");
});

test("selected layers expose four corner resize handles and an immediate size badge", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();

  await expect(page.getByTestId("selection-size-badge")).toHaveText("260 x 48");
  await expect(page.getByTestId("resize-handle-top-left")).toBeVisible();
  await expect(page.getByTestId("resize-handle-top-right")).toBeVisible();
  await expect(page.getByTestId("resize-handle-bottom-left")).toBeVisible();
  await expect(page.getByTestId("resize-handle-bottom-right")).toBeVisible();

  const topLeftHandleBox = await page.getByTestId("resize-handle-top-left").boundingBox();
  if (!topLeftHandleBox) {
    throw new Error("top-left resize handle was not visible");
  }

  const handleCenter = {
    x: topLeftHandleBox.x + topLeftHandleBox.width / 2,
    y: topLeftHandleBox.y + topLeftHandleBox.height / 2
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(handleCenter.x - 20, handleCenter.y - 20);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-x")).toHaveValue("12");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("280");
  await expect(page.getByTestId("inspector-height")).toHaveValue("68");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("280 x 68");
});

test("resize handles expose directional mouse cursors while hovered", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();

  const stageCursor = () =>
    page.evaluate(() => {
      const stageContainer = document.querySelector<HTMLElement>(".konvajs-content");
      if (!stageContainer) {
        throw new Error("Konva stage container was not visible");
      }
      return window.getComputedStyle(stageContainer).cursor;
    });

  for (const [handle, cursor] of [
    ["top-left", "nwse-resize"],
    ["bottom-right", "nwse-resize"],
    ["top-right", "nesw-resize"],
    ["bottom-left", "nesw-resize"]
  ] as const) {
    const handleBox = await page.getByTestId(`resize-handle-${handle}`).boundingBox();
    if (!handleBox) {
      throw new Error(`${handle} resize handle was not visible`);
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await expect.poll(stageCursor).toBe(cursor);
  }

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }
  await page.mouse.move(stageBox.x + 20, stageBox.y + 20);
  await expect.poll(stageCursor).toBe("auto");
});

test("selected layers expose only corner resize handles and side drags do not resize", async ({ page }) => {
  await createProjectFromEmptyState(page);

  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  await headlineLayer.click();

  await expect(page.getByTestId("resize-handle-top")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-right")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-bottom")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-left")).toHaveCount(0);

  const topRightHandleBox = await page.getByTestId("resize-handle-top-right").boundingBox();
  const bottomRightHandleBox = await page.getByTestId("resize-handle-bottom-right").boundingBox();
  if (!topRightHandleBox || !bottomRightHandleBox) {
    throw new Error("corner resize handles were not visible");
  }

  const rightEdgeMidpoint = {
    x: topRightHandleBox.x + topRightHandleBox.width / 2,
    y:
      (topRightHandleBox.y +
        topRightHandleBox.height / 2 +
        bottomRightHandleBox.y +
        bottomRightHandleBox.height / 2) /
      2
  };

  await page.mouse.move(rightEdgeMidpoint.x, rightEdgeMidpoint.y);
  await page.mouse.down();
  await page.mouse.move(rightEdgeMidpoint.x + 30, rightEdgeMidpoint.y);
  await page.mouse.up();

  await headlineLayer.click();
  await expect(page.getByTestId("inspector-width")).toHaveValue("260");
  await expect(page.getByTestId("inspector-height")).toHaveValue("48");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("260 x 48");
});

test("selected frames show thin padding and child spacing guides", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "랜딩 프레임" }).click();

  await expect(page.getByTestId("frame-spacing-overlay")).toBeVisible();
  await expect(page.getByTestId("frame-padding-left")).toHaveText("32");
  await expect(page.getByTestId("frame-padding-top")).toHaveText("40");
  await expect(page.getByTestId("frame-padding-right")).toHaveText("80");
  await expect(page.getByTestId("frame-padding-bottom")).toHaveText("44");
  await expect(page.getByTestId("frame-spacing-vertical")).toHaveText("52");
});

test("component instances drag as a single selected object from nested content", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "컴포넌트 만들기" }).click();
  await page.getByRole("button", { name: "인스턴스 만들기" }).click();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("560");
  await expect(page.getByTestId("inspector-y")).toHaveValue("120");

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 612, stageBox.y + 178);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 672, stageBox.y + 208);
  await page.mouse.up();

  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});

test("unselected component instances select first and move only after a selected drag", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "컴포넌트 만들기" }).click();
  await page.getByRole("button", { name: "인스턴스 만들기" }).click();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.click(stageBox.x + 60, stageBox.y + 580);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.mouse.move(stageBox.x + 590, stageBox.y + 140);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 650, stageBox.y + 170);
  await page.mouse.up();

  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("560");
  await expect(page.getByTestId("inspector-y")).toHaveValue("120");

  await page.mouse.move(stageBox.x + 590, stageBox.y + 140);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 650, stageBox.y + 170);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});

test("inspector auto layout stacks children inside a selected frame", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("80");
});

test("inspector layout reverse direction places children from the main-axis end", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal_reverse");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("260");
  await page.getByTestId("inspector-height").fill("48");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("140");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("48");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-direction")).toHaveValue("horizontal_reverse");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical_reverse");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("212");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("170");
});

test("inspector auto layout uses fit sizing for container", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("120");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-width-sizing").selectOption("fit");
  await page.getByTestId("inspector-layout-height-sizing").selectOption("fit");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-width-sizing")).toHaveValue("fit");
  await expect(page.getByTestId("inspector-layout-height-sizing")).toHaveValue("fit");
  await expect(page.getByTestId("inspector-width")).toHaveValue("168");
  await expect(page.getByTestId("inspector-height")).toHaveValue("122");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("72");
});

test("inspector grid layout auto-places static children into equal cells", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await expect(page.getByTestId("inspector-layout-grid-columns")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-grid-rows")).toBeVisible();
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("12");
  await page.getByTestId("inspector-layout-column-gap").fill("16");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(page.locator(".node-summary strong")).toHaveText("랜딩 프레임");
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }
  await expect(page.getByRole("button", { name: "사각형 5" })).toBeVisible();

  const cellPositions: string[] = [];
  for (const name of ["헤드라인", "사각형 3", "사각형 4", "사각형 5"]) {
    await page.getByRole("button", { name }).click();
    cellPositions.push(`${await page.getByTestId("inspector-x").inputValue()},${await page.getByTestId("inspector-y").inputValue()}`);
  }
  expect(cellPositions.sort()).toEqual(["188,126", "188,20", "24,126", "24,20"]);
});

test("inspector grid track units resize cells with px and fr values", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("500");
  await page.getByTestId("inspector-height").fill("260");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toBeVisible();
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 2fr 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("80px 1fr");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }

  const positions: Record<string, string> = {};
  for (const name of ["헤드라인", "사각형 3", "사각형 4", "사각형 5"]) {
    await page.getByRole("button", { name }).click();
    positions[name] = `${await page.getByTestId("inspector-x").inputValue()},${await page.getByTestId("inspector-y").inputValue()}`;
  }

  expect(positions).toMatchObject({
    "헤드라인": "20,20",
    "사각형 3": "150,20",
    "사각형 4": "373.3,20",
    "사각형 5": "20,110"
  });
});

test("canvas grid column handles resize tracks directly in the viewport", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHandle = page.getByTestId("grid-column-resize-handle-1");
  await expect(firstColumnHandle).toBeVisible();
  const handleBox = await firstColumnHandle.boundingBox();
  if (!handleBox) {
    throw new Error("grid column handle did not expose a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 40, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("160px 1fr");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("190");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstRowHandle = page.getByTestId("grid-row-resize-handle-1");
  await expect(firstRowHandle).toBeVisible();
  const rowHandleBox = await firstRowHandle.boundingBox();
  if (!rowHandleBox) {
    throw new Error("grid row handle did not expose a bounding box");
  }

  await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2 + 30);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("120px 1fr");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("140");
});

test("canvas grid viewport add controls append rows and columns", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await expect(page.getByTestId("grid-column-add-control")).toBeVisible();
  await expect(page.getByTestId("grid-row-add-control")).toBeVisible();
  await page.getByTestId("grid-column-add-control").click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 1fr");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("grid-row-add-control").click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 1fr 1fr");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");
});

test("canvas grid viewport remove controls delete specific rows and columns", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 1fr 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await expect(page.getByTestId("grid-column-remove-control-3")).toBeVisible();
  await expect(page.getByTestId("grid-row-remove-control-3")).toBeVisible();
  await page.getByTestId("grid-column-remove-control-3").click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr");
  await expect(page.getByTestId("grid-column-remove-control-3")).toHaveCount(0);

  await page.getByTestId("grid-row-remove-control-3").click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 1fr");
  await expect(page.getByTestId("grid-row-remove-control-3")).toHaveCount(0);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");
});

test("canvas grid header context menu edits rows and columns", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 40px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-column-header-2").click({ button: "right" });
  const menu = page.getByTestId("grid-track-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "왼쪽에 열 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "오른쪽에 열 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "열 복제" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "열 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "왼쪽에 열 추가" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 80px 1fr");

  await page.getByTestId("grid-column-header-3").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "열 복제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 80px 80px 1fr");

  await page.getByTestId("grid-column-header-4").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "열 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 80px 1fr");

  await page.getByTestId("grid-row-header-2").click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "행 복제" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "위에 행 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "아래에 행 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "행 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "행 복제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 40px 40px 1fr");

  await page.getByTestId("grid-row-header-3").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "행 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 40px 1fr");
});

test("canvas grid header context menu deletes tracks with shapes", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }
  await expect(page.getByRole("button", { name: "사각형 6" })).toBeVisible();

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("grid-column-header-2").click({ button: "right" });
  const menu = page.getByTestId("grid-track-context-menu");
  await expect(menu.getByRole("menuitem", { name: "열과 객체 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "열과 객체 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr");
  await expect(page.getByRole("button", { name: "사각형 3" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사각형 6" })).toHaveCount(0);

  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 5" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("grid-row-header-2").click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "행과 객체 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "행과 객체 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px");
  await expect(page.getByRole("button", { name: "사각형 5" })).toHaveCount(0);
});

test("canvas grid headers drag reorder rows and columns with shapes", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 40px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHeader = page.getByTestId("grid-column-header-1");
  const thirdColumnHeader = page.getByTestId("grid-column-header-3");
  const firstColumnBox = await firstColumnHeader.boundingBox();
  const thirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!firstColumnBox || !thirdColumnBox) {
    throw new Error("grid column headers did not expose bounding boxes");
  }
  await page.mouse.move(firstColumnBox.x + firstColumnBox.width / 2, firstColumnBox.y + firstColumnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdColumnBox.x + thirdColumnBox.width / 2, thirdColumnBox.y + thirdColumnBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("80px 1fr 120px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 5" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstRowHeader = page.getByTestId("grid-row-header-1");
  const thirdRowHeader = page.getByTestId("grid-row-header-3");
  const firstRowBox = await firstRowHeader.boundingBox();
  const thirdRowBox = await thirdRowHeader.boundingBox();
  if (!firstRowBox || !thirdRowBox) {
    throw new Error("grid row headers did not expose bounding boxes");
  }
  await page.mouse.move(firstRowBox.x + firstRowBox.width / 2, firstRowBox.y + firstRowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdRowBox.x + thirdRowBox.width / 2, thirdRowBox.y + thirdRowBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("40px 1fr 90px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("170");
  await page.getByRole("button", { name: "사각형 5" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("canvas grid Ctrl-drag reorder preserves object positions", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("240");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHeader = page.getByTestId("grid-column-header-1");
  const thirdColumnHeader = page.getByTestId("grid-column-header-3");
  const firstColumnBox = await firstColumnHeader.boundingBox();
  const thirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!firstColumnBox || !thirdColumnBox) {
    throw new Error("grid column headers did not expose bounding boxes");
  }
  await page.keyboard.down("Control");
  await page.mouse.move(firstColumnBox.x + firstColumnBox.width / 2, firstColumnBox.y + firstColumnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdColumnBox.x + thirdColumnBox.width / 2, thirdColumnBox.y + thirdColumnBox.height / 2);
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("80px 1fr 120px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("240");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("canvas grid header reorder supports spanned grid items", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("160");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-grid-column").fill("1");
  await page.getByTestId("inspector-layout-item-grid-row").fill("1");
  await page.getByTestId("inspector-layout-item-grid-column-span").fill("2");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("210");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHeader = page.getByTestId("grid-column-header-1");
  const thirdColumnHeader = page.getByTestId("grid-column-header-3");
  const firstColumnBox = await firstColumnHeader.boundingBox();
  const thirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!firstColumnBox || !thirdColumnBox) {
    throw new Error("grid column headers did not expose bounding boxes");
  }
  await page.mouse.move(firstColumnBox.x + firstColumnBox.width / 2, firstColumnBox.y + firstColumnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdColumnBox.x + thirdColumnBox.width / 2, thirdColumnBox.y + thirdColumnBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("80px 1fr 120px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-grid-column")).toHaveValue("1");
  await expect(page.getByTestId("inspector-layout-item-grid-column-span")).toHaveValue("3");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("380");
});

test("inspector manual grid cell placement moves a child to the requested cell", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("390");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("3");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("15");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("15");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-layout-item-grid-column")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-item-grid-row")).toBeVisible();
  await page.getByTestId("inspector-layout-item-grid-column").fill("3");
  await page.getByTestId("inspector-layout-item-grid-row").fill("2");
  await expect(page.getByTestId("inspector-x")).toHaveValue("263");
  await expect(page.getByTestId("inspector-y")).toHaveValue("115");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("15");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector grid justify items stretch expands child width", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("320");
  await page.getByTestId("inspector-height").fill("140");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("1");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-grid-justify-items").selectOption("stretch");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("10");
  await page.getByTestId("inspector-layout-padding-right").fill("10");
  await page.getByTestId("inspector-layout-padding-bottom").fill("10");
  await page.getByTestId("inspector-layout-padding-left").fill("10");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("40");
  await page.getByTestId("inspector-height").fill("40");

  await expect(page.getByTestId("inspector-x")).toHaveValue("10");
  await expect(page.getByTestId("inspector-y")).toHaveValue("10");
  await expect(page.getByTestId("inspector-width")).toHaveValue("150");
});

test("inspector grid item self alignment overrides container stretch", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("320");
  await page.getByTestId("inspector-height").fill("160");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("1");
  await page.getByTestId("inspector-layout-align-items").selectOption("stretch");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-grid-justify-items").selectOption("stretch");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("10");
  await page.getByTestId("inspector-layout-padding-right").fill("10");
  await page.getByTestId("inspector-layout-padding-bottom").fill("10");
  await page.getByTestId("inspector-layout-padding-left").fill("10");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-justify-self").selectOption("end");
  await page.getByTestId("inspector-layout-item-align-self").selectOption("center");
  await page.getByTestId("inspector-width").fill("40");
  await page.getByTestId("inspector-height").fill("40");

  await expect(page.getByTestId("inspector-layout-item-justify-self")).toHaveValue("end");
  await expect(page.getByTestId("inspector-layout-item-align-self")).toHaveValue("center");
  await expect(page.getByTestId("inspector-x")).toHaveValue("120");
  await expect(page.getByTestId("inspector-y")).toHaveValue("60");
  await expect(page.getByTestId("inspector-width")).toHaveValue("40");
  await expect(page.getByTestId("inspector-height")).toHaveValue("40");
});

test("inspector grid baseline aligns mixed text per row", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "label-1",
          name: "라벨",
          value: "Label",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "subtitle-1",
          name: "서브타이틀",
          value: "Sub",
          x: 0,
          y: 0,
          width: 90,
          height: 48,
          fill: "#111827",
          fontSize: 32,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("300");
  await page.getByTestId("inspector-height").fill("180");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("baseline");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("20");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");
  await page.getByRole("button", { name: "캡션" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "라벨" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-mode")).toHaveValue("grid");
  await expect(page.getByTestId("inspector-layout-align-items")).toHaveValue("baseline");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "캡션" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("29");
  await page.getByRole("button", { name: "라벨" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("113");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("100");
});

test("inspector auto layout baseline aligns mixed text baselines", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("140");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-align-items").selectOption("baseline");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("120");
  await page.getByTestId("inspector-height").fill("48");
  await page.getByRole("button", { name: "캡션" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-align-items")).toHaveValue("baseline");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "캡션" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("29");
});

test("inspector wrapped auto layout baseline aligns each row", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "label-1",
          name: "라벨",
          value: "Label",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "subtitle-1",
          name: "서브타이틀",
          value: "Sub",
          x: 0,
          y: 0,
          width: 90,
          height: 48,
          fill: "#111827",
          fontSize: 32,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("240");
  await page.getByTestId("inspector-height").fill("180");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-wrap").selectOption("wrap");
  await page.getByTestId("inspector-layout-align-content").selectOption("start");
  await page.getByTestId("inspector-layout-align-items").selectOption("baseline");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");
  await page.getByRole("button", { name: "캡션" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "라벨" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-wrap")).toHaveValue("wrap");
  await expect(page.getByTestId("inspector-layout-align-items")).toHaveValue("baseline");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "캡션" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("120");
  await expect(page.getByTestId("inspector-y")).toHaveValue("29");
  await page.getByRole("button", { name: "라벨" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("93");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("110");
  await expect(page.getByTestId("inspector-y")).toHaveValue("80");
});

test("inspector grid item span stretches a child across multiple cells", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("390");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("3");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("15");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("15");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-layout-item-grid-column-span")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-item-grid-row-span")).toBeVisible();
  await page.getByTestId("inspector-layout-item-grid-column").fill("1");
  await page.getByTestId("inspector-layout-item-grid-row").fill("1");
  await page.getByTestId("inspector-layout-item-grid-column-span").fill("2");
  await page.getByTestId("inspector-layout-item-grid-row-span").fill("2");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("15");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("236");
  await expect(page.getByTestId("inspector-height")).toHaveValue("180");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("263");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("canvas grid area boundary handle expands an explicit child span", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("8");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-grid-column").fill("1");
  await page.getByTestId("inspector-layout-item-grid-row").fill("1");
  await page.getByTestId("inspector-layout-item-grid-column-span").fill("1");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("120");

  const rightBoundaryHandle = page.getByTestId("grid-area-boundary-handle-right");
  await expect(rightBoundaryHandle).toBeVisible();
  const handleBox = await rightBoundaryHandle.boundingBox();
  if (!handleBox) {
    throw new Error("grid area right boundary handle did not expose a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 90, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-item-grid-column")).toHaveValue("1");
  await expect(page.getByTestId("inspector-layout-item-grid-column-span")).toHaveValue("2");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("210");
});

test("canvas grid area boundary handle expands a named grid area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("280");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 120px");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("80px 80px");
  await page.getByTestId("inspector-layout-grid-areas").fill("hero:1/1/1/1");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-grid-area").fill("hero");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-layout-item-grid-area")).toHaveValue("hero");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-height")).toHaveValue("80");

  const bottomBoundaryHandle = page.getByTestId("grid-area-boundary-handle-bottom");
  await expect(bottomBoundaryHandle).toBeVisible();
  const handleBox = await bottomBoundaryHandle.boundingBox();
  if (!handleBox) {
    throw new Error("grid area bottom boundary handle did not expose a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 80);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-item-grid-area")).toHaveValue("hero");
  await expect(page.getByTestId("inspector-height")).toHaveValue("160");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("hero:1/1/1/2");
});

test("canvas grid empty cell context menu creates a named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("8");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("area1:2/1/1/1");
});

test("canvas grid multi-cell context menu creates a spanned named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-cell-hit-zone-1-1").click({ modifiers: ["ControlOrMeta"] });
  await page.getByTestId("grid-cell-hit-zone-3-2").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByTestId("grid-cell-selection-range")).toBeVisible();

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("area1:1/1/3/2");
});

test("canvas grid cell context menu splits an existing named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");
  await page.getByTestId("inspector-layout-grid-areas").fill("hero:1/1/3/2");
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("hero:1/1/3/2");

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "병합 영역 분리" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "병합 영역 분리" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("");
});

test("inspector grid named areas place children and reserve occupied cells", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("390");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("3");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await expect(page.getByTestId("inspector-layout-grid-areas")).toBeVisible();
  await page.getByTestId("inspector-layout-grid-areas").fill("hero:2/1/2/2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("15");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("15");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-layout-item-grid-area")).toBeVisible();
  await page.getByTestId("inspector-layout-item-grid-area").fill("hero");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("139");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("236");
  await expect(page.getByTestId("inspector-height")).toHaveValue("180");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("15");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector layout item fill sizing stretches a child inside fixed auto layout", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("100");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-margin-right").fill("6");
  await page.getByTestId("inspector-layout-item-margin-left").fill("6");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("158");
  await expect(page.getByTestId("inspector-x")).toHaveValue("30");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("190");
});

test("direct resize pins fill layout child axes to fixed sizing", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("100");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-margin-right").fill("6");
  await page.getByTestId("inspector-layout-item-margin-left").fill("6");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("158");

  const stageCanvasBox = await page.locator("canvas").first().boundingBox();
  if (!stageCanvasBox) {
    throw new Error("stage canvas was not visible");
  }
  const handlePoint = {
    x: stageCanvasBox.x + 450,
    y: stageCanvasBox.y + 258
  };

  await page.mouse.move(handlePoint.x, handlePoint.y);
  await page.mouse.down();
  await page.mouse.move(handlePoint.x + 32, handlePoint.y + 20);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fixed");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fixed");
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-width").inputValue()))
    .toBeGreaterThan(300);
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-height").inputValue()))
    .toBeGreaterThan(158);

  await page.keyboard.press("Control+Z");
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("158");

  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fixed");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fixed");
});

test("inspector layout min and max sizing clamps fit frames and fill children", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-width-sizing").selectOption("fit");
  await page.getByTestId("inspector-layout-height-sizing").selectOption("fit");
  await expect(page.getByTestId("inspector-layout-min-width")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-max-width")).toBeVisible();
  await page.getByTestId("inspector-layout-min-width").fill("220");
  await page.getByTestId("inspector-layout-max-width").fill("240");
  await page.getByTestId("inspector-layout-min-height").fill("160");
  await page.getByTestId("inspector-layout-max-height").fill("170");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");
  await expect(page.getByTestId("inspector-width")).toHaveValue("240");
  await expect(page.getByTestId("inspector-height")).toHaveValue("160");

  await page.getByTestId("inspector-layout-width-sizing").selectOption("fixed");
  await page.getByTestId("inspector-layout-height-sizing").selectOption("fixed");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-max-width")).toBeVisible();
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-max-width").fill("180");
  await page.getByTestId("inspector-layout-item-max-height").fill("110");
  await expect(page.getByTestId("inspector-width")).toHaveValue("180");
  await expect(page.getByTestId("inspector-height")).toHaveValue("110");
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector layout item margin offsets auto-layout children", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-margin-top").fill("10");
  await page.getByTestId("inspector-layout-item-margin-right").fill("8");
  await page.getByTestId("inspector-layout-item-margin-bottom").fill("14");
  await page.getByTestId("inspector-layout-item-margin-left").fill("6");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("26");
  await expect(page.getByTestId("inspector-y")).toHaveValue("30");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("104");
});

test("inspector layout item position keeps absolute children out of auto-layout flow", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-position").selectOption("absolute");
  await page.getByTestId("inspector-x").fill("140");
  await page.getByTestId("inspector-y").fill("160");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-position")).toHaveValue("absolute");
  await expect(page.getByTestId("inspector-x")).toHaveValue("140");
  await expect(page.getByTestId("inspector-y")).toHaveValue("160");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector auto layout wraps children into multiple rows", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("180");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-wrap").selectOption("wrap");
  await page.getByTestId("inspector-layout-align-content").selectOption("start");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("72");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("124");
});


test("inspector auto layout uses separate row and column gaps", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("200");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-wrap").selectOption("wrap");
  await page.getByTestId("inspector-layout-align-content").selectOption("start");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-row-gap").fill("24");
  await page.getByTestId("inspector-layout-column-gap").fill("6");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("70");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("70");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("70");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-row-gap")).toHaveValue("24");
  await expect(page.getByTestId("inspector-layout-column-gap")).toHaveValue("6");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("96");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("84");
});

test("inspector auto layout alignment controls center and distribute children", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("center");
  await page.getByTestId("inspector-layout-justify-content").selectOption("space_between");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("80");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("130");
  await expect(page.getByTestId("inspector-y")).toHaveValue("164");
});
