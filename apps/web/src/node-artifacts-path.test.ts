import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { pdfForNode, svgForNode } from "./node-artifacts";

const firstClassPathNode: RendererNode = {
  id: "first-class-path",
  kind: "path",
  name: "Editable compound path",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 100 },
  style: { fill: "#0ea5e9", stroke: "#0f172a", stroke_width: 2, opacity: 0.8 },
  content: {
    type: "path",
    path_data: "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z",
    fill_rule: "evenodd"
  },
  children: []
};

const booleanPathNode: RendererNode = {
  ...firstClassPathNode,
  id: "boolean-path",
  name: "Non-destructive union",
  content: {
    type: "boolean_path",
    relation: {
      operation: "union",
      source_node_ids: ["path-left", "path-right"]
    },
    path_data: "M0 0 H150 V100 H0 Z",
    fill_rule: "nonzero"
  },
  children: []
};

describe("first-class path artifacts", () => {
  test("exports the evaluated boolean result while retaining relation metadata", () => {
    const svg = svgForNode(booleanPathNode);

    expect(svg).toContain('data-node-kind="path"');
    expect(svg).toContain('d="M0 0 H150 V100 H0 Z"');
    expect(svg).not.toContain('data-node-id="path-left"');

    const pdfText = new TextDecoder().decode(pdfForNode(booleanPathNode));
    expect(pdfText).toContain("151 101 l");
  });

  test("renders path geometry and even-odd winding in SVG and PDF", () => {
    const svg = svgForNode(firstClassPathNode);

    expect(svg).toContain('data-node-kind="path"');
    expect(svg).toContain('d="M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).not.toContain('<rect data-node-id="first-class-path"');

    const pdf = pdfForNode(firstClassPathNode);
    const pdfText = new TextDecoder().decode(pdf);

    expect(pdfText).toContain("1 101 m");
    expect(pdfText).toContain("101 101 l");
    expect(pdfText).toMatch(/\nf\*\nQ/);
  });
});
