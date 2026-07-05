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
const svgRawId = "44444444-4444-4444-4444-444444444444";
const expectedSvgRawAssetId = `penpot-asset-${svgRawId}-svg-raw`;
const rawSvgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24" viewBox="0 0 32 24"><path d="M4 20L16 4l12 16Z" fill="#14b8a6"/></svg>';
const rawSvgBytes = Buffer.from(rawSvgMarkup, "utf8");

function createPenpotSvgRawExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot SVG Raw Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot SVG Raw Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "SVG raw", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "SVG raw frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 160,
          height: 96,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [svgRawId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${svgRawId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: svgRawId,
          name: "Inline logo",
          type: "svg-raw",
          x: 56,
          y: 80,
          width: 32,
          height: 24,
          opacity: 0.8,
          content: rawSvgMarkup
        }),
        "utf8"
      )
    }
  ]);
}

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

test("imports Penpot svg-raw shapes as local SVG image assets", () => {
  const archive = createPenpotSvgRawExportArchive();

  const review = reviewExternalMigrationArchive(archive, { fileName: "svg-raw.penpot" });
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
    fileName: "svg-raw.penpot",
    fileId: "penpot-svg-raw-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 2,
    skippedNodeCount: 0
  });
  expect(imported.importedAssets).toHaveLength(1);
  expect(imported.importedAssets[0]?.metadata).toMatchObject({
    assetId: expectedSvgRawAssetId,
    name: "Inline logo.svg",
    mimeType: "image/svg+xml",
    byteLength: rawSvgBytes.length,
    url: `/assets/${expectedSvgRawAssetId}`
  });
  expect(imported.importedAssets[0]?.data).toEqual(rawSvgBytes);

  const frame = imported.file.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "SVG raw frame" });
  expect(frame.children).toHaveLength(1);
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${svgRawId}`,
    kind: "image",
    name: "Inline logo",
    transform: { x: 16, y: 16, rotation: 0 },
    size: { width: 32, height: 24 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 0.8 },
    content: {
      type: "image",
      asset_id: expectedSvgRawAssetId,
      natural_width: 32,
      natural_height: 24,
      fit_mode: "fill"
    }
  });
});

test("reviews imports and persists Penpot svg-raw assets through HTTP", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotSvgRawExportArchive();

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "svg-raw.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 1,
    mappedNodeCount: 2,
    skippedNodeCount: 0,
    project: { name: "Penpot SVG Raw Board" },
    file: { name: "Penpot SVG Raw Board", pages: [{ name: "SVG raw" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const frame = persisted.pages[0].children[0];
  const svgNode = frame.children[0];
  expect(svgNode).toMatchObject({
    id: `penpot-${svgRawId}`,
    kind: "image",
    name: "Inline logo",
    content: {
      type: "image",
      asset_id: expectedSvgRawAssetId,
      natural_width: 32,
      natural_height: 24,
      fit_mode: "fill"
    }
  });
  if (svgNode.content.type !== "image") {
    throw new Error("expected Penpot svg-raw import to persist an image node");
  }
  const asset = await storage.readAsset(svgNode.content.asset_id);
  expect(asset).toMatchObject({
    assetId: expectedSvgRawAssetId,
    name: "Inline logo.svg",
    mimeType: "image/svg+xml",
    byteLength: rawSvgBytes.length,
    url: `/assets/${expectedSvgRawAssetId}`
  });
  expect(asset.data).toEqual(rawSvgBytes);
});
