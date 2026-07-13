import { expect, test } from "vitest";
import type { RendererDocument, RendererNode } from "@layo/renderer";
import {
  createEditorState,
  findNodeById,
  redo,
  setSelectedNodeStyle,
  setSelection,
  undo
} from "./editor-state";

const pathNode: RendererNode = {
  id: "stroke-path",
  kind: "path",
  name: "Stroke path",
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 50 },
  style: {
    fill: "transparent",
    stroke: "#0f172a",
    stroke_width: 8,
    stroke_cap: "round",
    stroke_join: "bevel",
    stroke_dasharray: [12, 6],
    stroke_start_marker: "circle",
    stroke_end_marker: "triangle",
    opacity: 1
  },
  content: {
    type: "path",
    path_data: "M0 25 C25 0 75 50 100 25",
    fill_rule: "nonzero"
  },
  children: []
};

const document: RendererDocument = {
  id: "stroke-history",
  name: "Stroke history",
  pages: [{ id: "page-1", name: "Page 1", children: [pathNode] }]
};

test("records stroke contract changes as undoable and redoable history", () => {
  const selected = setSelection(createEditorState(structuredClone(document)), pathNode.id);
  const changed = setSelectedNodeStyle(selected, {
    ...pathNode.style,
    stroke_cap: "square",
    stroke_join: "round",
    stroke_dasharray: [4, 2],
    stroke_start_marker: "diamond",
    stroke_end_marker: "line_arrow"
  });

  expect(findNodeById(changed.document, pathNode.id)?.style).toMatchObject({
    stroke_cap: "square",
    stroke_join: "round",
    stroke_dasharray: [4, 2],
    stroke_start_marker: "diamond",
    stroke_end_marker: "line_arrow"
  });
  expect(findNodeById(undo(changed).document, pathNode.id)?.style.stroke_end_marker).toBe("triangle");
  expect(findNodeById(redo(undo(changed)).document, pathNode.id)?.style.stroke_end_marker).toBe("line_arrow");
});
