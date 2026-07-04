import { describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";

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
          generatedBy: "penpot/test",
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
      data: Buffer.from(
        JSON.stringify({ id: pageId, name: "Landing", index: 0, objects: {} }),
        "utf8"
      )
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
          fills: [{ fillColor: "#1a334d", fillOpacity: 1 }],
          strokes: [{ strokeColor: "#000000", strokeWidth: 2 }]
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

describe("Penpot external design migration", () => {
  test("reviews Penpot v3 ZIP exports as importable when basic shapes are mappable", () => {
    const archive = createBasicPenpotExportArchive();

    const review = reviewExternalMigrationArchive(archive, { fileName: "landing.penpot" });

    expect(review).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      archiveKind: "zip",
      canImport: true,
      blockedBy: [],
      documentCandidateCount: 2
    });
    expect(review.documentCandidates.some((candidate) => candidate.name === "Penpot Landing")).toBe(true);
  });

  test("imports Penpot v3 frame rectangle and text shapes into a Layo design file", () => {
    const archive = createBasicPenpotExportArchive();

    const imported = importExternalMigrationArchive(archive, {
      fileName: "landing.penpot",
      fileId: "penpot-imported-file"
    });

    expect(imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      mappedNodeCount: 3,
      skippedNodeCount: 0
    });
    expect(imported.file).toMatchObject({
      id: "penpot-imported-file",
      name: "Penpot Landing",
      pages: [{ id: "penpot-22222222-2222-2222-2222-222222222222", name: "Landing" }]
    });
    const frame = imported.file.pages[0].children[0];
    expect(frame).toMatchObject({
      id: "penpot-33333333-3333-3333-3333-333333333333",
      kind: "frame",
      name: "Hero frame",
      transform: { x: 80, y: 96, rotation: 0 },
      size: { width: 320, height: 180 },
      style: { fill: "#ffffff" }
    });
    expect(frame.children[0]).toMatchObject({
      id: "penpot-44444444-4444-4444-4444-444444444444",
      kind: "rectangle",
      name: "CTA background",
      transform: { x: 24, y: 26, rotation: 0 },
      size: { width: 180, height: 56 },
      style: { fill: "#1a334d", stroke: "#000000", stroke_width: 2 }
    });
    expect(frame.children[1]).toMatchObject({
      id: "penpot-55555555-5555-5555-5555-555555555555",
      kind: "text",
      name: "Headline",
      transform: { x: 44, y: 48, rotation: 0 },
      size: { width: 220, height: 32 },
      content: { type: "text", value: "Imported from Penpot", font_size: 18, font_family: "Inter" }
    });
  });
});
