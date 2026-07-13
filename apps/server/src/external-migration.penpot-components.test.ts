import { describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const componentId = "33333333-3333-3333-3333-333333333333";
const mainId = "44444444-4444-4444-4444-444444444444";
const mainLabelId = "55555555-5555-5555-5555-555555555555";
const copyId = "66666666-6666-6666-6666-666666666666";
const copyLabelId = "77777777-7777-7777-7777-777777777777";

function componentArchive() {
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
        "component-file": fileId,
        "shape-ref": mainId,
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
        x: 352,
        y: 112,
        width: 116,
        height: 24,
        "shape-ref": mainLabelId,
        touched: ["text-content-group"],
        content: "Continue",
        fontSize: 16,
        fontFamily: "Inter",
        fills: [{ fillColor: "#ffffff", fillOpacity: 1 }]
      })
    }
  ]);
}

describe("Penpot component instance migration", () => {
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
        overrides: [
          {
            node_id: `penpot-${mainLabelId}`,
            field: "text",
            value: "Continue"
          }
        ]
      }
    });
    expect(copy?.children).toEqual([
      expect.objectContaining({
        id: `penpot-${copyId}__penpot-${mainLabelId}`,
        kind: "text",
        content: expect.objectContaining({ value: "Continue" })
      })
    ]);
  });
});
