import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { rm, writeFile } from "node:fs/promises";
import { createZipArchive } from "../../server/src/file-archive";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const frameId = "33333333-3333-3333-3333-333333333333";
const strokeStackRectId = "12121212-1212-1212-1212-121212121212";
const expectedStrokeStackColor = "#800080";

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
  expect(projectId).not.toBe("sample-project");
}

function createPenpotSolidMultiStrokeExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Multi Stroke Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Multi Stroke Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Multi strokes", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Multi stroke frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          shapes: [strokeStackRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${strokeStackRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeStackRectId,
          name: "Layered stroke card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            { "stroke-color": "#ff0000", "stroke-opacity": 0.5, "stroke-width": 4 },
            { "stroke-color": "#0000ff", "stroke-opacity": 1, "stroke-width": 4 }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel imports a Penpot solid stroke stack as a flattened visible stroke", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("multi-strokes.penpot");
  await writeFile(penpotZipPath, createPenpotSolidMultiStrokeExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Multi Stroke Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Multi Stroke Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Multi Stroke Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Layered stroke card");

  const importedProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${importedProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  const fileResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${projectPayload.project.currentDocumentId}`
  );
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const frame = filePayload.file.pages[0].children[0];
  const strokeStack = frame.children[0];
  expect(strokeStack).toMatchObject({
    id: `penpot-${strokeStackRectId}`,
    kind: "rectangle",
    name: "Layered stroke card",
    style: { fill: "#ffffff", stroke: expectedStrokeStackColor, stroke_width: 4, opacity: 1 }
  });
});
