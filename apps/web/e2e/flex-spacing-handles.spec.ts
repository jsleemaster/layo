import { expect, test, type Page } from "@playwright/test";
import { rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

async function openFilePanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
}

async function openEmptyEditor(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await expect(page.getByTestId("project-status")).toContainText("저장된 프로젝트 없음");
}

async function createProjectFromEmptyState(page: Page) {
  await openEmptyEditor(page);
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const projectId = await page.getByTestId("project-switcher").inputValue();
  expect(projectId).not.toBe("");
}

async function dragCenterBy(page: Page, testId: string, deltaX: number, deltaY: number, modifiers: string[] = []) {
  const target = page.getByTestId(testId).first();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error(`${testId} did not expose a bounding box`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
  }
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
  await page.mouse.up();
  for (const modifier of modifiers.reverse()) {
    await page.keyboard.up(modifier);
  }
}

test("canvas frame spacing handles drag padding into the Inspector layout values", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("24");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("24");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await expect(page.getByTestId("frame-spacing-overlay")).toBeVisible();
  await expect(page.getByTestId("frame-padding-left")).toContainText("24");

  await dragCenterBy(page, "frame-padding-left", 18, 0);
  await expect(page.getByTestId("inspector-layout-padding-left")).toHaveValue("42");
  await expect(page.getByTestId("inspector-layout-padding-right")).toHaveValue("24");
});

test("canvas frame spacing handles support Shift and Alt padding modifiers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await dragCenterBy(page, "frame-padding-left", 12, 0, ["Shift"]);
  await expect(page.getByTestId("inspector-layout-padding-left")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-padding-right")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-padding-top")).toHaveValue("20");
  await expect(page.getByTestId("inspector-layout-padding-bottom")).toHaveValue("20");

  await dragCenterBy(page, "frame-padding-top", 0, 8, ["Alt"]);
  await expect(page.getByTestId("inspector-layout-padding-top")).toHaveValue("28");
  await expect(page.getByTestId("inspector-layout-padding-right")).toHaveValue("40");
  await expect(page.getByTestId("inspector-layout-padding-bottom")).toHaveValue("28");
  await expect(page.getByTestId("inspector-layout-padding-left")).toHaveValue("40");
});

test("canvas frame spacing handles drag vertical gap into the Inspector layout values", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-gap").fill("12");

  await expect(page.getByTestId("frame-spacing-overlay")).toBeVisible();
  await expect(page.getByTestId("frame-spacing-vertical").first()).toContainText("12");

  await dragCenterBy(page, "frame-spacing-vertical", 0, 10);
  await expect(page.getByTestId("inspector-layout-gap")).toHaveValue("22");
  await expect(page.getByTestId("inspector-layout-row-gap")).toHaveValue("22");
});
