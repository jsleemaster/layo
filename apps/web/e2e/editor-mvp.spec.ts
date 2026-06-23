import { expect, test, type Page } from "@playwright/test";
import { rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

async function openEmptyEditor(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await expect(page.getByTestId("project-status")).toContainText("저장된 프로젝트 없음");
}

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

async function createImageDataTransfer(page: Page, name: string) {
  return page.evaluateHandle(async (fileName) => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 12;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas context missing");
    }
    context.fillStyle = "#2563eb";
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
  }, name);
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
  await expect(page.getByTestId("project-switcher")).toHaveValue(alphaProjectId);
  await expect(page.getByTestId("project-switcher").locator("option").first()).toHaveText("검색 알파");
});

test("duplicates and deletes a saved project from the project panel", async ({ page }) => {
  await rm(".layo/projects", { recursive: true, force: true });
  await rm(".layo/files", { recursive: true, force: true });
  await rm("apps/server/.layo/projects", { recursive: true, force: true });
  await rm("apps/server/.layo/files", { recursive: true, force: true });

  await page.goto("http://127.0.0.1:5173/");
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
  await expect(page.getByText("125%")).toBeVisible();

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
  await expect(page.getByRole("button", { name: agentName })).toBeVisible();
  await page.getByRole("button", { name: agentName }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue(agentValue);

  await page.screenshot({ path: "/tmp/layo-mvp-verified.png", fullPage: true });
});

test("web editor fills the available work area with a white canvas", async ({ page }) => {
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
  expect(metrics.canvasBackground).toBe("rgb(255, 255, 255)");
  expect(metrics.stageBackground).toBe("rgb(255, 255, 255)");
  expect(metrics.stageWidth).toBe(metrics.canvasClientWidth);
  expect(metrics.stageHeight).toBe(metrics.canvasClientHeight);
});

test("left sidebar can collapse from the top toolbar", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await expect(page.getByRole("heading", { name: "Layo" })).toBeVisible();
  await page.getByRole("button", { name: "왼쪽 사이드바 접기" }).click();
  await expect(page.getByRole("heading", { name: "Layo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "헤드라인" })).toHaveCount(0);
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  await page.getByRole("button", { name: "왼쪽 사이드바 펼치기" }).click();
  await expect(page.getByRole("heading", { name: "Layo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "헤드라인" })).toBeVisible();
});

test("component toolbar actions use component-style icons instead of letter labels", async ({ page }) => {
  await openEmptyEditor(page);

  await expect(page.getByRole("button", { name: "컴포넌트 만들기" })).not.toHaveText("C");
  await expect(page.getByRole("button", { name: "인스턴스 만들기" })).not.toHaveText("I");
  await expect(page.getByRole("button", { name: "인스턴스 분리" })).not.toHaveText("D");
});

test("Figma-like canvas input routing nudges layers, pans canvas, and zooms with modifiers", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 360, stageBox.y + 260);
  await page.mouse.wheel(0, -300);
  await expect(page.getByText("100%")).toBeVisible();

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect(page.getByText("125%")).toBeVisible();

  await page.keyboard.press("Control+=");
  await expect(page.getByText("150%")).toBeVisible();
  await page.keyboard.press("Control+-");
  await expect(page.getByText("125%")).toBeVisible();
  await page.keyboard.press("Control+0");
  await expect(page.getByText("100%")).toBeVisible();

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
  await expect(page.getByText("400%")).toBeVisible();

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
