import { expect, test } from "vitest";
import type { RendererDocument } from "@layo/renderer";
import {
  createEditorState,
  findNodeById,
  getNodeAbsolutePosition,
  getNodeBounds,
  getSelectionBoundsForNodeIds,
  moveSelectedNodesBy,
  setSelection
} from "./editor-state";

function autoLayoutDocumentWithAbsoluteChild(): RendererDocument {
  return {
    id: "absolute-layout-file",
    name: "Absolute layout item file",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "frame-1",
            kind: "frame",
            name: "Auto layout frame",
            transform: { x: 120, y: 80, rotation: 0 },
            size: { width: 420, height: 280 },
            style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
            content: { type: "empty" },
            layout: {
              mode: "auto",
              direction: "vertical",
              gap: 12,
              padding: { top: 20, right: 20, bottom: 20, left: 20 },
              align_items: "start",
              justify_content: "start"
            },
            children: [
              {
                id: "text-1",
                kind: "text",
                name: "Headline",
                transform: { x: 140, y: 160, rotation: 0 },
                size: { width: 260, height: 48 },
                style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                content: {
                  type: "text",
                  value: "Layo",
                  font_size: 28,
                  font_family: "Inter"
                },
                layout_item: {
                  position: "absolute",
                  margin: { top: 0, right: 0, bottom: 0, left: 0 }
                },
                children: []
              },
              {
                id: "rectangle-1",
                kind: "rectangle",
                name: "Flow rectangle",
                transform: { x: 20, y: 20, rotation: 0 },
                size: { width: 120, height: 40 },
                style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
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

test("absolute auto-layout children expose selection geometry and move directly", () => {
  const selected = setSelection(createEditorState(autoLayoutDocumentWithAbsoluteChild()), "text-1");

  expect(getNodeBounds(selected.document, "text-1")).toEqual({ x: 260, y: 240, width: 260, height: 48 });
  expect(getSelectionBoundsForNodeIds(selected.document, selected.selection.nodeIds)).toEqual({
    x: 260,
    y: 240,
    width: 260,
    height: 48
  });

  const moved = moveSelectedNodesBy(selected, { x: 32, y: 24 });

  expect(findNodeById(moved.document, "text-1")?.transform).toMatchObject({ x: 172, y: 184 });
  expect(getNodeAbsolutePosition(moved.document, "text-1")).toEqual({ x: 292, y: 264 });
  expect(findNodeById(moved.document, "rectangle-1")?.transform).toMatchObject({ x: 20, y: 20 });
  expect(moved.selection.nodeIds).toEqual(["text-1"]);
  expect(moved.history.past).toHaveLength(1);
});
