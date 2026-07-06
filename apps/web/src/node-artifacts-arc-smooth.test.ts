import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode } from "./node-artifacts";

const penpotArcSmoothPathData = "M 10 50 A 30 20 0 0 1 70 50 S 100 20 110 50 Q 125 80 140 50 T 170 50 Z";

const penpotRadialArcSmoothPathGradientShape: RendererNode = {
  id: "penpot-radial-arc-smooth-path-gradient-artifact-shape",
  kind: "rectangle",
  name: "Penpot radial arc smooth path gradient artifact shape",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 180, height: 100 },
  clip: {
    type: "bounds",
    source: {
      origin: "penpot",
      shapeId: "penpot-source-arc-smooth-path",
      name: "Penpot source arc smooth path",
      shapeType: "path",
      bounds: { x: 0, y: 0, width: 180, height: 100 },
      pathData: penpotArcSmoothPathData
    }
  },
  style: {
    fill: "#800080",
    stroke: "#111827",
    stroke_width: 2,
    opacity: 1,
    paint_sources: [
      {
        origin: "penpot",
        kind: "fill",
        paintType: "gradient",
        index: 0,
        opacity: 1,
        blendMode: "normal",
        gradient: {
          type: "radial",
          start: { x: 0.5, y: 0.5 },
          end: { x: 1, y: 0.5 },
          width: 1,
          stops: [
            { color: "#ff0000", opacity: 1, offset: 0 },
            { color: "#0000ff", opacity: 1, offset: 1 }
          ]
        }
      }
    ]
  },
  content: { type: "empty" },
  children: []
};

function pdfTextForNode(node: RendererNode) {
  return new TextDecoder().decode(pdfForNode(node));
}

describe("Penpot arc and smooth path selected-layer PDF artifacts", () => {
  test("renders preserved Penpot arc and smooth path gradients with PDF path commands", () => {
    const pdf = pdfTextForNode(penpotRadialArcSmoothPathGradientShape);

    expect(pdf).toContain("/Shading << /Sh1");
    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("10 50 m");
    expect(pdf).toContain("70 50 100 80 110 50 c");
    expect(pdf).toContain("120 30 130 30 140 50 c");
    expect(pdf).toContain("150 70 160 70 170 50 c");
    expect(pdf).toContain(["h", "W", "n", "/Sh1 sh", "Q"].join("\n"));
    expect(pdf.match(/ c\n/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(pdf).not.toContain(["q", "0 0 180 100 re", "W", "n", "/Sh1 sh", "Q"].join("\n"));
  });
});
