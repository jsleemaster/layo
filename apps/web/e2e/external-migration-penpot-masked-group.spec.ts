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
const groupId = "33333333-3333-3333-3333-333333333333";
const rectId = "44444444-4444-4444-4444-444444444444";

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

function createPenpotMaskedGroupExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Masked Group Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Masked Group Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Masked group import", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${groupId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: groupId,
          name: "Masked artwork",
          type: "group",
          maskedGroup: true,
          "masked-group": true,
          x: 40,
          y: 64,
          width: 160,
          height: 96,
          shapes: [rectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${rectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: rectId,
          name: "Oversized masked content card",
          type: "rect",
          x: 56,
          y: 80,
          width: 220,
          height: 140,
          opacity: 0.9,
          fills: [{ fillColor: "#38bdf8", fillOpacity: 0.7 }],
          strokes: [{ strokeColor: "#0f172a", strokeOpacity: 1, strokeWidth: 2 }]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel imports a Penpot masked group as a clipped Layo group container", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("masked-group.penpot");
  await writeFile(penpotZipPath, createPenpotMaskedGroupExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");

  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Masked Group Board 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Masked Group Board 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Masked artwork");
  await expect(page.getByTestId("layer-panel")).toContainText("Oversized masked content card");

  const importedProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${importedProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  const fileResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${projectPayload.project.currentDocumentId}`
  );
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const group = filePayload.file.pages[0].children[0];
  expect(group).toMatchObject({
    id: `penpot-${groupId}`,
    kind: "group",
    name: "Masked artwork",
    clip: { type: "bounds" },
    transform: { x: 40, y: 64, rotation: 0 },
    size: { width: 160, height: 96 }
  });
  expect(group.children).toHaveLength(1);
  expect(group.children[0]).toMatchObject({
    id: `penpot-${rectId}`,
    kind: "rectangle",
    name: "Oversized masked content card",
    transform: { x: 16, y: 16, rotation: 0 },
    size: { width: 220, height: 140 },
    style: { fill: "#38bdf8", stroke: "#0f172a", stroke_width: 2, opacity: 0.9 }
  });
});
