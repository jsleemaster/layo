import { expect, test } from "@playwright/test";
import { rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

test("Inspector manages an ordered multi-stroke stack and persists it across reload", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");

  const projectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`);
  const project = (await projectResponse.json()).project;
  const documentId = project.currentDocumentId as string;
  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  const file = (await fileResponse.json()).file;
  const frame = file.pages[0].children.find((node: { id: string }) => node.id === "frame-1");

  const seeded = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [{
        type: "set_node_style",
        nodeId: "frame-1",
        style: {
          ...frame.style,
          strokes: [
            {
              id: "outer",
              color: "#ef4444",
              opacity: 0.5,
              width: 8,
              position: "outside",
              style: "dashed",
              visible: true,
              dasharray: [8, 4],
              cap: "round",
              join: "round",
              start_marker: "none",
              end_marker: "none"
            },
            {
              id: "inner",
              color: "#2563eb",
              opacity: 1,
              width: 2,
              position: "inside",
              style: "solid",
              visible: true,
              dasharray: [],
              cap: "butt",
              join: "miter",
              start_marker: "none",
              end_marker: "none"
            }
          ]
        }
      }]
    }
  });
  expect(seeded.ok()).toBeTruthy();

  await page.reload();
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();

  const stack = page.getByTestId("inspector-stroke-stack");
  await expect(stack.getByTestId("inspector-stroke-row-0")).toBeVisible();
  await expect(stack.getByTestId("inspector-stroke-row-1")).toBeVisible();
  await expect(stack.getByTestId("inspector-stroke-0-position")).toHaveValue("outside");
  await expect(stack.getByTestId("inspector-stroke-1-position")).toHaveValue("inside");

  await stack.getByRole("button", { name: "선을 아래로 이동" }).first().click();
  await expect(stack.getByTestId("inspector-stroke-0-position")).toHaveValue("inside");

  await stack.getByRole("button", { name: "선 복제" }).first().click();
  await expect(stack.locator('[data-testid^="inspector-stroke-row-"]')).toHaveCount(3);

  await stack.getByRole("button", { name: "선 숨기기" }).first().click();
  await expect(stack.getByRole("button", { name: "선 보이기" })).toHaveCount(1);

  await stack.getByRole("button", { name: "선 삭제" }).last().click();
  await expect(stack.locator('[data-testid^="inspector-stroke-row-"]')).toHaveCount(2);

  await stack.getByTestId("inspector-stroke-add").click();
  await expect(stack.locator('[data-testid^="inspector-stroke-row-"]')).toHaveCount(3);
  await stack.getByTestId("inspector-stroke-2-position").selectOption("center");
  await stack.getByTestId("inspector-stroke-2-opacity").fill("0.35");
  await stack.getByTestId("inspector-stroke-2-opacity").blur();

  await expect.poll(async () => {
    const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
    const latest = (await response.json()).file;
    return latest.pages[0].children.find((node: { id: string }) => node.id === "frame-1").style.strokes;
  }).toMatchObject([
    { position: "inside", visible: false },
    { position: "outside", visible: true },
    { position: "center", opacity: 0.35 }
  ]);

  await page.reload();
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();
  await expect(page.getByTestId("inspector-stroke-2-opacity")).toHaveValue("0.35");
});
