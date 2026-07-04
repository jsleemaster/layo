import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { rm, writeFile } from "node:fs/promises";
import { createZipArchive } from "../../server/src/file-archive";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

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

function createBasicPenpotExportArchive(): Buffer {
  const fileId = "11111111-1111-1111-1111-111111111111";
  const pageId = "22222222-2222-2222-2222-222222222222";
  const frameId = "33333333-3333-3333-3333-333333333333";
  const rectId = "44444444-4444-4444-4444-444444444444";
  const textId = "55555555-5555-5555-5555-555555555555";
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Landing", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Landing" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Landing", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Hero frame",
          type: "frame",
          x: 80,
          y: 96,
          width: 320,
          height: 180,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [rectId, textId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${rectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: rectId,
          name: "CTA background",
          type: "rect",
          x: 104,
          y: 122,
          width: 180,
          height: 56,
          fills: [{ fillColor: "#1a334d", fillOpacity: 1 }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${textId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: textId,
          name: "Headline",
          type: "text",
          x: 124,
          y: 144,
          width: 220,
          height: 32,
          content: "Imported from Penpot",
          fontSize: 18,
          fontFamily: "Inter",
          fills: [{ fillColor: "#111827", fillOpacity: 1 }]
        }),
        "utf8"
      )
    }
  ]);
}

test("file panel reviews and imports an external Penpot ZIP file", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("landing.penpot");
  await writeFile(penpotZipPath, createBasicPenpotExportArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Penpot");
  await expect(review).toContainText("가져오기 가능");
  await expect(review).toContainText("문서 후보 2개");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Landing 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Penpot Landing 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Penpot Landing");
  await expect(page.getByTestId("layer-panel")).toContainText("Headline");
  await expect(page.getByTestId("layer-panel")).toContainText("CTA background");

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
  expect(frame).toMatchObject({ name: "Hero frame", kind: "frame" });
  expect(frame.children.map((node: { name: string }) => node.name)).toEqual(["CTA background", "Headline"]);
});
