import { describe, expect, test } from "vitest";
import type { NodeStroke, RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

function stroke(id: string, position: NodeStroke["position"], width: number): NodeStroke {
  return {
    id,
    color: position === "inside" ? "#2563eb" : "#ef4444",
    opacity: 1,
    width,
    position,
    style: "dashed",
    visible: true,
    dasharray: [6, 3],
    cap: "round",
    join: "round",
    start_marker: "none",
    end_marker: "none"
  };
}

const closedCompoundPath: RendererNode = {
  id: "compound-path",
  kind: "path",
  name: "Closed compound path",
  transform: { x: 12, y: 18, rotation: 27 },
  size: { width: 120, height: 100 },
  style: {
    fill: "#ffffff",
    stroke: null,
    stroke_width: 0,
    opacity: 1,
    strokes: [stroke("outside", "outside", 4), stroke("inside", "inside", 6)]
  },
  content: {
    type: "path",
    path_data: "M 10 50 C 10 20 35 10 60 10 C 95 10 110 30 110 50 C 110 80 85 90 60 90 C 25 90 10 70 10 50 Z M 45 50 C 45 40 52 35 60 35 C 70 35 77 42 77 50 C 77 60 70 65 60 65 C 50 65 45 58 45 50 Z",
    fill_rule: "evenodd"
  },
  children: []
};

const openPath: RendererNode = {
  ...closedCompoundPath,
  id: "open-path",
  name: "Open cubic path",
  style: {
    ...closedCompoundPath.style,
    strokes: [stroke("requested-outside", "outside", 5)]
  },
  content: {
    type: "path",
    path_data: "M 10 80 C 35 10 85 10 110 80",
    fill_rule: "nonzero"
  }
};

describe("closed path stroke alignment", () => {
  test("clips doubled SVG stroke passes to the inside and outside of an even-odd path", () => {
    const svg = svgForNode(closedCompoundPath);

    expect(svg).toContain('<clipPath id="layo-stroke-clip-compound-path-inside">');
    expect(svg).toContain('<mask id="layo-stroke-mask-compound-path-outside"');
    expect(svg).toContain('clip-rule="evenodd"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('data-stroke-id="inside"');
    expect(svg).toContain('data-stroke-id="outside"');
    expect(svg).toContain('data-effective-stroke-position="inside"');
    expect(svg).toContain('data-effective-stroke-position="outside"');
    expect(svg).toContain('stroke-width="12"');
    expect(svg).toContain('stroke-width="8"');
    expect(svg).toContain('clip-path="url(#layo-stroke-clip-compound-path-inside)"');
    expect(svg).toContain('mask="url(#layo-stroke-mask-compound-path-outside)"');
  });

  test("uses even-odd PDF clipping before doubled aligned stroke paint passes", () => {
    const pdf = new TextDecoder().decode(pdfForNode(closedCompoundPath));

    expect(pdf).toContain("% Layo aligned path stroke outside");
    expect(pdf).toContain("% Layo aligned path stroke inside");
    expect(pdf).toContain("8 w");
    expect(pdf).toContain("12 w");
    expect(pdf).toContain("W*");
    expect(pdf.indexOf("% Layo aligned path stroke outside")).toBeLessThan(
      pdf.indexOf("% Layo aligned path stroke inside")
    );
  });

  test("normalizes unsupported inside or outside alignment on open paths to center", () => {
    const svg = svgForNode(openPath);
    const pdf = new TextDecoder().decode(pdfForNode(openPath));

    expect(svg).toContain('data-stroke-position="outside"');
    expect(svg).toContain('data-effective-stroke-position="center"');
    expect(svg).toContain('stroke-width="5"');
    expect(svg).not.toContain("layo-stroke-clip-open-path");
    expect(svg).not.toContain("layo-stroke-mask-open-path");
    expect(pdf).toContain("% Layo stroke requested-outside center");
    expect(pdf).not.toContain("% Layo aligned path stroke");
  });
});
