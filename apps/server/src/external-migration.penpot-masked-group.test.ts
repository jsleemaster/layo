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
const groupId = "33333333-3333-3333-3333-333333333333";
const rectId = "44444444-4444-4444-4444-444444444444";
const maskedGroupWarning =
  "Imported Penpot masked group Masked artwork with Layo bounds clipping; complex mask shapes are not preserved.";

function createPenpotMaskedGroupExportArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot Masked Group Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Masked Group Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Masked group import", index: 0, objects: {} }), "utf8")
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
          name: "Masked content card",
          type: "rect",
          x: 56,
          y: 80,
          width: 64,
          height: 40,
          opacity: 0.9,
          fills: [{ fillColor: "#38bdf8", fillOpacity: 0.7 }],
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

test("imports Penpot masked groups as clipped group containers with children", () => {
  const archive = createPenpotMaskedGroupExportArchive();

  const review = reviewExternalMigrationArchive(archive, { fileName: "masked-group.penpot" });
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
    fileName: "masked-group.penpot",
    fileId: "penpot-masked-group-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 2,
    skippedNodeCount: 0
  });
  expect(imported.warnings).toContain(maskedGroupWarning);
  expect(imported.importedAssets).toHaveLength(0);

  const group = imported.file.pages[0].children[0];
  expect(group).toMatchObject({
    id: `penpot-${groupId}`,
    kind: "group",
    name: "Masked artwork",
    clip: { type: "bounds" },
    transform: { x: 40, y: 64, rotation: 0 },
    size: { width: 160, height: 96 },
    style: { fill: "#ffffff", stroke: null, stroke_width: 0, opacity: 1 }
  });
  expect(group.children).toHaveLength(1);
  expect(group.children[0]).toMatchObject({
    id: `penpot-${rectId}`,
    kind: "rectangle",
    name: "Masked content card",
    transform: { x: 16, y: 16, rotation: 0 },
    size: { width: 64, height: 40 },
    style: { fill: "#38bdf8", stroke: "#0f172a", stroke_width: 2, opacity: 0.9 }
  });
});

test("persists Penpot clipped masked group containers through HTTP", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotMaskedGroupExportArchive();

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    headers: { "idempotency-key": "external-migration-penpot-masked-group-1" },
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "masked-group.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 0,
    mappedNodeCount: 2,
    skippedNodeCount: 0,
    warnings: [maskedGroupWarning],
    project: { name: "Penpot Masked Group Board" },
    file: { name: "Penpot Masked Group Board", pages: [{ name: "Masked group import" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const group = persisted.pages[0].children[0];
  expect(group).toMatchObject({
    id: `penpot-${groupId}`,
    kind: "group",
    name: "Masked artwork",
    clip: { type: "bounds" }
  });
  expect(group.children).toHaveLength(1);
  expect(group.children[0]).toMatchObject({
    id: `penpot-${rectId}`,
    kind: "rectangle",
    name: "Masked content card",
    transform: { x: 16, y: 16, rotation: 0 },
    size: { width: 64, height: 40 },
    style: { fill: "#38bdf8", stroke: "#0f172a", stroke_width: 2, opacity: 0.9 }
  });
});
