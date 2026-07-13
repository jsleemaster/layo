import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { inspectCanvas, validateDocument } from "./agent-control";
import { exportDesignToCode } from "./code-export";
import { createZipArchive } from "./file-archive";
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
      const updateReviewer = storage as unknown as {
        reviewLibraryRegistryItemUpdate(
          fileId: string,
          libraryId: string
        ): Promise<{
          canUpdate: boolean;
          blockedBy: string[];
          deletedComponents: Array<{
            sourceComponentId: string;
            targetComponentId: string;
            affectedInstanceIds: string[];
          }>;
        }>;
      };
      await expect(
        updateReviewer.reviewLibraryRegistryItemUpdate(
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
              `penpot-${outerCopyId}__penpot-${outerMainSlotId}`
            ]
          }
        ]
      });

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
