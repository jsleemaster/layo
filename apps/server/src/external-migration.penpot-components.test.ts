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

function componentArchive(options: { copyShapeRef?: string } = {}) {
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
