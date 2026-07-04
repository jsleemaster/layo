import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const frameId = "33333333-3333-3333-3333-333333333333";
const imageId = "44444444-4444-4444-4444-444444444444";
const fillRectId = "55555555-5555-5555-5555-555555555555";
const mediaId = "66666666-6666-6666-6666-666666666666";
const storageObjectId = "77777777-7777-7777-7777-777777777777";
const fillMediaId = "88888888-8888-8888-8888-888888888888";
const fillStorageObjectId = "99999999-9999-9999-9999-999999999999";
const frameBackgroundMediaId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const frameBackgroundStorageObjectId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const foregroundRectId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const multiFillRectId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const expectedMultiFillColor = "#800080";
const expectedAssetId = `penpot-asset-${mediaId}`;
const expectedFillAssetId = `penpot-asset-${fillMediaId}`;
const expectedFrameBackgroundAssetId = `penpot-asset-${frameBackgroundMediaId}`;
const pngImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function createPenpotImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Image frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [imageId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${imageId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: imageId,
          name: "Hero image",
          type: "image",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          metadata: { id: mediaId, width: 1, height: 1, mtype: "image/png" }
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${mediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: mediaId,
          name: "hero.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: storageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${storageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: storageObjectId, size: pngImage.length, contentType: "image/png", bucket: "file-media" }),
        "utf8"
      )
    },
    {
      path: `objects/${storageObjectId}.png`,
      data: pngImage
    }
  ]);
}

function createPenpotFillImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Fill Image Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Fill Image Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Fill images", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Fill image frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [fillRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${fillRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: fillRectId,
          name: "Hero fill",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            {
              "fill-image": {
                id: fillMediaId,
                name: "hero-fill.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "fill-opacity": 1
            }
          ]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${fillMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: fillMediaId,
          name: "hero-fill.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: fillStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${fillStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: fillStorageObjectId, size: pngImage.length, contentType: "image/png", bucket: "file-media" }),
        "utf8"
      )
    },
    {
      path: `objects/${fillStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

function createPenpotFrameFillImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Frame Background Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Frame Background Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Frame backgrounds", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Hero frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [
            {
              "fill-image": {
                id: frameBackgroundMediaId,
                name: "frame-bg.png",
                width: 1,
                height: 1,
                mtype: "image/png"
              },
              "fill-opacity": 1
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
          x: 80,
          y: 104,
          width: 80,
          height: 48,
          fills: [{ fillColor: "#10b981", fillOpacity: 1 }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/media/${frameBackgroundMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameBackgroundMediaId,
          name: "frame-bg.png",
          width: 1,
          height: 1,
          mtype: "image/png",
          mediaId: frameBackgroundStorageObjectId
        }),
        "utf8"
      )
    },
    {
      path: `objects/${frameBackgroundStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({ id: frameBackgroundStorageObjectId, size: pngImage.length, contentType: "image/png", bucket: "file-media" }),
        "utf8"
      )
    },
    {
      path: `objects/${frameBackgroundStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

function createPenpotSolidMultiFillExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Multi Fill Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Multi Fill Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Multi fills", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Multi fill frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [multiFillRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${multiFillRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: multiFillRectId,
          name: "Layered fill card",
          type: "rect",
          x: 64,
          y: 88,
          width: 96,
          height: 72,
          fills: [
            { "fill-color": "#ff0000", "fill-opacity": 0.5 },
            { "fill-color": "#0000ff", "fill-opacity": 1 }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

describe("Penpot external image asset migration HTTP routes", () => {
  test("reviews imports and persists Penpot image assets into local storage", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const archive = createPenpotImageExportArchive();

    const review = await server.inject({
      method: "POST",
      url: "/migrations/external/review",
      payload: {
        archiveBase64: archive.toString("base64"),
        fileName: "images.penpot"
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
        fileName: "images.penpot"
      }
    });

    expect(imported.statusCode).toBe(200);
    const body = imported.json();
    expect(body.imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      assetCount: 1,
      mappedNodeCount: 2,
      skippedNodeCount: 0,
      project: { name: "Penpot Image Board" },
      file: { name: "Penpot Image Board", pages: [{ name: "Images" }] }
    });

    const projects = await storage.listProjects();
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    const frame = persisted.pages[0].children[0];
    const imageNode = frame.children[0];
    expect(imageNode).toMatchObject({
      id: `penpot-${imageId}`,
      kind: "image",
      name: "Hero image",
      content: {
        type: "image",
        asset_id: expectedAssetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
    if (imageNode.content.type !== "image") {
      throw new Error("expected Penpot import to persist an image node");
    }
    const asset = await storage.readAsset(imageNode.content.asset_id);
    expect(asset).toMatchObject({
      assetId: expectedAssetId,
      name: "hero.png",
      mimeType: "image/png",
      byteLength: pngImage.length,
      url: `/assets/${expectedAssetId}`
    });
    expect(asset.data).toEqual(pngImage);
  });

  test("reviews imports and persists Penpot fill-image paint assets into local storage", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const archive = createPenpotFillImageExportArchive();

    const review = await server.inject({
      method: "POST",
      url: "/migrations/external/review",
      payload: {
        archiveBase64: archive.toString("base64"),
        fileName: "fill-images.penpot"
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
        fileName: "fill-images.penpot"
      }
    });

    expect(imported.statusCode).toBe(200);
    const body = imported.json();
    expect(body.imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      assetCount: 1,
      mappedNodeCount: 2,
      skippedNodeCount: 0,
      project: { name: "Penpot Fill Image Board" },
      file: { name: "Penpot Fill Image Board", pages: [{ name: "Fill images" }] }
    });

    const projects = await storage.listProjects();
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    const frame = persisted.pages[0].children[0];
    const imageNode = frame.children[0];
    expect(imageNode).toMatchObject({
      id: `penpot-${fillRectId}`,
      kind: "image",
      name: "Hero fill",
      content: {
        type: "image",
        asset_id: expectedFillAssetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
    if (imageNode.content.type !== "image") {
      throw new Error("expected Penpot fill-image import to persist an image node");
    }
    const asset = await storage.readAsset(imageNode.content.asset_id);
    expect(asset).toMatchObject({
      assetId: expectedFillAssetId,
      name: "hero-fill.png",
      mimeType: "image/png",
      byteLength: pngImage.length,
      url: `/assets/${expectedFillAssetId}`
    });
    expect(asset.data).toEqual(pngImage);
  });

  test("reviews imports and persists Penpot frame fill-image backgrounds without losing children", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const archive = createPenpotFrameFillImageExportArchive();

    const imported = await server.inject({
      method: "POST",
      url: "/migrations/external/import",
      payload: {
        archiveBase64: archive.toString("base64"),
        fileName: "frame-backgrounds.penpot"
      }
    });

    expect(imported.statusCode).toBe(200);
    const body = imported.json();
    expect(body.imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      assetCount: 1,
      mappedNodeCount: 3,
      skippedNodeCount: 0,
      project: { name: "Penpot Frame Background Board" },
      file: { name: "Penpot Frame Background Board", pages: [{ name: "Frame backgrounds" }] }
    });

    const projects = await storage.listProjects();
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    const frame = persisted.pages[0].children[0];
    expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Hero frame" });
    expect(frame.children).toHaveLength(2);
    const background = frame.children[0];
    expect(background).toMatchObject({
      id: `penpot-${frameId}-fill-image`,
      kind: "image",
      name: "Hero frame background",
      content: {
        type: "image",
        asset_id: expectedFrameBackgroundAssetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
    expect(frame.children[1]).toMatchObject({ id: `penpot-${foregroundRectId}`, kind: "rectangle", name: "Foreground card" });
    if (background.content.type !== "image") {
      throw new Error("expected Penpot frame background import to persist an image node");
    }
    const asset = await storage.readAsset(background.content.asset_id);
    expect(asset).toMatchObject({
      assetId: expectedFrameBackgroundAssetId,
      name: "frame-bg.png",
      mimeType: "image/png",
      byteLength: pngImage.length,
      url: `/assets/${expectedFrameBackgroundAssetId}`
    });
    expect(asset.data).toEqual(pngImage);
  });
});

  test("reviews imports and persists flattened Penpot solid fill stacks", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const archive = createPenpotSolidMultiFillExportArchive();

    const review = await server.inject({
      method: "POST",
      url: "/migrations/external/review",
      payload: {
        archiveBase64: archive.toString("base64"),
        fileName: "multi-fills.penpot"
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
        fileName: "multi-fills.penpot"
      }
    });

    expect(imported.statusCode).toBe(200);
    expect(imported.json().imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      assetCount: 0,
      mappedNodeCount: 2,
      skippedNodeCount: 0,
      project: { name: "Penpot Multi Fill Board" },
      file: { name: "Penpot Multi Fill Board", pages: [{ name: "Multi fills" }] }
    });

    const projects = await storage.listProjects();
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    const frame = persisted.pages[0].children[0];
    expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Multi fill frame" });
    expect(frame.children[0]).toMatchObject({
      id: `penpot-${multiFillRectId}`,
      kind: "rectangle",
      name: "Layered fill card",
      style: { fill: expectedMultiFillColor, opacity: 1 }
    });
  });
