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
const strokeImageRectId = "15151515-1515-1515-1515-151515151515";
const strokeImageMediaId = "16161616-1616-1616-1616-161616161616";
const strokeImageStorageObjectId = "17171717-1717-1717-1717-171717171717";
const expectedStrokeImageAssetId = `penpot-asset-${strokeImageMediaId}`;
const pngImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function createPenpotStrokeImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot Stroke Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Stroke Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Stroke images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Stroke image frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          shapes: [strokeImageRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${strokeImageRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeImageRectId,
          name: "Border texture card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          strokes: [
            {
              "stroke-image": {
                id: strokeImageMediaId,
                name: "border-texture.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "stroke-opacity": 0.6,
              "stroke-width": 12,
              "stroke-alignment": "center"
            }
          ]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${strokeImageMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeImageMediaId,
          name: "border-texture.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: strokeImageStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${strokeImageStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: strokeImageStorageObjectId,
          size: pngImage.length,
          contentType: "image/png",
          bucket: "file-media"
        }),
        "utf8"
      )
    },
    {
      path: `objects/${strokeImageStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

test("imports Penpot stroke-image records as packaged image assets", () => {
  const archive = createPenpotStrokeImageExportArchive();
  const review = reviewExternalMigrationArchive(archive, { fileName: "stroke-images.penpot" });
  expect(review).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    archiveKind: "zip",
    canImport: true,
    blockedBy: [],
    assetCount: 1,
    documentCandidateCount: 2
  });

  const imported = importExternalMigrationArchive(archive, {
    fileName: "stroke-images.penpot",
    fileId: "penpot-stroke-image-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 2,
    skippedNodeCount: 0
  });
  expect(imported.importedAssets).toHaveLength(1);
  expect(imported.importedAssets[0]?.metadata).toMatchObject({
    assetId: expectedStrokeImageAssetId,
    name: "border-texture.png",
    mimeType: "image/png",
    byteLength: pngImage.length,
    url: `/assets/${expectedStrokeImageAssetId}`
  });

  const frame = imported.file.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Stroke image frame" });
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${strokeImageRectId}`,
    kind: "rectangle",
    name: "Border texture card",
    style: {
      fill: "#ffffff",
      stroke: null,
      stroke_width: 0,
      opacity: 1,
      strokes: [{
        paint: { type: "image", asset_id: expectedStrokeImageAssetId },
        opacity: 0.6,
        width: 12,
        position: "center"
      }]
    },
    content: { type: "empty" }
  });
});

test("reviews imports and persists Penpot stroke-image records through HTTP", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotStrokeImageExportArchive();

  const review = await server.inject({
    method: "POST",
    url: "/migrations/external/review",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "stroke-images.penpot"
    }
  });

  expect(review.statusCode).toBe(200);
  expect(review.json().review).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    archiveKind: "zip",
    canImport: true,
    blockedBy: [],
    assetCount: 1,
    documentCandidateCount: 2
  });

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    headers: { "idempotency-key": "external-migration-penpot-stroke-image-1" },
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "stroke-images.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 1,
    mappedNodeCount: 2,
    skippedNodeCount: 0,
    project: { name: "Penpot Stroke Image Board" },
    file: { name: "Penpot Stroke Image Board", pages: [{ name: "Stroke images" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const frame = persisted.pages[0].children[0];
  const imageNode = frame.children[0];
  expect(imageNode).toMatchObject({
    id: `penpot-${strokeImageRectId}`,
    kind: "rectangle",
    name: "Border texture card",
    style: {
      fill: "#ffffff",
      stroke: null,
      stroke_width: 0,
      opacity: 1,
      strokes: [{
        paint: { type: "image", asset_id: expectedStrokeImageAssetId },
        opacity: 0.6,
        width: 12,
        position: "center"
      }]
    },
    content: { type: "empty" }
  });
  const asset = await storage.readAsset(expectedStrokeImageAssetId);
  expect(asset).toMatchObject({
    assetId: expectedStrokeImageAssetId,
    name: "border-texture.png",
    mimeType: "image/png",
    byteLength: pngImage.length,
    url: `/assets/${expectedStrokeImageAssetId}`
  });
  expect(asset.data).toEqual(pngImage);
});
