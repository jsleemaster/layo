import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const clippedGroup: RendererNode = {
  id: "masked-group",
  kind: "group",
  name: "Masked group",
  clip: { type: "bounds" },
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 60 },
  style: { fill: "#ffffff", stroke: null, stroke_width: 0, opacity: 1 },
  content: { type: "empty" },
  children: [
    {
      id: "oversized-child",
      kind: "rectangle",
      name: "Oversized child",
      transform: { x: 40, y: 20, rotation: 0 },
      size: { width: 90, height: 70 },
      style: { fill: "#38bdf8", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    }
  ]
};

const polygonClippedGroup: RendererNode = {
  ...clippedGroup,
  id: "polygon-masked-group",
  name: "Polygon masked group",
  clip: {
    type: "bounds",
    source: {
      origin: "penpot",
      shapeId: "penpot-mask-shape",
      name: "Diamond mask",
      shapeType: "path",
      bounds: { x: 10, y: 20, width: 100, height: 60 },
      opacity: 0.72,
      points: [
        { x: 60, y: 20 },
        { x: 110, y: 50 },
        { x: 60, y: 80 },
        { x: 10, y: 50 }
      ]
    }
  }
};

function pdfTextForNode(node: RendererNode) {
  return new TextDecoder().decode(pdfForNode(node));
}

describe("clipped node artifact exports", () => {
  test("renders selected clipped groups with bounded viewBox and SVG clipPath", () => {
    const svg = svgForNode(clippedGroup);

    expect(svg).toContain('viewBox="0 0 100 60"');
    expect(svg).toContain('<clipPath id="layo-clip-masked-group">');
    expect(svg).toContain('<rect x="0" y="0" width="100" height="60" />');
    expect(svg).toContain('clip-path="url(#layo-clip-masked-group)"');
    expect(svg).toContain('data-node-id="oversized-child"');
    expect(svg).toContain('transform="translate(40 20)"');
  });

  test("renders Penpot polygon mask source points as SVG clipPath polygons", () => {
    const svg = svgForNode(polygonClippedGroup);

    expect(svg).toContain('viewBox="0 0 100 60"');
    expect(svg).toContain('<clipPath id="layo-clip-polygon-masked-group">');
    expect(svg).toContain('<polygon points="50,0 100,30 50,60 0,30" />');
    expect(svg).not.toContain('<rect x="0" y="0" width="100" height="60" />');
    expect(svg).toContain('clip-path="url(#layo-clip-polygon-masked-group)"');
    expect(svg).toContain('data-node-id="oversized-child"');
    expect(svg).toContain('transform="translate(40 20)"');
  });

  test("renders bounds-clipped groups as PDF clipping scopes", () => {
    const pdf = pdfTextForNode(clippedGroup);

    expect(pdf).toContain(["q", "0 0 100 60 re", "W", "n"].join("\n"));
    expect(pdf).toContain("40 -30 90 70 re");
  });

  test("renders Penpot polygon mask source points as PDF clipping paths", () => {
    const pdf = pdfTextForNode(polygonClippedGroup);

    expect(pdf).toContain(["q", "50 60 m", "100 30 l", "50 0 l", "0 30 l", "h", "W", "n"].join("\n"));
    expect(pdf).not.toContain(["0 0 100 60 re", "W", "n"].join("\n"));
    expect(pdf).toContain("40 -30 90 70 re");
  });
});
