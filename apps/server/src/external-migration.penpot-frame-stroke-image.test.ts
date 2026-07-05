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
const foregroundRectId = "24242424-2424-2424-2424-242424242424";
const frameStrokeImageMediaId = "25252525-2525-2525-2525-252525252525";
const frameStrokeImageStorageObjectId = "26262626-2626-2626-2626-262626262626";
const frameFillImageMediaId = "27272727-2727-2727-2727-272727272727";
const frameFillImageStorageObjectId = "28282828-2828-2828-2828-282828282828";
const expectedFrameStrokeImageAssetId = `penpot-asset-${frameStrokeImageMediaId}`;
const expectedFrameStrokeImageNodeId = `penpot-${frameId}-stroke-image`;
const expectedFrameFillImageAssetId = `penpot-asset-${frameFillImageMediaId}`;
const expectedFrameFillImageNodeId = `penpot-${frameId}-fill-image`;
const pngImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const svgImage = Buffer.from('<svg width="17" height="23" xmlns="http://www.w3.org/2000/svg"><rect width="17" height="23"/></svg>', "utf8");

interface FrameStrokeImageArchiveOptions {
  imageData?: Buffer;
  mediaName?: string;
  mediaType?: string;
  objectExtension?: string;
  includeMediaDimensions?: boolean;
  includeFrameFillImage?: boolean;
}

function createPenpotFrameStrokeImageExportArchive(options: FrameStrokeImageArchiveOptions = {}): Buffer {
  const imageData = options.imageData ?? pngImage;
  const mediaName = options.mediaName ?? "frame-border-texture.png";
  const mediaType = options.mediaType ?? "image/png";
  const objectExtension = options.objectExtension ?? ".png";
  const includeMediaDimensions = options.includeMediaDimensions ?? true;
  const strokeImageMetadata = includeMediaDimensions ? { width: 1, height: 1 } : {};
  const mediaDimensions = includeMediaDimensions ? { width: 1, height: 1 } : {};
  const frameFills = options.includeFrameFillImage
    ? [
        {
          "fill-image": {
            id: frameFillImageMediaId,
            name: "frame-background-texture.png",
            width: 1,
            height: 1,
            mtype: "image/png"
          },
          "fill-opacity": 0.35
        }
      ]
    : [{ "fill-color": "#ffffff", "fill-opacity": 1 }];

  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot Frame Stroke Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Frame Stroke Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Frame stroke images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Frame stroke image board",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: frameFills,
          strokes: [
            {
              "stroke-image": {
                id: frameStrokeImageMediaId,
                name: mediaName,
                ...strokeImageMetadata,
                mtype: mediaType
              },
              "stroke-opacity": 0.55,
              "stroke-width": 14,
              "stroke-alignment": "outer"
            }
          ],
          shapes: [foregroundRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${foregroundRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: foregroundRectId,
          name: "Foreground card",
          type: "rect",
          x: 72,
          y: 96,
          width: 88,
          height: 56,
          fills: [{ "fill-color": "#dbeafe", "fill-opacity": 1 }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${frameStrokeImageMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameStrokeImageMediaId,
          name: mediaName,
          ...mediaDimensions,
          mtype: mediaType,
          mediaId: frameStrokeImageStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${frameStrokeImageStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameStrokeImageStorageObjectId,
          size: imageData.length,
          contentType: mediaType,
          bucket: "file-media"
        }),
        "utf8"
      )
    },
    {
      path: `objects/${frameStrokeImageStorageObjectId}${objectExtension}`,
      data: imageData
    },
    ...(options.includeFrameFillImage
      ? [
          {
            path: `files/${fileId}/media/${frameFillImageMediaId}.json`,
            data: Buffer.from(
              JSON.stringify({
                id: frameFillImageMediaId,
                name: "frame-background-texture.png",
                width: 1,
                height: 1,
                mtype: "image/png",
                mediaId: frameFillImageStorageObjectId
              }),
              "utf8"
            )
          },
          {
            path: `objects/${frameFillImageStorageObjectId}.json`,
            data: Buffer.from(
              JSON.stringify({
                id: frameFillImageStorageObjectId,
                size: pngImage.length,
                contentType: "image/png",
                bucket: "file-media"
              }),
              "utf8"
            )
          },
          {
            path: `objects/${frameFillImageStorageObjectId}.png`,
            data: pngImage
          }
        ]
      : [])
  ]);
}

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

test("imports Penpot frame stroke-image records as packaged background image assets", () => {
  const archive = createPenpotFrameStrokeImageExportArchive();
  const review = reviewExternalMigrationArchive(archive, { fileName: "frame-stroke-images.penpot" });
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
    fileName: "frame-stroke-images.penpot",
    fileId: "penpot-frame-stroke-image-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 3,
    skippedNodeCount: 0
  });
  expect(imported.importedAssets).toHaveLength(1);
  expect(imported.importedAssets[0]?.metadata).toMatchObject({
    assetId: expectedFrameStrokeImageAssetId,
    name: "frame-border-texture.png",
    mimeType: "image/png",
    byteLength: pngImage.length,
    url: `/assets/${expectedFrameStrokeImageAssetId}`
  });

  const frame = imported.file.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Frame stroke image board" });
  expect(frame.children).toHaveLength(2);
  expect(frame.children[0]).toMatchObject({
    id: expectedFrameStrokeImageNodeId,
    kind: "image",
    name: "Frame stroke image board stroke image",
    transform: { x: 0, y: 0, rotation: 0 },
    size: { width: 240, height: 160 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.55 },
    content: {
      type: "image",
      asset_id: expectedFrameStrokeImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(frame.children[1]).toMatchObject({
    id: `penpot-${foregroundRectId}`,
    kind: "rectangle",
    name: "Foreground card",
    style: { fill: "#dbeafe", stroke: null, stroke_width: 0, opacity: 1 }
  });
});

test("imports Penpot frame fill-image and stroke-image records as separate packaged image children", () => {
  const archive = createPenpotFrameStrokeImageExportArchive({ includeFrameFillImage: true });
  const review = reviewExternalMigrationArchive(archive, { fileName: "frame-dual-image-paints.penpot" });
  expect(review).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    archiveKind: "zip",
    canImport: true,
    blockedBy: [],
    assetCount: 2,
    documentCandidateCount: 2
  });

  const imported = importExternalMigrationArchive(archive, {
    fileName: "frame-dual-image-paints.penpot",
    fileId: "penpot-frame-dual-image-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 4,
    skippedNodeCount: 0
  });
  expect(imported.importedAssets.map((asset) => asset.metadata.assetId).sort()).toEqual(
    [expectedFrameFillImageAssetId, expectedFrameStrokeImageAssetId].sort()
  );

  const frame = imported.file.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Frame stroke image board" });
  expect(frame.children).toHaveLength(3);
  expect(frame.children[0]).toMatchObject({
    id: expectedFrameFillImageNodeId,
    kind: "image",
    name: "Frame stroke image board background",
    transform: { x: 0, y: 0, rotation: 0 },
    size: { width: 240, height: 160 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.35 },
    content: {
      type: "image",
      asset_id: expectedFrameFillImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(frame.children[1]).toMatchObject({
    id: expectedFrameStrokeImageNodeId,
    kind: "image",
    name: "Frame stroke image board stroke image",
    transform: { x: 0, y: 0, rotation: 0 },
    size: { width: 240, height: 160 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.55 },
    content: {
      type: "image",
      asset_id: expectedFrameStrokeImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(frame.children[2]).toMatchObject({
    id: `penpot-${foregroundRectId}`,
    kind: "rectangle",
    name: "Foreground card",
    style: { fill: "#dbeafe", stroke: null, stroke_width: 0, opacity: 1 }
  });
});

test("infers Penpot frame stroke-image natural dimensions from packaged SVG bytes", () => {
  const archive = createPenpotFrameStrokeImageExportArchive({
    imageData: svgImage,
    mediaName: "frame-border-texture.svg",
    mediaType: "image/svg+xml",
    objectExtension: ".svg",
    includeMediaDimensions: false
  });

  const imported = importExternalMigrationArchive(archive, {
    fileName: "frame-stroke-images.penpot",
    fileId: "penpot-frame-stroke-image-svg-imported-file"
  });

  expect(imported.importedAssets[0]?.metadata).toMatchObject({
    assetId: expectedFrameStrokeImageAssetId,
    name: "frame-border-texture.svg",
    mimeType: "image/svg+xml",
    byteLength: svgImage.length,
    url: `/assets/${expectedFrameStrokeImageAssetId}`
  });

  const frame = imported.file.pages[0].children[0];
  expect(frame.children[0]).toMatchObject({
    id: expectedFrameStrokeImageNodeId,
    kind: "image",
    content: {
      type: "image",
      asset_id: expectedFrameStrokeImageAssetId,
      natural_width: 17,
      natural_height: 23,
      fit_mode: "fill"
    }
  });
});

test("reviews imports and persists Penpot frame stroke-image records through HTTP", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotFrameStrokeImageExportArchive();

  const review = await server.inject({
    method: "POST",
    url: "/migrations/external/review",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "frame-stroke-images.penpot"
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
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "frame-stroke-images.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 1,
    mappedNodeCount: 3,
    skippedNodeCount: 0,
    project: { name: "Penpot Frame Stroke Image Board" },
    file: { name: "Penpot Frame Stroke Image Board", pages: [{ name: "Frame stroke images" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const frame = persisted.pages[0].children[0];
  const strokeImageNode = frame.children[0];
  expect(strokeImageNode).toMatchObject({
    id: expectedFrameStrokeImageNodeId,
    kind: "image",
    name: "Frame stroke image board stroke image",
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.55 },
    content: {
      type: "image",
      asset_id: expectedFrameStrokeImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(frame.children[1]).toMatchObject({
    id: `penpot-${foregroundRectId}`,
    kind: "rectangle",
    name: "Foreground card",
    style: { fill: "#dbeafe", stroke: null, stroke_width: 0, opacity: 1 }
  });
  if (strokeImageNode.content.type !== "image") {
    throw new Error("expected Penpot frame stroke-image import to persist an image node");
  }
  const asset = await storage.readAsset(strokeImageNode.content.asset_id);
  expect(asset).toMatchObject({
    assetId: expectedFrameStrokeImageAssetId,
    name: "frame-border-texture.png",
    mimeType: "image/png",
    byteLength: pngImage.length,
    url: `/assets/${expectedFrameStrokeImageAssetId}`
  });
  expect(asset.data).toEqual(pngImage);
});

test("reviews imports and persists Penpot frame fill-image plus stroke-image records through HTTP", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotFrameStrokeImageExportArchive({ includeFrameFillImage: true });

  const review = await server.inject({
    method: "POST",
    url: "/migrations/external/review",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "frame-dual-image-paints.penpot"
    }
  });

  expect(review.statusCode).toBe(200);
  expect(review.json().review).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    archiveKind: "zip",
    canImport: true,
    blockedBy: [],
    assetCount: 2,
    documentCandidateCount: 2
  });

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "frame-dual-image-paints.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 2,
    mappedNodeCount: 4,
    skippedNodeCount: 0,
    project: { name: "Penpot Frame Stroke Image Board" },
    file: { name: "Penpot Frame Stroke Image Board", pages: [{ name: "Frame stroke images" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const frame = persisted.pages[0].children[0];
  expect(frame.children).toHaveLength(3);
  const fillImageNode = frame.children[0];
  const strokeImageNode = frame.children[1];
  expect(fillImageNode).toMatchObject({
    id: expectedFrameFillImageNodeId,
    kind: "image",
    name: "Frame stroke image board background",
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.35 },
    content: {
      type: "image",
      asset_id: expectedFrameFillImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(strokeImageNode).toMatchObject({
    id: expectedFrameStrokeImageNodeId,
    kind: "image",
    name: "Frame stroke image board stroke image",
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.55 },
    content: {
      type: "image",
      asset_id: expectedFrameStrokeImageAssetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fill"
    }
  });
  expect(frame.children[2]).toMatchObject({
    id: `penpot-${foregroundRectId}`,
    kind: "rectangle",
    name: "Foreground card",
    style: { fill: "#dbeafe", stroke: null, stroke_width: 0, opacity: 1 }
  });

  if (fillImageNode.content.type !== "image" || strokeImageNode.content.type !== "image") {
    throw new Error("expected Penpot frame dual image-paint import to persist image nodes");
  }
  const fillAsset = await storage.readAsset(fillImageNode.content.asset_id);
  const strokeAsset = await storage.readAsset(strokeImageNode.content.asset_id);
  expect(fillAsset).toMatchObject({ assetId: expectedFrameFillImageAssetId, name: "frame-background-texture.png" });
  expect(strokeAsset).toMatchObject({ assetId: expectedFrameStrokeImageAssetId, name: "frame-border-texture.png" });
  expect(fillAsset.data).toEqual(pngImage);
  expect(strokeAsset.data).toEqual(pngImage);
});
