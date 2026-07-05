import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { svgForNode } from "./node-artifacts";

const clippedGroup: RendererNode = {
  id: "masked-group",
  kind: "group",
  name: "Masked group",
  clip: { type: "bounds" },
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 60 },
  style: { fill: "#ffffff", stroke: null, stroke_width: 0, opacity: 1 },
  content: { type: "empty" },
  children: [
    {
      id: "oversized-child",
      kind: "rectangle",
      name: "Oversized child",
      transform: { x: 40, y: 20, rotation: 0 },
      size: { width: 90, height: 70 },
      style: { fill: "#38bdf8", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    }
  ]
};

describe("clipped node artifact exports", () => {
  test("renders selected clipped groups with bounded viewBox and SVG clipPath", () => {
    const svg = svgForNode(clippedGroup);

    expect(svg).toContain('viewBox="0 0 100 60"');
    expect(svg).toContain('<clipPath id="layo-clip-masked-group">');
    expect(svg).toContain('<rect x="0" y="0" width="100" height="60" />');
    expect(svg).toContain('clip-path="url(#layo-clip-masked-group)"');
    expect(svg).toContain('data-node-id="oversized-child"');
    expect(svg).toContain('transform="translate(40 20)"');
  });
});
