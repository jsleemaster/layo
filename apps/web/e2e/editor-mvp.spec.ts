import { expect, test } from "@playwright/test";
import { rm } from "node:fs/promises";

test("canvas editor MVP supports select, inspect, edit, undo, create, and zoom", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");

  await page.getByRole("button", { name: "Headline" }).click();
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
  await page.getByTestId("inspector-text").fill("Verified MVP headline");

  await expect(page.getByTestId("inspector-x")).toHaveValue("96");
  await expect(page.getByTestId("inspector-y")).toHaveValue("112");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("60");
  await expect(page.getByTestId("inspector-text")).toHaveValue("Verified MVP headline");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Canvas MCP Editor");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Verified MVP headline");

  await page.getByRole("button", { name: "Create rectangle" }).click();
  await expect(page.getByRole("button", { name: "Rectangle 3" })).toBeVisible();

  await page.getByRole("button", { name: "Landing Frame" }).click();
  await page.getByRole("button", { name: "Create component" }).click();
  await expect(page.getByRole("button", { name: /Landing Frame .* Component/ })).toBeVisible();

  await page.getByRole("button", { name: "Create instance" }).click();
  await expect(page.getByRole("button", { name: /Landing Frame Component Instance .* Instance/ })).toBeVisible();
  await expect(page.getByText("component_instance")).toBeVisible();

  await page.getByRole("button", { name: "Detach instance" }).click();
  await expect(page.getByText("frame", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("125%")).toBeVisible();

  const agentId = `agent-note-${Date.now()}`;
  const agentName = `Agent Note ${Date.now()}`;
  const agentValue = "Verified agent-created text";
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

test("web editor keeps laptop viewport overflow inside the canvas area", async ({ page }) => {
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
      canvasScrollWidth: canvas.scrollWidth,
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      stageHeight: Math.round(stage.getBoundingClientRect().height)
    };
  });

  expect(metrics.pageScrollXAfterAttempt).toBe(0);
  expect(metrics.documentScrollWidth).toBe(metrics.viewportWidth);
  expect(metrics.canvasScrollWidth).toBeGreaterThan(metrics.canvasClientWidth);
  expect(metrics.stageWidth).toBe(960);
  expect(metrics.stageHeight).toBe(640);
});

test("component instances drag as a single selected object from nested content", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Landing Frame" }).click();
  await page.getByRole("button", { name: "Create component" }).click();
  await page.getByRole("button", { name: "Create instance" }).click();
  await expect(page.getByText("component_instance")).toBeVisible();
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

  await expect(page.getByText("component_instance")).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});

test("unselected component instances move on the first drag gesture", async ({ page }) => {
  await rm(".canvas-mcp-editor/files/sample-file.json", { force: true });
  await rm("apps/server/.canvas-mcp-editor/files/sample-file.json", { force: true });

  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Landing Frame" }).click();
  await page.getByRole("button", { name: "Create component" }).click();
  await page.getByRole("button", { name: "Create instance" }).click();
  await expect(page.getByText("component_instance")).toBeVisible();

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.click(stageBox.x + 60, stageBox.y + 580);
  await expect(page.getByText("Select a layer or canvas node.")).toBeVisible();

  await page.mouse.move(stageBox.x + 590, stageBox.y + 140);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 650, stageBox.y + 170);
  await page.mouse.up();

  await expect(page.getByText("component_instance")).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});
