import { expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { importExternalMigrationArchive } from "./external-migration";
import { exportDesignToCode } from "./code-export";
import { inspectCanvas } from "./agent-control";

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const groupId = "33333333-3333-3333-3333-333333333333";
const rectId = "44444444-4444-4444-4444-444444444444";
const clippedMaskWarning =
  "Imported Penpot masked group Masked artwork with Layo bounds clipping; complex mask shapes are not preserved.";

function createPenpotClippedMaskedGroupArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot Masked Group Clipping Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Masked Group Clipping Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Masked group clipping", index: 0, objects: {} }), "utf8")
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

test("imports Penpot masked groups with bounds clipping metadata for agents and handoff", () => {
  const imported = importExternalMigrationArchive(createPenpotClippedMaskedGroupArchive(), {
    fileName: "masked-group-clipping.penpot",
    fileId: "penpot-masked-group-clipping-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 2,
    skippedNodeCount: 0
  });
  expect(imported.warnings).toContain(clippedMaskWarning);

  const group = imported.file.pages[0].children[0];
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

  const inspection = inspectCanvas(imported.file);
  expect(inspection.nodes.find((node) => node.id === `penpot-${groupId}`)).toMatchObject({
    id: `penpot-${groupId}`,
    clip: { type: "bounds" }
  });

  const exported = exportDesignToCode(imported.file);
  const rootElement = exported.elements.find((element) => element.id === `penpot-${groupId}`);
  expect(rootElement?.structure).toMatchObject({
    id: `penpot-${groupId}`,
    clip: { type: "bounds" }
  });
  expect(rootElement?.css).toContain("overflow: hidden;");
});
