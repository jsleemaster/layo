import { describe, expect, test } from "vitest";
import { exportDesignToCode } from "./code-export";
import type { DesignFile } from "./storage";

describe("layout item z-index code export", () => {
  test("exports layout item z-index as CSS and structure metadata", () => {
    const result = exportDesignToCode(zIndexFixture());
    const card = result.elements.find((element) => element.id === "card");

    expect(result.css).toContain(".node-badge {");
    expect(result.css).toContain("z-index: 7;");
    expect(card?.structure.children[0].layout_item).toMatchObject({ z_index: 7 });
  });
});

function zIndexFixture(): DesignFile {
  return {
    id: "z-index-file",
    name: "Z Index Fixture",
    version: 1,
    components: [],
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "card",
            kind: "frame",
            name: "Card",
            layout: {
              mode: "auto",
              direction: "horizontal",
              align_items: "start",
              justify_content: "start",
              gap: 0,
              padding: { top: 0, right: 0, bottom: 0, left: 0 }
            },
            transform: { x: 0, y: 0, rotation: 0 },
            size: { width: 240, height: 160 },
            style: { fill: "#ffffff", stroke: null, stroke_width: 0, opacity: 1 },
            content: { type: "empty" },
            children: [
              {
                id: "badge",
                kind: "rectangle",
                name: "Badge",
                layout_item: {
                  z_index: 7,
                  margin: { top: 0, right: 0, bottom: 0, left: 0 }
                } as any,
                transform: { x: 16, y: 16, rotation: 0 },
                size: { width: 80, height: 40 },
                style: { fill: "#22c55e", stroke: null, stroke_width: 0, opacity: 1 },
                content: { type: "empty" },
                children: []
              }
            ]
          }
        ]
      }
    ]
  };
}
