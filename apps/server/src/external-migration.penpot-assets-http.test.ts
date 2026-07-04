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
const mediaId = "66666666-6666-6666-6666-666666666666";
const storageObjectId = "77777777-7777-7777-7777-777777777777";
const expectedAssetId = `penpot-asset-${mediaId}`;
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
});
