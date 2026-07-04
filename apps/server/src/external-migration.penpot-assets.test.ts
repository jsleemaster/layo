import { describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const frameId = "33333333-3333-3333-3333-333333333333";
const imageId = "44444444-4444-4444-4444-444444444444";
const fillRectId = "55555555-5555-5555-5555-555555555555";
const mediaId = "66666666-6666-6666-6666-666666666666";
const storageObjectId = "77777777-7777-7777-7777-777777777777";
const fillMediaId = "88888888-8888-8888-8888-888888888888";
const fillStorageObjectId = \"99999999-9999-9999-9999-999999999999\";
const frameBackgroundMediaId = \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\";
const frameBackgroundStorageObjectId = \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\";
const foregroundRectId = \"cccccccc-cccc-cccc-cccc-cccccccccccc\";
const expectedAssetId = `penpot-asset-${mediaId}`;
const expectedFillAssetId = `penpot-asset-${fillMediaId}`;
const expectedFrameBackgroundAssetId = `penpot-asset-${frameBackgroundMediaId}`;
const pngImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function createPenpotImageExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
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
        JSON.stringify({
          id: storageObjectId,
          size: pngImage.length,
          contentType: "image/png",
          bucket: "file-media"
        }),
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
          generatedBy: "penpot/test",
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
        JSON.stringify({
          id: fillStorageObjectId,
          size: pngImage.length,
          contentType: "image/png",
          bucket: "file-media"
        }),
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
      path: \"manifest.json\",
      data: Buffer.from(
        JSON.stringify({
          type: \"penpot/export-files\",
          version: 1,
          generatedBy: \"penpot/test\",
          files: [{ id: fileId, name: \"Penpot Frame Background Board\", features: [] }]
        }),
        \"utf8\"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: \"Penpot Frame Background Board\" }), \"utf8\")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: \"Frame backgrounds\", index: 0, objects: {} }), \"utf8\")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: \"Hero frame\",
          type: \"frame\",
          x: 40,
          y: 64,
          width: 240,
          height: 160,
          fills: [
            {
              \"fill-image\": {
                id: frameBackgroundMediaId,
                name: \"frame-bg.png\",
                width: 1,
                height: 1,
                mtype: \"image/png\"
              },
              \"fill-opacity\": 1
            }
          ],
          shapes: [foregroundRectId]
        }),
        \"utf8\"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${foregroundRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: foregroundRectId,
          name: \"Foreground card\",
          type: \"rect\",
          x: 80,
          y: 104,
          width: 80,
          height: 48,
          fills: [{ fillColor: \"#10b981\", fillOpacity: 1 }]
        }),
        \"utf8\"
      )
    },
    {
      path: `files/${fileId}/media/${frameBackgroundMediaId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameBackgroundMediaId,
          name: \"frame-bg.png\",
          width: 1,
          height: 1,
          mtype: \"image/png\",
          mediaId: frameBackgroundStorageObjectId
        }),
        \"utf8\"
      )
    },
    {
      path: `objects/${frameBackgroundStorageObjectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameBackgroundStorageObjectId,
          size: pngImage.length,
          contentType: \"image/png\",
          bucket: \"file-media\"
        }),
        \"utf8\"
      )
    },
    {
      path: `objects/${frameBackgroundStorageObjectId}.png`,
      data: pngImage
    }
  ]);
}

describe(\"Penpot external image asset migration\", () => {
  test("reviews Penpot v3 ZIP exports with packaged image assets as importable", () => {
    const review = reviewExternalMigrationArchive(createPenpotImageExportArchive(), { fileName: "images.penpot" });

    expect(review).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      archiveKind: "zip",
      canImport: true,
      blockedBy: [],
      assetCount: 1,
      documentCandidateCount: 2
    });
    expect(review.assetCandidates).toContainEqual({
      path: `objects/${storageObjectId}.png`,
      bytes: pngImage.length,
      mediaType: "image/png"
    });
  });

  test("imports Penpot image shapes as Layo image nodes backed by packaged assets", () => {
    const imported = importExternalMigrationArchive(createPenpotImageExportArchive(), {
      fileName: "images.penpot",
      fileId: "penpot-image-imported-file"
    });

    expect(imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      mappedNodeCount: 2,
      skippedNodeCount: 0
    });
    expect(imported.importedAssets).toHaveLength(1);
    expect(imported.importedAssets[0].metadata).toMatchObject({
      assetId: expectedAssetId,
      name: "hero.png",
      mimeType: "image/png",
      byteLength: pngImage.length,
      url: `/assets/${expectedAssetId}`
    });
    expect(imported.importedAssets[0].data).toEqual(pngImage);

    const frame = imported.file.pages[0].children[0];
    expect(frame).toMatchObject({
      id: `penpot-${frameId}`,
      kind: "frame",
      name: "Image frame",
      transform: { x: 40, y: 64, rotation: 0 },
      size: { width: 240, height: 160 }
    });
    expect(frame.children[0]).toMatchObject({
      id: `penpot-${imageId}`,
      kind: "image",
      name: "Hero image",
      transform: { x: 24, y: 24, rotation: 0 },
      size: { width: 96, height: 72 },
      style: { fill: "#f3f4f6", stroke: null, stroke_width: 0 },
      content: {
        type: "image",
        asset_id: expectedAssetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
  });

  test("imports Penpot rectangle fill-image paints as Layo image nodes backed by packaged assets", () => {
    const imported = importExternalMigrationArchive(createPenpotFillImageExportArchive(), {
      fileName: "fill-images.penpot",
      fileId: "penpot-fill-image-imported-file"
    });

    expect(imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      mappedNodeCount: 2,
      skippedNodeCount: 0
    });
    expect(imported.importedAssets).toHaveLength(1);
    expect(imported.importedAssets[0].metadata).toMatchObject({
      assetId: expectedFillAssetId,
      name: "hero-fill.png",
      mimeType: "image/png",
      byteLength: pngImage.length,
      url: `/assets/${expectedFillAssetId}`
    });
    expect(imported.importedAssets[0].data).toEqual(pngImage);

    const frame = imported.file.pages[0].children[0];
    expect(frame).toMatchObject({
      id: `penpot-${frameId}`,
      kind: "frame",
      name: "Fill image frame"
    });
    expect(frame.children[0]).toMatchObject({
      id: `penpot-${fillRectId}`,
      kind: "image",
      name: "Hero fill",
      transform: { x: 24, y: 24, rotation: 0 },
      size: { width: 96, height: 72 },
      style: { fill: "#f3f4f6", stroke: null, stroke_width: 0 },
      content: {
        type: "image",
        asset_id: expectedFillAssetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
  });

  test(\"imports Penpot frame fill-image paints without dropping child layers\", () => {
    const imported = importExternalMigrationArchive(createPenpotFrameFillImageExportArchive(), {
      fileName: \"frame-backgrounds.penpot\",
      fileId: \"penpot-frame-background-imported-file\"
    });

    expect(imported).toMatchObject({
      source: \"penpot\",
      sourceLabel: \"Penpot\",
      mappedNodeCount: 3,
      skippedNodeCount: 0
    });
    expect(imported.importedAssets).toHaveLength(1);
    expect(imported.importedAssets[0].metadata).toMatchObject({
      assetId: expectedFrameBackgroundAssetId,
      name: \"frame-bg.png\",
      mimeType: \"image/png\",
      byteLength: pngImage.length,
      url: `/assets/${expectedFrameBackgroundAssetId}`
    });

    const frame = imported.file.pages[0].children[0];
    expect(frame).toMatchObject({
      id: `penpot-${frameId}`,
      kind: \"frame\",
      name: \"Hero frame\"
    });
    expect(frame.children).toHaveLength(2);
    expect(frame.children[0]).toMatchObject({
      id: `penpot-${frameId}-fill-image`,
      kind: \"image\",
      name: \"Hero frame background\",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 240, height: 160 },
      style: { fill: \"#f3f4f6\", stroke: null, stroke_width: 0 },
      content: {
        type: \"image\",
        asset_id: expectedFrameBackgroundAssetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: \"fill\"
      }
    });
    expect(frame.children[1]).toMatchObject({
      id: `penpot-${foregroundRectId}`,
      kind: \"rectangle\",
      name: \"Foreground card\",
      transform: { x: 40, y: 40, rotation: 0 },
      size: { width: 80, height: 48 },
      style: { fill: \"#10b981\" }
    });
  });
});