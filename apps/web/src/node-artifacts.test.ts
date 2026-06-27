import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { imageAssetIdsForNode, pdfForNode, svgForNode, type NodeArtifactAsset } from "./node-artifacts";

const pixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const nestedFrame: RendererNode = {
  id: "frame-1",
  kind: "frame",
  name: "Frame",
  transform: { x: 120, y: 80, rotation: 0 },
  size: { width: 240, height: 160 },
  style: { fill: "#f8fafc", stroke: "#94a3b8", stroke_width: 1, opacity: 1 },
  content: { type: "empty" },
  children: [
    {
      id: "text-1",
      kind: "text",
      name: "Nested headline",
      transform: { x: 24, y: 32, rotation: 0 },
      size: { width: 150, height: 32 },
      style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "text", value: "Nested headline", font_size: 18, font_family: "Inter" },
      children: []
    },
    {
      id: "rectangle-1",
      kind: "rectangle",
      name: "Nested swatch",
      transform: { x: 24, y: 84, rotation: 0 },
      size: { width: 96, height: 48 },
      style: { fill: "#dbeafe", stroke: "#1d4ed8", stroke_width: 2, opacity: 0.75 },
      content: { type: "empty" },
      children: []
    }
  ]
};

const imageNode: RendererNode = {
  id: "image-1",
  kind: "image",
  name: "Reference image",
  transform: { x: 16, y: 20, rotation: 0 },
  size: { width: 80, height: 48 },
  style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
  content: { type: "image", asset_id: "asset-pixel", natural_width: 1, natural_height: 1, fit_mode: "fit" },
  children: []
};

const imageAsset: NodeArtifactAsset = {
  assetId: "asset-pixel",
  mimeType: "image/png",
  dataBase64: pixelPngBase64,
  name: "pixel.png"
};

describe("node artifact exports", () => {
  test("renders selected frame SVG with nested child layers", () => {
    const svg = svgForNode(nestedFrame);

    expect(svg).toContain('data-node-id="frame-1"');
    expect(svg).toContain('data-node-id="text-1"');
    expect(svg).toContain('data-node-name="Nested headline"');
    expect(svg).toContain('transform="translate(24 32)"');
    expect(svg).toContain(">Nested headline</text>");
    expect(svg).toContain('data-node-id="rectangle-1"');
    expect(svg).toContain('data-node-name="Nested swatch"');
    expect(svg).toContain('fill="#dbeafe"');
    expect(svg).toContain('stroke="#1d4ed8"');
    expect(svg).toContain('opacity="0.75"');
  });

  test("renders selected frame PDF with nested child layer drawing commands", () => {
    const pdf = pdfForNode(nestedFrame);
    const pdfText = new TextDecoder().decode(pdf);

    expect(pdfText).toContain("%PDF-");
    expect(pdfText).toContain("/Title (Frame)");
    expect(pdfText).toContain("/Subject (frame-1)");
    expect(pdfText).toContain("(Nested headline) Tj");
    expect(pdfText).toContain("0.859 0.918 0.996 rg");
    expect(pdfText).toContain("24 28 96 48 re");
  });

  test("collects image asset ids from nested nodes", () => {
    expect(imageAssetIdsForNode({ ...nestedFrame, children: [...nestedFrame.children, imageNode] })).toEqual(["asset-pixel"]);
  });

  test("renders image nodes in SVG with embedded asset bytes", () => {
    const svg = svgForNode(imageNode, { assets: { "asset-pixel": imageAsset } });

    expect(svg).toContain("<image");
    expect(svg).toContain('data-node-id="image-1"');
    expect(svg).toContain('data-image-asset-id="asset-pixel"');
    expect(svg).toContain(`href="data:image/png;base64,${pixelPngBase64}"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).not.toContain('data-node-kind="image" x="0" y="0" width="80" height="48" rx="0"');
  });

  test("embeds image source bytes in selected-layer PDFs", () => {
    const pdf = pdfForNode(imageNode, { assets: { "asset-pixel": imageAsset } });
    const pdfText = new TextDecoder().decode(pdf);
    const pngSignature = Buffer.from(pixelPngBase64, "base64").subarray(0, 8);

    expect(pdfText).toContain("%PDF-");
    expect(pdfText).toContain("/EmbeddedFiles");
    expect(pdfText).toContain("/Type /EmbeddedFile");
    expect(pdfText).toContain("/Subtype /image#2Fpng");
    expect(Buffer.from(pdf).includes(pngSignature)).toBe(true);
  });
});
