import { describe, expect, test } from "vitest";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import {
  createEditorState,
  executeEditorCommand,
  findNodeById,
  createRectangleNode,
  createTextNode,
  getNodeAbsolutePosition,
  panViewport,
  redo,
  setSelection,
  setViewport,
  undo,
  zoomViewport
} from "./editor-state";

function sampleDocument(): RendererDocument {
  return {
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
            name: "Landing Frame",
            transform: { x: 120, y: 80, rotation: 0 },
            size: { width: 420, height: 280 },
            style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
            content: { type: "empty" },
            children: [
              {
                id: "text-1",
                kind: "text",
                name: "Headline",
                transform: { x: 32, y: 40, rotation: 0 },
                size: { width: 260, height: 48 },
                style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                content: {
                  type: "text",
                  value: "Canvas MCP Editor",
                  font_size: 28,
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
}

describe("editor state commands", () => {
  test("updates node geometry and reverses it with undo and redo", () => {
    const initial = createEditorState(sampleDocument());

    const moved = executeEditorCommand(initial, {
      type: "update_node_geometry",
      nodeId: "text-1",
      patch: { x: 72, y: 96 }
    });

    expect(findNodeById(moved.document, "text-1")?.transform).toMatchObject({ x: 72, y: 96 });
    expect(moved.history.past).toHaveLength(1);

    const undone = undo(moved);
    expect(findNodeById(undone.document, "text-1")?.transform).toMatchObject({ x: 32, y: 40 });
    expect(undone.history.future).toHaveLength(1);

    const redone = redo(undone);
    expect(findNodeById(redone.document, "text-1")?.transform).toMatchObject({ x: 72, y: 96 });
  });

  test("resizes with minimum dimensions and supports inspector patch updates", () => {
    const initial = createEditorState(sampleDocument());

    const resized = executeEditorCommand(initial, {
      type: "update_node_geometry",
      nodeId: "text-1",
      patch: { width: -20, height: 0 }
    });

    expect(findNodeById(resized.document, "text-1")?.size).toEqual({ width: 1, height: 1 });
  });

  test("updates fill and text content with undo support", () => {
    const initial = createEditorState(sampleDocument());

    const filled = executeEditorCommand(initial, {
      type: "set_fill",
      nodeId: "text-1",
      fill: "#2563eb"
    });
    const renamed = executeEditorCommand(filled, {
      type: "update_text",
      nodeId: "text-1",
      value: "Edited headline"
    });

    const node = findNodeById(renamed.document, "text-1");
    expect(node?.style.fill).toBe("#2563eb");
    expect(node?.content).toMatchObject({ type: "text", value: "Edited headline" });

    const undone = undo(renamed);
    expect(findNodeById(undone.document, "text-1")?.content).toMatchObject({
      type: "text",
      value: "Canvas MCP Editor"
    });
  });

  test("creates nodes on the first page and selects the created node", () => {
    const initial = createEditorState(sampleDocument());

    const created = executeEditorCommand(initial, {
      type: "create_node",
      parentId: "page-1",
      node: {
        id: "rectangle-1",
        kind: "rectangle",
        name: "Rectangle",
        transform: { x: 180, y: 140, rotation: 0 },
        size: { width: 160, height: 96 },
        style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
        content: { type: "empty" },
        children: []
      }
    });

    expect(findNodeById(created.document, "rectangle-1")?.name).toBe("Rectangle");
    expect(created.selection.nodeId).toBe("rectangle-1");
    expect(findNodeById(undo(created).document, "rectangle-1")).toBeNull();
  });

  test("tracks selection and viewport pan and zoom", () => {
    const initial = createEditorState(sampleDocument());
    const selected = setSelection(initial, "text-1");
    const zoomed = setViewport(selected, { scale: 2.4, x: 80, y: -40 });
    const clamped = setViewport(zoomed, { scale: 0.05 });

    expect(selected.selection.nodeId).toBe("text-1");
    expect(zoomed.viewport).toEqual({ scale: 2.4, x: 80, y: -40 });
    expect(clamped.viewport.scale).toBe(0.25);
  });

  test("creates predictable default rectangle and text nodes for toolbar actions", () => {
    const rectangle = createRectangleNode(3);
    const text = createTextNode(4);

    expect(rectangle).toMatchObject({
      id: "rectangle-3",
      kind: "rectangle",
      name: "Rectangle 3",
      transform: { x: 180, y: 140, rotation: 0 },
      size: { width: 160, height: 96 }
    });
    expect(text).toMatchObject({
      id: "text-4",
      kind: "text",
      name: "Text 4",
      transform: { x: 220, y: 180, rotation: 0 },
      size: { width: 220, height: 44 },
      content: { type: "text", value: "New text" }
    });
  });

  test("pans and zooms the viewport from toolbar actions", () => {
    const initial = createEditorState(sampleDocument());
    const panned = panViewport(initial, { x: 24, y: -16 });
    const zoomed = zoomViewport(panned, 0.5);

    expect(panned.viewport).toEqual({ scale: 1, x: 24, y: -16 });
    expect(zoomed.viewport.scale).toBe(1.5);
  });

  test("calculates absolute node position through parent transforms", () => {
    expect(getNodeAbsolutePosition(sampleDocument(), "frame-1")).toEqual({ x: 120, y: 80 });
    expect(getNodeAbsolutePosition(sampleDocument(), "text-1")).toEqual({ x: 152, y: 120 });
    expect(getNodeAbsolutePosition(sampleDocument(), "missing")).toBeNull();
  });
});
