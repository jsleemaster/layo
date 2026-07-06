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
const pathId = "55555555-5555-5555-5555-555555555555";
const evenOddPathId = "66666666-6666-6666-6666-666666666666";
const expectedPathAssetId = `penpot-asset-${pathId}-path-svg`;
const expectedEvenOddPathAssetId = `penpot-asset-${evenOddPathId}-path-svg`;
const pathData = "M4 20L16 4l12 16Z";
const evenOddPathData = "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z";
const expectedPathSvgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24" viewBox="0 0 32 24"><path d="M4 20L16 4l12 16Z" fill="#14b8a6" stroke="#0f172a" stroke-width="2" opacity="0.8"/></svg>';
const expectedEvenOddPathSvgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z" fill="#0ea5e9" fill-rule="evenodd"/></svg>';
const expectedPathSvgBytes = Buffer.from(expectedPathSvgMarkup, "utf8");
const expectedEvenOddPathSvgBytes = Buffer.from(expectedEvenOddPathSvgMarkup, "utf8");

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

function createPenpotPathExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Path Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Path Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Path import", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Path frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 160,
          height: 96,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [pathId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${pathId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: pathId,
          name: "Vector triangle",
          type: "path",
          x: 56,
          y: 80,
          width: 32,
          height: 24,
          opacity: 0.8,
          content: pathData,
          fills: [{ fillColor: "#14b8a6", fillOpacity: 1 }],
          strokes: [{ strokeColor: "#0f172a", strokeOpacity: 1, strokeWidth: 2 }]
        }),
        "utf8"
      )
    }
  ]);
}

function createPenpotEvenOddPathExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Even Odd Path Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Even Odd Path Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Even odd path import", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Path frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 180,
          height: 132,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [evenOddPathId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${evenOddPathId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: evenOddPathId,
          name: "Compound even odd path",
          type: "path",
          x: 56,
          y: 80,
          width: 100,
          height: 100,
          content: evenOddPathData,
          "fill-rule": "evenodd",
          fills: [{ fillColor: "#0ea5e9", fillOpacity: 1 }]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel imports a Penpot path shape as a local SVG image asset", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("path.penpot");
  await writeFile(penpotZipPath, createPenpotPathExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Path Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Path Board 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Path frame");
  await expect(page.getByTestId("layer-panel")).toContainText("Vector triangle");

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
  expect(frame.children).toHaveLength(1);
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${pathId}`,
    kind: "image",
    name: "Vector triangle",
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.8 },
    content: {
      type: "image",
      asset_id: expectedPathAssetId,
      natural_width: 32,
      natural_height: 24,
      fit_mode: "fill"
    }
  });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedPathAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(await assetResponse.body()).toEqual(expectedPathSvgBytes);
});

test("file panel preserves Penpot even-odd path fill rule in imported SVG asset", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("evenodd-path.penpot");
  await writeFile(penpotZipPath, createPenpotEvenOddPathExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Even Odd Path Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Even Odd Path Board 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Path frame");
  await expect(page.getByTestId("layer-panel")).toContainText("Compound even odd path");

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
  expect(frame.children).toHaveLength(1);
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${evenOddPathId}`,
    kind: "image",
    name: "Compound even odd path",
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
    content: {
      type: "image",
      asset_id: expectedEvenOddPathAssetId,
      natural_width: 100,
      natural_height: 100,
      fit_mode: "fill"
    }
  });

  const inspectResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${projectPayload.project.currentDocumentId}/agent/inspect`
  );
  expect(inspectResponse.ok()).toBeTruthy();
  const inspectPayload = await inspectResponse.json();
  const inspectedPathNode = inspectPayload.inspection.nodes.find(
    (node: { id: string }) => node.id === `penpot-${evenOddPathId}`
  );
  expect(inspectedPathNode).toMatchObject({
    id: `penpot-${evenOddPathId}`,
    kind: "image",
    vectorSource: {
      origin: "penpot",
      shapeId: evenOddPathId,
      shapeType: "path",
      pathData: evenOddPathData,
      fillRule: "evenodd",
      bounds: { x: 56, y: 80, width: 100, height: 100 }
    }
  });

  const assetResponse = await page.request.get(`http://127.0.0.1:4317/assets/${expectedEvenOddPathAssetId}`);
  expect(assetResponse.ok()).toBeTruthy();
  expect(await assetResponse.body()).toEqual(expectedEvenOddPathSvgBytes);
});
