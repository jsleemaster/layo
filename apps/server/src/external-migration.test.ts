import { describe, expect, test } from "vitest";
import { createZipArchive } from "./file-archive";
import { importExternalMigrationArchive, reviewExternalMigrationArchive } from "./external-migration";

const pixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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

  test("reviews a Figma REST file JSON as importable when basic node mapping is available", () => {
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
      canImport: true,
      documentCandidateCount: 1,
      blockedBy: []
    });
    expect(review.documentCandidates[0]).toMatchObject({
      name: "Figma landing",
      path: "landing.figma.json",
      pageCount: 1,
      nodeCount: 3
    });
  });

  test("imports basic Figma REST JSON into a Layo design file", () => {
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
              children: [
                {
                  id: "2:1",
                  name: "Hero",
                  type: "FRAME",
                  absoluteBoundingBox: { x: 100, y: 200, width: 360, height: 240 },
                  fills: [
                    { type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 }, opacity: 1 }
                  ],
                  children: [
                    {
                      id: "3:1",
                      name: "CTA background",
                      type: "RECTANGLE",
                      absoluteBoundingBox: { x: 120, y: 230, width: 180, height: 56 },
                      fills: [
                        { type: "SOLID", visible: true, color: { r: 0.1, g: 0.2, b: 0.3 }, opacity: 1 }
                      ],
                      strokes: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
                      strokeWeight: 2
                    },
                    {
                      id: "4:1",
                      name: "Headline",
                      type: "TEXT",
                      characters: "Imported headline",
                      absoluteBoundingBox: { x: 144, y: 260, width: 220, height: 32 },
                      fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
                      style: { fontSize: 18, fontFamily: "Inter" }
                    },
                    {
                      id: "5:1",
                      name: "Unsupported vector",
                      type: "LINE",
                      absoluteBoundingBox: { x: 100, y: 100, width: 20, height: 1 }
                    }
                  ]
                }
              ]
            }
          ]
        }
      }),
      "utf8"
    );

    const imported = importExternalMigrationArchive(figmaFile, {
      fileName: "landing.figma.json",
      fileId: "figma-imported-file"
    });

    expect(imported).toMatchObject({
      source: "figma",
      sourceLabel: "Figma",
      mappedNodeCount: 3,
      skippedNodeCount: 1
    });
    expect(imported.warnings.join(" ")).toContain("LINE");
    expect(imported.file).toMatchObject({
      id: "figma-imported-file",
      name: "Figma landing",
      pages: [{ name: "Page 1" }]
    });
    const frame = imported.file.pages[0].children[0];
    expect(frame).toMatchObject({
      id: "figma-2-1",
      kind: "frame",
      name: "Hero",
      transform: { x: 100, y: 200, rotation: 0 },
      size: { width: 360, height: 240 },
      style: { fill: "#ffffff" }
    });
    expect(frame.children[0]).toMatchObject({
      id: "figma-3-1",
      kind: "rectangle",
      name: "CTA background",
      transform: { x: 20, y: 30, rotation: 0 },
      size: { width: 180, height: 56 },
      style: { fill: "#1a334d", stroke: "#000000", stroke_width: 2 }
    });
    expect(frame.children[1]).toMatchObject({
      id: "figma-4-1",
      kind: "text",
      name: "Headline",
      transform: { x: 44, y: 60, rotation: 0 },
      size: { width: 220, height: 32 },
      content: { type: "text", value: "Imported headline", font_size: 18, font_family: "Inter" }
    });
  });

  test("imports Figma JSON packages with image fills as image nodes", () => {
    const pngBytes = Buffer.from(pixelPngBase64, "base64");
    const figmaJson = {
      name: "Figma image landing",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:1",
                name: "Hero",
                type: "FRAME",
                absoluteBoundingBox: { x: 80, y: 96, width: 320, height: 180 },
                children: [
                  {
                    id: "3:1",
                    name: "Hero image",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 104, y: 122, width: 180, height: 96 },
                    fills: [
                      {
                        type: "IMAGE",
                        visible: true,
                        imageRef: "figma-image-hero",
                        scaleMode: "FILL"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    };
    const archive = createZipArchive([
      { path: "figma-file.json", data: Buffer.from(JSON.stringify(figmaJson), "utf8") },
      { path: "assets/figma-image-hero.png", data: pngBytes }
    ]);

    const review = reviewExternalMigrationArchive(archive, { fileName: "figma-image-package.zip" });

    expect(review).toMatchObject({
      source: "figma",
      sourceLabel: "Figma",
      archiveKind: "zip",
      canImport: true,
      assetCount: 1,
      documentCandidateCount: 1,
      blockedBy: []
    });
    expect(review.assetCandidates[0]).toMatchObject({
      path: "assets/figma-image-hero.png",
      mediaType: "image/png",
      bytes: pngBytes.length
    });

    const imported = importExternalMigrationArchive(archive, {
      fileName: "figma-image-package.zip",
      fileId: "figma-image-imported-file"
    });

    expect(imported).toMatchObject({
      source: "figma",
      sourceLabel: "Figma",
      mappedNodeCount: 2,
      skippedNodeCount: 0
    });
    const image = imported.file.pages[0].children[0].children[0];
    expect(image).toMatchObject({
      id: "figma-3-1",
      kind: "image",
      name: "Hero image",
      transform: { x: 24, y: 26, rotation: 0 },
      size: { width: 180, height: 96 },
      style: { fill: "#f3f4f6", stroke: null, stroke_width: 0 },
      content: {
        type: "image",
        asset_id: "figma-asset-figma-image-hero",
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
    expect(imported.importedAssets).toHaveLength(1);
    expect(imported.importedAssets[0].metadata).toMatchObject({
      assetId: "figma-asset-figma-image-hero",
      name: "figma-image-hero.png",
      mimeType: "image/png",
      byteLength: pngBytes.length,
      url: "/assets/figma-asset-figma-image-hero"
    });
    expect(imported.importedAssets[0].data.equals(pngBytes)).toBe(true);
  });

  test("does not mark Figma ZIP packages without CANVAS pages as importable", () => {
    const figmaJson = {
      name: "Empty Figma",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: []
      }
    };
    const archive = createZipArchive([
      { path: "figma-file.json", data: Buffer.from(JSON.stringify(figmaJson), "utf8") }
    ]);

    const review = reviewExternalMigrationArchive(archive, { fileName: "empty-figma.zip", sourceHint: "figma" });

    expect(review).toMatchObject({
      source: "figma",
      archiveKind: "zip",
      canImport: false,
      documentCandidateCount: 1,
      blockedBy: expect.arrayContaining(["mapping_not_implemented"])
    });
    expect(review.documentCandidates[0]).toMatchObject({ pageCount: 0 });
    expect(() => importExternalMigrationArchive(archive, { fileName: "empty-figma.zip", sourceHint: "figma" })).toThrow(/CANVAS pages/);
  });

  test("preserves packaged frame image fills as background image nodes", () => {
    const pngBytes = Buffer.from(pixelPngBase64, "base64");
    const figmaJson = {
      name: "Figma frame image landing",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:1",
                name: "Hero frame",
                type: "FRAME",
                absoluteBoundingBox: { x: 80, y: 96, width: 320, height: 180 },
                fills: [{ type: "IMAGE", visible: true, imageRef: "figma-frame-bg", scaleMode: "FILL" }],
                children: [
                  {
                    id: "3:1",
                    name: "Headline",
                    type: "TEXT",
                    characters: "Frame keeps children",
                    absoluteBoundingBox: { x: 120, y: 136, width: 180, height: 32 }
                  }
                ]
              }
            ]
          }
        ]
      }
    };
    const archive = createZipArchive([
      { path: "figma-file.json", data: Buffer.from(JSON.stringify(figmaJson), "utf8") },
      { path: "assets/figma-frame-bg.png", data: pngBytes }
    ]);

    const imported = importExternalMigrationArchive(archive, {
      fileName: "figma-frame-image-package.zip",
      fileId: "figma-frame-image-imported-file"
    });

    const frame = imported.file.pages[0].children[0];
    expect(frame).toMatchObject({
      id: "figma-2-1",
      kind: "frame",
      name: "Hero frame",
      size: { width: 320, height: 180 }
    });
    expect(frame.children[0]).toMatchObject({
      id: "figma-2-1-image-fill",
      kind: "image",
      name: "Hero frame image fill",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 320, height: 180 },
      content: {
        type: "image",
        asset_id: "figma-asset-figma-frame-bg",
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fill"
      }
    });
    expect(frame.children[1]).toMatchObject({
      id: "figma-3-1",
      kind: "text",
      name: "Headline",
      transform: { x: 40, y: 40, rotation: 0 }
    });
    expect(imported.importedAssets).toHaveLength(1);
    expect(imported.importedAssets[0].metadata.assetId).toBe("figma-asset-figma-frame-bg");
  });

  test("ignores asset entries while discovering Figma package documents", () => {
    const figmaJson = {
      name: "Asset nested Figma",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [{ id: "1:1", name: "Page 1", type: "CANVAS", children: [] }]
      }
    };
    const archive = createZipArchive([
      { path: "assets/figma-file.json", data: Buffer.from(JSON.stringify(figmaJson), "utf8") },
      { path: "assets/figma-image-hero.png", data: Buffer.from(pixelPngBase64, "base64") }
    ]);

    const review = reviewExternalMigrationArchive(archive, { fileName: "assets-only.zip", sourceHint: "figma" });

    expect(review).toMatchObject({
      source: "figma",
      archiveKind: "zip",
      canImport: false,
      documentCandidateCount: 0,
      assetCount: 2
    });
    expect(() => importExternalMigrationArchive(archive, { fileName: "assets-only.zip", sourceHint: "figma" })).toThrow(/Only Figma REST JSON/);
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
