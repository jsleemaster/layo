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
const strokeGradientRectId = "f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0";
const radialGradientRectId = "a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0";
const radialGradientWidthRectId = "b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0";
const radialStrokeGradientRectId = "c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0";
const expectedStrokeGradientColor = "#800080";

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

function createPenpotStrokeGradientExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Stroke Gradient Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Stroke Gradient Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Stroke gradients", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Stroke gradient frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [strokeGradientRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${strokeGradientRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeGradientRectId,
          name: "Gradient stroke card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          strokes: [
            {
              "stroke-color-gradient": {
                type: "linear",
                "start-x": 0,
                "start-y": 0,
                "end-x": 1,
                "end-y": 0,
                width: 1,
                stops: [
                  { color: "#ff0000", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "stroke-opacity": 1,
              "stroke-width": 4
            }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

function createPenpotRadialGradientExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Radial Gradient Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Radial Gradient Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Radial gradients", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Radial gradient frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [radialGradientRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${radialGradientRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: radialGradientRectId,
          name: "Radial fill card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            {
              "fill-color-gradient": {
                type: "radial",
                "start-x": 0.5,
                "start-y": 0.5,
                "end-x": 1,
                "end-y": 0.5,
                width: 1,
                stops: [
                  { color: "#ff0000", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "fill-opacity": 1
            }
          ],
          strokes: []
        }),
        "utf8"
      )
    }
  ]);
}

function createPenpotRadialWidthGradientExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Radial Width Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Radial Width Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Radial width gradients", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Radial width frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [radialGradientWidthRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${radialGradientWidthRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: radialGradientWidthRectId,
          name: "Radial width fill card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            {
              "fill-color-gradient": {
                type: "radial",
                "start-x": 0.5,
                "start-y": 0.5,
                "end-x": 1,
                "end-y": 0.5,
                width: 0.5,
                stops: [
                  { color: "#ff0000", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "fill-opacity": 1
            }
          ],
          strokes: []
        }),
        "utf8"
      )
    }
  ]);
}

function createPenpotRadialStrokeGradientExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Radial Stroke Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Radial Stroke Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Radial stroke gradients", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Radial stroke frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [radialStrokeGradientRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${radialStrokeGradientRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: radialStrokeGradientRectId,
          name: "Radial stroke card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 24,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          strokes: [
            {
              "stroke-color-gradient": {
                type: "radial",
                "start-x": 0.5,
                "start-y": 0.5,
                "end-x": 1,
                "end-y": 0.5,
                width: 1,
                stops: [
                  { color: "#ff0000", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "stroke-opacity": 1,
              "stroke-width": 24
            }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel imports a Penpot stroke gradient as a flattened visible stroke", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("stroke-gradients.penpot");
  await writeFile(penpotZipPath, createPenpotStrokeGradientExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Stroke Gradient Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Stroke Gradient Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Stroke Gradient Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Gradient stroke card");

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
  const strokeGradient = frame.children[0];
  expect(strokeGradient).toMatchObject({
    id: `penpot-${strokeGradientRectId}`,
    kind: "rectangle",
    name: "Gradient stroke card",
    style: { fill: "#ffffff", stroke: expectedStrokeGradientColor, stroke_width: 4, opacity: 1 }
  });
});


test("dev panel PNG raster artifact preserves the imported Penpot stroke gradient", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("stroke-gradient-raster.penpot");
  await writeFile(penpotZipPath, createPenpotStrokeGradientExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  await expect(page.getByTestId("external-migration-review")).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("layer-panel")).toContainText("Gradient stroke card");

  await page.getByTestId("layer-panel").getByRole("button", { name: "Gradient stroke card" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`penpot-${strokeGradientRectId}.png`);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("gradient raster png download path missing");
  }
  const png = await readFile(downloadPath);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const leftStroke = await imagePixel(page, png, "image/png", 6, Math.floor(height / 2));
  const rightStroke = await imagePixel(page, png, "image/png", width - 7, Math.floor(height / 2));

  expect(leftStroke.r).toBeGreaterThan(leftStroke.b + 40);
  expect(rightStroke.b).toBeGreaterThan(rightStroke.r + 40);
  expect(leftStroke.a).toBeGreaterThan(200);
  expect(rightStroke.a).toBeGreaterThan(200);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("Gradient stroke card PNG 다운로드됨");
});


test("dev panel PNG raster artifact preserves the imported Penpot radial fill gradient", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("radial-gradient-raster.penpot");
  await writeFile(penpotZipPath, createPenpotRadialGradientExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  await expect(page.getByTestId("external-migration-review")).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("layer-panel")).toContainText("Radial fill card");

  await page.getByTestId("layer-panel").getByRole("button", { name: "Radial fill card" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`penpot-${radialGradientRectId}.png`);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("radial gradient raster png download path missing");
  }

  const png = await readFile(downloadPath);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const centerFill = await imagePixel(page, png, "image/png", Math.floor(width / 2), Math.floor(height / 2));
  const rightFill = await imagePixel(page, png, "image/png", width - 8, Math.floor(height / 2));

  expect(centerFill.r).toBeGreaterThan(centerFill.b + 40);
  expect(rightFill.b).toBeGreaterThan(rightFill.r + 40);
  expect(centerFill.a).toBeGreaterThan(200);
  expect(rightFill.a).toBeGreaterThan(200);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("Radial fill card PNG 다운로드됨");
});

test("dev panel PNG raster artifact preserves the imported Penpot radial width geometry", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("radial-width-gradient-raster.penpot");
  await writeFile(penpotZipPath, createPenpotRadialWidthGradientExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  await expect(page.getByTestId("external-migration-review")).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("layer-panel")).toContainText("Radial width fill card");

  await page.getByTestId("layer-panel").getByRole("button", { name: "Radial width fill card" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`penpot-${radialGradientWidthRectId}.png`);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("radial width gradient raster png download path missing");
  }

  const png = await readFile(downloadPath);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const centerFill = await imagePixel(page, png, "image/png", Math.floor(width / 2), Math.floor(height / 2));
  const rightFill = await imagePixel(page, png, "image/png", width - 8, Math.floor(height / 2));
  const verticalProbe = await imagePixel(
    page,
    png,
    "image/png",
    Math.floor(width / 2),
    Math.max(4, Math.floor(height / 2) - 52)
  );

  expect(centerFill.r).toBeGreaterThan(centerFill.b + 40);
  expect(rightFill.b).toBeGreaterThan(rightFill.r + 40);
  expect(verticalProbe.b).toBeGreaterThan(verticalProbe.r + 40);
  expect(centerFill.a).toBeGreaterThan(200);
  expect(rightFill.a).toBeGreaterThan(200);
  expect(verticalProbe.a).toBeGreaterThan(200);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("Radial width fill card PNG 다운로드됨");
});

test("dev panel PNG raster artifact preserves the imported Penpot radial stroke gradient", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("radial-stroke-gradient-raster.penpot");
  await writeFile(penpotZipPath, createPenpotRadialStrokeGradientExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  await expect(page.getByTestId("external-migration-review")).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("layer-panel")).toContainText("Radial stroke card");

  await page.getByTestId("layer-panel").getByRole("button", { name: "Radial stroke card" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`penpot-${radialStrokeGradientRectId}.png`);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("radial stroke gradient raster png download path missing");
  }

  const png = await readFile(downloadPath);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const centerStroke = await imagePixel(page, png, "image/png", Math.floor(width / 2), Math.floor(height / 2));
  const rightStroke = await imagePixel(page, png, "image/png", width - 20, Math.floor(height / 2));

  expect(centerStroke.r).toBeGreaterThan(centerStroke.b + 40);
  expect(rightStroke.b).toBeGreaterThan(rightStroke.r + 40);
  expect(centerStroke.a).toBeGreaterThan(200);
  expect(rightStroke.a).toBeGreaterThan(200);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("Radial stroke card PNG 다운로드됨");
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
