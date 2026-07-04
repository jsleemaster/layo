import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { createHttpServer } from "./http";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function createBasicPenpotExportArchive(): Buffer {
  const fileId = "11111111-1111-1111-1111-111111111111";
  const pageId = "22222222-2222-2222-2222-222222222222";
  const frameId = "33333333-3333-3333-3333-333333333333";
  const rectId = "44444444-4444-4444-4444-444444444444";
  const textId = "55555555-5555-5555-5555-555555555555";
  return createZipArchive([
    {
      path: "manifest.json",
      data: Buffer.from(
        JSON.stringify({
          type: "penpot/export-files",
          version: 1,
          files: [{ id: fileId, name: "Penpot Landing", features: [] }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}.json`,
      data: Buffer.from(JSON.stringify({ id: fileId, name: "Penpot Landing" }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}.json`,
      data: Buffer.from(JSON.stringify({ id: pageId, name: "Landing", index: 0, objects: {} }), "utf8")
    },
    {
      path: `files/${fileId}/pages/${pageId}/${frameId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: frameId,
          name: "Hero frame",
          type: "frame",
          x: 80,
          y: 96,
          width: 320,
          height: 180,
          fills: [{ fillColor: "#ffffff", fillOpacity: 1 }],
          shapes: [rectId, textId]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${rectId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: rectId,
          name: "CTA background",
          type: "rect",
          x: 104,
          y: 122,
          width: 180,
          height: 56,
          fills: [{ fillColor: "#1a334d", fillOpacity: 1 }]
        }),
        "utf8"
      )
    },
    {
      path: `files/${fileId}/pages/${pageId}/${textId}.json`,
      data: Buffer.from(
        JSON.stringify({
          id: textId,
          name: "Headline",
          type: "text",
          x: 124,
          y: 144,
          width: 220,
          height: 32,
          content: "Imported from Penpot",
          fontSize: 18,
          fontFamily: "Inter",
          fills: [{ fillColor: "#111827", fillOpacity: 1 }]
        }),
        "utf8"
      )
    }
  ]);
}

describe("Penpot external migration HTTP routes", () => {
  test("reviews and imports Penpot v3 ZIP exports into a fresh project", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const server = createHttpServer(storage);
    const archive = createBasicPenpotExportArchive();

    const review = await server.inject({
      method: "POST",
      url: "/migrations/external/review",
      payload: {
        archiveBase64: archive.toString("base64"),
        fileName: "landing.penpot"
      }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().review).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      archiveKind: "zip",
      canImport: true,
      blockedBy: [],
      documentCandidateCount: 2
    });

    const imported = await server.inject({
      method: "POST",
      url: "/migrations/external/import",
      payload: {
        archiveBase64: archive.toString("base64"),
        fileName: "landing.penpot"
      }
    });

    expect(imported.statusCode).toBe(200);
    const body = imported.json();
    expect(body.imported).toMatchObject({
      source: "penpot",
      sourceLabel: "Penpot",
      mappedNodeCount: 3,
      skippedNodeCount: 0,
      project: { name: "Penpot Landing" },
      file: { name: "Penpot Landing", pages: [{ name: "Landing" }] }
    });
    const projects = await storage.listProjects();
    expect(projects).toHaveLength(1);
    const persisted = await storage.readFile(projects[0].currentDocumentId);
    const frame = persisted.pages[0].children[0];
    expect(frame).toMatchObject({ name: "Hero frame", kind: "frame" });
    expect(frame.children.map((node) => node.name)).toEqual(["CTA background", "Headline"]);
    expect(frame.children[1]).toMatchObject({
      kind: "text",
      content: { type: "text", value: "Imported from Penpot", font_size: 18, font_family: "Inter" }
    });
  });
});
