import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createZipArchive } from "./file-archive";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const frameId = "33333333-3333-3333-3333-333333333333";
const strokeStackRectId = "12121212-1212-1212-1212-121212121212";
const differentWidthStrokeRectId = "13131313-1313-1313-1313-131313131313";
const expectedStrokeStackColor = "#800080";
const expectedDifferentWidthStrokeWidth = 8;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function createPenpotSolidMultiStrokeExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Multi Stroke Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Multi Stroke Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Multi strokes", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Multi stroke frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 320,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          shapes: [strokeStackRectId, differentWidthStrokeRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${strokeStackRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeStackRectId,
          name: "Layered stroke card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            { "stroke-color": "#ff0000", "stroke-opacity": 0.5, "stroke-width": 4 },
            { "stroke-color": "#0000ff", "stroke-opacity": 1, "stroke-width": 4 }
          ]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${differentWidthStrokeRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: differentWidthStrokeRectId,
          name: "Wide layered stroke card",
          type: "rect",
          x: 184,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            { "stroke-color": "#ff0000", "stroke-opacity": 0.5, "stroke-width": 2 },
            { "stroke-color": "#0000ff", "stroke-opacity": 1, "stroke-width": expectedDifferentWidthStrokeWidth }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

test("flattens Penpot solid stroke stacks into a single Layo stroke", () => {
  const archive = createPenpotSolidMultiStrokeExportArchive();
  const review = reviewExternalMigrationArchive(archive, { fileName: "multi-strokes.penpot" });
  expect(review).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    archiveKind: "zip",
    canImport: true,
    blockedBy: [],
    assetCount: 0,
    documentCandidateCount: 2
  });

  const imported = importExternalMigrationArchive(archive, {
    fileName: "multi-strokes.penpot",
    fileId: "penpot-multi-stroke-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 3,
    skippedNodeCount: 0
  });
  expect(imported.importedAssets).toHaveLength(0);
  const frame = imported.file.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Multi stroke frame" });
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${strokeStackRectId}`,
    kind: "rectangle",
    name: "Layered stroke card",
    style: { fill: "#ffffff", stroke: expectedStrokeStackColor, stroke_width: 4, opacity: 1 }
  });
  expect(frame.children[1]).toMatchObject({
    id: `penpot-${differentWidthStrokeRectId}`,
    kind: "rectangle",
    name: "Wide layered stroke card",
    style: {
      fill: "#ffffff",
      stroke: expectedStrokeStackColor,
      stroke_width: expectedDifferentWidthStrokeWidth,
      opacity: 1
    }
  });
});

test("reviews imports and persists flattened Penpot solid stroke stacks", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotSolidMultiStrokeExportArchive();

  const review = await server.inject({
    method: "POST",
    url: "/migrations/external/review",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "multi-strokes.penpot"
    }
  });

  expect(review.statusCode).toBe(200);
  expect(review.json().review).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    archiveKind: "zip",
    canImport: true,
    blockedBy: [],
    assetCount: 0,
    documentCandidateCount: 2
  });

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "multi-strokes.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 0,
    mappedNodeCount: 3,
    skippedNodeCount: 0,
    project: { name: "Penpot Multi Stroke Board" },
    file: { name: "Penpot Multi Stroke Board", pages: [{ name: "Multi strokes" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const frame = persisted.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Multi stroke frame" });
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${strokeStackRectId}`,
    kind: "rectangle",
    name: "Layered stroke card",
    style: { fill: "#ffffff", stroke: expectedStrokeStackColor, stroke_width: 4, opacity: 1 }
  });
  expect(frame.children[1]).toMatchObject({
    id: `penpot-${differentWidthStrokeRectId}`,
    kind: "rectangle",
    name: "Wide layered stroke card",
    style: {
      fill: "#ffffff",
      stroke: expectedStrokeStackColor,
      stroke_width: expectedDifferentWidthStrokeWidth,
      opacity: 1
    }
  });
});
