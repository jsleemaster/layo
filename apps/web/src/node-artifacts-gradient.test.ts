import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const penpotPathData = "M 10 0 C 70 0 110 20 110 40 L 60 60 C 20 60 0 40 10 0 Z";

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

const penpotRadialGradientCard: RendererNode = {
  id: "penpot-radial-gradient-artifact-card",
  kind: "rectangle",
  name: "Penpot radial gradient artifact card",
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

const penpotRadialWidthGradientCard: RendererNode = {
  id: "penpot-radial-width-gradient-artifact-card",
  kind: "rectangle",
  name: "Penpot radial width gradient artifact card",
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
          width: 0.5,
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

const penpotRadialEllipseGradientShape: RendererNode = {
  id: "penpot-radial-ellipse-gradient-artifact-shape",
  kind: "rectangle",
  name: "Penpot radial ellipse gradient artifact shape",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 60 },
  clip: {
    type: "bounds",
    source: {
      origin: "penpot",
      shapeId: "penpot-source-ellipse",
      name: "Penpot source ellipse",
      shapeType: "ellipse",
      bounds: { x: 0, y: 0, width: 120, height: 60 }
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

const penpotRadialPathGradientShape: RendererNode = {
  id: "penpot-radial-path-gradient-artifact-shape",
  kind: "rectangle",
  name: "Penpot radial path gradient artifact shape",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 60 },
  clip: {
    type: "bounds",
    source: {
      origin: "penpot",
      shapeId: "penpot-source-path",
      name: "Penpot source path",
      shapeType: "path",
      bounds: { x: 0, y: 0, width: 120, height: 60 },
      pathData: penpotPathData
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

const penpotStrokeGradientCard: RendererNode = {
  id: "penpot-stroke-gradient-artifact-card",
  kind: "rectangle",
  name: "Penpot stroke gradient artifact card",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 60 },
  style: {
    fill: "#ffffff",
    stroke: "#008000",
    stroke_width: 4,
    opacity: 1,
    paint_sources: [
      {
        origin: "penpot",
        kind: "stroke",
        paintType: "gradient",
        index: 0,
        opacity: 1,
        blendMode: "normal",
        gradient: {
          type: "linear",
          start: { x: 0, y: 0.5 },
          end: { x: 1, y: 0.5 },
          width: 1,
          stops: [
            { color: "#ff0000", opacity: 1, offset: 0 },
            { color: "#00ff00", opacity: 1, offset: 1 }
          ]
        }
      }
    ]
  },
  content: { type: "empty" },
  children: []
};

const penpotRadialStrokeGradientCard: RendererNode = {
  id: "penpot-radial-stroke-gradient-artifact-card",
  kind: "rectangle",
  name: "Penpot radial stroke gradient artifact card",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 120, height: 60 },
  style: {
    fill: "#ffffff",
    stroke: "#800080",
    stroke_width: 4,
    opacity: 1,
    paint_sources: [
      {
        origin: "penpot",
        kind: "stroke",
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

const penpotDualGradientCard: RendererNode = {
  ...penpotGradientCard,
  id: "penpot-dual-gradient-artifact-card",
  name: "Penpot dual gradient artifact card",
  style: {
    ...penpotGradientCard.style,
    stroke: "#008000",
    stroke_width: 4,
    paint_sources: [...(penpotGradientCard.style.paint_sources ?? []), ...(penpotStrokeGradientCard.style.paint_sources ?? [])]
  }
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
    expect(svg).toContain('<linearGradient id="layo-gradient-penpot-gradient-artifact-card-fill-0" x1="0%" y1="0%" x2="100%" y2="0%">');
    expect(svg).toContain('<stop offset="0%" stop-color="#ff0000" />');
    expect(svg).toContain('<stop offset="100%" stop-color="#0000ff" stop-opacity="0.5" />');
    expect(svg).toContain('</linearGradient>');
    expect(svg).toContain('fill="url(#layo-gradient-penpot-gradient-artifact-card-fill-0)"');
    expect(svg).toContain('data-fallback-fill="#800080"');
    expect(svg).toContain('stroke="#111827"');
  });

  test("renders preserved Penpot radial fill gradients as SVG paint servers", () => {
    const svg = svgForNode(penpotRadialGradientCard);

    expect(svg).toContain("<defs>");
    expect(svg).toContain("<radialGradient id=\"layo-gradient-penpot-radial-gradient-artifact-card-fill-0\" cx=\"50%\" cy=\"50%\" r=\"50%\">");
    expect(svg).toContain("<stop offset=\"0%\" stop-color=\"#ff0000\" />");
    expect(svg).toContain("<stop offset=\"100%\" stop-color=\"#0000ff\" />");
    expect(svg).toContain("</radialGradient>");
    expect(svg).toContain("fill=\"url(#layo-gradient-penpot-radial-gradient-artifact-card-fill-0)\"");
    expect(svg).toContain("data-fallback-fill=\"#800080\"");
    expect(svg).toContain("stroke=\"#111827\"");
  });

  test("renders Penpot radial width geometry as an SVG gradient transform", () => {
    const svg = svgForNode(penpotRadialWidthGradientCard);

    expect(svg).toContain("<defs>");
    expect(svg).toContain(
      "<radialGradient id=\"layo-gradient-penpot-radial-width-gradient-artifact-card-fill-0\" cx=\"50%\" cy=\"50%\" r=\"50%\" gradientTransform=\"translate(50% 50%) rotate(90) scale(0.5 1) translate(-50% -50%)\">"
    );
    expect(svg).toContain("fill=\"url(#layo-gradient-penpot-radial-width-gradient-artifact-card-fill-0)\"");
    expect(svg).toContain("data-fallback-fill=\"#800080\"");
  });

  test("renders preserved Penpot ellipse radial fill gradients as SVG ellipse paint", () => {
    const svg = svgForNode(penpotRadialEllipseGradientShape);

    expect(svg).toContain("<defs>");
    expect(svg).toContain("<ellipse cx=\"60\" cy=\"30\" rx=\"60\" ry=\"30\" />");
    expect(svg).toContain(
      "<radialGradient id=\"layo-gradient-penpot-radial-ellipse-gradient-artifact-shape-fill-0\" cx=\"50%\" cy=\"50%\" r=\"50%\">"
    );
    expect(svg).toContain(
      "<ellipse data-node-id=\"penpot-radial-ellipse-gradient-artifact-shape\" data-node-name=\"Penpot radial ellipse gradient artifact shape\" data-node-kind=\"rectangle\" cx=\"60\" cy=\"30\" rx=\"60\" ry=\"30\" fill=\"url(#layo-gradient-penpot-radial-ellipse-gradient-artifact-shape-fill-0)\" data-fallback-fill=\"#800080\" stroke=\"#111827\" stroke-width=\"2\" />"
    );
    expect(svg).not.toContain("<rect data-node-id=\"penpot-radial-ellipse-gradient-artifact-shape\"");
  });

  test("renders preserved Penpot path radial fill gradients as SVG path paint", () => {
    const svg = svgForNode(penpotRadialPathGradientShape);

    expect(svg).toContain("<defs>");
    expect(svg).toContain(`<path d="${penpotPathData}" />`);
    expect(svg).toContain(
      "<radialGradient id=\"layo-gradient-penpot-radial-path-gradient-artifact-shape-fill-0\" cx=\"50%\" cy=\"50%\" r=\"50%\">"
    );
    expect(svg).toContain(
      `<path data-node-id="penpot-radial-path-gradient-artifact-shape" data-node-name="Penpot radial path gradient artifact shape" data-node-kind="rectangle" d="${penpotPathData}" fill="url(#layo-gradient-penpot-radial-path-gradient-artifact-shape-fill-0)" data-fallback-fill="#800080" stroke="#111827" stroke-width="2" />`
    );
    expect(svg).not.toContain("<rect data-node-id=\"penpot-radial-path-gradient-artifact-shape\"");
    expect(svg).not.toContain("<ellipse data-node-id=\"penpot-radial-path-gradient-artifact-shape\"");
  });

  test("renders preserved Penpot stroke gradients as SVG paint servers", () => {
    const svg = svgForNode(penpotStrokeGradientCard);

    expect(svg).toContain('<defs>');
    expect(svg).toContain(
      '<linearGradient id="layo-gradient-penpot-stroke-gradient-artifact-card-stroke-0" x1="0%" y1="50%" x2="100%" y2="50%">'
    );
    expect(svg).toContain('<stop offset="0%" stop-color="#ff0000" />');
    expect(svg).toContain('<stop offset="100%" stop-color="#00ff00" />');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="url(#layo-gradient-penpot-stroke-gradient-artifact-card-stroke-0)"');
    expect(svg).toContain('data-fallback-stroke="#008000"');
    expect(svg).toContain('stroke-width="4"');
  });

  test("renders preserved Penpot radial stroke gradients as SVG paint servers", () => {
    const svg = svgForNode(penpotRadialStrokeGradientCard);

    expect(svg).toContain("<defs>");
    expect(svg).toContain(
      "<radialGradient id=\"layo-gradient-penpot-radial-stroke-gradient-artifact-card-stroke-0\" cx=\"50%\" cy=\"50%\" r=\"50%\">"
    );
    expect(svg).toContain("<stop offset=\"0%\" stop-color=\"#ff0000\" />");
    expect(svg).toContain("<stop offset=\"100%\" stop-color=\"#0000ff\" />");
    expect(svg).toContain("fill=\"#ffffff\"");
    expect(svg).toContain("stroke=\"url(#layo-gradient-penpot-radial-stroke-gradient-artifact-card-stroke-0)\"");
    expect(svg).toContain("data-fallback-stroke=\"#800080\"");
  });

  test("uses distinct SVG paint server ids when Penpot fill and stroke gradients share an index", () => {
    const svg = svgForNode(penpotDualGradientCard);

    expect(svg).toContain('<linearGradient id="layo-gradient-penpot-dual-gradient-artifact-card-fill-0" x1="0%" y1="0%" x2="100%" y2="0%">');
    expect(svg).toContain(
      '<linearGradient id="layo-gradient-penpot-dual-gradient-artifact-card-stroke-0" x1="0%" y1="50%" x2="100%" y2="50%">'
    );
    expect(svg).toContain('fill="url(#layo-gradient-penpot-dual-gradient-artifact-card-fill-0)"');
    expect(svg).toContain('stroke="url(#layo-gradient-penpot-dual-gradient-artifact-card-stroke-0)"');
    expect(svg.match(/id="layo-gradient-penpot-dual-gradient-artifact-card-fill-0"/g) ?? []).toHaveLength(1);
    expect(svg.match(/id="layo-gradient-penpot-dual-gradient-artifact-card-stroke-0"/g) ?? []).toHaveLength(1);
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
    expect(pdf).toContain("0.067 0.094 0.153 RG");
    expect(pdf).not.toContain(["0.502 0 0.502 rg", "0 0 120 60 re", "f"].join("\n"));
  });

  test("renders preserved Penpot ellipse radial fill gradients with ellipse clip in PDF artifacts", () => {
    const pdf = pdfTextForNode(penpotRadialEllipseGradientShape);

    expect(pdf).toContain("/Shading << /Sh1");
    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("/Coords [60 30 0 60 30 60]");
    expect(pdf).toContain(
      [
        "q",
        "120 30 m",
        "120 46.569 93.137 60 60 60 c",
        "26.863 60 0 46.569 0 30 c",
        "0 13.431 26.863 0 60 0 c",
        "93.137 0 120 13.431 120 30 c",
        "h",
        "W",
        "n",
        "/Sh1 sh",
        "Q"
      ].join("\n")
    );
    expect(pdf).not.toContain(["q", "0 0 120 60 re", "W", "n", "/Sh1 sh", "Q"].join("\n"));
  });

  test("renders preserved Penpot path radial fill gradients with path clip in PDF artifacts", () => {
    const pdf = pdfTextForNode(penpotRadialPathGradientShape);

    expect(pdf).toContain("/Shading << /Sh1");
    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("/Coords [60 30 0 60 30 60]");
    expect(pdf).toContain(
      [
        "q",
        "10 60 m",
        "70 60 110 40 110 20 c",
        "60 0 l",
        "20 0 0 20 10 60 c",
        "h",
        "W",
        "n",
        "/Sh1 sh",
        "Q"
      ].join("\n")
    );
    expect(pdf).not.toContain(["q", "0 0 120 60 re", "W", "n", "/Sh1 sh", "Q"].join("\n"));
  });

  test("renders preserved Penpot stroke gradients as axial shading resources", () => {
    const pdf = pdfTextForNode(penpotStrokeGradientCard);

    expect(pdf).toContain('/Shading << /Sh1');
    expect(pdf).toContain('/ShadingType 2');
    expect(pdf).toContain('/ColorSpace /DeviceRGB');
    expect(pdf).toContain('/Coords [0 30 120 30]');
    expect(pdf).toContain('/FunctionType 2');
    expect(pdf).toContain('/C0 [1 0 0]');
    expect(pdf).toContain('/C1 [0 1 0]');
    expect(pdf).toContain(["q", "0 0 120 60 re", "4 4 112 52 re", "W*", "n", "/Sh1 sh", "Q"].join("\n"));
    expect(pdf).not.toContain(["0 0.502 0 RG", "4 w", "0 0 120 60 re", "S"].join("\n"));
  });

  test("renders preserved Penpot radial stroke gradients as radial shading resources", () => {
    const pdf = pdfTextForNode(penpotRadialStrokeGradientCard);

    expect(pdf).toContain("/Shading << /Sh1");
    expect(pdf).toContain("/ShadingType 3");
    expect(pdf).toContain("/ColorSpace /DeviceRGB");
    expect(pdf).toContain("/Coords [60 30 0 60 30 60]");
    expect(pdf).toContain("/FunctionType 2");
    expect(pdf).toContain("/C0 [1 0 0]");
    expect(pdf).toContain("/C1 [0 0 1]");
    expect(pdf).toContain(["q", "0 0 120 60 re", "4 4 112 52 re", "W*", "n", "/Sh1 sh", "Q"].join("\n"));
    expect(pdf).not.toContain(["0.502 0 0.502 RG", "4 w", "0 0 120 60 re", "S"].join("\n"));
  });
});
