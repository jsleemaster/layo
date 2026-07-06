import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const evenOddCompoundPathNode = {
  id: "compound-path",
  kind: "rectangle",
  name: "Penpot compound path",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 100 },
  style: { fill: "#111827", stroke: "#f97316", stroke_width: 2, opacity: 1 },
  content: { type: "empty" },
  clip: {
    type: "bounds",
    source: {
      origin: "penpot",
      shapeId: "penpot-compound-evenodd",
      name: "Penpot compound path",
      shapeType: "path",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      pathData: "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z",
      fillRule: "evenodd"
    }
  },
  children: []
} as RendererNode;

describe("node artifact fill-rule exports", () => {
  test("preserves Penpot even-odd compound path semantics in selected-layer artifacts", () => {
    const svg = svgForNode(evenOddCompoundPathNode);

    expect(svg).toContain('d="M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('clip-rule="evenodd"');

    const pdf = pdfForNode(evenOddCompoundPathNode);
    const pdfText = new TextDecoder().decode(pdf);

    expect(pdfText).toMatch(/\nW\*\nn\n/);
    expect(pdfText).toMatch(/\nf\*\nQ/);
  });
});
