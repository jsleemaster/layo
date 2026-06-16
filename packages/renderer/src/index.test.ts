import { describe, expect, test } from "vitest";
import { flattenRendererNodes, type RendererDocument } from "./index";

describe("flattenRendererNodes", () => {
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
