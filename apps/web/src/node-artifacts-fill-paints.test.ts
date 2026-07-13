import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const pixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const paintedNode = {
  id: "painted-fills",
  kind: "rectangle",
  name: "Painted fills",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 80 },
  style: {
    fill: "#ffffff",
    stroke: null,
    stroke_width: 0,
    opacity: 1,
    fills: [
      {
        id: "solid",
        color: "#111827",
        paint: { type: "solid", color: "#111827" },
        opacity: 0.8,
        visible: true,
        blend_mode: "normal"
      },
      {
        id: "gradient",
        color: "#ef4444",
        paint: {
          type: "gradient",
          gradient: {
            type: "linear",
            start: { x: 0, y: 0.5 },
            end: { x: 1, y: 0.5 },
            stops: [
              { color: "#ef4444", opacity: 1, offset: 0 },
              { color: "#2563eb", opacity: 1, offset: 1 }
            ]
          }
        },
        opacity: 1,
        visible: true,
        blend_mode: "multiply"
      },
      {
        id: "image",
        color: "#ffffff",
        paint: { type: "image", asset_id: "asset-fill-texture" },
        opacity: 0.6,
        visible: true,
        blend_mode: "screen"
      }
    ]
  },
  content: { type: "empty" },
  children: []
} as unknown as RendererNode;

const options = {
  assets: {
    "asset-fill-texture": {
      assetId: "asset-fill-texture",
      mimeType: "image/png",
      dataBase64: pixelPngBase64,
      name: "fill-texture.png"
    }
  }
};

describe("first-class fill paint artifacts", () => {
  test("keeps ordered solid, gradient, and image paints as separate SVG fill passes", () => {
    const svg = svgForNode(paintedNode, options);

    expect(svg).toContain('id="layo-fill-gradient-painted-fills-gradient"');
    expect(svg).toContain('id="layo-fill-pattern-painted-fills-image"');
    expect(svg).toContain('data-fill-id="solid" data-fill-paint="solid"');
    expect(svg).toContain('data-fill-id="gradient" data-fill-paint="gradient"');
    expect(svg).toContain('fill="url(#layo-fill-gradient-painted-fills-gradient)"');
    expect(svg).toContain('data-fill-id="image" data-fill-paint="image"');
    expect(svg).toContain('fill="url(#layo-fill-pattern-painted-fills-image)"');
    expect(svg.indexOf('data-fill-id="solid"')).toBeLessThan(svg.indexOf('data-fill-id="gradient"'));
    expect(svg.indexOf('data-fill-id="gradient"')).toBeLessThan(svg.indexOf('data-fill-id="image"'));
  });

  test("emits ordered solid, gradient, and image resources in PDF", () => {
    const pdf = new TextDecoder().decode(pdfForNode(paintedNode, options));

    expect(pdf).toContain("% Layo fill paint solid solid");
    expect(pdf).toContain("% Layo fill paint gradient gradient");
    expect(pdf).toContain("% Layo fill paint image image");
    expect(pdf).toContain("/Shading");
    expect(pdf).toContain("/Pattern");
    expect(pdf).toContain("/Image");
    expect(pdf).toContain("/BM /Multiply");
    expect(pdf).toContain("/BM /Screen");
    expect(pdf).toContain("/ca 0.8");
    expect(pdf).toContain("/ca 0.6");
    expect(pdf.indexOf("% Layo fill paint solid solid")).toBeLessThan(
      pdf.indexOf("% Layo fill paint gradient gradient")
    );
    expect(pdf.indexOf("% Layo fill paint gradient gradient")).toBeLessThan(
      pdf.indexOf("% Layo fill paint image image")
    );
  });
});
