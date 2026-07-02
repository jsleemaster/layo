import { describe, expect, test } from "vitest";
import type { RendererDocument } from "@layo/renderer";
import {
  createEditorState,
  executeEditorCommand,
  findNodeById,
  getTopmostNodeIdAtPoint,
  undo
} from "./editor-state";

describe("layout item z-index", () => {
  test("persists z-index through layout item commands and undo", () => {
    const updated = executeEditorCommand(createEditorState(sampleDocument()), {
      type: "set_node_layout_item",
      nodeId: "front-rect",
      layoutItem: { z_index: 7, margin: { top: 0, right: 0, bottom: 0, left: 0 } }
    } as any);

    expect(findNodeById(updated.document, "front-rect")?.layout_item).toEqual({
      z_index: 7,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    const restored = undo(updated);
    expect(findNodeById(restored.document, "front-rect")?.layout_item).toBeUndefined();
  });

  test("uses layout item z-index before document order for hit testing", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.children[0].layout_item = { z_index: 10, margin: { top: 0, right: 0, bottom: 0, left: 0 } };
    frame.children[1].layout_item = { z_index: 1, margin: { top: 0, right: 0, bottom: 0, left: 0 } };

    expect(getTopmostNodeIdAtPoint(document, { x: 180, y: 140 })).toBe("back-rect");
  });
});

function sampleDocument(): RendererDocument {
  return {
    id: "z-index-file",
    name: "Z Index Fixture",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "frame-1",
            kind: "frame",
            name: "Frame",
            transform: { x: 120, y: 80, rotation: 0 },
            size: { width: 320, height: 220 },
            style: { fill: "#ffffff", stroke: null, stroke_width: 0, opacity: 1 },
            content: { type: "empty" },
            children: [
              {
                id: "back-rect",
                kind: "rectangle",
                name: "Back",
                transform: { x: 40, y: 40, rotation: 0 },
                size: { width: 120, height: 90 },
                style: { fill: "#ef4444", stroke: null, stroke_width: 0, opacity: 1 },
                content: { type: "empty" },
                children: []
              },
              {
                id: "front-rect",
                kind: "rectangle",
                name: "Front",
                transform: { x: 40, y: 40, rotation: 0 },
                size: { width: 120, height: 90 },
                style: { fill: "#2563eb", stroke: null, stroke_width: 0, opacity: 1 },
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
