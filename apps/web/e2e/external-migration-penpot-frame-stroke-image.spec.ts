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
const foregroundRectId = "24242424-2424-2424-2424-242424242424";
const frameStrokeImageMediaId = "25252525-2525-2525-2525-252525252525";
const frameStrokeImageStorageObjectId = "26262626-2626-2626-2626-262626262626";
const expectedFrameStrokeImageAssetId = `penpot-asset-${frameStrokeImageMediaId}`;
const expectedFrameStrokeImageNodeId = `penpot-${frameId}-stroke-image`;
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

function createPenpotFrameStrokeImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Frame Stroke Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Frame Stroke Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Frame stroke images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Frame stroke image board",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            {
              "stroke-image": {
                id: frameStrokeImageMediaId,
                name: "frame-border-texture.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "stroke-opacity": 0.55,
              "stroke-width": 14,
              "stroke-alignment": "outer"
            }
          ],
          shapes: [foregroundRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${foregroundRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: foregroundRectId,
          name: "Foreground card",
          type: "rect",
          x: 72,
          y: 96,
          width: 88,
          height: 56,
          fills: [{ "fill-color": "#dbeafe", "fill-opacity": 1 }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${frameStrokeImageMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameStrokeImageMediaId,
          name: "frame-border-texture.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: frameStrokeImageStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${frameStrokeImageStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameStrokeImageStorageObjectId,
          size: pngImage.length,
          contentType: "image/png",
          bucket: "file-media"
        }),
        "utf8"
      )
    },
    {
      path: `objects/${frameStrokeImageStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

test("file panel imports a Penpot frame stroke-image record as a packaged background image asset", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("frame-stroke-images.penpot");
  await writeFile(penpotZipPath, createPenpotFrameStrokeImageExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Frame Stroke Image Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Frame Stroke Image Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Frame Stroke Image Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Frame stroke image board");
  await expect(page.getByTestId("layer-panel")).toContainText("Frame stroke image board stroke image");
  await expect(page.getByTestId("layer-panel")).toContainText("Foreground card");

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
  const foregroundNode = frame.children[1];
  expect(strokeImageNode).toMatchObject({
    id: expectedFrameStrokeImageNodeId,
    kind: "image",
    name: "Frame stroke image board stroke image",
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.55 },
    content: {
      type: "image",
      asset_id: expectedFrameStrokeImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(foregroundNode).toMatchObject({
    id: `penpot-${foregroundRectId}`,
    kind: "rectangle",
    name: "Foreground card",
    style: { fill: "#dbeafe", stroke: null, stroke_width: 0, opacity: 1 }
  });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedFrameStrokeImageAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(await assetResponse.body()).toEqual(pngImage);
});
