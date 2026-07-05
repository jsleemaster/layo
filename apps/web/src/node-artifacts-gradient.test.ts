import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const penpotGradientCard: RendererNode = {
  id: "penpot-gradient-artifact-card",
  kind: "rectangle",
  name: "Penpot gradient artifact card",
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
          type: "linear",
          start: { x: 0, y: 0 },
          end: { x: 1, y: 0 },
          width: 1,
          stops: [
            { color: "#ff0000", opacity: 1, offset: 0 },
            { color: "#0000ff", opacity: 0.5, offset: 1 }
          ]
        }
      }
    ]
  },
  content: { type: "empty" },
  children: []
};

const opaquePenpotGradientCard: RendererNode = {
  ...penpotGradientCard,
  id: "penpot-gradient-pdf-artifact-card",
  name: "Penpot gradient PDF artifact card",
  style: {
    ...penpotGradientCard.style,
    paint_sources: [
      {
        origin: "penpot",
        kind: "fill",
        paintType: "gradient",
        index: 0,
        opacity: 1,
        blendMode: "normal",
        gradient: {
          type: "linear",
          start: { x: 0, y: 0 },
          end: { x: 1, y: 0 },
          width: 1,
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

describe("Penpot gradient selected-layer SVG artifacts", () => {
  test("renders preserved Penpot fill gradients as SVG paint servers", () => {
    const svg = svgForNode(penpotGradientCard);

    expect(svg).toContain('<defs>');
    expect(svg).toContain('<linearGradient id="layo-gradient-penpot-gradient-artifact-card-0" x1="0%" y1="0%" x2="100%" y2="0%">');
    expect(svg).toContain('<stop offset="0%" stop-color="#ff0000" />');
    expect(svg).toContain('<stop offset="100%" stop-color="#0000ff" stop-opacity="0.5" />');
    expect(svg).toContain('</linearGradient>');
    expect(svg).toContain('fill="url(#layo-gradient-penpot-gradient-artifact-card-0)"');
    expect(svg).toContain('data-fallback-fill="#800080"');
    expect(svg).toContain('stroke="#111827"');
  });
});

describe("Penpot gradient selected-layer PDF artifacts", () => {
  test("renders preserved Penpot fill gradients as axial shading resources", () => {
    const pdf = pdfTextForNode(opaquePenpotGradientCard);

    expect(pdf).toContain('/Shading << /Sh1');
    expect(pdf).toContain('/ShadingType 2');
    expect(pdf).toContain('/ColorSpace /DeviceRGB');
    expect(pdf).toContain('/Coords [0 60 120 60]');
    expect(pdf).toContain('/FunctionType 2');
    expect(pdf).toContain('/C0 [1 0 0]');
    expect(pdf).toContain('/C1 [0 0 1]');
    expect(pdf).toContain(["q", "0 0 120 60 re", "W", "n", "/Sh1 sh", "Q"].join("\n"));
    expect(pdf).toContain("0.067 0.098 0.153 RG");
    expect(pdf).not.toContain(["0.502 0 0.502 rg", "0 0 120 60 re", "f"].join("\n"));
  });
});
