import { expect, test, type Page } from "@playwright/test";
import { resetE2eStorage } from "./test-storage";

test.beforeEach(async () => {
  await resetE2eStorage();
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

test("fill auto-layout child height recalculates when parent height changes", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("220");
  await page.getByTestId("inspector-height").fill("260");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("100");
  await page.getByTestId("inspector-height").fill("80");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByRole("button", { name: "사각형 3" }).click();
  await page.getByTestId("inspector-width").fill("100");
  await page.getByTestId("inspector-height").fill("80");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-height")).toHaveValue("130");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("160");
  await expect(page.getByTestId("inspector-height")).toHaveValue("80");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-height").fill("320");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-height")).toHaveValue("190");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("220");
  await expect(page.getByTestId("inspector-height")).toHaveValue("80");
});
