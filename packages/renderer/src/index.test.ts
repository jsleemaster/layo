import { describe, expect, test } from "vitest";
import { flattenRendererNodes, type RendererDocument } from "./index";

describe("flattenRendererNodes", () => {
  test("preserves non-destructive boolean path relations", () => {
    const document: RendererDocument = {
      id: "boolean-file",
      name: "Boolean file",
      pages: [{
        id: "page-1",
        name: "Page 1",
        children: [{
          id: "boolean-1",
          kind: "path",
          name: "Difference",
          transform: { x: 0, y: 0, rotation: 0 },
          size: { width: 120, height: 80 },
          style: { fill: "#2563eb", stroke: null, stroke_width: 0, opacity: 1 },
          content: {
            type: "boolean_path",
            relation: {
              operation: "difference",
              source_node_ids: ["path-base", "path-cutout"]
            },
            path_data: "M0 0 H120 V80 H0 Z",
            fill_rule: "nonzero"
          },
          children: []
        }]
      }]
    };

    expect(flattenRendererNodes(document)[0]?.content).toMatchObject({
      type: "boolean_path",
      relation: {
        operation: "difference",
        source_node_ids: ["path-base", "path-cutout"]
      }
    });
  });

  test("returns parent and child nodes in document order", () => {
    const document: RendererDocument = {
      id: "sample-file",
      name: "Sample File",
      pages: [
        {
          id: "page-1",
          name: "Page 1",
          children: [
            {
              id: "frame-1",
              kind: "frame",
              name: "Frame",
              transform: { x: 0, y: 0, rotation: 0 },
              size: { width: 100, height: 100 },
              style: { fill: "#fff", stroke: null, stroke_width: 0, opacity: 1 },
              content: { type: "empty" },
              children: [
                {
                  id: "text-1",
                  kind: "text",
                  name: "Text",
                  transform: { x: 10, y: 10, rotation: 0 },
                  size: { width: 80, height: 20 },
                  style: { fill: "#111", stroke: null, stroke_width: 0, opacity: 1 },
                  content: {
                    type: "text",
                    value: "Hello",
                    font_size: 16,
                    font_family: "Inter"
                  },
                  children: []
                }
              ]
            }
          ]
        }
      ]
    };

    expect(flattenRendererNodes(document).map((node) => node.id)).toEqual(["frame-1", "text-1"]);
  });
});
