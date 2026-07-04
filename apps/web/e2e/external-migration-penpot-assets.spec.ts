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
const mediaId = "66666666-6666-6666-6666-666666666666";
const storageObjectId = "77777777-7777-7777-7777-777777777777";
const expectedAssetId = `penpot-asset-${mediaId}`;
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
