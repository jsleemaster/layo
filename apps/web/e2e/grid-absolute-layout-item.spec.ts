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

async function dragSelectedLayerBy(page: Page, deltaX: number, deltaY: number) {
  const topLeft = page.getByTestId("resize-handle-top-left");
  const bottomRight = page.getByTestId("resize-handle-bottom-right");
  await expect(topLeft).toBeVisible();
  await expect(bottomRight).toBeVisible();
  const topLeftBox = await topLeft.boundingBox();
  const bottomRightBox = await bottomRight.boundingBox();
  if (!topLeftBox || !bottomRightBox) {
    throw new Error("selected layer handles did not expose bounding boxes");
  }
  const startX = (topLeftBox.x + topLeftBox.width / 2 + bottomRightBox.x + bottomRightBox.width / 2) / 2;
  const startY = (topLeftBox.y + topLeftBox.height / 2 + bottomRightBox.y + bottomRightBox.height / 2) / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 5 });
  await page.mouse.up();
}

test("absolute grid child stays out of flow after direct canvas drag", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
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
  await page.getByTestId("inspector-layout-item-position").selectOption("absolute");
  await page.getByTestId("inspector-x").fill("90");
  await page.getByTestId("inspector-y").fill("70");
  await expect(page.getByTestId("inspector-layout-item-position")).toHaveValue("absolute");
  await expect(page.getByTestId("inspector-x")).toHaveValue("90");
  await expect(page.getByTestId("inspector-y")).toHaveValue("70");

  await dragSelectedLayerBy(page, 32, 24);
  await expect(page.getByTestId("inspector-layout-item-position")).toHaveValue("absolute");
  await expect(page.getByTestId("inspector-x")).toHaveValue("122");
  await expect(page.getByTestId("inspector-y")).toHaveValue("94");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-position")).toHaveValue("absolute");
  await expect(page.getByTestId("inspector-x")).toHaveValue("122");
  await expect(page.getByTestId("inspector-y")).toHaveValue("94");
});
