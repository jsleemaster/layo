import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode } from "./node-artifacts";

const penpotRadialPdfCard: RendererNode = {
  id: "penpot-radial-pdf-artifact-card",
  kind: "rectangle",
  name: "Penpot radial PDF artifact card",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 60 },
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

const penpotRadialWidthPdfCard: RendererNode = {
  ...penpotRadialPdfCard,
  id: "penpot-radial-width-pdf-artifact-card",
  name: "Penpot radial width PDF artifact card",
  style: {
    ...penpotRadialPdfCard.style,
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
          width: 0.5,
          stops: [
            { color: "#ff0000", opacity: 1, offset: 0 },
            { color: "#0000ff", opacity: 1, offset: 1 }
          ]
        }
      }
    ]
  }
};

function pdfTextForNode(node: RendererNode) {
  return new TextDecoder().decode(pdfForNode(node));
}

describe("Penpot radial selected-layer PDF artifacts", () => {
  test("renders preserved Penpot radial fill gradients as radial shading resources", () => {
    const pdf = pdfTextForNode(penpotRadialPdfCard);

    expect(pdf).toContain("/Shading << /Sh1");
    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/Coords [60 30 0 60 30 60]");
    expect(pdf).toContain("/FunctionType 2");
    expect(pdf).toContain("/C0 [1 0 0]");
    expect(pdf).toContain("/C1 [0 0 1]");
    expect(pdf).toContain(["q", "0 0 120 60 re", "W", "n", "/Sh1 sh", "Q"].join("\n"));
    expect(pdf).toContain("0.067 0.094 0.153 RG");
    expect(pdf).not.toContain(["0.502 0 0.502 rg", "0 0 120 60 re", "f"].join("\n"));
  });

  test("renders Penpot radial width geometry as a transformed radial shading resource", () => {
    const pdf = pdfTextForNode(penpotRadialWidthPdfCard);

    expect(pdf).toContain("/Shading << /Sh1");
    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("/Coords [0 0 0 0 0 60]");
    expect(pdf).toContain(["q", "0 0 120 60 re", "W", "n", "0 0.5 -1 0 60 30 cm", "/Sh1 sh", "Q"].join("\n"));
    expect(pdf).not.toContain(["0.502 0 0.502 rg", "0 0 120 60 re", "f"].join("\n"));
  });
});
