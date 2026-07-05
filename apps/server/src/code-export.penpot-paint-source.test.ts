import { expect, test } from "vitest";
import { exportDesignToCode } from "./code-export";
import type { DesignFile, DesignNode } from "./storage";

const paintSources = [
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
];

const expectedGradientCss = "background-image: linear-gradient(90deg, #ff0000 0%, #0000ff 100%);";

test("exports Penpot fill gradient paint sources as CSS background images", () => {
  const result = exportDesignToCode(penpotGradientFixture());
  const element = result.elements.find((candidate) => candidate.id === "penpot-gradient-card");

  expect(result.css).toContain("background-color: #800080;");
  expect(result.css).toContain(expectedGradientCss);
  expect(element?.css).toContain("background-color: #800080;");
  expect(element?.css).toContain(expectedGradientCss);
  expect((element?.structure.style as any).paintSources).toEqual(paintSources);
  expect(element?.structure.annotations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "penpot-gradient-card-paint-source",
        label: "Penpot paint",
        value: "1 paint source(s) preserved"
      })
    ])
  );
  expect(element?.jsModule).toContain(expectedGradientCss);
  expect(element?.jsModule).toContain('"paintSources"');
});

function penpotGradientFixture(): DesignFile {
  return {
    id: "penpot-gradient-file",
    name: "Penpot Gradient Source",
    version: 1,
    components: [],
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [gradientCard()]
      }
    ]
  };
}

function gradientCard(): DesignNode {
  return {
    id: "penpot-gradient-card",
    kind: "rectangle",
    name: "Gradient Card",
    transform: { x: 40, y: 64, rotation: 0 },
    size: { width: 180, height: 72 },
    style: {
      fill: "#800080",
      stroke: null,
      stroke_width: 0,
      opacity: 1,
      paint_sources: paintSources
    } as any,
    content: { type: "empty" },
    children: []
  };
}
