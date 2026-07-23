import { mkdtemp, readFile as readRawFile, rm, writeFile as writeRawFile } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { inspectCanvas, validateDocument } from "./agent-control";
import { exportDesignToCode } from "./code-export";
import { createZipArchive } from "./file-archive";
import { createHttpServer } from "./http";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";
import { FileStorage } from "./storage";

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const componentId = "33333333-3333-3333-3333-333333333333";
const mainId = "44444444-4444-4444-4444-444444444444";
const mainLabelId = "55555555-5555-5555-5555-555555555555";
const copyId = "66666666-6666-6666-6666-666666666666";
const copyLabelId = "77777777-7777-7777-7777-777777777777";

function componentArchive(options: { copyShapeRef?: string; copyLabelShapeRef?: string } = {}) {
  const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  return createZipArchive([
    {
      path: "manifest.json",
      data: json({
        type: "penpot/export-files",
        version: 1,
        generatedBy: "penpot/component-contract",
        files: [{ id: fileId, name: "Component migration", features: ["components/v2"] }]
      })
    },
    {
      path: `files/${fileId}.json`,
      data: json({ id: fileId, name: "Component migration" })
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: json({ id: pageId, name: "Components", index: 0, objects: {} })
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
        "component-file": fileId,
        fills: [{ fillColor: "#2563eb", fillOpacity: 1 }],
        shapes: [mainLabelId]
      })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${mainLabelId}.json`,
      data: json({
        id: mainLabelId,
        name: "Label",
        type: "text",
        x: 112,
        y: 112,
        width: 116,
        height: 24,
        content: "Submit",
        fontSize: 16,
        fontFamily: "Inter",
        opacity: 1,
        fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
        strokes: [{ strokeColor: "#111827", strokeWidth: 1 }]
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
        "component-file": fileId,
        "shape-ref": options.copyShapeRef ?? mainId,
        fills: [{ fillColor: "#2563eb", fillOpacity: 1 }],
        shapes: [copyLabelId]
      })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${copyLabelId}.json`,
      data: json({
        id: copyLabelId,
        name: "Label",
        type: "text",
        x: 360,
        y: 118,
        width: 126,
        height: 28,
        "shape-ref": options.copyLabelShapeRef ?? mainLabelId,
        touched: ["text-content-group", "fill-group", "stroke-group", "opacity-group", "geometry-group"],
        content: "Continue",
        fontSize: 16,
        fontFamily: "Inter",
        opacity: 0.6,
        fills: [{ fillColor: "#f97316", fillOpacity: 0.8 }],
        strokes: [{ strokeColor: "#22c55e", strokeWidth: 2 }]
      })
    }
  ]);
}

const variantContainerId = "88888888-8888-8888-8888-888888888888";
const smallComponentId = "99999999-9999-9999-9999-999999999991";
const largeComponentId = "99999999-9999-9999-9999-999999999992";
const smallMainId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const largeMainId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
const variantCopyId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function variantArchive() {
  const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  const shape = (
    id: string,
    name: string,
    x: number,
    width: number,
    component: string,
    variantName: string,
    extra: Record<string, unknown> = {}
  ) => ({
    id,
    name,
    type: "frame",
    x,
    y: 96,
    width,
    height: 56,
    "component-root": true,
    "component-id": component,
    "component-file": fileId,
    "variant-id": variantContainerId,
    "variant-name": variantName,
    fills: [{ fillColor: "#2563eb", fillOpacity: 1 }],
    ...extra
  });
  return createZipArchive([
    {
      path: "manifest.json",
      data: json({
        type: "penpot/export-files",
        version: 1,
        files: [{ id: fileId, name: "Variant migration", features: ["components/v2"] }]
      })
    },
    { path: `files/${fileId}.json`, data: json({ id: fileId, name: "Variant migration" }) },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: json({ id: pageId, name: "Variants", index: 0, objects: {} })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${variantContainerId}.json`,
      data: json({
        id: variantContainerId,
        name: "Button",
        type: "frame",
        x: 48,
        y: 48,
        width: 520,
        height: 152,
        "is-variant-container": true,
        shapes: [smallMainId, largeMainId]
      })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${smallMainId}.json`,
      data: json(shape(
        smallMainId,
        "Button / Small / Default",
        80,
        140,
        smallComponentId,
        "Size=Small, State=Default",
        { "main-instance": true }
      ))
    },
    {
      path: `files/${fileId}/pages/${pageId}/${largeMainId}.json`,
      data: json(shape(
        largeMainId,
        "Button / Large / Default",
        280,
        220,
        largeComponentId,
        "Size=Large, State=Default",
        { "main-instance": true }
      ))
    },
    {
      path: `files/${fileId}/pages/${pageId}/${variantCopyId}.json`,
      data: json(shape(
        variantCopyId,
        "Button large copy",
        640,
        220,
        largeComponentId,
        "Size=Large, State=Default",
        { "shape-ref": largeMainId }
      ))
    }
  ]);
}

const libraryFileId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const libraryPageId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const rectangleComponentId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1";
const circleComponentId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2";
const rectangleMainId = "ffffffff-ffff-ffff-ffff-fffffffffff1";
const circleMainId = "ffffffff-ffff-ffff-ffff-fffffffffff2";
const outerComponentId = "12121212-1212-1212-1212-121212121212";
const outerMainId = "13131313-1313-1313-1313-131313131313";
const outerMainSlotId = "14141414-1414-1414-1414-141414141414";
const outerCopyId = "15151515-1515-1515-1515-151515151515";
const outerCopySlotId = "16161616-1616-1616-1616-161616161616";
const libraryMediaId = "17171717-1717-1717-1717-171717171717";
const libraryStorageObjectId = "18181818-1818-1818-1818-181818181818";

function packagedLibrarySwapArchive(options: { includeLibrary?: boolean } = {}) {
  const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  const shape = (
    id: string,
    name: string,
    type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    extra: Record<string, unknown> = {}
  ) => ({ id, name, type, x, y, width, height, ...extra });

  const entries = [
    {
      path: "manifest.json",
      data: json({
        type: "penpot/export-files",
        version: 1,
        generatedBy: "penpot/packaged-library-swap-contract",
        files: options.includeLibrary === false
          ? [{ id: fileId, name: "Product file", features: ["components/v2"] }]
          : [
              { id: fileId, name: "Product file", features: ["components/v2"] },
              { id: libraryFileId, name: "Shape library", features: ["components/v2"] }
            ]
      })
    },
    { path: `files/${fileId}.json`, data: json({ id: fileId, name: "Product file" }) },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: json({ id: pageId, name: "Product", index: 0, objects: {} })
    },
    {
      path: `files/${fileId}/pages/${pageId}/${outerMainId}.json`,
      data: json(shape(outerMainId, "Card", "frame", 80, 80, 240, 160, {
        "main-instance": true,
        "component-root": true,
        "component-id": outerComponentId,
        "component-file": fileId,
        shapes: [outerMainSlotId]
      }))
    },
    {
      path: `files/${fileId}/pages/${pageId}/${outerMainSlotId}.json`,
      data: json(shape(outerMainSlotId, "Shape slot", "frame", 112, 112, 64, 64, {
        "component-id": rectangleComponentId,
        "component-file": libraryFileId,
        "shape-ref": rectangleMainId
      }))
    },
    {
      path: `files/${fileId}/pages/${pageId}/${outerCopyId}.json`,
      data: json(shape(outerCopyId, "Card copy", "frame", 400, 80, 240, 160, {
        "component-root": true,
        "component-id": outerComponentId,
        "component-file": fileId,
        "shape-ref": outerMainId,
        shapes: [outerCopySlotId]
      }))
    },
    {
      path: `files/${fileId}/pages/${pageId}/${outerCopySlotId}.json`,
      data: json(shape(outerCopySlotId, "Shape slot", "frame", 432, 112, 64, 64, {
        "component-id": circleComponentId,
        "component-file": libraryFileId,
        "shape-ref": circleMainId,
        touched: [`swap-slot-${outerMainSlotId}`]
      }))
    },
    { path: `files/${libraryFileId}.json`, data: json({ id: libraryFileId, name: "Shape library" }) },
    {
      path: `files/${libraryFileId}/pages/${libraryPageId}.json`,
      data: json({ id: libraryPageId, name: "Shapes", index: 0, objects: {} })
    },
    {
      path: `files/${libraryFileId}/pages/${libraryPageId}/${rectangleMainId}.json`,
      data: json(shape(rectangleMainId, "Rectangle", "frame", 80, 80, 64, 64, {
        "main-instance": true,
        "component-root": true,
        "component-id": rectangleComponentId,
        "component-file": libraryFileId,
        fills: [{ fillColor: "#2563eb", fillOpacity: 1 }]
      }))
    },
    {
      path: `files/${libraryFileId}/pages/${libraryPageId}/${circleMainId}.json`,
      data: json(shape(circleMainId, "Circle", "frame", 200, 80, 64, 64, {
        "main-instance": true,
        "component-root": true,
        "component-id": circleComponentId,
        "component-file": libraryFileId,
        fills: [
          { fillColor: "#f97316", fillOpacity: 1 },
          { "fill-image": { id: libraryMediaId }, "fill-opacity": 1 }
        ]
      }))
    },
    {
      path: `files/${libraryFileId}/media/${libraryMediaId}.json`,
      data: json({
        id: libraryMediaId,
        "media-id": libraryStorageObjectId,
        mtype: "image/svg+xml",
        name: "circle-pattern.svg",
        width: 64,
        height: 64
      })
    },
    {
      path: `objects/${libraryStorageObjectId}.svg`,
      data: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="24" fill="#f97316"/></svg>',
        "utf8"
      )
    }
  ];
  return createZipArchive(
    options.includeLibrary === false
      ? entries.filter((entry) => !entry.path.startsWith(`files/${libraryFileId}`))
      : entries
  );
}

describe("Penpot component instance migration", () => {

  test("reviews a packaged cross-file component library and nested swap as importable", () => {
    const review = reviewExternalMigrationArchive(packagedLibrarySwapArchive(), {
      fileName: "packaged-library-swap.penpot"
    });

    expect(review).toMatchObject({
      source: "penpot",
      canImport: true,
      blockedBy: []
    });
    expect(review.documentCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Product file" }),
        expect.objectContaining({ name: "Shape library" })
      ])
    );
  });

  test("maps packaged library definitions and a nested swap into native instances", () => {
    const imported = importExternalMigrationArchive(packagedLibrarySwapArchive(), {
      fileName: "packaged-library-swap.penpot",
      fileId: "packaged-library-swap-import"
    });

    expect(imported.file.pages).toHaveLength(1);
    expect(imported.file.pages[0].name).toBe("Product");
    expect(
      (imported as {
        importedLibraries?: Array<{ sourceFileId: string; file: { name: string; pages: unknown[]; components?: Array<{ id: string }> } }>;
      }).importedLibraries
    ).toEqual([
      {
        sourceFileId: libraryFileId,
        file: expect.objectContaining({
          name: "Shape library",
          pages: [expect.objectContaining({ name: "Shapes" })],
          components: [
            expect.objectContaining({ id: `penpot-component-${rectangleComponentId}` }),
            expect.objectContaining({ id: `penpot-component-${circleComponentId}` })
          ]
        })
      }
    ]);
    expect(imported.file.components?.map((component) => component.id)).toEqual([
      `penpot-component-${outerComponentId}`,
      `penpot-component-${rectangleComponentId}`,
      `penpot-component-${circleComponentId}`
    ]);
    expect(imported.importedAssets).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          assetId: `penpot-asset-${libraryMediaId}`,
          name: "circle-pattern.svg",
          mimeType: "image/svg+xml"
        })
      })
    ]);
    expect(
      JSON.stringify(
        imported.file.components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )
      )
    ).toContain(`penpot-asset-${libraryMediaId}`);

    const main = imported.file.pages[0].children.find(
      (node) => node.id === `penpot-${outerMainId}`
    );
    const copy = imported.file.pages[0].children.find(
      (node) => node.id === `penpot-${outerCopyId}`
    );

    expect(main?.children[0]).toMatchObject({
      kind: "component_instance",
      component_instance: {
        definition_id: `penpot-component-${rectangleComponentId}`,
        variant_id: "default",
        overrides: [],
        detached: false
      }
    });
    expect(copy?.children[0]).toMatchObject({
      kind: "component_instance",
      component_instance: {
        definition_id: `penpot-component-${circleComponentId}`,
        variant_id: "default",
        overrides: [],
        detached: false
      }
    });
    expect(copy?.component_instance?.overrides).toEqual(
      expect.arrayContaining([
        {
          node_id: `penpot-${outerMainSlotId}`,
          field: "component_swap",
          value: `penpot-component-${circleComponentId}`
        }
      ])
    );

    const inspection = inspectCanvas(imported.file);
    expect(inspection.validation).toMatchObject({ ok: true, issueCount: 0 });
    expect(inspection.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `penpot-${outerCopyId}__penpot-${outerMainSlotId}`,
          componentDefinitionId: `penpot-component-${circleComponentId}`
        })
      ])
    );
    expect(validateDocument(imported.file)).toMatchObject({ ok: true, issueCount: 0 });

    const handoff = exportDesignToCode(imported.file);
    const exportedCopy = handoff.elements.find(
      (element) => element.id === `penpot-${outerCopyId}`
    );
    expect(exportedCopy?.structure.componentRef).toEqual(
      expect.objectContaining({
        definitionId: `penpot-component-${outerComponentId}`,
        overrides: expect.arrayContaining([
          {
            nodeId: `penpot-${outerMainSlotId}`,
            field: "component_swap",
            value: `penpot-component-${circleComponentId}`
          }
        ])
      })
    );
    expect(exportedCopy?.structure.children[0]?.componentRef).toEqual(
      expect.objectContaining({
        definitionId: `penpot-component-${circleComponentId}`
      })
    );
  });

  test("rejects a conflicting global asset before external migration can replace it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-asset-conflict-"));
    try {
      const storage = new FileStorage(root);
      const assetId = `penpot-asset-${libraryMediaId}`;
      const existingData = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2563eb"/></svg>',
        "utf8"
      );
      const internals = storage as unknown as {
        writeAsset(
          metadata: {
            assetId: string;
            name: string;
            mimeType: string;
            byteLength: number;
            url: string;
          },
          data: Buffer
        ): Promise<unknown>;
      };
      await internals.writeAsset(
        {
          assetId,
          name: "existing-blue.svg",
          mimeType: "image/svg+xml",
          byteLength: existingData.length,
          url: `/assets/${assetId}`
        },
        existingData
      );

      await expect(
        storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
          projectId: "asset-conflict-project",
          documentId: "asset-conflict-document",
          fileName: "packaged-library-swap.penpot"
        })
      ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });

      await expect(storage.readProject("asset-conflict-project")).rejects.toMatchObject({
        code: "ENOENT"
      });
      await expect(storage.readFile("asset-conflict-document")).rejects.toMatchObject({
        code: "ENOENT"
      });
      const retainedAsset = await storage.readAsset(assetId);
      expect(retainedAsset.name).toBe("existing-blue.svg");
      expect(retainedAsset.data.equals(existingData)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rolls back external migration when library publication is rejected", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-publication-conflict-"));
    try {
      const storage = new FileStorage(root);
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      await storage.createProject({
        projectId: "registry-owner-project",
        name: "기존 팀 라이브러리",
        documentId: "registry-owner-file",
        documentName: "기존 라이브러리 문서"
      });
      await storage.setProjectSharing("registry-owner-project", {
        mode: "team",
        teamId: "team-existing"
      });
      await storage.publishLibraryToRegistry("registry-owner-file", {
        libraryId: libraryDocumentId,
        name: "기존 팀 라이브러리"
      });
      const registryBefore = await storage.listLibraryRegistry("registry-owner-file");

      await expect(
        storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
          projectId: "publication-conflict-project",
          documentId: "publication-conflict-document",
          fileName: "packaged-library-swap.penpot"
        })
      ).rejects.toMatchObject({ code: "EACCES", statusCode: 403 });

      await expect(storage.readProject("publication-conflict-project")).rejects.toMatchObject({
        code: "ENOENT"
      });
      await expect(storage.readFile("publication-conflict-document")).rejects.toMatchObject({
        code: "ENOENT"
      });
      await expect(storage.readFile(libraryDocumentId)).rejects.toMatchObject({
        code: "ENOENT"
      });
      await expect(
        storage.readAsset(`penpot-asset-${libraryMediaId}`)
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(await storage.listLibraryRegistry("registry-owner-file")).toEqual(
        registryBefore
      );
      expect(await storage.listLibraryRegistrySubscriptions()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists packaged libraries as registry-owned project documents and subscriptions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-"));
    try {
      const storage = new FileStorage(root);
      const imported = await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-library-project",
        documentId: "penpot-product-document",
        name: "Penpot library project",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;

      expect(imported.project.documents).toEqual([
        expect.objectContaining({ documentId: "penpot-product-document", name: "Product file" }),
        expect.objectContaining({ documentId: libraryDocumentId, name: "Shape library" })
      ]);
      await expect(storage.readFile(libraryDocumentId)).resolves.toMatchObject({
        id: libraryDocumentId,
        name: "Shape library",
        components: [
          expect.objectContaining({ id: `penpot-component-${rectangleComponentId}` }),
          expect.objectContaining({ id: `penpot-component-${circleComponentId}` })
        ]
      });
      expect(await storage.listLibraryRegistry("penpot-product-document")).toEqual([
        expect.objectContaining({
          libraryId: libraryDocumentId,
          sourceFileId: libraryDocumentId,
          name: "Shape library",
          componentCount: 2
        })
      ]);
      await expect(storage.exportLibraryArchive(libraryDocumentId)).resolves.toMatchObject({
        componentCount: 2,
        assetCount: 1
      });

      const updatedLibrary = await storage.readFile(libraryDocumentId);
      const updatedCircle = updatedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      expect(updatedCircle).toBeDefined();
      updatedCircle!.source_node.style.fill = "#0f766e";
      await storage.writeFile(libraryDocumentId, updatedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });
      await expect(
        storage.updateLibraryRegistryItem("penpot-product-document", libraryDocumentId)
      ).resolves.toMatchObject({ componentCount: 2, assetCount: 1 });

      const updatedTarget = await storage.readFile("penpot-product-document");
      expect(
        updatedTarget.components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#0f766e");
      expect(
        updatedTarget.pages[0].children.find(
          (node) => node.id === `penpot-${outerCopyId}`
        )?.component_instance?.overrides
      ).toContainEqual({
        node_id: `penpot-${outerMainSlotId}`,
        field: "component_swap",
        value: `penpot-component-${circleComponentId}`
      });

      expect(await storage.listLibraryRegistrySubscriptions("penpot-product-document")).toEqual([
        expect.objectContaining({
          fileId: "penpot-product-document",
          libraryId: libraryDocumentId,
          sourceFileId: libraryDocumentId,
          assetCount: 1,
          componentIdMap: {
            [`penpot-component-${rectangleComponentId}`]: `penpot-component-${rectangleComponentId}`,
            [`penpot-component-${circleComponentId}`]: `penpot-component-${circleComponentId}`
          }
        })
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks deletion of a library component used by an imported nested swap before writes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-delete-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-delete-project",
        documentId: "penpot-delete-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const library = await storage.readFile(libraryDocumentId);
      library.components = library.components?.filter(
        (component) => component.id !== `penpot-component-${circleComponentId}`
      );
      await storage.writeFile(libraryDocumentId, library);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const beforeTarget = await storage.readFile("penpot-delete-target");
      const beforeSubscriptions = await storage.listLibraryRegistrySubscriptions(
        "penpot-delete-target"
      );
      await expect(
        storage.reviewLibraryRegistryItemUpdate(
          "penpot-delete-target",
          libraryDocumentId
        )
      ).resolves.toEqual({
        canUpdate: false,
        blockedBy: ["library_component_deletion_in_use"],
        deletedComponents: [
          {
            sourceComponentId: `penpot-component-${circleComponentId}`,
            targetComponentId: `penpot-component-${circleComponentId}`,
            affectedInstanceIds: [
              `penpot-${outerCopyId}`,
              `penpot-${outerCopyId}__penpot-${outerMainSlotId}`
            ]
          }
        ],
        conflictedComponents: []
      });

      const server = createHttpServer(storage, { webDistDir: null });
      try {
        const reviewResponse = await server.inject({
          method: "POST",
          url: "/files/penpot-delete-target/import/library/registry/update/review",
          payload: { libraryId: libraryDocumentId }
        });
        expect(reviewResponse.statusCode).toBe(200);
        expect(reviewResponse.json().review).toMatchObject({
          canUpdate: false,
          blockedBy: ["library_component_deletion_in_use"]
        });

        const updateResponse = await server.inject({
          method: "POST",
          url: "/files/penpot-delete-target/import/library/registry/update",
          payload: { libraryId: libraryDocumentId }
        });
        expect(updateResponse.statusCode).toBe(400);
        expect(updateResponse.json()).toEqual({
          error: expect.stringMatching(/component deletion.*in use/i)
        });
      } finally {
        await server.close();
      }

      await expect(
        storage.updateLibraryRegistryItem("penpot-delete-target", libraryDocumentId)
      ).rejects.toThrow(/component deletion.*in use/i);
      expect(await storage.readFile("penpot-delete-target")).toEqual(beforeTarget);
      expect(
        await storage.listLibraryRegistrySubscriptions("penpot-delete-target")
      ).toEqual(beforeSubscriptions);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks a same-id replacement that removes a locally overridden source node", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-override-conflict-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-override-project",
        documentId: "penpot-override-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const target = await storage.readFile("penpot-override-target");
      const copy = target.pages[0].children.find(
        (node) => node.id === `penpot-${outerCopyId}`
      );
      const nestedCircle = copy?.children[0];
      expect(nestedCircle?.component_instance?.definition_id).toBe(
        `penpot-component-${circleComponentId}`
      );
      nestedCircle!.component_instance!.overrides = [
        {
          node_id: `penpot-${circleMainId}`,
          field: "fill",
          value: "#0f766e"
        }
      ];
      const swapOnlyCircle = structuredClone(nestedCircle!);
      swapOnlyCircle.id = "penpot-swap-only-circle";
      swapOnlyCircle.component_instance!.overrides = [
        {
          node_id: `penpot-${circleMainId}`,
          field: "component_swap",
          value: `penpot-component-${rectangleComponentId}`
        }
      ];
      target.pages[0].children.push(swapOnlyCircle);
      await storage.writeFile("penpot-override-target", target);

      const library = await storage.readFile(libraryDocumentId);
      const circle = library.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      expect(circle).toBeDefined();
      circle!.source_node.id = "replacement-circle-root";
      await storage.writeFile(libraryDocumentId, library);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const beforeTarget = await storage.readFile("penpot-override-target");
      const beforeSubscriptions = await storage.listLibraryRegistrySubscriptions(
        "penpot-override-target"
      );
      await expect(
        storage.reviewLibraryRegistryItemUpdate(
          "penpot-override-target",
          libraryDocumentId
        )
      ).resolves.toEqual({
        canUpdate: false,
        blockedBy: ["library_component_override_target_missing"],
        deletedComponents: [],
        conflictedComponents: [
          {
            sourceComponentId: `penpot-component-${circleComponentId}`,
            targetComponentId: `penpot-component-${circleComponentId}`,
            affectedInstanceIds: [
              `penpot-${outerCopyId}__penpot-${outerMainSlotId}`,
              "penpot-swap-only-circle"
            ],
            missingOverrideNodeIds: [`penpot-${circleMainId}`]
          }
        ]
      });

      const server = createHttpServer(storage, { webDistDir: null });
      try {
        const reviewResponse = await server.inject({
          method: "POST",
          url: "/files/penpot-override-target/import/library/registry/update/review",
          payload: { libraryId: libraryDocumentId }
        });
        expect(reviewResponse.statusCode).toBe(200);
        expect(reviewResponse.json().review).toMatchObject({
          canUpdate: false,
          blockedBy: ["library_component_override_target_missing"],
          conflictedComponents: [
            {
              sourceComponentId: `penpot-component-${circleComponentId}`,
              missingOverrideNodeIds: [`penpot-${circleMainId}`]
            }
          ]
        });

        const updateResponse = await server.inject({
          method: "POST",
          url: "/files/penpot-override-target/import/library/registry/update",
          payload: { libraryId: libraryDocumentId }
        });
        expect(updateResponse.statusCode).toBe(400);
        expect(updateResponse.json()).toEqual({
          error: expect.stringMatching(/override target.*missing/i)
        });
      } finally {
        await server.close();
      }

      await expect(
        storage.updateLibraryRegistryItem("penpot-override-target", libraryDocumentId)
      ).rejects.toThrow(/override target.*missing/i);
      expect(await storage.readFile("penpot-override-target")).toEqual(beforeTarget);
      expect(
        await storage.listLibraryRegistrySubscriptions("penpot-override-target")
      ).toEqual(beforeSubscriptions);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("applies the exact library snapshot that passed compatibility review", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-stale-preview-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-stale-project",
        documentId: "penpot-stale-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const target = await storage.readFile("penpot-stale-target");
      const copy = target.pages[0].children.find(
        (node) => node.id === `penpot-${outerCopyId}`
      );
      const nestedCircle = copy?.children[0];
      nestedCircle!.component_instance!.overrides = [
        {
          node_id: `penpot-${circleMainId}`,
          field: "fill",
          value: "#0f766e"
        }
      ];
      await storage.writeFile("penpot-stale-target", target);

      const compatibleLibrary = await storage.readFile(libraryDocumentId);
      const compatibleCircle = compatibleLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      compatibleCircle!.source_node.style.fill = "#14b8a6";
      await storage.writeFile(libraryDocumentId, compatibleLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const internals = storage as unknown as {
        readAccessibleLibraryRegistryArchive(
          fileId: string,
          libraryId: string
        ): Promise<{ entry: unknown; archive: Buffer }>;
      };
      const readSnapshot = internals.readAccessibleLibraryRegistryArchive.bind(storage);
      let archiveReadCount = 0;
      internals.readAccessibleLibraryRegistryArchive = async (fileId, libraryId) => {
        const snapshot = await readSnapshot(fileId, libraryId);
        archiveReadCount += 1;
        if (archiveReadCount === 1) {
          const incompatibleLibrary = await storage.readFile(libraryDocumentId);
          const incompatibleCircle = incompatibleLibrary.components?.find(
            (component) => component.id === `penpot-component-${circleComponentId}`
          );
          incompatibleCircle!.source_node.id = "replacement-circle-root";
          await storage.writeFile(libraryDocumentId, incompatibleLibrary);
          await storage.publishLibraryToRegistry(libraryDocumentId, {
            libraryId: libraryDocumentId,
            name: "Shape library"
          });
        }
        return snapshot;
      };

      await expect(
        storage.updateLibraryRegistryItem("penpot-stale-target", libraryDocumentId)
      ).resolves.toMatchObject({ componentCount: 2 });
      expect(archiveReadCount).toBe(1);

      const updatedTarget = await storage.readFile("penpot-stale-target");
      const updatedCircle = updatedTarget.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      expect(updatedCircle?.source_node.id).toBe(`penpot-${circleMainId}`);
      expect(updatedCircle?.source_node.style.fill).toBe("#14b8a6");
      expect(
        updatedTarget.pages[0].children.find(
          (node) => node.id === `penpot-${outerCopyId}`
        )?.children[0]?.component_instance?.overrides
      ).toContainEqual({
        node_id: `penpot-${circleMainId}`,
        field: "fill",
        value: "#0f766e"
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rolls back partial library writes and supports retry plus saved-version recovery", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-rollback-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-rollback-project",
        documentId: "penpot-rollback-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const assetId = `penpot-asset-${libraryMediaId}`;
      const beforeTarget = await storage.readFile("penpot-rollback-target");
      const beforeSubscription = (
        await storage.listLibraryRegistrySubscriptions("penpot-rollback-target")
      )[0];
      const beforeAsset = await storage.readAsset(assetId);
      const savedVersion = await storage.saveFileVersion("penpot-rollback-target", {
        message: "라이브러리 업데이트 전"
      });

      const publishedAssetData = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="26" fill="#7c3aed"/></svg>',
        "utf8"
      );
      const internals = storage as unknown as {
        writeAsset(
          asset: {
            assetId: string;
            name: string;
            mimeType: string;
            byteLength: number;
            url: string;
          },
          data: Buffer
        ): Promise<unknown>;
        writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
      };
      await internals.writeAsset(
        { ...beforeAsset, byteLength: publishedAssetData.length },
        publishedAssetData
      );
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#7c3aed";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });
      await internals.writeAsset(beforeAsset, beforeAsset.data);

      const writeSubscriptions =
        internals.writeLibraryRegistrySubscriptions.bind(storage);
      let failAfterSubscriptionWrite = true;
      internals.writeLibraryRegistrySubscriptions = async (subscriptions) => {
        await writeSubscriptions(subscriptions);
        if (failAfterSubscriptionWrite) {
          failAfterSubscriptionWrite = false;
          throw new Error("injected subscription commit failure");
        }
      };

      await expect(
        storage.updateLibraryRegistryItem("penpot-rollback-target", libraryDocumentId)
      ).rejects.toThrow("injected subscription commit failure");

      expect(await storage.readFile("penpot-rollback-target")).toEqual(beforeTarget);
      expect(
        (await storage.listLibraryRegistrySubscriptions("penpot-rollback-target"))[0]
      ).toEqual(beforeSubscription);
      expect(await storage.readAsset(assetId)).toEqual(beforeAsset);

      await expect(
        storage.updateLibraryRegistryItem("penpot-rollback-target", libraryDocumentId)
      ).resolves.toMatchObject({ componentCount: 2, assetCount: 1 });
      const retriedTarget = await storage.readFile("penpot-rollback-target");
      expect(
        retriedTarget.components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#7c3aed");
      const retriedAsset = await storage.readAsset(assetId);
      expect(retriedAsset.byteLength).toBe(publishedAssetData.length);
      expect(retriedAsset.data.equals(publishedAssetData)).toBe(true);

      const restored = await storage.restoreFileVersion(
        "penpot-rollback-target",
        savedVersion.versionId
      );
      expect(restored.file).toEqual(beforeTarget);
      const recoveryVersion = await storage.readFileVersion(
        "penpot-rollback-target",
        restored.recoveryVersion.versionId
      );
      expect(
        recoveryVersion.document.components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#7c3aed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("serializes concurrent library updates for the same target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-update-lock-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-update-lock-project",
        documentId: "penpot-update-lock-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      type LibraryArchiveReader = {
        readAccessibleLibraryRegistryArchive(
          fileId: string,
          libraryId: string
        ): Promise<unknown>;
      };
      const secondStorage = new FileStorage(root);
      const firstInternals = storage as unknown as LibraryArchiveReader;
      const secondInternals = secondStorage as unknown as LibraryArchiveReader;
      const firstReadArchive =
        firstInternals.readAccessibleLibraryRegistryArchive.bind(storage);
      const secondReadArchive =
        secondInternals.readAccessibleLibraryRegistryArchive.bind(secondStorage);
      let readCount = 0;
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let markFirstEntered!: () => void;
      const firstEntered = new Promise<void>((resolve) => {
        markFirstEntered = resolve;
      });
      let markSecondEntered!: () => void;
      const secondEntered = new Promise<void>((resolve) => {
        markSecondEntered = resolve;
      });
      firstInternals.readAccessibleLibraryRegistryArchive = async (fileId, libraryId) => {
        readCount += 1;
        markFirstEntered();
        await firstGate;
        return firstReadArchive(fileId, libraryId);
      };
      secondInternals.readAccessibleLibraryRegistryArchive = async (fileId, libraryId) => {
        readCount += 1;
        markSecondEntered();
        return secondReadArchive(fileId, libraryId);
      };

      const firstUpdate = storage.updateLibraryRegistryItem(
        "penpot-update-lock-target",
        libraryDocumentId
      );
      await firstEntered;
      const secondUpdate = secondStorage.updateLibraryRegistryItem(
        "penpot-update-lock-target",
        libraryDocumentId
      );
      const secondState = await Promise.race([
        secondEntered.then(() => "entered" as const),
        new Promise<"blocked">((resolve) => {
          setTimeout(() => resolve("blocked"), 50);
        })
      ]);
      releaseFirst();
      const results = await Promise.allSettled([firstUpdate, secondUpdate]);

      expect(secondState).toBe("blocked");
      expect(results).toEqual([
        expect.objectContaining({ status: "fulfilled" }),
        expect.objectContaining({ status: "fulfilled" })
      ]);
      expect(readCount).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("serializes product writes behind a failing library update", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-product-write-lock-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-product-write-project",
        documentId: "penpot-product-write-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#0ea5e9";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const concurrentTarget = await storage.readFile("penpot-product-write-target");
      concurrentTarget.name = "Concurrent product edit";
      const originalFill = concurrentTarget.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      )?.source_node.style.fill;
      const internals = storage as unknown as {
        writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
      };
      const writeSubscriptions =
        internals.writeLibraryRegistrySubscriptions.bind(storage);
      let concurrentWrite!: ReturnType<FileStorage["writeFile"]>;
      let writerState: "blocked" | "written" | undefined;
      internals.writeLibraryRegistrySubscriptions = async (subscriptions) => {
        await writeSubscriptions(subscriptions);
        concurrentWrite = storage.writeFile("penpot-product-write-target", concurrentTarget);
        writerState = await Promise.race([
          concurrentWrite.then(() => "written" as const),
          new Promise<"blocked">((resolve) => {
            setTimeout(() => resolve("blocked"), 50);
          })
        ]);
        throw new Error("injected failure while product write waits");
      };

      await expect(
        storage.updateLibraryRegistryItem("penpot-product-write-target", libraryDocumentId)
      ).rejects.toThrow("injected failure while product write waits");
      await concurrentWrite;

      expect(writerState).toBe("blocked");
      const preservedTarget = await storage.readFile("penpot-product-write-target");
      expect(preservedTarget.name).toBe("Concurrent product edit");
      expect(
        preservedTarget.components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe(originalFill);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not roll back over a concurrent target writer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-concurrent-writer-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-concurrent-project",
        documentId: "penpot-concurrent-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#0ea5e9";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const internals = storage as unknown as {
        writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
        filePathFor(fileId: string): string;
      };
      const writeSubscriptions =
        internals.writeLibraryRegistrySubscriptions.bind(storage);
      let failAfterConcurrentWrite = true;
      internals.writeLibraryRegistrySubscriptions = async (subscriptions) => {
        await writeSubscriptions(subscriptions);
        if (failAfterConcurrentWrite) {
          failAfterConcurrentWrite = false;
          const concurrentTarget = await storage.readFile("penpot-concurrent-target");
          concurrentTarget.name = "Concurrent product edit";
          await writeRawFile(
            internals.filePathFor("penpot-concurrent-target"),
            `${JSON.stringify(concurrentTarget, null, 2)}\n`,
            "utf8"
          );
          throw new Error("injected failure after concurrent target write");
        }
      };

      await expect(
        storage.updateLibraryRegistryItem("penpot-concurrent-target", libraryDocumentId)
      ).rejects.toThrow("rollback conflicted with concurrent writes");

      const preservedTarget = await storage.readFile("penpot-concurrent-target");
      expect(preservedTarget.name).toBe("Concurrent product edit");
      expect(
        preservedTarget.components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#0ea5e9");

      await expect(
        storage.updateLibraryRegistryItem("penpot-concurrent-target", libraryDocumentId)
      ).resolves.toMatchObject({ componentCount: 2 });
      expect((await storage.readFile("penpot-concurrent-target")).name).toBe(
        "Concurrent product edit"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not roll back over a concurrent subscription writer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-subscription-writer-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-subscription-project",
        documentId: "penpot-subscription-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#f97316";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      type SubscriptionCommit = (snapshot: unknown) => void;
      const internals = storage as unknown as {
        writeLibraryRegistrySubscriptions(
          subscriptions: unknown[],
          onCommitted?: SubscriptionCommit
        ): Promise<void>;
        librarySubscriptionsPath(): string;
      };
      const writeSubscriptions =
        internals.writeLibraryRegistrySubscriptions.bind(storage);
      let failAfterExternalWrite = true;
      internals.writeLibraryRegistrySubscriptions = async (
        subscriptions,
        onCommitted
      ) => {
        await writeSubscriptions(subscriptions, onCommitted);
        if (failAfterExternalWrite) {
          failAfterExternalWrite = false;
          const subscriptionPath = internals.librarySubscriptionsPath();
          const current = JSON.parse(
            await readRawFile(subscriptionPath, "utf8")
          ) as { schemaVersion: number; subscriptions: Array<Record<string, unknown>> };
          const seed = current.subscriptions[0];
          if (!seed) {
            throw new Error("expected imported library subscription");
          }
          current.subscriptions.push({
            ...seed,
            fileId: "penpot-external-subscription-writer",
            importedAt: "2026-07-13T16:10:00.000Z"
          });
          await writeRawFile(
            subscriptionPath,
            `${JSON.stringify(current, null, 2)}\n`,
            "utf8"
          );
          throw new Error("injected failure after concurrent subscription write");
        }
      };

      await expect(
        storage.updateLibraryRegistryItem("penpot-subscription-target", libraryDocumentId)
      ).rejects.toThrow("rollback conflicted with concurrent writes");

      expect(
        (await storage.listLibraryRegistrySubscriptions()).some(
          (subscription) => subscription.fileId === "penpot-external-subscription-writer"
        )
      ).toBe(true);
      expect(
        (await storage.readFile("penpot-subscription-target")).components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#f97316");

      await expect(
        storage.updateLibraryRegistryItem("penpot-subscription-target", libraryDocumentId)
      ).resolves.toMatchObject({ componentCount: 2 });
      expect(
        (await storage.listLibraryRegistrySubscriptions()).some(
          (subscription) => subscription.fileId === "penpot-external-subscription-writer"
        )
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not recover an active library update during same-process project reads", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-active-read-"));
    let releaseSubscriptionWrite: () => void = () => undefined;
    let activeUpdate: Promise<unknown> | null = null;
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-active-read-project",
        documentId: "penpot-active-read-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#0f766e";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const internals = storage as unknown as {
        writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
      };
      let markSubscriptionReached!: () => void;
      const subscriptionReached = new Promise<void>((resolve) => {
        markSubscriptionReached = resolve;
      });
      const subscriptionRelease = new Promise<void>((resolve) => {
        releaseSubscriptionWrite = resolve;
      });
      const originalWriteSubscriptions =
        internals.writeLibraryRegistrySubscriptions.bind(storage);
      internals.writeLibraryRegistrySubscriptions = async (subscriptions) => {
        markSubscriptionReached();
        await subscriptionRelease;
        await originalWriteSubscriptions(subscriptions);
      };

      activeUpdate = storage.updateLibraryRegistryItem(
        "penpot-active-read-target",
        libraryDocumentId
      );
      await subscriptionReached;
      await storage.listProjects();

      expect(
        (await storage.readFile("penpot-active-read-target")).components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#0f766e");

      releaseSubscriptionWrite();
      await activeUpdate;
    } finally {
      releaseSubscriptionWrite();
      await activeUpdate?.catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  test("serializes a library update and product write across processes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-process-lock-"));
    const releasePath = path.join(root, "release-update");
    const workerPath = fileURLToPath(new URL("./storage-process-lock-worker.ts", import.meta.url));
    const children: ChildProcessWithoutNullStreams[] = [];
    const exits: Promise<void>[] = [];
    const spawnWorker = (
      args: string[],
      options: { env?: Record<string, string>; allowSignal?: NodeJS.Signals } = {}
    ) => {
      const child = spawn(process.execPath, ["--import", "tsx", workerPath, ...args], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...options.env }
      });
      children.push(child);
      exits.push(new Promise<void>((resolve, reject) => {
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          if (code === 0 || signal === options.allowSignal) {
            resolve();
          } else {
            reject(new Error(
              `storage process worker exited ${code ?? signal}: ${stderr}`
            ));
          }
        });
      }));
      return child;
    };
    const waitForMarker = (child: ChildProcessWithoutNullStreams, markerText: string) =>
      new Promise<void>((resolve, reject) => {
        let output = "";
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes(markerText)) {
            cleanup();
            resolve();
          }
        };
        const onExit = (code: number | null) => {
          cleanup();
          reject(new Error(`worker exited ${code} before marker ${markerText}: ${output}`));
        };
        const cleanup = () => {
          child.stdout.off("data", onData);
          child.off("exit", onExit);
        };
        child.stdout.on("data", onData);
        child.on("exit", onExit);
      });

    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-process-lock-project",
        documentId: "penpot-process-lock-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#7c3aed";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const updateWorker = spawnWorker([
        "update",
        root,
        "penpot-process-lock-target",
        libraryDocumentId,
        releasePath
      ]);
      await waitForMarker(updateWorker, "update-paused");

      const writeWorker = spawnWorker([
        "write",
        root,
        "penpot-process-lock-target",
        "-",
        releasePath
      ]);
      await waitForMarker(writeWorker, "write-ready");
      const writeDone = waitForMarker(writeWorker, "write-done");
      const completedBeforeRelease = await Promise.race([
        writeDone.then(() => true),
        delay(1_500).then(() => false)
      ]);

      expect(completedBeforeRelease).toBe(false);

      await writeRawFile(releasePath, "release\n", "utf8");
      await Promise.all(exits);
      expect((await storage.readFile("penpot-process-lock-target")).name).toBe(
        "Concurrent process write"
      );
    } finally {
      await writeRawFile(releasePath, "release\n", "utf8").catch(() => undefined);
      await Promise.allSettled(exits);
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);

  test("preserves concurrent read-modify-write geometry edits across processes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-process-rmw-"));
    const releasePath = path.join(root, "release-writers");
    const workerPath = fileURLToPath(new URL("./storage-process-lock-worker.ts", import.meta.url));
    const children: ChildProcessWithoutNullStreams[] = [];
    const exits: Promise<void>[] = [];
    const spawnWorker = (mode: "geometry-x" | "geometry-y") => {
      const child = spawn(process.execPath, [
        "--import",
        "tsx",
        workerPath,
        mode,
        root,
        "penpot-process-rmw-target",
        `penpot-${copyId}`,
        releasePath
      ], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env
      });
      children.push(child);
      exits.push(new Promise<void>((resolve, reject) => {
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`storage geometry worker exited ${code}: ${stderr}`));
          }
        });
      }));
      return child;
    };
    const waitForMarker = (child: ChildProcessWithoutNullStreams, markerText: string) =>
      new Promise<void>((resolve, reject) => {
        let output = "";
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes(markerText)) {
            cleanup();
            resolve();
          }
        };
        const onExit = (code: number | null) => {
          cleanup();
          reject(new Error(`worker exited ${code} before marker ${markerText}: ${output}`));
        };
        const cleanup = () => {
          child.stdout.off("data", onData);
          child.off("exit", onExit);
        };
        child.stdout.on("data", onData);
        child.on("exit", onExit);
      });

    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "penpot-process-rmw-project",
        documentId: "penpot-process-rmw-target",
        documentName: "Product file",
        fileName: "component.penpot"
      });

      const xWorker = spawnWorker("geometry-x");
      await waitForMarker(xWorker, "geometry-x-ready");
      const yWorker = spawnWorker("geometry-y");
      const yRead = waitForMarker(yWorker, "geometry-y-ready");
      const yReadBeforeRelease = await Promise.race([
        yRead.then(() => true),
        delay(500).then(() => false)
      ]);
      expect(yReadBeforeRelease).toBe(false);

      await writeRawFile(releasePath, "release\n", "utf8");
      await Promise.all(exits);

      const target = await storage.readFile("penpot-process-rmw-target");
      const node = target.pages[0].children.find(
        (candidate) => candidate.id === `penpot-${copyId}`
      );
      expect(node?.transform).toMatchObject({ x: 111, y: 222 });
    } finally {
      await writeRawFile(releasePath, "release\n", "utf8").catch(() => undefined);
      await Promise.allSettled(exits);
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);

  test("rejects case-folded library ids before replacing registry archives", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-library-casefold-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "publication-case-a-project",
        documentId: "publication-case-a",
        documentName: "Publication Case A",
        fileName: "publication-case-a.penpot"
      });
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "publication-case-b-project",
        documentId: "publication-case-b",
        documentName: "Publication Case B",
        fileName: "publication-case-b.penpot"
      });
      await storage.publishLibraryToRegistry("publication-case-a", {
        libraryId: "CaseFoldLibrary"
      });
      const registryBefore = await storage.listLibraryRegistry();

      await expect(
        storage.publishLibraryToRegistry("publication-case-b", {
          libraryId: "casefoldlibrary"
        })
      ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });

      expect(await storage.listLibraryRegistry()).toEqual(registryBefore);
      const review = await storage.reviewLibraryRegistryItem(
        "publication-case-a",
        "CaseFoldLibrary"
      );
      expect(review.originalFileId).toBe("publication-case-a");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps registry metadata and archive from the same competing publication", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-library-publication-race-"));
    const releasePath = path.join(root, "release-publisher");
    const workerPath = fileURLToPath(new URL("./storage-publication-worker.ts", import.meta.url));
    const children: ChildProcessWithoutNullStreams[] = [];
    const spawnPublisher = (mode: "publish-paused" | "publish", fileId: string) => {
      const child = spawn(process.execPath, [
        "--import",
        "tsx",
        workerPath,
        mode,
        root,
        fileId,
        "shared-publication",
        releasePath
      ], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
      children.push(child);
      return child;
    };
    const waitForMarker = (child: ChildProcessWithoutNullStreams, marker: string) =>
      new Promise<void>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
          if (stdout.includes(marker)) {
            resolve();
          }
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (!stdout.includes(marker)) {
            reject(new Error(`publisher exited ${code} before ${marker}: ${stderr}`));
          }
        });
      });
    const waitForExit = (child: ChildProcessWithoutNullStreams) =>
      new Promise<void>((resolve, reject) => {
        if (child.exitCode !== null) {
          if (child.exitCode === 0) {
            resolve();
          } else {
            reject(new Error(`publisher exited ${child.exitCode}`));
          }
          return;
        }
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`publisher exited ${code}: ${stderr}`));
          }
        });
      });

    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "publication-a-project",
        documentId: "publication-a",
        documentName: "Publication A",
        fileName: "publication-a.penpot"
      });
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "publication-b-project",
        documentId: "publication-b",
        documentName: "Publication B",
        fileName: "publication-b.penpot"
      });

      const publisherA = spawnPublisher("publish-paused", "publication-a");
      await waitForMarker(publisherA, "publish-paused");
      const publisherAExit = waitForExit(publisherA);
      const publisherB = spawnPublisher("publish", "publication-b");
      const publisherBExit = waitForExit(publisherB);
      await expect(
        Promise.race([
          publisherBExit.then(() => "completed"),
          delay(300).then(() => "blocked")
        ])
      ).resolves.toBe("blocked");

      await writeRawFile(releasePath, "release\n", "utf8");
      await Promise.all([publisherAExit, publisherBExit]);

      const entry = (await storage.listLibraryRegistry()).find(
        (candidate) => candidate.libraryId === "shared-publication"
      );
      const review = await storage.reviewLibraryRegistryItem(
        entry?.sourceFileId ?? "publication-a",
        "shared-publication"
      );
      expect(review.originalFileId).toBe(entry?.sourceFileId);
    } finally {
      await writeRawFile(releasePath, "release\n", "utf8").catch(() => undefined);
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
      await Promise.allSettled(children.map((child) => waitForExit(child)));
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);

  test("recovers an interrupted library publication before serving registry state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-publication-recovery-"));
    const releasePath = path.join(root, "unused-release");
    const workerPath = fileURLToPath(new URL("./storage-publication-worker.ts", import.meta.url));
    let publisher: ChildProcessWithoutNullStreams | null = null;

    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "publication-recovery-a-project",
        documentId: "publication-recovery-a",
        documentName: "Publication Recovery A",
        fileName: "publication-recovery-a.penpot"
      });
      await storage.importExternalMigrationArchive(componentArchive(), {
        projectId: "publication-recovery-b-project",
        documentId: "publication-recovery-b",
        documentName: "Publication Recovery B",
        fileName: "publication-recovery-b.penpot"
      });
      await storage.publishLibraryToRegistry("publication-recovery-a", {
        libraryId: "recovery-publication"
      });

      publisher = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          workerPath,
          "publish-crash-after-archive",
          root,
          "publication-recovery-b",
          "recovery-publication",
          releasePath
        ],
        { stdio: ["pipe", "pipe", "pipe"], env: process.env }
      );
      await new Promise<void>((resolve, reject) => {
        let stderr = "";
        publisher?.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        publisher?.once("error", reject);
        publisher?.once("exit", (code) => {
          if (code === 86) {
            resolve();
          } else {
            reject(new Error(`crashing publisher exited ${code}: ${stderr}`));
          }
        });
      });

      const restarted = new FileStorage(root);
      await restarted.publishLibraryToRegistry("publication-recovery-b", {
        libraryId: "unrelated-publication"
      });
      await restarted.prepareFiles();

      const entries = await restarted.listLibraryRegistry();
      const entry = entries.find(
        (candidate) => candidate.libraryId === "recovery-publication"
      );
      expect(entry?.sourceFileId).toBe("publication-recovery-a");
      expect(
        entries.find((candidate) => candidate.libraryId === "unrelated-publication")
          ?.sourceFileId
      ).toBe("publication-recovery-b");
      const review = await restarted.reviewLibraryRegistryItem(
        "publication-recovery-a",
        "recovery-publication"
      );
      expect(review.originalFileId).toBe(entry?.sourceFileId);
    } finally {
      if (publisher?.exitCode === null) {
        publisher.kill("SIGKILL");
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  test("namespaces publication recovery journals away from document update journals", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-publication-namespace-"));
    try {
      const storage = new FileStorage(root) as unknown as {
        libraryUpdateRecoveryPathFor(fileId: string): string;
        libraryPublicationRecoveryPathFor(libraryId: string): string;
      };
      expect(storage.libraryPublicationRecoveryPathFor("kit")).not.toBe(
        storage.libraryUpdateRecoveryPathFor("library-publication-kit")
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("recovers an abandoned process lock before the bounded wait expires", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-abandoned-process-lock-"));
    const releasePath = path.join(root, "unused-release");
    const workerPath = fileURLToPath(new URL("./storage-process-lock-worker.ts", import.meta.url));
    const children: ChildProcessWithoutNullStreams[] = [];
    const exits: Promise<void>[] = [];
    const spawnWorker = (
      args: string[],
      options: { env?: Record<string, string>; allowSignal?: NodeJS.Signals } = {}
    ) => {
      const child = spawn(process.execPath, ["--import", "tsx", workerPath, ...args], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...options.env }
      });
      children.push(child);
      exits.push(new Promise<void>((resolve, reject) => {
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          if (code === 0 || signal === options.allowSignal) {
            resolve();
          } else {
            reject(new Error(
              `storage process worker exited ${code ?? signal}: ${stderr}`
            ));
          }
        });
      }));
      return child;
    };
    const waitForMarker = (child: ChildProcessWithoutNullStreams, markerText: string) =>
      new Promise<void>((resolve, reject) => {
        let output = "";
        const onData = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes(markerText)) {
            cleanup();
            resolve();
          }
        };
        const onExit = (code: number | null) => {
          cleanup();
          reject(new Error(`worker exited ${code} before marker ${markerText}: ${output}`));
        };
        const cleanup = () => {
          child.stdout.off("data", onData);
          child.off("exit", onExit);
        };
        child.stdout.on("data", onData);
        child.on("exit", onExit);
      });

    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-abandoned-lock-project",
        documentId: "penpot-abandoned-lock-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });

      const holder = spawnWorker([
        "hold",
        root,
        "penpot-abandoned-lock-target",
        "-",
        releasePath
      ], { allowSignal: "SIGKILL" });
      await waitForMarker(holder, "hold-acquired");
      const holderExit = exits[0];
      holder.kill("SIGKILL");
      await holderExit;

      const writer = spawnWorker([
        "write",
        root,
        "penpot-abandoned-lock-target",
        "-",
        releasePath
      ], {
        env: {
          LAYO_STORAGE_LOCK_TIMEOUT_MS: "800",
          LAYO_STORAGE_LOCK_STALE_MS: "100"
        }
      });
      await waitForMarker(writer, "write-ready");
      await exits[1];

      expect((await storage.readFile("penpot-abandoned-lock-target")).name).toBe(
        "Concurrent process write"
      );
    } finally {
      await Promise.allSettled(exits);
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);

  test("recovers an interrupted library target write on storage restart", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-restart-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-restart-project",
        documentId: "penpot-restart-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const originalTarget = await storage.readFile("penpot-restart-target");
      const originalSubscriptions = await storage.listLibraryRegistrySubscriptions();
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#e11d48";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const internals = storage as unknown as {
        writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
      };
      let markSubscriptionReached!: () => void;
      const subscriptionReached = new Promise<void>((resolve) => {
        markSubscriptionReached = resolve;
      });
      const neverCommits = new Promise<void>(() => undefined);
      internals.writeLibraryRegistrySubscriptions = async () => {
        markSubscriptionReached();
        await neverCommits;
      };

      const interruptedUpdate = storage.updateLibraryRegistryItem(
        "penpot-restart-target",
        libraryDocumentId
      );
      void interruptedUpdate.catch(() => undefined);
      await subscriptionReached;
      expect(
        (await storage.readFile("penpot-restart-target")).components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#e11d48");

      const restartedStorage = new FileStorage(root);
      await restartedStorage.prepareFiles();

      expect(await restartedStorage.readFile("penpot-restart-target")).toEqual(originalTarget);
      expect(await restartedStorage.listLibraryRegistrySubscriptions()).toEqual(
        originalSubscriptions
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("recovers committed asset target and subscription writes before journal cleanup", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-commit-restart-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-commit-restart-project",
        documentId: "penpot-commit-restart-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const assetId = `penpot-asset-${libraryMediaId}`;
      const originalTarget = await storage.readFile("penpot-commit-restart-target");
      const originalSubscriptions = await storage.listLibraryRegistrySubscriptions();
      const originalAsset = await storage.readAsset(assetId);
      const publishedAssetData = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0891b2"/></svg>',
        "utf8"
      );
      const internals = storage as unknown as {
        writeAsset(
          asset: {
            assetId: string;
            name: string;
            mimeType: string;
            byteLength: number;
            url: string;
          },
          data: Buffer
        ): Promise<unknown>;
        removeLibraryUpdateRecoveryJournal(fileId: string): Promise<void>;
      };
      await internals.writeAsset(
        { ...originalAsset, byteLength: publishedAssetData.length },
        publishedAssetData
      );
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#0891b2";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });
      await internals.writeAsset(originalAsset, originalAsset.data);

      let markCleanupReached!: () => void;
      const cleanupReached = new Promise<void>((resolve) => {
        markCleanupReached = resolve;
      });
      const neverCleans = new Promise<void>(() => undefined);
      internals.removeLibraryUpdateRecoveryJournal = async () => {
        markCleanupReached();
        await neverCleans;
      };

      const interruptedUpdate = storage.updateLibraryRegistryItem(
        "penpot-commit-restart-target",
        libraryDocumentId
      );
      void interruptedUpdate.catch(() => undefined);
      await cleanupReached;
      expect(
        (await storage.readFile("penpot-commit-restart-target")).components?.find(
          (component) => component.id === `penpot-component-${circleComponentId}`
        )?.source_node.style.fill
      ).toBe("#0891b2");
      expect((await storage.readAsset(assetId)).data.equals(publishedAssetData)).toBe(true);

      const restartedStorage = new FileStorage(root);
      await restartedStorage.prepareFiles();

      expect(await restartedStorage.readFile("penpot-commit-restart-target")).toEqual(
        originalTarget
      );
      expect(await restartedStorage.listLibraryRegistrySubscriptions()).toEqual(
        originalSubscriptions
      );
      expect(await restartedStorage.readAsset(assetId)).toEqual(originalAsset);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses restart recovery over a target outside journal intent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-library-restart-conflict-"));
    try {
      const storage = new FileStorage(root);
      await storage.importExternalMigrationArchive(packagedLibrarySwapArchive(), {
        projectId: "penpot-restart-conflict-project",
        documentId: "penpot-restart-conflict-target",
        documentName: "Product file",
        fileName: "packaged-library-swap.penpot"
      });
      const libraryDocumentId = `penpot-library-${libraryFileId}`;
      const publishedLibrary = await storage.readFile(libraryDocumentId);
      const publishedCircle = publishedLibrary.components?.find(
        (component) => component.id === `penpot-component-${circleComponentId}`
      );
      publishedCircle!.source_node.style.fill = "#4f46e5";
      await storage.writeFile(libraryDocumentId, publishedLibrary);
      await storage.publishLibraryToRegistry(libraryDocumentId, {
        libraryId: libraryDocumentId,
        name: "Shape library"
      });

      const internals = storage as unknown as {
        writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
        filePathFor(fileId: string): string;
      };
      let markSubscriptionReached!: () => void;
      const subscriptionReached = new Promise<void>((resolve) => {
        markSubscriptionReached = resolve;
      });
      const neverCommits = new Promise<void>(() => undefined);
      internals.writeLibraryRegistrySubscriptions = async () => {
        markSubscriptionReached();
        await neverCommits;
      };
      const interruptedUpdate = storage.updateLibraryRegistryItem(
        "penpot-restart-conflict-target",
        libraryDocumentId
      );
      void interruptedUpdate.catch(() => undefined);
      await subscriptionReached;

      const externalTarget = await storage.readFile("penpot-restart-conflict-target");
      externalTarget.name = "External writer after interruption";
      await writeRawFile(
        internals.filePathFor("penpot-restart-conflict-target"),
        `${JSON.stringify(externalTarget, null, 2)}\n`,
        "utf8"
      );

      const restartedStorage = new FileStorage(root);
      await expect(restartedStorage.prepareFiles()).rejects.toThrow(
        "interrupted library update path changed outside journal"
      );
      expect((await restartedStorage.readFile("penpot-restart-conflict-target")).name).toBe(
        "External writer after interruption"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks a missing external library before writing project or document state", async () => {
    const archive = packagedLibrarySwapArchive({ includeLibrary: false });
    const review = reviewExternalMigrationArchive(archive, {
      fileName: "missing-library.penpot"
    });

    expect(review).toMatchObject({
      source: "penpot",
      canImport: false,
      blockedBy: ["penpot_component_relation_invalid"]
    });

    const root = await mkdtemp(path.join(tmpdir(), "layo-penpot-missing-library-"));
    try {
      const storage = new FileStorage(root);
      await expect(
        storage.importExternalMigrationArchive(archive, {
          projectId: "must-not-write-project",
          documentId: "must-not-write-document",
          fileName: "missing-library.penpot"
        })
      ).rejects.toThrow(/component relation/i);
      expect(await storage.listProjects()).toEqual([]);
      expect(await storage.listFiles()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reviews readable main and copy relations as structurally importable", () => {
    const review = reviewExternalMigrationArchive(componentArchive(), {
      fileName: "components.penpot"
    });

    expect(review).toMatchObject({
      source: "penpot",
      canImport: true,
      blockedBy: []
    });
    expect(review.warnings).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/component|shape-ref/i)])
    );
  });

  test("maps a main component, linked copy, and text override into native Layo ownership", () => {
    const imported = importExternalMigrationArchive(componentArchive(), {
      fileName: "components.penpot",
      fileId: "component-import"
    });

    expect(imported.file.components).toEqual([
      expect.objectContaining({
        id: `penpot-component-${componentId}`,
        name: "Button",
        source_node: expect.objectContaining({
          id: `penpot-${mainId}`,
          kind: "component"
        }),
        variants: [
          expect.objectContaining({ id: "default", name: "Default", properties: [] })
        ]
      })
    ]);

    const main = imported.file.pages[0].children.find(
      (node) => node.id === `penpot-${mainId}`
    );
    const copy = imported.file.pages[0].children.find(
      (node) => node.id === `penpot-${copyId}`
    );

    expect(main).toMatchObject({ kind: "component", component_instance: null });
    expect(copy).toMatchObject({
      kind: "component_instance",
      component_instance: {
        definition_id: `penpot-component-${componentId}`,
        variant_id: "default",
        detached: false,
        overrides: expect.arrayContaining([
          {
            node_id: `penpot-${mainLabelId}`,
            field: "text",
            value: "Continue"
          },
          {
            node_id: `penpot-${mainLabelId}`,
            field: "fill",
            value: "#f97316"
          },
          expect.objectContaining({
            node_id: `penpot-${mainLabelId}`,
            field: "fills",
            value: expect.stringContaining("#f97316")
          }),
          {
            node_id: `penpot-${mainLabelId}`,
            field: "stroke",
            value: "#22c55e"
          },
          {
            node_id: `penpot-${mainLabelId}`,
            field: "stroke_width",
            value: "2"
          },
          expect.objectContaining({
            node_id: `penpot-${mainLabelId}`,
            field: "strokes",
            value: expect.stringContaining("#22c55e")
          }),
          {
            node_id: `penpot-${mainLabelId}`,
            field: "opacity",
            value: "0.6"
          },
          {
            node_id: `penpot-${mainLabelId}`,
            field: "x",
            value: "40"
          },
          {
            node_id: `penpot-${mainLabelId}`,
            field: "y",
            value: "22"
          },
          {
            node_id: `penpot-${mainLabelId}`,
            field: "width",
            value: "126"
          },
          {
            node_id: `penpot-${mainLabelId}`,
            field: "height",
            value: "28"
          }
        ])
      }
    });
    expect(copy?.children).toEqual([
      expect.objectContaining({
        id: `penpot-${copyId}__penpot-${mainLabelId}`,
        kind: "text",
        content: expect.objectContaining({ value: "Continue" }),
        style: expect.objectContaining({
          fill: "#f97316",
          fills: [
            expect.objectContaining({ color: "#f97316", opacity: 0.8 })
          ],
          stroke: "#22c55e",
          stroke_width: 2,
          strokes: [
            expect.objectContaining({ color: "#22c55e", width: 2 })
          ],
          opacity: 0.6
        }),
        transform: expect.objectContaining({ x: 40, y: 22 }),
        size: { width: 126, height: 28 }
      })
    ]);
  });

  test("blocks a dangling component copy before import writes a flattened document", () => {
    const archive = componentArchive({ copyShapeRef: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
    const review = reviewExternalMigrationArchive(archive, { fileName: "dangling.penpot" });

    expect(review).toMatchObject({
      source: "penpot",
      canImport: false,
      blockedBy: ["penpot_component_relation_invalid"]
    });
    expect(review.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/Button copy.*main-instance relation/i)])
    );
    expect(() =>
      importExternalMigrationArchive(archive, {
        fileName: "dangling.penpot",
        fileId: "must-not-import"
      })
    ).toThrow(/component relation/i);
  });

  test("blocks touched copy layers that do not resolve inside the selected main tree", () => {
    const review = reviewExternalMigrationArchive(
      componentArchive({ copyLabelShapeRef: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }),
      { fileName: "dangling-layer.penpot" }
    );

    expect(review).toMatchObject({
      source: "penpot",
      canImport: false,
      blockedBy: ["penpot_component_relation_invalid"]
    });
    expect(review.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/Label.*connected layer/i)])
    );
  });

  test("groups Penpot variant mains and preserves the selected copy combination", () => {
    const imported = importExternalMigrationArchive(variantArchive(), {
      fileName: "variants.penpot",
      fileId: "variant-import"
    });

    expect(imported.file.components).toEqual([
      expect.objectContaining({
        id: `penpot-component-${variantContainerId}`,
        name: "Button",
        source_node: expect.objectContaining({ id: `penpot-${smallMainId}`, kind: "component" }),
        variants: [
          expect.objectContaining({
            id: `penpot-variant-${smallComponentId}`,
            name: "Size=Small, State=Default",
            properties: [
              { name: "Size", value: "Small", type: "select" },
              { name: "State", value: "Default", type: "select" }
            ]
          }),
          expect.objectContaining({
            id: `penpot-variant-${largeComponentId}`,
            name: "Size=Large, State=Default",
            properties: [
              { name: "Size", value: "Large", type: "select" },
              { name: "State", value: "Default", type: "select" }
            ],
            source_node: expect.objectContaining({ id: `penpot-${largeMainId}`, kind: "component" })
          })
        ]
      })
    ]);

    const container = imported.file.pages[0].children.find(
      (node) => node.id === `penpot-${variantContainerId}`
    );
    const copy = imported.file.pages[0].children.find(
      (node) => node.id === `penpot-${variantCopyId}`
    );
    expect(container?.children.map((node) => node.kind)).toEqual(["component", "component"]);
    expect(copy).toMatchObject({
      kind: "component_instance",
      component_instance: {
        definition_id: `penpot-component-${variantContainerId}`,
        variant_id: `penpot-variant-${largeComponentId}`,
        overrides: [],
        detached: false
      }
    });
  });
});
