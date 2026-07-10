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
const pathData = "M4 20L16 4l12 16Z";
const evenOddPathData = "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z";

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
}

function createPenpotPathExportArchive(input: {
  sourceId: string;
  name: string;
  width: number;
  height: number;
  pathData: string;
  fill: string;
  fillRule?: "evenodd";
  stroke?: string;
  strokeWidth?: number;
  opacity: number;
}): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: input.fillRule ? "Penpot Even Odd Path Board" : "Penpot Path Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: fileId, name: input.fillRule ? "Penpot Even Odd Path Board" : "Penpot Path Board" }),
        "utf8"
      )
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
          width: 180,
          height: 140,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [input.sourceId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${input.sourceId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: input.sourceId,
          name: input.name,
          type: "path",
          x: 56,
          y: 80,
          width: input.width,
          height: input.height,
          opacity: input.opacity,
          content: input.pathData,
          ...(input.fillRule ? { "fill-rule": input.fillRule } : {}),
          fills: [{ fillColor: input.fill, fillOpacity: 1 }],
          ...(input.stroke
            ? { strokes: [{ strokeColor: input.stroke, strokeOpacity: 1, strokeWidth: input.strokeWidth ?? 1 }] }
            : {})
        }),
        "utf8"
      )
    }
  ]);
}

async function importArchive(page: Page, archivePath: string, expectedStatus: string) {
  await page.getByTestId("external-migration-upload").setInputFiles(archivePath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText(expectedStatus);

  const importedProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${importedProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  const fileResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${projectPayload.project.currentDocumentId}`
  );
  expect(fileResponse.ok()).toBeTruthy();
  return { file: (await fileResponse.json()).file, fileId: projectPayload.project.currentDocumentId };
}

test("file panel imports a Penpot path as a first-class path node", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const archivePath = testInfo.outputPath("path.penpot");
  await writeFile(
    archivePath,
    createPenpotPathExportArchive({
      sourceId: pathId,
      name: "Vector triangle",
      width: 32,
      height: 24,
      pathData,
      fill: "#14b8a6",
      stroke: "#0f172a",
      strokeWidth: 2,
      opacity: 0.8
    })
  );

  const imported = await importArchive(page, archivePath, "Penpot Path Board 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Vector triangle");
  const pathNode = imported.file.pages[0].children[0].children[0];

  expect(pathNode).toMatchObject({
    id: `penpot-${pathId}`,
    kind: "path",
    name: "Vector triangle",
    style: { fill: "#14b8a6", stroke: "#0f172a", stroke_width: 2, opacity: 0.8 },
    content: { type: "path", path_data: pathData, fill_rule: "nonzero" }
  });

  const legacyAsset = await page.request.get(
    `http://127.0.0.1:4317/assets/penpot-asset-${pathId}-path-svg`
  );
  expect(legacyAsset.status()).toBe(404);
});

test("file panel preserves even-odd winding on a first-class Penpot path", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const archivePath = testInfo.outputPath("evenodd-path.penpot");
  await writeFile(
    archivePath,
    createPenpotPathExportArchive({
      sourceId: evenOddPathId,
      name: "Compound even odd path",
      width: 100,
      height: 100,
      pathData: evenOddPathData,
      fill: "#0ea5e9",
      fillRule: "evenodd",
      opacity: 1
    })
  );

  const imported = await importArchive(page, archivePath, "Penpot Even Odd Path Board 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Compound even odd path");
  const pathNode = imported.file.pages[0].children[0].children[0];

  expect(pathNode).toMatchObject({
    id: `penpot-${evenOddPathId}`,
    kind: "path",
    name: "Compound even odd path",
    style: { fill: "#0ea5e9", stroke: null, stroke_width: 0, opacity: 1 },
    content: { type: "path", path_data: evenOddPathData, fill_rule: "evenodd" }
  });

  const inspectResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${imported.fileId}/agent/inspect`
  );
  expect(inspectResponse.ok()).toBeTruthy();
  const inspectPayload = await inspectResponse.json();
  expect(inspectPayload.inspection.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: `penpot-${evenOddPathId}`, kind: "path" })
    ])
  );
});
