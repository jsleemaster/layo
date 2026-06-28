import { describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { reviewExternalMigrationArchive } from "./external-migration";

describe("external design migration preflight", () => {
  test("reviews a Penpot-style ZIP without writing imported files", () => {
    const archive = createZipArchive([
      {
        path: "manifest.json",
        data: Buffer.from(JSON.stringify({ source: "penpot", name: "Team kit" }), "utf8")
      },
      {
        path: "files/home.json",
        data: Buffer.from(
          JSON.stringify({
            name: "Home",
            pages: [{ id: "page-1", name: "Page 1" }],
            shapes: [{ id: "frame-1", type: "frame" }, { id: "text-1", type: "text" }]
          }),
          "utf8"
        )
      },
      { path: "assets/logo.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
    ]);

    const review = reviewExternalMigrationArchive(archive, { fileName: "team-kit.penpot" });

    expect(review).toMatchObject({
      schemaVersion: 1,
      source: "penpot",
      sourceLabel: "Penpot",
      archiveKind: "zip",
      canImport: false,
      entryCount: 3,
      assetCount: 1,
      documentCandidateCount: 2,
      blockedBy: expect.arrayContaining(["mapping_not_implemented"])
    });
    expect(review.entries.map((entry) => [entry.path, entry.kind])).toEqual([
      ["assets/logo.png", "asset"],
      ["files/home.json", "document"],
      ["manifest.json", "manifest"]
    ]);
    expect(review.nextSteps.join(" ")).toContain("Penpot");
  });

  test("reviews a Figma REST file JSON and keeps import blocked until mapping exists", () => {
    const figmaFile = Buffer.from(
      JSON.stringify({
        name: "Figma landing",
        document: {
          id: "0:0",
          name: "Document",
          type: "DOCUMENT",
          children: [
            {
              id: "1:1",
              name: "Page 1",
              type: "CANVAS",
              children: [{ id: "2:1", name: "Hero", type: "FRAME", children: [] }]
            }
          ]
        },
        components: {},
        styles: {}
      }),
      "utf8"
    );

    const review = reviewExternalMigrationArchive(figmaFile, { fileName: "landing.figma.json" });

    expect(review).toMatchObject({
      source: "figma",
      sourceLabel: "Figma",
      archiveKind: "json",
      canImport: false,
      documentCandidateCount: 1,
      blockedBy: expect.arrayContaining(["mapping_not_implemented", "figma_images_required"])
    });
    expect(review.documentCandidates[0]).toMatchObject({
      name: "Figma landing",
      path: "landing.figma.json",
      pageCount: 1,
      nodeCount: 3
    });
  });

  test("rejects opaque Figma binaries with a concrete REST-export next step", () => {
    const review = reviewExternalMigrationArchive(Buffer.from("opaque fig binary"), { fileName: "draft.fig" });

    expect(review).toMatchObject({
      source: "figma",
      archiveKind: "binary",
      canImport: false,
      blockedBy: expect.arrayContaining(["figma_api_json_required"])
    });
    expect(review.warnings.join(" ")).toContain("binary");
    expect(review.nextSteps.join(" ")).toContain("GET /v1/files/:key");
  });
});
