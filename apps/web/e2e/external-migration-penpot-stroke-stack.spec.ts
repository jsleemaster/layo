import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createZipArchive } from "../../server/src/file-archive";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const frameId = "33333333-3333-3333-3333-333333333333";
const strokeStackRectId = "12121212-1212-1212-1212-121212121212";
const differentWidthStrokeRectId = "13131313-1313-1313-1313-131313131313";
const mixedGradientStrokeRectId = "14141414-1414-1414-1414-141414141414";
const expectedStrokeStackColor = "#800080";
const expectedDifferentWidthStrokeWidth = 8;
const expectedMixedGradientStrokeColor = "#804040";
const expectedMixedGradientStrokeWidth = 6;

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
          width: 440,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          shapes: [strokeStackRectId, differentWidthStrokeRectId, mixedGradientStrokeRectId]
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
    },
    {
      path: `files/${fileId}/pages/${pageId}/${differentWidthStrokeRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: differentWidthStrokeRectId,
          name: "Wide layered stroke card",
          type: "rect",
          x: 184,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            { "stroke-color": "#ff0000", "stroke-opacity": 0.5, "stroke-width": 2 },
            { "stroke-color": "#0000ff", "stroke-opacity": 1, "stroke-width": expectedDifferentWidthStrokeWidth }
          ]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${mixedGradientStrokeRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: mixedGradientStrokeRectId,
          name: "Mixed gradient stroke card",
          type: "rect",
          x: 304,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            { "stroke-color": "#ff0000", "stroke-opacity": 0.5, "stroke-width": expectedMixedGradientStrokeWidth },
            {
              "stroke-color-gradient": {
                stops: [
                  { color: "#00ff00", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "stroke-opacity": 1,
              "stroke-width": expectedMixedGradientStrokeWidth
            }
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
  await expect(page.getByTestId("layer-panel")).toContainText("Wide layered stroke card");
  await expect(page.getByTestId("layer-panel")).toContainText("Mixed gradient stroke card");

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
  const differentWidthStrokeStack = frame.children[1];
  expect(differentWidthStrokeStack).toMatchObject({
    id: `penpot-${differentWidthStrokeRectId}`,
    kind: "rectangle",
    name: "Wide layered stroke card",
    style: {
      fill: "#ffffff",
      stroke: expectedStrokeStackColor,
      stroke_width: expectedDifferentWidthStrokeWidth,
      opacity: 1
    }
  });
  const mixedGradientStrokeStack = frame.children[2];
  expect(mixedGradientStrokeStack).toMatchObject({
    id: `penpot-${mixedGradientStrokeRectId}`,
    kind: "rectangle",
    name: "Mixed gradient stroke card",
    style: {
      fill: "#ffffff",
      stroke: expectedMixedGradientStrokeColor,
      stroke_width: expectedMixedGradientStrokeWidth,
      opacity: 1
    }
  });
});

test("dev panel PNG raster artifact keeps mixed Penpot stroke stacks on the flattened fallback", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("mixed-stroke-stack-raster.penpot");
  await writeFile(penpotZipPath, createPenpotSolidMultiStrokeExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  await expect(page.getByTestId("external-migration-review")).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("layer-panel")).toContainText("Mixed gradient stroke card");

  await page.getByTestId("layer-panel").getByRole("button", { name: "Mixed gradient stroke card" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`penpot-${mixedGradientStrokeRectId}.png`);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("mixed stroke stack raster png download path missing");
  }
  const png = await readFile(downloadPath);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const leftStroke = await imagePixel(page, png, "image/png", 8, Math.floor(height / 2));
  const rightStroke = await imagePixel(page, png, "image/png", width - 9, Math.floor(height / 2));

  expect(Math.abs(leftStroke.r - rightStroke.r)).toBeLessThan(12);
  expect(Math.abs(leftStroke.g - rightStroke.g)).toBeLessThan(12);
  expect(Math.abs(leftStroke.b - rightStroke.b)).toBeLessThan(12);
  expect(leftStroke.r).toBeGreaterThan(leftStroke.b + 40);
  expect(rightStroke.b).not.toBeGreaterThan(rightStroke.r + 40);
  expect(leftStroke.a).toBeGreaterThan(200);
  expect(rightStroke.a).toBeGreaterThan(200);
});

async function imagePixel(page: Page, image: Buffer, mimeType: "image/png", x: number, y: number) {
  return page.evaluate(
    async ({ base64, mime, sampleX, sampleY }) =>
      new Promise<{ r: number; g: number; b: number; a: number; width: number; height: number }>((resolve, reject) => {
        const element = new Image();
        element.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = element.naturalWidth;
          canvas.height = element.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("pixel canvas context missing"));
            return;
          }
          context.drawImage(element, 0, 0);
          const [r, g, b, a] = context.getImageData(sampleX, sampleY, 1, 1).data;
          resolve({ r, g, b, a, width: canvas.width, height: canvas.height });
        };
        element.onerror = () => reject(new Error(`Could not decode ${mime}`));
        element.src = `data:${mime};base64,${base64}`;
      }),
    { base64: image.toString("base64"), mime: mimeType, sampleX: x, sampleY: y }
  );
}
