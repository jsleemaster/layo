import { describe, expect, test } from "vitest";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import {
  alignSelectedNodeToParent,
  alignSelectedNodes,
  calculateSnapForMovingBounds,
  createEditorState,
  deleteSelectedNode,
  distributeSelectedNodes,
  duplicateSelectedNode,
  executeEditorCommand,
  findNodeById,
  createRectangleNode,
  createTextNode,
  getNodeBounds,
  getNodeAbsolutePosition,
  getTopmostNodeIdAtPoint,
  getSelectionBoundsForNodeIds,
  moveSelectedNodesBy,
  nudgeSelectedNode,
  panViewport,
  redo,
  selectNodesInBounds,
  setMultiSelection,
  setSelection,
  toggleSelection,
  setViewport,
  undo,
  zoomViewportAtPoint,
  zoomViewport
} from "./editor-state";

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
            size: { width: 420, height: 280 },
            style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
            content: { type: "empty" },
            children: [
              {
                id: "text-1",
                kind: "text",
                name: "헤드라인",
                transform: { x: 32, y: 40, rotation: 0 },
                size: { width: 260, height: 48 },
                style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                content: {
                  type: "text",
                  value: "캔버스 MCP 에디터",
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

function sampleDocumentWithTopLevelRectangle(): RendererDocument {
  const document = sampleDocument();
  document.pages[0]?.children.push({
    id: "rectangle-1",
    kind: "rectangle",
    name: "사각형",
    transform: { x: 180, y: 140, rotation: 0 },
    size: { width: 160, height: 96 },
    style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
    content: { type: "empty" },
    children: []
  });
  return document;
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
      value: "캔버스 MCP 에디터"
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
        name: "사각형",
        transform: { x: 180, y: 140, rotation: 0 },
        size: { width: 160, height: 96 },
        style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
        content: { type: "empty" },
        children: []
      }
    });

    expect(findNodeById(created.document, "rectangle-1")?.name).toBe("사각형");
    expect(created.selection.nodeId).toBe("rectangle-1");
    expect(findNodeById(undo(created).document, "rectangle-1")).toBeNull();
  });

  test("auto layout stacks direct children with padding and gap after node creation", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      gap: 12,
      padding: { top: 20, right: 24, bottom: 20, left: 24 }
    };

    const created = executeEditorCommand(createEditorState(document), {
      type: "create_node",
      parentId: "frame-1",
      node: {
        id: "rectangle-1",
        kind: "rectangle",
        name: "사각형",
        transform: { x: 180, y: 140, rotation: 0 },
        size: { width: 160, height: 96 },
        style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
        content: { type: "empty" },
        children: []
      }
    });

    expect(findNodeById(created.document, "text-1")?.transform).toMatchObject({ x: 24, y: 20 });
    expect(findNodeById(created.document, "rectangle-1")?.transform).toMatchObject({ x: 24, y: 80 });
  });

  test("sets auto layout through an editor command and supports undo", () => {
    const layout = {
      mode: "auto",
      direction: "vertical",
      gap: 12,
      padding: { top: 20, right: 24, bottom: 20, left: 24 }
    } as const;

    const updated = executeEditorCommand(createEditorState(sampleDocument()), {
      type: "set_node_layout",
      nodeId: "frame-1",
      layout
    } as any);

    expect(findNodeById(updated.document, "frame-1")?.layout).toEqual(layout);
    expect(findNodeById(updated.document, "text-1")?.transform).toMatchObject({ x: 24, y: 20 });

    const undone = undo(updated);
    expect(findNodeById(undone.document, "frame-1")?.layout).toBeUndefined();
    expect(findNodeById(undone.document, "text-1")?.transform).toMatchObject({ x: 32, y: 40 });
  });

  test("constraints preserve right and bottom offsets when a parent frame resizes", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1");
    if (!frame) {
      throw new Error("frame missing");
    }
    frame.children.push({
      id: "badge-1",
      kind: "rectangle",
      name: "Badge",
      transform: { x: 300, y: 220, rotation: 0 },
      size: { width: 80, height: 32 },
      style: { fill: "#fef3c7", stroke: "#f59e0b", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: [],
      constraints: { horizontal: "right", vertical: "bottom" }
    } as any);

    const resized = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "frame-1",
      patch: { width: 520, height: 340 }
    });

    expect(findNodeById(resized.document, "badge-1")?.transform).toMatchObject({
      x: 400,
      y: 280
    });
  });

  test("tracks selection and viewport pan and zoom", () => {
    const initial = createEditorState(sampleDocument());
    const selected = setSelection(initial, "text-1");
    const zoomed = setViewport(selected, { scale: 2.4, x: 80, y: -40 });
    const clamped = setViewport(zoomed, { scale: 0.05 });

    expect(selected.selection.nodeId).toBe("text-1");
    expect(selected.selection.nodeIds).toEqual(["text-1"]);
    expect(zoomed.viewport).toEqual({ scale: 2.4, x: 80, y: -40 });
    expect(clamped.viewport.scale).toBe(0.25);
  });

  test("toggles nodes into and out of multi-selection", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const added = toggleSelection(initial, "frame-1");
    expect(added.selection.nodeId).toBe("frame-1");
    expect(added.selection.nodeIds).toEqual(["text-1", "frame-1"]);

    const removed = toggleSelection(added, "frame-1");
    expect(removed.selection.nodeId).toBe("text-1");
    expect(removed.selection.nodeIds).toEqual(["text-1"]);
  });

  test("selects fully enclosed nodes in document bounds without selecting their parent frame", () => {
    const selected = selectNodesInBounds(createEditorState(sampleDocumentWithTopLevelRectangle()), {
      x: 150,
      y: 110,
      width: 300,
      height: 150
    });

    expect(selected.selection.nodeId).toBe("rectangle-1");
    expect(selected.selection.nodeIds).toEqual(["text-1", "rectangle-1"]);
  });

  test("aligns selected nodes by document-space left edge across parents", () => {
    const initial = setMultiSelection(
      createEditorState(sampleDocumentWithTopLevelRectangle()),
      ["text-1", "rectangle-1"],
      "rectangle-1"
    );

    const aligned = alignSelectedNodes(initial, "left");

    expect(getNodeAbsolutePosition(aligned.document, "text-1")).toEqual({ x: 152, y: 120 });
    expect(findNodeById(aligned.document, "rectangle-1")?.transform).toMatchObject({
      x: 152,
      y: 140
    });
    expect(aligned.selection.nodeIds).toEqual(["text-1", "rectangle-1"]);
    expect(findNodeById(undo(aligned).document, "rectangle-1")?.transform).toMatchObject({
      x: 180,
      y: 140
    });
  });

  test("aligns a single selected child inside its parent bounds", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const aligned = alignSelectedNodeToParent(initial, "right");

    expect(findNodeById(aligned.document, "text-1")?.transform.x).toBe(160);
    expect(aligned.selection.nodeId).toBe("text-1");
    expect(findNodeById(undo(aligned).document, "text-1")?.transform.x).toBe(32);
  });

  test("finds absolute node bounds and topmost hover targets", () => {
    const document = sampleDocumentWithTopLevelRectangle();

    expect(getNodeBounds(document, "text-1")).toEqual({ x: 152, y: 120, width: 260, height: 48 });
    expect(getTopmostNodeIdAtPoint(document, { x: 190, y: 150 }, new Set(["text-1"]))).toBe(
      "rectangle-1"
    );
    expect(getTopmostNodeIdAtPoint(document, { x: 160, y: 130 }, new Set(["frame-1"]))).toBeNull();
  });

  test("distributes selected nodes horizontally while keeping outer layers fixed", () => {
    const document = sampleDocumentWithTopLevelRectangle();
    document.pages[0]?.children.push({
      id: "text-2",
      kind: "text",
      name: "보조 텍스트",
      transform: { x: 760, y: 180, rotation: 0 },
      size: { width: 220, height: 44 },
      style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "text", value: "보조 텍스트", font_size: 24, font_family: "Inter" },
      children: []
    });
    const initial = setMultiSelection(
      createEditorState(document),
      ["text-1", "rectangle-1", "text-2"],
      "text-2"
    );

    const distributed = distributeSelectedNodes(initial, "horizontal");

    expect(getNodeAbsolutePosition(distributed.document, "text-1")).toEqual({ x: 152, y: 120 });
    expect(findNodeById(distributed.document, "rectangle-1")?.transform.x).toBe(506);
    expect(findNodeById(distributed.document, "text-2")?.transform.x).toBe(760);
    expect(distributed.selection.nodeIds).toEqual(["text-1", "rectangle-1", "text-2"]);
  });

  test("moves multiple selected nodes together with one undo step", () => {
    const initial = setMultiSelection(
      createEditorState(sampleDocumentWithTopLevelRectangle()),
      ["text-1", "rectangle-1"],
      "rectangle-1"
    );

    const moved = moveSelectedNodesBy(initial, { x: 40, y: 24 });

    expect(getNodeAbsolutePosition(moved.document, "text-1")).toEqual({ x: 192, y: 144 });
    expect(findNodeById(moved.document, "rectangle-1")?.transform).toMatchObject({
      x: 220,
      y: 164
    });
    expect(moved.selection.nodeIds).toEqual(["text-1", "rectangle-1"]);
    expect(moved.history.past).toHaveLength(1);

    const undone = undo(moved);
    expect(getNodeAbsolutePosition(undone.document, "text-1")).toEqual({ x: 152, y: 120 });
    expect(findNodeById(undone.document, "rectangle-1")?.transform).toMatchObject({
      x: 180,
      y: 140
    });
    expect(undone.history.future).toHaveLength(1);
  });

  test("calculates snap delta and guide against unselected node bounds", () => {
    const document = sampleDocumentWithTopLevelRectangle();
    document.pages[0]?.children.push({
      id: "target-1",
      kind: "rectangle",
      name: "스냅 기준",
      transform: { x: 480, y: 130, rotation: 0 },
      size: { width: 160, height: 96 },
      style: { fill: "#f8fafc", stroke: "#64748b", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const selectionBounds = getSelectionBoundsForNodeIds(document, ["text-1", "rectangle-1"]);
    expect(selectionBounds).toEqual({ x: 152, y: 120, width: 260, height: 116 });

    const snapped = calculateSnapForMovingBounds(
      document,
      ["text-1", "rectangle-1"],
      selectionBounds!,
      { x: 65, y: 0 },
      6
    );

    expect(snapped.delta).toEqual({ x: 68, y: 0 });
    expect(snapped.guides).toContainEqual(
      expect.objectContaining({ orientation: "vertical", x: 480 })
    );
  });

  test("creates predictable default rectangle and text nodes for toolbar actions", () => {
    const rectangle = createRectangleNode(3);
    const text = createTextNode(4);

    expect(rectangle).toMatchObject({
      id: "rectangle-3",
      kind: "rectangle",
      name: "사각형 3",
      transform: { x: 180, y: 140, rotation: 0 },
      size: { width: 160, height: 96 }
    });
    expect(text).toMatchObject({
      id: "text-4",
      kind: "text",
      name: "텍스트 4",
      transform: { x: 220, y: 180, rotation: 0 },
      size: { width: 220, height: 44 },
      content: { type: "text", value: "새 텍스트" }
    });
  });

  test("pans and zooms the viewport from toolbar actions", () => {
    const initial = createEditorState(sampleDocument());
    const panned = panViewport(initial, { x: 24, y: -16 });
    const zoomed = zoomViewport(panned, 0.5);

    expect(panned.viewport).toEqual({ scale: 1, x: 24, y: -16 });
    expect(zoomed.viewport.scale).toBe(1.5);
  });

  test("zooms around a viewport point without moving the document point under the pointer", () => {
    const initial = setViewport(createEditorState(sampleDocument()), {
      scale: 1,
      x: 40,
      y: -20
    });
    const pointer = { x: 400, y: 300 };
    const documentPointBefore = {
      x: (pointer.x - initial.viewport.x) / initial.viewport.scale,
      y: (pointer.y - initial.viewport.y) / initial.viewport.scale
    };

    const zoomed = zoomViewportAtPoint(initial, 0.5, pointer);
    const documentPointAfter = {
      x: (pointer.x - zoomed.viewport.x) / zoomed.viewport.scale,
      y: (pointer.y - zoomed.viewport.y) / zoomed.viewport.scale
    };

    expect(zoomed.viewport.scale).toBe(1.5);
    expect(documentPointAfter).toEqual(documentPointBefore);
  });

  test("nudges the selected node and preserves undo history", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const nudged = nudgeSelectedNode(initial, { x: 1, y: 0 });

    expect(findNodeById(nudged.document, "text-1")?.transform).toMatchObject({ x: 33, y: 40 });
    expect(nudged.selection.nodeId).toBe("text-1");
    expect(findNodeById(undo(nudged).document, "text-1")?.transform).toMatchObject({ x: 32, y: 40 });
  });

  test("deletes the selected node and restores it with undo", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const deleted = deleteSelectedNode(initial);

    expect(findNodeById(deleted.document, "text-1")).toBeNull();
    expect(deleted.selection.nodeId).toBeNull();
    expect(findNodeById(undo(deleted).document, "text-1")?.name).toBe("헤드라인");
  });

  test("duplicates the selected node into the same parent and selects the duplicate", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const duplicated = duplicateSelectedNode(initial);
    const duplicate = findNodeById(duplicated.document, "text-1-copy-1");

    expect(duplicate?.name).toBe("헤드라인 복사본");
    expect(duplicate?.transform).toMatchObject({ x: 32, y: 40 });
    expect(duplicated.selection.nodeId).toBe("text-1-copy-1");
    expect(findNodeById(undo(duplicated).document, "text-1-copy-1")).toBeNull();
  });

  test("calculates absolute node position through parent transforms", () => {
    expect(getNodeAbsolutePosition(sampleDocument(), "frame-1")).toEqual({ x: 120, y: 80 });
    expect(getNodeAbsolutePosition(sampleDocument(), "text-1")).toEqual({ x: 152, y: 120 });
    expect(getNodeAbsolutePosition(sampleDocument(), "missing")).toBeNull();
  });

  test("creates a component definition from a selected node", () => {
    const initial = createEditorState(sampleDocument());

    const component = executeEditorCommand(initial, {
      type: "create_component",
      nodeId: "frame-1",
      componentId: "component-1",
      name: "Card"
    });

    expect(component.document.components).toHaveLength(1);
    expect(component.document.components?.[0]).toMatchObject({
      id: "component-1",
      name: "Card",
      variants: [{ id: "default", name: "Default", properties: [] }]
    });
    expect(findNodeById(component.document, "frame-1")?.kind).toBe("component");

    const undone = undo(component);
    expect(undone.document.components).toEqual([]);
    expect(findNodeById(undone.document, "frame-1")?.kind).toBe("frame");
  });

  test("creates and detaches a component instance", () => {
    const component = executeEditorCommand(createEditorState(sampleDocument()), {
      type: "create_component",
      nodeId: "frame-1",
      componentId: "component-1",
      name: "Card"
    });

    const instance = executeEditorCommand(component, {
      type: "create_component_instance",
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });

    const instanceNode = findNodeById(instance.document, "instance-1");
    expect(instanceNode).toMatchObject({
      id: "instance-1",
      kind: "component_instance",
      component_instance: {
        definition_id: "component-1",
        detached: false,
        overrides: []
      }
    });
    expect(instance.selection.nodeId).toBe("instance-1");

    const detached = executeEditorCommand(instance, {
      type: "detach_instance",
      nodeId: "instance-1"
    });

    expect(findNodeById(detached.document, "instance-1")).toMatchObject({
      kind: "frame",
      component_instance: null
    });
  });
});
