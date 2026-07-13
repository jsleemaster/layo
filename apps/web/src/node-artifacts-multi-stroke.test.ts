import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const multiStrokeNode: RendererNode = {
  id: "multi-stroke-rect",
  kind: "rectangle",
  name: "Ordered multi-stroke rectangle",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 60 },
  style: {
    fill: "#ffffff",
    stroke: "#2563eb",
    stroke_width: 2,
    opacity: 1,
    strokes: [
      {
        id: "outer",
        color: "#ef4444",
        opacity: 0.5,
        width: 8,
        position: "outside",
        style: "dashed",
        visible: true,
        dasharray: [8, 4],
        cap: "round",
        join: "round",
        start_marker: "none",
        end_marker: "none"
      },
      {
        id: "inner",
        color: "#2563eb",
        opacity: 1,
        width: 2,
        position: "inside",
        style: "solid",
        visible: true,
        dasharray: [],
        cap: "butt",
        join: "miter",
        start_marker: "none",
        end_marker: "none"
      },
      {
        id: "hidden",
        color: "#22c55e",
        opacity: 1,
        width: 20,
        position: "center",
        style: "solid",
        visible: false,
        dasharray: [],
        cap: "butt",
        join: "miter",
        start_marker: "none",
        end_marker: "none"
      }
    ]
  },
  content: { type: "empty" },
  children: []
};

describe("first-class multi-stroke artifacts", () => {
  test("renders ordered visible strokes with per-stroke geometry and opacity in SVG", () => {
    const svg = svgForNode(multiStrokeNode);

    expect(svg).toContain('viewBox="-8 -8 116 76"');
    expect(svg.indexOf('data-stroke-id="outer"')).toBeLessThan(svg.indexOf('data-stroke-id="inner"'));
    expect(svg).toContain('stroke="#ef4444"');
    expect(svg).toContain('stroke-opacity="0.5"');
    expect(svg).toContain('stroke-width="8"');
    expect(svg).toContain('stroke-dasharray="8 4"');
    expect(svg).toContain('data-stroke-position="outside"');
    expect(svg).toContain('data-stroke-position="inside"');
    expect(svg).not.toContain('data-stroke-id="hidden"');
    expect(svg).not.toContain("#22c55e");
  });

  test("renders each visible stroke as a distinct PDF paint pass", () => {
    const pdfText = new TextDecoder().decode(pdfForNode(multiStrokeNode));

    expect(pdfText).toContain("% Layo stroke outer outside");
    expect(pdfText).toContain("% Layo stroke inner inside");
    expect(pdfText.indexOf("% Layo stroke outer outside")).toBeLessThan(
      pdfText.indexOf("% Layo stroke inner inside")
    );
    expect(pdfText).toContain("/CA 0.5");
    expect(pdfText).not.toContain("% Layo stroke hidden");
  });
});
