import { expect, test } from "vitest";
import type { RendererDocument } from "@layo/renderer";
import { createEditorState, executeEditorCommand, findNodeById } from "./editor-state";

function sampleDocument(): RendererDocument {
  return {
    id: "sample-file",
    name: "샘플 파일",
    pages: [
      {
        id: "page-1",
        name: "페이지 1",
        children: [
          {
            id: "frame-1",
            kind: "frame",
            name: "랜딩 프레임",
            transform: { x: 120, y: 80, rotation: 0 },
            size: { width: 420, height: 180 },
            style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
            content: { type: "empty" },
            layout: {
              mode: "auto",
              direction: "horizontal",
              wrap: "wrap",
              align_content: "start",
              align_items: "start",
              justify_content: "start",
              gap: 10,
              padding: { top: 20, right: 20, bottom: 20, left: 20 }
            },
            children: [
              {
                id: "text-1",
                kind: "text",
                name: "헤드라인",
                transform: { x: 32, y: 40, rotation: 0 },
                size: { width: 80, height: 40 },
                style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                content: {
                  type: "text",
                  value: "Layo",
                  font_size: 28,
                  font_family: "Inter",
                  font_weight: 700,
                  line_height: 1.2
                },
                layout_item: { width_sizing: "fill" },
                children: []
              },
              {
                id: "wrap-fill-fixed-rectangle-1",
                kind: "rectangle",
                name: "줄바꿈 고정 사각형",
                transform: { x: 0, y: 0, rotation: 0 },
                size: { width: 80, height: 40 },
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

test("wrapped fill child stays on the same row after direct parent resize recomputes fill width", () => {
  const initial = executeEditorCommand(createEditorState(sampleDocument()), {
    type: "update_node_geometry",
    nodeId: "frame-1",
    patch: { width: 420 }
  });

  expect(findNodeById(initial.document, "text-1")?.size.width).toBe(290);
  expect(findNodeById(initial.document, "wrap-fill-fixed-rectangle-1")?.transform).toMatchObject({
    x: 320,
    y: 20
  });

  const resized = executeEditorCommand(initial, {
    type: "update_node_geometry",
    nodeId: "frame-1",
    patch: { width: 360 }
  });

  expect(findNodeById(resized.document, "text-1")?.layout_item).toMatchObject({ width_sizing: "fill" });
  expect(findNodeById(resized.document, "text-1")?.size.width).toBe(230);
  expect(findNodeById(resized.document, "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
  expect(findNodeById(resized.document, "wrap-fill-fixed-rectangle-1")?.transform).toMatchObject({
    x: 260,
    y: 20
  });
});
