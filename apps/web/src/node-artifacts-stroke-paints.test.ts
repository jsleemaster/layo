import { describe, expect, test } from "vitest";
import type { NodeStroke, RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const pixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function stroke(id: string, paint: unknown): NodeStroke {
  return {
    id,
    color: "#111827",
    opacity: 1,
    width: 8,
    position: "center",
    style: "solid",
    visible: true,
    dasharray: [],
    cap: "round",
    join: "round",
    start_marker: "none",
    end_marker: "none",
    paint
  } as unknown as NodeStroke;
}

const paintedNode: RendererNode = {
  id: "painted-strokes",
  kind: "rectangle",
  name: "Painted strokes",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 80 },
  style: {
    fill: "#ffffff",
    stroke: null,
    stroke_width: 0,
    opacity: 1,
    strokes: [
      stroke("solid", { type: "solid", color: "#111827" }),
      stroke("gradient", {
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
      }),
      stroke("image", { type: "image", asset_id: "asset-border-texture" })
    ]
  },
  content: { type: "empty" },
  children: []
};

const options = {
  assets: {
    "asset-border-texture": {
      assetId: "asset-border-texture",
      mimeType: "image/png",
      dataBase64: pixelPngBase64,
      name: "border-texture.png"
    }
  }
};

describe("first-class stroke paint artifacts", () => {
  test("keeps solid, gradient, and image paints attached to their SVG stroke passes", () => {
    const svg = svgForNode(paintedNode, options);

    expect(svg).toContain('id="layo-stroke-gradient-painted-strokes-gradient"');
    expect(svg).toContain('id="layo-stroke-pattern-painted-strokes-image"');
    expect(svg).toContain('data-stroke-id="solid" data-stroke-paint="solid"');
    expect(svg).toContain('data-stroke-id="gradient" data-stroke-paint="gradient"');
    expect(svg).toContain('stroke="url(#layo-stroke-gradient-painted-strokes-gradient)"');
    expect(svg).toContain('data-stroke-id="image" data-stroke-paint="image"');
    expect(svg).toContain('stroke="url(#layo-stroke-pattern-painted-strokes-image)"');
    expect(svg.indexOf('data-stroke-id="solid"')).toBeLessThan(svg.indexOf('data-stroke-id="gradient"'));
    expect(svg.indexOf('data-stroke-id="gradient"')).toBeLessThan(svg.indexOf('data-stroke-id="image"'));
  });

  test("emits separate gradient shading and image pattern PDF stroke passes", () => {
    const pdf = new TextDecoder().decode(pdfForNode(paintedNode, options));

    expect(pdf).toContain("% Layo stroke paint solid solid");
    expect(pdf).toContain("% Layo stroke paint gradient gradient");
    expect(pdf).toContain("% Layo stroke paint image image");
    expect(pdf).toContain("/Shading");
    expect(pdf).toContain("/Pattern");
    expect(pdf).toContain("/Image");
    expect(pdf.indexOf("% Layo stroke paint solid solid")).toBeLessThan(
      pdf.indexOf("% Layo stroke paint gradient gradient")
    );
    expect(pdf.indexOf("% Layo stroke paint gradient gradient")).toBeLessThan(
      pdf.indexOf("% Layo stroke paint image image")
    );
  });
});
