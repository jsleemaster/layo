import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { rm, writeFile } from "node:fs/promises";
import { createZipArchive } from "../../server/src/file-archive";
import {
  createPenpotComponentLibrarySwapArchive,
  penpotLibrarySwapIds
} from "./fixtures/penpot-component-library-swap";

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

function createPenpotComponentArchive(): Buffer {
  const fileId = "81111111-1111-1111-1111-111111111111";
  const pageId = "82222222-2222-2222-2222-222222222222";
  const componentId = "83333333-3333-3333-3333-333333333333";
  const mainId = "84444444-4444-4444-4444-444444444444";
  const mainLabelId = "85555555-5555-5555-5555-555555555555";
  const copyId = "86666666-6666-6666-6666-666666666666";
  const copyLabelId = "87777777-7777-7777-7777-777777777777";
  const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  return createZipArchive([
    {
      path: "manifest.json",
      data: json({
        type: "penpot/export-files",
        version: 1,
        files: [{ id: fileId, name: "Penpot Components", features: ["components/v2"] }]
      })
    },
    { path: `files/${fileId}.json`, data: json({ id: fileId, name: "Penpot Components" }) },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: json({ id: pageId, name: "Components", objects: {} })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${mainId}.json`,
      data: json({
        id: mainId,
        name: "Button",
        type: "frame",
        x: 80,
        y: 96,
        width: 180,
        height: 56,
        "main-instance": true,
        "component-root": true,
        "component-id": componentId,
        fills: [{ fillColor: "#2563eb", fillOpacity: 1 }],
        shapes: [mainLabelId]
      })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${mainLabelId}.json`,
      data: json({
        id: mainLabelId,
        name: "Main label",
        type: "text",
        x: 112,
        y: 112,
        width: 116,
        height: 24,
        content: "Submit",
        fills: [{ fillColor: "#ffffff", fillOpacity: 1 }]
      })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${copyId}.json`,
      data: json({
        id: copyId,
        name: "Button copy",
        type: "frame",
        x: 320,
        y: 96,
        width: 180,
        height: 56,
        "component-root": true,
        "component-id": componentId,
        "shape-ref": mainId,
        fills: [{ fillColor: "#2563eb", fillOpacity: 1 }],
        shapes: [copyLabelId]
      })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${copyLabelId}.json`,
      data: json({
        id: copyLabelId,
        name: "Copy label",
        type: "text",
        x: 352,
        y: 112,
        width: 116,
        height: 24,
        "shape-ref": mainLabelId,
        touched: ["text-content-group"],
        content: "Continue",
        fills: [{ fillColor: "#ffffff", fillOpacity: 1 }]
      })
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

test("imports Penpot component ownership and renders the linked copy", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("components.penpot");
  await writeFile(penpotZipPath, createPenpotComponentArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  await expect(page.getByTestId("external-migration-review")).toContainText("가져오기 가능");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Penpot Components 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Button");
  await expect(page.getByTestId("layer-panel")).toContainText("Button copy");

  await page.getByRole("button", { name: "Button copy" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("320");
  await expect(page.getByTestId("inspector-width")).toHaveValue("180");

  const importedProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${importedProjectId}`);
  const projectPayload = await projectResponse.json();
  const fileResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${projectPayload.project.currentDocumentId}`
  );
  const file = (await fileResponse.json()).file;
  expect(file.components).toEqual([
    expect.objectContaining({
      id: "penpot-component-83333333-3333-3333-3333-333333333333",
      source_node: expect.objectContaining({ kind: "component" })
    })
  ]);
  const copy = file.pages[0].children.find(
    (node: { id: string }) => node.id === "penpot-86666666-6666-6666-6666-666666666666"
  );
  expect(copy).toMatchObject({
    kind: "component_instance",
    component_instance: {
      definition_id: "penpot-component-83333333-3333-3333-3333-333333333333",
      variant_id: "default",
      detached: false,
      overrides: [
        {
          node_id: "penpot-85555555-5555-5555-5555-555555555555",
          field: "text",
          value: "Continue"
        }
      ]
    }
  });
  expect(copy.children[0]).toMatchObject({
    id: "penpot-86666666-6666-6666-6666-666666666666__penpot-85555555-5555-5555-5555-555555555555",
    content: { type: "text", value: "Continue" }
  });
});


test("imports a packaged Penpot library swap and preserves it after reload", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const penpotZipPath = testInfo.outputPath("component-library-swap.penpot");
  await writeFile(penpotZipPath, createPenpotComponentLibrarySwapArchive());

  await page.getByTestId("external-migration-upload").setInputFiles(penpotZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("가져오기 가능");
  await expect(review).toContainText("문서 후보 4개");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();

  await expect(page.getByTestId("external-migration-status")).toContainText("Product file 가져옴");
  await expect(page.getByTestId("layer-panel")).toContainText("Card");
  await expect(page.getByTestId("layer-panel")).toContainText("Card copy");
  await page.getByRole("button", { name: "Card copy" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("400");

  const importedProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${importedProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()).project;
  expect(project.documents.map((document: { name: string }) => document.name)).toEqual([
    "Product file",
    "Shape library"
  ]);

  const fileResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${project.currentDocumentId}`
  );
  const file = (await fileResponse.json()).file;
  const copy = file.pages[0].children.find(
    (node: { id: string }) => node.id === `penpot-${penpotLibrarySwapIds.outerCopyId}`
  );
  expect(copy.children[0]).toMatchObject({
    kind: "component_instance",
    component_instance: {
      definition_id: `penpot-component-${penpotLibrarySwapIds.circleComponentId}`,
      variant_id: "default",
      overrides: [],
      detached: false
    }
  });
  expect(copy.component_instance.overrides).toContainEqual({
    node_id: `penpot-${penpotLibrarySwapIds.outerMainSlotId}`,
    field: "component_swap",
    value: `penpot-component-${penpotLibrarySwapIds.circleComponentId}`
  });

  const libraryId = `penpot-library-${penpotLibrarySwapIds.libraryFileId}`;
  let updateRequestCount = 0;
  await page.route(
    `**/files/${project.currentDocumentId}/import/library/registry/update`,
    async (route) => {
      updateRequestCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "update must not run" })
      });
    }
  );
  await page.route(
    `**/files/${project.currentDocumentId}/import/library/registry/update/review`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          review: {
            canUpdate: false,
            blockedBy: ["library_component_deletion_in_use"],
            deletedComponents: [
              {
                sourceComponentId: `penpot-component-${penpotLibrarySwapIds.circleComponentId}`,
                targetComponentId: `penpot-component-${penpotLibrarySwapIds.circleComponentId}`,
                affectedInstanceIds: [
                  `penpot-${penpotLibrarySwapIds.outerCopyId}`,
                  `penpot-${penpotLibrarySwapIds.outerCopyId}__penpot-${penpotLibrarySwapIds.outerMainSlotId}`
                ]
              }
            ]
          }
        })
      });
    }
  );
  await page.route(
    `**/files/${project.currentDocumentId}/libraries/updates`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updates: [
            {
              fileId: project.currentDocumentId,
              libraryId,
              libraryName: "Shape library",
              sourceFileId: libraryId,
              sourceName: "Shape library",
              componentCount: 1,
              tokenCount: 0,
              assetCount: 0,
              importedRegistryUpdatedAt: "2026-07-13T00:00:00.000Z",
              registryUpdatedAt: "2026-07-13T00:01:00.000Z"
            }
          ]
        })
      });
    }
  );

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("project-switcher").selectOption(importedProjectId);
  await expect(page.getByTestId("project-switcher")).toHaveValue(importedProjectId);
  await expect(page.getByTestId("layer-panel")).toContainText("Card copy");
  await page.getByRole("button", { name: "Card copy" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("400");

  await page.getByTestId(`library-registry-update-${libraryId}`).click();
  await expect(page.getByTestId("library-registry-status")).toContainText(
    "업데이트 차단 · 사용 중 컴포넌트 삭제 1개 · 영향 인스턴스 2개"
  );
  expect(updateRequestCount).toBe(0);
});
