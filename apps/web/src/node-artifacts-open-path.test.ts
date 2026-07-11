import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const openStrokePath: RendererNode = {
  id: "open-stroke-path",
  kind: "path",
  name: "Open stroke path",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 50 },
  style: {
    fill: "transparent",
    stroke: "#0f172a",
    stroke_width: 8,
    stroke_cap: "round",
    stroke_join: "bevel",
    stroke_dasharray: [12, 6],
    stroke_start_marker: "circle",
    stroke_end_marker: "triangle",
    opacity: 1
  },
  content: {
    type: "path",
    path_data: "M0 25 C25 0 75 50 100 25",
    fill_rule: "nonzero"
  },
  children: []
};

describe("open path stroke artifacts", () => {
  test("emits SVG cap join dash and endpoint markers", () => {
    const svg = svgForNode(openStrokePath);

    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="bevel"');
    expect(svg).toContain('stroke-dasharray="12 6"');
    expect(svg).toContain('marker-start="url(#layo-marker-open-stroke-path-start-circle)"');
    expect(svg).toContain('marker-end="url(#layo-marker-open-stroke-path-end-triangle)"');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<path');
  });

  test("emits PDF cap join dash operators and marker geometry metadata", () => {
    const pdf = new TextDecoder().decode(pdfForNode(openStrokePath));

    expect(pdf).toContain("1 J");
    expect(pdf).toContain("2 j");
    expect(pdf).toContain("[12 6] 0 d");
    expect(pdf).toContain("% Layo stroke marker start circle");
    expect(pdf).toContain("% Layo stroke marker end triangle");
  });
});
