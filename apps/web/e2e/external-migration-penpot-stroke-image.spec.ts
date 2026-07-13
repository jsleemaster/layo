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
const strokeImageRectId = "15151515-1515-1515-1515-151515151515";
const strokeImageMediaId = "16161616-1616-1616-1616-161616161616";
const strokeImageStorageObjectId = "17171717-1717-1717-1717-171717171717";
const expectedStrokeImageAssetId = `penpot-asset-${strokeImageMediaId}`;
const pngImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

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

function createPenpotStrokeImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Stroke Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Stroke Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Stroke images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Stroke image frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          shapes: [strokeImageRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${strokeImageRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeImageRectId,
          name: "Border texture card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            {
              "stroke-image": {
                id: strokeImageMediaId,
                name: "border-texture.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "stroke-opacity": 0.6,
              "stroke-width": 12,
              "stroke-alignment": "center"
            }
          ]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${strokeImageMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeImageMediaId,
          name: "border-texture.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: strokeImageStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${strokeImageStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeImageStorageObjectId,
          size: pngImage.length,
          contentType: "image/png",
          bucket: "file-media"
        }),
        "utf8"
      )
    },
    {
      path: `objects/${strokeImageStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

test("file panel imports a Penpot stroke-image record as a rectangle-owned paint", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("stroke-images.penpot");
  await writeFile(penpotZipPath, createPenpotStrokeImageExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Stroke Image Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Stroke Image Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Stroke Image Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Border texture card");

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
  const strokeImageNode = frame.children[0];
  expect(strokeImageNode).toMatchObject({
    id: `penpot-${strokeImageRectId}`,
    kind: "rectangle",
    name: "Border texture card",
    style: {
      fill: "#ffffff",
      stroke: null,
      stroke_width: 0,
      opacity: 1,
      strokes: [{
        paint: { type: "image", asset_id: expectedStrokeImageAssetId },
        opacity: 0.6,
        width: 12,
        position: "center"
      }]
    },
    content: { type: "empty" }
  });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedStrokeImageAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(await assetResponse.body()).toEqual(pngImage);
});
