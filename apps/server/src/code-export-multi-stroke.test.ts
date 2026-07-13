import { describe, expect, test } from "vitest";
import type { DesignFile } from "./storage";
import { exportDesignToCode } from "./code-export";

const document: DesignFile = {
  id: "multi-stroke-code-export",
  name: "Multi-stroke handoff",
  version: 1,
  tokens: [],
  components: [],
  pages: [{
    id: "page-1",
    name: "Page",
    children: [{
      id: "shape-1",
      kind: "rectangle",
      name: "Outlined card",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 120, height: 80 },
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
    }]
  }]
};

describe("multi-stroke code handoff", () => {
  test("preserves ordered stroke metadata and visibility in structure and generated modules", () => {
    const result = exportDesignToCode(document);
    const structure = result.elements[0].structure;

    expect(structure.style.strokes?.map((stroke) => stroke.id)).toEqual(["outer", "inner"]);
    expect(structure.style.strokes?.[0]).toMatchObject({ position: "outside", opacity: 0.5, dasharray: [8, 4] });
    expect(structure.style.strokes?.[1]).toMatchObject({ position: "inside", visible: false });
    expect(structure.annotations.find((annotation) => annotation.id === "shape-1-style")?.detail)
      .toContain("2 ordered stroke layer(s)");
    expect(result.elements[0].jsModule).toContain('"strokes"');
    expect(result.elements[0].jsModule.indexOf('"outer"')).toBeLessThan(result.elements[0].jsModule.indexOf('"inner"'));
  });
});
