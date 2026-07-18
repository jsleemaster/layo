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
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  return {
    projectId,
    documentId: projectPayload.project.currentDocumentId as string
  };
}

test("inspector layout item z-index persists into dev handoff", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-z-index")).toBeVisible();
  await page.getByTestId("inspector-layout-item-z-index").fill("7");
  await expect(page.getByTestId("inspector-layout-item-z-index")).toHaveValue("7");

  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-css")).toContainText("z-index: 7;");
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"z_index": 7');
});
