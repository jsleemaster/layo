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
const pathId = "55555555-5555-5555-5555-555555555555";
const pathData = "M4 20L16 4l12 16Z";

function createPenpotPathExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot Path Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Path Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Path import", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Path frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 160,
          height: 96,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [pathId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${pathId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: pathId,
          name: "Vector triangle",
          type: "path",
          x: 56,
          y: 80,
          width: 32,
          height: 24,
          opacity: 0.8,
          content: pathData,
          fills: [{ fillColor: "#14b8a6", fillOpacity: 1 }],
          strokes: [{ strokeColor: "#0f172a", strokeOpacity: 1, strokeWidth: 2 }]
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

test("imports Penpot path shapes as first-class path nodes", () => {
  const archive = createPenpotPathExportArchive();

  const review = reviewExternalMigrationArchive(archive, { fileName: "path.penpot" });
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
    fileName: "path.penpot",
    fileId: "penpot-path-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 2,
    skippedNodeCount: 0
  });
  expect(imported.importedAssets).toEqual([]);

  const frame = imported.file.pages[0].children[0];
  expect(frame).toMatchObject({ id: `penpot-${frameId}`, kind: "frame", name: "Path frame" });
  expect(frame.children).toHaveLength(1);
  expect(frame.children[0]).toMatchObject({
    id: `penpot-${pathId}`,
    kind: "path",
    name: "Vector triangle",
    transform: { x: 16, y: 16, rotation: 0 },
    size: { width: 32, height: 24 },
    style: { fill: "#14b8a6", stroke: "#0f172a", stroke_width: 2, opacity: 0.8 },
    content: {
      type: "path",
      path_data: pathData,
      fill_rule: "nonzero"
    }
  });
});

test("reviews imports and persists first-class Penpot paths through HTTP", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotPathExportArchive();

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    headers: { "idempotency-key": "external-migration-penpot-path-1" },
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "path.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 0,
    mappedNodeCount: 2,
    skippedNodeCount: 0,
    project: { name: "Penpot Path Board" },
    file: { name: "Penpot Path Board", pages: [{ name: "Path import" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const pathNode = persisted.pages[0].children[0].children[0];
  expect(pathNode).toMatchObject({
    id: `penpot-${pathId}`,
    kind: "path",
    name: "Vector triangle",
    style: { fill: "#14b8a6", stroke: "#0f172a", stroke_width: 2, opacity: 0.8 },
    content: {
      type: "path",
      path_data: pathData,
      fill_rule: "nonzero"
    }
  });
});
