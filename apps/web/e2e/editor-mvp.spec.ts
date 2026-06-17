import { expect, test } from "@playwright/test";
import { rm } from "node:fs/promises";

test("canvas editor MVP supports Korean-first select, inspect, edit, undo, create, and zoom", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");

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

  await page.mouse.move(stageBox.x + 400, stageBox.y + 160);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 470, stageBox.y + 220);
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

  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("캔버스 MCP 에디터");

  await page.getByRole("button", { name: "다시 실행" }).click();
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
    "http://127.0.0.1:4317/files/sample-file/agent/commands",
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

  await page.screenshot({ path: "/tmp/canvas-mcp-editor-mvp-verified.png", fullPage: true });
});

test("web editor fills the available work area with a white canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:5173/");
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
  await page.goto("http://127.0.0.1:5173/");

  await expect(page.getByRole("heading", { name: "캔버스 MCP 에디터" })).toBeVisible();
  await page.getByRole("button", { name: "왼쪽 사이드바 접기" }).click();
  await expect(page.getByRole("heading", { name: "캔버스 MCP 에디터" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "헤드라인" })).toHaveCount(0);
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  await page.getByRole("button", { name: "왼쪽 사이드바 펼치기" }).click();
  await expect(page.getByRole("heading", { name: "캔버스 MCP 에디터" })).toBeVisible();
  await expect(page.getByRole("button", { name: "헤드라인" })).toBeVisible();
});

test("component toolbar actions use component-style icons instead of letter labels", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  await expect(page.getByRole("button", { name: "컴포넌트 만들기" })).not.toHaveText("C");
  await expect(page.getByRole("button", { name: "인스턴스 만들기" })).not.toHaveText("I");
  await expect(page.getByRole("button", { name: "인스턴스 분리" })).not.toHaveText("D");
});

test("Figma-like canvas input routing nudges layers, pans canvas, and zooms with modifiers", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");
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

  await expect(page.getByTestId("inspector-text")).toHaveValue("캔버스 MCP 에디터");
  await page.getByTestId("inspector-text").fill("키보드 단축키 검증");
  await expect(page.getByTestId("inspector-text")).toHaveValue("키보드 단축키 검증");

  await page.mouse.click(stageBox.x + 40, stageBox.y + 40);
  await page.keyboard.press("Control+Z");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("캔버스 MCP 에디터");

  await page.mouse.click(stageBox.x + 40, stageBox.y + 40);
  await page.keyboard.press("Control+Shift+Z");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("키보드 단축키 검증");

  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();
});

test("Figma-like edit shortcuts duplicate and delete selected layers", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+D");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
  await expect(page.getByTestId("inspector-text")).toHaveValue("캔버스 MCP 에디터");

  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toHaveCount(0);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.keyboard.press("Control+Z");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
});

test("Figma-like multi-selection supports Shift-click and area selection", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");

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

test("component instances drag as a single selected object from nested content", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");
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

test("unselected component instances move on the first drag gesture", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");
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
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});

test("inspector auto layout stacks children inside a selected frame", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");
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
