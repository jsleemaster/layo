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
const imageId = "44444444-4444-4444-4444-444444444444";
const fillRectId = "55555555-5555-5555-5555-555555555555";
const mediaId = "66666666-6666-6666-6666-666666666666";
const storageObjectId = "77777777-7777-7777-7777-777777777777";
const fillMediaId = "88888888-8888-8888-8888-888888888888";
const fillStorageObjectId = "99999999-9999-9999-9999-999999999999";
const frameBackgroundMediaId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const frameBackgroundStorageObjectId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const foregroundRectId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const multiFillRectId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const gradientFillRectId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const expectedMultiFillColor = "#800080";
const expectedGradientFillColor = "#800080";
const expectedAssetId = `penpot-asset-${mediaId}`;
const expectedFillAssetId = `penpot-asset-${fillMediaId}`;
const expectedFrameBackgroundAssetId = `penpot-asset-${frameBackgroundMediaId}`;
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

function createPenpotImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Image frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [imageId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${imageId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: imageId,
          name: "Hero image",
          type: "image",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          metadata: { id: mediaId, width: 1, height: 1, mtype: "image/png" }
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${mediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: mediaId,
          name: "hero.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: storageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${storageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: storageObjectId, size: pngImage.length, contentType: "image/png", bucket: "file-media" }),
        "utf8"
      )
    },
    {
      path: `objects/${storageObjectId}.png`,
      data: pngImage
    }
  ]);
}

function createPenpotFillImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Fill Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Fill Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Fill images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Fill image frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [fillRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${fillRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: fillRectId,
          name: "Hero fill",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            {
              "fill-color-gradient": {
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
              "fill-opacity": 0.4
            },
            {
              "fill-image": {
                id: fillMediaId,
                name: "hero-fill.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "fill-opacity": 0.75
            }
          ]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${fillMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: fillMediaId,
          name: "hero-fill.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: fillStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${fillStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: fillStorageObjectId, size: pngImage.length, contentType: "image/png", bucket: "file-media" }),
        "utf8"
      )
    },
    {
      path: `objects/${fillStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

function createPenpotFrameFillImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Frame Background Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Frame Background Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Frame backgrounds", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Hero frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [
            {
              "fill-image": {
                id: frameBackgroundMediaId,
                name: "frame-bg.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "fill-opacity": 1
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
          x: 80,
          y: 104,
          width: 80,
          height: 48,
          fills: [{ fillColor: "#10b981", fillOpacity: 1 }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${frameBackgroundMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameBackgroundMediaId,
          name: "frame-bg.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: frameBackgroundStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${frameBackgroundStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: frameBackgroundStorageObjectId, size: pngImage.length, contentType: "image/png", bucket: "file-media" }),
        "utf8"
      )
    },
    {
      path: `objects/${frameBackgroundStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

function createPenpotSolidMultiFillExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Multi Fill Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Multi Fill Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Multi fills", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Multi fill frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [multiFillRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${multiFillRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: multiFillRectId,
          name: "Layered fill card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            { "fill-color": "#ff0000", "fill-opacity": 0.5 },
            { "fill-color": "#0000ff", "fill-opacity": 1 }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel imports a Penpot ZIP image asset into local asset storage", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("images.penpot");
  await writeFile(penpotZipPath, createPenpotImageExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Image Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Image Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Image Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Hero image");

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
  const imageNode = frame.children[0];
  expect(imageNode).toMatchObject({
    id: `penpot-${imageId}`,
    kind: "image",
    name: "Hero image",
    content: {
      type: "image",
      asset_id: expectedAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(assetResponse.headers()["content-type"]).toBe("image/png");
  expect(await assetResponse.body()).toEqual(pngImage);
});

test("file panel imports a Penpot mixed fill-image stack into local asset storage", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("fill-images.penpot");
  await writeFile(penpotZipPath, createPenpotFillImageExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Fill Image Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Fill Image Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Fill Image Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Hero fill");

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
  const fillImageNode = frame.children[0];
  expect(fillImageNode).toMatchObject({
    id: `penpot-${fillRectId}`,
    kind: "image",
    name: "Hero fill",
    style: { opacity: 0.75 },
    content: {
      type: "image",
      asset_id: expectedFillAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedFillAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(assetResponse.headers()["content-type"]).toBe("image/png");
  expect(await assetResponse.body()).toEqual(pngImage);
});

test("file panel imports a Penpot frame fill-image background without dropping children", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("frame-backgrounds.penpot");
  await writeFile(penpotZipPath, createPenpotFrameFillImageExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Frame Background Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Frame Background Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Frame Background Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Hero frame background");
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
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Hero frame" });
  expect(frame.children).toHaveLength(2);
  const background = frame.children[0];
  expect(background).toMatchObject({
    id: `penpot-${frameId}-fill-image`,
    kind: "image",
    name: "Hero frame background",
    content: {
      type: "image",
      asset_id: expectedFrameBackgroundAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(frame.children[1]).toMatchObject({ id: `penpot-${foregroundRectId}`, kind: "rectangle", name: "Foreground card" });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedFrameBackgroundAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(assetResponse.headers()["content-type"]).toBe("image/png");
  expect(await assetResponse.body()).toEqual(pngImage);
});

test("file panel imports a Penpot solid fill stack as a flattened visible color", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("multi-fills.penpot");
  await writeFile(penpotZipPath, createPenpotSolidMultiFillExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Multi Fill Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Multi Fill Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Multi Fill Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Layered fill card");

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
  const layeredFill = frame.children[0];
  expect(layeredFill).toMatchObject({
    id: `penpot-${multiFillRectId}`,
    kind: "rectangle",
    name: "Layered fill card",
    style: { fill: expectedMultiFillColor, opacity: 1 }
  });
});

function createPenpotGradientFillExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Gradient Fill Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Gradient Fill Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Gradient fills", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Gradient fill frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [gradientFillRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${gradientFillRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: gradientFillRectId,
          name: "Gradient card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            {
              "fill-color-gradient": {
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
              "fill-opacity": 1
            }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel imports a Penpot gradient fill as a flattened visible color", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("gradient-fills.penpot");
  await writeFile(penpotZipPath, createPenpotGradientFillExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Gradient Fill Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Gradient Fill Board 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Gradient Fill Board");
  await expect(page.getByTestId("layer-panel")).toContainText("Gradient card");

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
  const gradientFill = frame.children[0];
  expect(gradientFill).toMatchObject({
    id: `penpot-${gradientFillRectId}`,
    kind: "rectangle",
    name: "Gradient card",
    style: { fill: expectedGradientFillColor, opacity: 1 }
  });
});
