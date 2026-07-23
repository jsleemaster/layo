import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { inspectCanvas } from "./agent-control";
import { exportDesignToCode } from "./code-export";
import { createZipArchive } from "./file-archive";
import { createHttpServer } from "./http";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

const fileId = "11111111-1111-1111-1111-111111111111";
const pageId = "22222222-2222-2222-2222-222222222222";
const frameId = "33333333-3333-3333-3333-333333333333";
const gradientRectId = "44444444-4444-4444-4444-444444444444";
const expectedPaintSources = [
  {
    origin: "penpot",
    kind: "fill",
    paintType: "gradient",
    index: 0,
    opacity: 0.6,
    blendMode: "multiply",
    gradient: {
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      width: 1,
      stops: [
        { color: "#ff0000", opacity: 1, offset: 0 },
        { color: "#0000ff", opacity: 1, offset: 1 }
      ]
    }
  },
  {
    origin: "penpot",
    kind: "stroke",
    paintType: "gradient",
    index: 0,
    opacity: 0.4,
    blendMode: "screen",
    gradient: {
      type: "linear",
      start: { x: 0, y: 1 },
      end: { x: 1, y: 1 },
      width: 0.5,
      stops: [
        { color: "#00ff00", opacity: 1, offset: 0 },
        { color: "#0000ff", opacity: 1, offset: 1 }
      ]
    }
  }
];

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function createPenpotPaintSourceArchive(): Buffer {
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          generatedBy: "penpot/test",
          files: [{ id: fileId, name: "Penpot Paint Source Board", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Paint Source Board" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Paint sources", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Paint source frame",
          type: "frame",
          x: 40,
          y: 64,
          width: 320,
          height: 160,
          fills: [{ "fill-color": "#ffffff", "fill-opacity": 1 }],
          shapes: [gradientRectId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${gradientRectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: gradientRectId,
          name: "Gradient paint card",
          type: "rect",
          x: 64,
          y: 88,
          width: 180,
          height: 72,
          fills: [
            {
              "fill-color-gradient": {
                type: "linear",
                "start-x": 0,
                "start-y": 0,
                "end-x": 1,
                "end-y": 0,
                width: 1,
                stops: [
                  { color: "#ff0000", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "fill-opacity": 0.6,
              "blend-mode": "multiply"
            }
          ],
          strokes: [
            {
              "stroke-color-gradient": {
                type: "linear",
                "start-x": 0,
                "start-y": 1,
                "end-x": 1,
                "end-y": 1,
                width: 0.5,
                stops: [
                  { color: "#00ff00", opacity: 1, offset: 0 },
                  { color: "#0000ff", opacity: 1, offset: 1 }
                ]
              },
              "stroke-opacity": 0.4,
              "stroke-width": 3,
              "blend-mode": "screen"
            }
          ]
        }),
        "utf8"
      )
    }
  ]);
}

test("preserves Penpot paint source metadata for agents and code handoff", () => {
  const archive = createPenpotPaintSourceArchive();

  const review = reviewExternalMigrationArchive(archive, { fileName: "paint-source.penpot" });
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
    fileName: "paint-source.penpot",
    fileId: "penpot-paint-source-imported-file"
  });

  expect(imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    mappedNodeCount: 2,
    skippedNodeCount: 0
  });
  const frame = imported.file.pages[0].children[0];
  const rect = frame.children[0] as any;
  expect(rect).toMatchObject({
    id: `penpot-${gradientRectId}`,
    kind: "rectangle",
    name: "Gradient paint card",
    style: {
      fill: "#800080",
      stroke: "#008080",
      stroke_width: 3,
      opacity: 1,
      fills: [
        {
          id: "penpot-fill-1",
          paint: {
            type: "gradient",
            gradient: {
              type: "linear",
              stops: [
                { color: "#ff0000", opacity: 1, offset: 0 },
                { color: "#0000ff", opacity: 1, offset: 1 }
              ]
            }
          },
          opacity: 0.6,
          visible: true,
          blend_mode: "multiply"
        }
      ]
    }
  });
  expect(rect.style.paint_sources).toBeUndefined();

  const inspection = inspectCanvas(imported.file);
  expect(inspection.nodes.find((node) => node.id === `penpot-${gradientRectId}`)?.fills).toEqual(
    rect.style.fills
  );

  const exported = exportDesignToCode(imported.file);
  const rootElement = exported.elements.find((element) => element.id === `penpot-${frameId}`);
  const rectStructure = rootElement?.structure.children.find((child) => child.id === `penpot-${gradientRectId}`) as any;
  expect(rectStructure?.style.fills).toEqual(rect.style.fills);
  expect(rectStructure?.style.paintSources).toBeUndefined();
  expect(rootElement?.jsModule).toContain('"fills"');
  expect(rootElement?.jsModule).toContain('"blend_mode": "multiply"');
  expect(rect.style.strokes?.[0]?.paint).toMatchObject({
    type: "gradient",
    gradient: {
      type: "linear",
      stops: [
        { color: "#00ff00", opacity: 1, offset: 0 },
        { color: "#0000ff", opacity: 1, offset: 1 }
      ]
    }
  });
  expect(rectStructure?.style.strokes?.[0]?.paint).toEqual(rect.style.strokes[0].paint);
});

test("persists Penpot paint source metadata through HTTP import", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  const server = createHttpServer(storage);
  const archive = createPenpotPaintSourceArchive();

  const imported = await server.inject({
    method: "POST",
    url: "/migrations/external/import",
    headers: { "idempotency-key": "external-migration-penpot-paint-source-1" },
    payload: {
      archiveBase64: archive.toString("base64"),
      fileName: "paint-source.penpot"
    }
  });

  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    source: "penpot",
    sourceLabel: "Penpot",
    assetCount: 0,
    mappedNodeCount: 2,
    skippedNodeCount: 0,
    project: { name: "Penpot Paint Source Board" },
    file: { name: "Penpot Paint Source Board", pages: [{ name: "Paint sources" }] }
  });

  const projects = await storage.listProjects();
  const persisted = await storage.readFile(projects[0].currentDocumentId);
  const frame = persisted.pages[0].children[0];
  const rect = frame.children[0] as any;
  expect(rect).toMatchObject({
    id: `penpot-${gradientRectId}`,
    kind: "rectangle",
    name: "Gradient paint card",
    style: {
      fill: "#800080",
      stroke: "#008080",
      stroke_width: 3,
      opacity: 1,
      fills: [
        {
          id: "penpot-fill-1",
          paint: {
            type: "gradient",
            gradient: {
              type: "linear",
              stops: [
                { color: "#ff0000", opacity: 1, offset: 0 },
                { color: "#0000ff", opacity: 1, offset: 1 }
              ]
            }
          },
          opacity: 0.6,
          visible: true,
          blend_mode: "multiply"
        }
      ]
    }
  });
  expect(rect.style.fills).toMatchObject([
    {
      id: "penpot-fill-1",
      paint: { type: "gradient" },
      opacity: 0.6,
      blend_mode: "multiply"
    }
  ]);
  expect(rect.style.paint_sources).toBeUndefined();
});
