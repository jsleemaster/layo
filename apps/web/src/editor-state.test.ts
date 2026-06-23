import { describe, expect, test } from "vitest";
import type { RendererDocument } from "@layo/renderer";
import {
  alignSelectedNodeToParent,
  alignSelectedNodes,
  calculateSnapForMovingBounds,
  copySelectedNode,
  createEditorState,
  deleteSelectedNode,
  distributeSelectedNodes,
  duplicateSelectedNode,
  executeEditorCommand,
  findNodeById,
  fitViewportToSelection,
  flipSelectedNodes,
  frameSelectedNodes,
  createImageNode,
  createRectangleNode,
  createTextNode,
  groupSelectedNodes,
  getNodeBounds,
  getNodeAbsolutePosition,
  getTopmostNodeIdAtPoint,
  getSelectionBoundsForNodeIds,
  moveSelectedNodesBy,
  nudgeSelectedNode,
  panViewport,
  pasteCopiedNode,
  pasteCopiedNodeAt,
  redo,
  renameSelectedNode,
  reorderSelectedNode,
  replaceSelectedImageAsset,
  resizeSelectedImageToNaturalSize,
  selectAllPageNodes,
  selectNodesInBounds,
  selectNodesWithSameKind,
  setSelectedImageFitMode,
  setSelectedNodeLocked,
  setSelectedNodeVisible,
  setMultiSelection,
  setSelection,
  toggleSelection,
  ungroupSelectedNode,
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
                  value: "Layo",
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

test("creates image nodes backed by asset ids", () => {
  const node = createImageNode(3, {
    assetId: "asset-test",
    name: "붙여넣은 이미지",
    naturalWidth: 640,
    naturalHeight: 480,
    x: 24,
    y: 36,
    width: 120,
    height: 80
  });

  expect(node).toMatchObject({
    id: "image-3",
    kind: "image",
    name: "붙여넣은 이미지",
    transform: { x: 24, y: 36, rotation: 0 },
    size: { width: 120, height: 80 },
    content: { type: "image", asset_id: "asset-test", natural_width: 640, natural_height: 480 },
    children: []
  });
});

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
      value: "Layo"
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

  test("selects page-level nodes and nodes with the same kind from context menu commands", () => {
    const document = sampleDocumentWithTopLevelRectangle();
    document.pages[0]?.children.push({
      id: "rectangle-2",
      kind: "rectangle",
      name: "보조 사각형",
      transform: { x: 460, y: 180, rotation: 0 },
      size: { width: 120, height: 80 },
      style: { fill: "#dcfce7", stroke: "#16a34a", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const all = selectAllPageNodes(createEditorState(document));
    expect(all.selection.nodeIds).toEqual(["frame-1", "rectangle-1", "rectangle-2"]);
    expect(all.selection.nodeId).toBe("rectangle-2");

    const sameKind = selectNodesWithSameKind(setSelection(createEditorState(document), "rectangle-1"));
    expect(sameKind.selection.nodeIds).toEqual(["rectangle-1", "rectangle-2"]);
    expect(sameKind.selection.nodeId).toBe("rectangle-2");
  });

  test("flips selected sibling nodes around the selection bounds with undo support", () => {
    const document = sampleDocumentWithTopLevelRectangle();
    document.pages[0]?.children.push({
      id: "rectangle-2",
      kind: "rectangle",
      name: "보조 사각형",
      transform: { x: 460, y: 180, rotation: 0 },
      size: { width: 120, height: 80 },
      style: { fill: "#dcfce7", stroke: "#16a34a", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    const selected = setMultiSelection(createEditorState(document), ["rectangle-1", "rectangle-2"], "rectangle-2");

    const flipped = flipSelectedNodes(selected, "horizontal");

    expect(findNodeById(flipped.document, "rectangle-1")?.transform.x).toBe(420);
    expect(findNodeById(flipped.document, "rectangle-2")?.transform.x).toBe(180);
    expect(flipped.selection.nodeIds).toEqual(["rectangle-1", "rectangle-2"]);
    expect(findNodeById(undo(flipped).document, "rectangle-1")?.transform.x).toBe(180);
  });

  test("fits the viewport around the current selection bounds", () => {
    const selected = setSelection(createEditorState(sampleDocument()), "text-1");

    const fitted = fitViewportToSelection(selected, { width: 1000, height: 600 }, 40);
    const bounds = getSelectionBoundsForNodeIds(fitted.document, fitted.selection.nodeIds);

    expect(fitted.viewport.scale).toBeCloseTo(3.538, 2);
    expect(bounds).not.toBeNull();
    if (!bounds) {
      return;
    }
    expect((bounds.x + bounds.width / 2) * fitted.viewport.scale + fitted.viewport.x).toBeCloseTo(500, 1);
    expect((bounds.y + bounds.height / 2) * fitted.viewport.scale + fitted.viewport.y).toBeCloseTo(300, 1);
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

  test("copies and pastes the selected node as undoable offset copies", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const clipboard = copySelectedNode(initial);
    const pasted = pasteCopiedNode(initial, clipboard);
    const firstPaste = findNodeById(pasted.document, "text-1-copy-1");

    expect(clipboard?.sourceNodeId).toBe("text-1");
    expect(firstPaste?.name).toBe("헤드라인 복사본");
    expect(firstPaste?.transform).toMatchObject({ x: 56, y: 64 });
    expect(pasted.selection.nodeId).toBe("text-1-copy-1");
    expect(findNodeById(undo(pasted).document, "text-1-copy-1")).toBeNull();

    const pastedAgain = pasteCopiedNode(pasted, clipboard);
    const secondPaste = findNodeById(pastedAgain.document, "text-1-copy-2");

    expect(secondPaste?.name).toBe("헤드라인 복사본 2");
    expect(secondPaste?.transform).toMatchObject({ x: 80, y: 88 });
    expect(pastedAgain.selection.nodeId).toBe("text-1-copy-2");
  });

  test("pastes copied nodes at the requested document point", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");
    const clipboard = copySelectedNode(initial);

    const pasted = pasteCopiedNodeAt(initial, clipboard, { x: 220, y: 240 });
    const pastedNode = findNodeById(pasted.document, "text-1-copy-1");

    expect(pastedNode?.name).toBe("헤드라인 복사본");
    expect(pastedNode?.transform).toMatchObject({ x: 100, y: 160 });
    expect(pasted.selection.nodeId).toBe("text-1-copy-1");
    expect(findNodeById(undo(pasted).document, "text-1-copy-1")).toBeNull();
  });

  test("resizes selected images back to their original uploaded dimensions", () => {
    const document = sampleDocument();
    document.pages[0]?.children.push(
      createImageNode(2, {
        assetId: "asset-original",
        naturalWidth: 640,
        naturalHeight: 480,
        x: 240,
        y: 180,
        width: 320,
        height: 240
      })
    );
    const initial = setSelection(createEditorState(document), "image-2");

    const resized = resizeSelectedImageToNaturalSize(initial);
    expect(findNodeById(resized.document, "image-2")?.size).toEqual({ width: 640, height: 480 });
    expect(findNodeById(resized.document, "image-2")?.transform).toMatchObject({ x: 240, y: 180 });

    const undone = undo(resized);
    expect(findNodeById(undone.document, "image-2")?.size).toEqual({ width: 320, height: 240 });
  });

  test("replaces selected image assets without changing geometry and supports undo", () => {
    const document = sampleDocument();
    document.pages[0]?.children.push(
      createImageNode(2, {
        assetId: "asset-before",
        naturalWidth: 640,
        naturalHeight: 480,
        x: 240,
        y: 180,
        width: 320,
        height: 240
      })
    );
    const initial = setSelection(createEditorState(document), "image-2");

    const replaced = replaceSelectedImageAsset(initial, {
      assetId: "asset-after",
      naturalWidth: 1200,
      naturalHeight: 800
    });
    const image = findNodeById(replaced.document, "image-2");
    expect(image?.content).toMatchObject({
      type: "image",
      asset_id: "asset-after",
      natural_width: 1200,
      natural_height: 800
    });
    expect(image?.size).toEqual({ width: 320, height: 240 });
    expect(image?.transform).toMatchObject({ x: 240, y: 180 });
    expect(replaced.selection.nodeId).toBe("image-2");

    const undone = undo(replaced);
    expect(findNodeById(undone.document, "image-2")?.content).toMatchObject({
      type: "image",
      asset_id: "asset-before",
      natural_width: 640,
      natural_height: 480
    });
  });

  test("sets selected image fit mode without changing geometry and supports undo", () => {
    const document = sampleDocument();
    document.pages[0]?.children.push(
      createImageNode(2, {
        assetId: "asset-before",
        naturalWidth: 640,
        naturalHeight: 480,
        x: 240,
        y: 180,
        width: 320,
        height: 180
      })
    );
    const initial = setSelection(createEditorState(document), "image-2");

    const fitted = setSelectedImageFitMode(initial, "fit");
    const image = findNodeById(fitted.document, "image-2");
    expect(image?.content).toMatchObject({
      type: "image",
      asset_id: "asset-before",
      natural_width: 640,
      natural_height: 480,
      fit_mode: "fit"
    });
    expect(image?.size).toEqual({ width: 320, height: 180 });
    expect(image?.transform).toMatchObject({ x: 240, y: 180 });
    expect(fitted.selection.nodeId).toBe("image-2");

    const filled = setSelectedImageFitMode(fitted, "fill");
    expect(findNodeById(filled.document, "image-2")?.content).toMatchObject({
      fit_mode: "fill"
    });

    const undone = undo(filled);
    expect(findNodeById(undone.document, "image-2")?.content).toMatchObject({
      fit_mode: "fit"
    });
  });

  test("reorders selected sibling layers with undo", () => {
    const initial = setSelection(createEditorState(sampleDocumentWithTopLevelRectangle()), "frame-1");

    const front = reorderSelectedNode(initial, "front");
    expect(front.document.pages[0]?.children.map((node) => node.id)).toEqual(["rectangle-1", "frame-1"]);
    expect(front.selection.nodeId).toBe("frame-1");
    expect(undo(front).document.pages[0]?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);

    const backward = reorderSelectedNode(front, "backward");
    expect(backward.document.pages[0]?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);
    expect(backward.selection.nodeId).toBe("frame-1");
  });

  test("renames the selected layer with undo support", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const renamed = renameSelectedNode(initial, "검사기 제목");
    expect(findNodeById(renamed.document, "text-1")?.name).toBe("검사기 제목");
    expect(renamed.selection.nodeId).toBe("text-1");

    const undone = undo(renamed);
    expect(findNodeById(undone.document, "text-1")?.name).toBe("헤드라인");
  });

  test("groups selected sibling layers into one transparent layer and supports undo", () => {
    const initial = setMultiSelection(
      createEditorState(sampleDocumentWithTopLevelRectangle()),
      ["frame-1", "rectangle-1"],
      "rectangle-1"
    );

    const grouped = groupSelectedNodes(initial, "group-1", "그룹 1");
    const group = findNodeById(grouped.document, "group-1");

    expect(group).toMatchObject({
      id: "group-1",
      kind: "group",
      name: "그룹 1",
      transform: { x: 120, y: 80, rotation: 0 },
      size: { width: 420, height: 280 },
      style: { fill: "transparent", stroke: null, stroke_width: 0, opacity: 1 }
    });
    expect(group?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);
    expect(group?.children[0]?.transform).toMatchObject({ x: 0, y: 0 });
    expect(group?.children[1]?.transform).toMatchObject({ x: 60, y: 60 });
    expect(grouped.document.pages[0]?.children.map((node) => node.id)).toEqual(["group-1"]);
    expect(grouped.selection).toEqual({ nodeId: "group-1", nodeIds: ["group-1"] });

    const undone = undo(grouped);
    expect(findNodeById(undone.document, "group-1")).toBeNull();
    expect(undone.document.pages[0]?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);
    expect(findNodeById(undone.document, "rectangle-1")?.transform).toMatchObject({ x: 180, y: 140 });
  });

  test("groups selected sibling layers inside a frame without losing the parent relationship", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1");
    frame?.children.push({
      id: "rectangle-1",
      kind: "rectangle",
      name: "사각형",
      transform: { x: 160, y: 140, rotation: 0 },
      size: { width: 120, height: 80 },
      style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    const initial = setMultiSelection(createEditorState(document), ["text-1", "rectangle-1"], "rectangle-1");

    const grouped = groupSelectedNodes(initial, "group-1", "그룹 1");
    const parentFrame = findNodeById(grouped.document, "frame-1");
    const group = findNodeById(grouped.document, "group-1");

    expect(parentFrame?.children.map((node) => node.id)).toEqual(["group-1"]);
    expect(group?.children.map((node) => node.id)).toEqual(["text-1", "rectangle-1"]);
    expect(group?.transform).toMatchObject({ x: 32, y: 40 });
    expect(findNodeById(grouped.document, "rectangle-1")?.transform).toMatchObject({ x: 128, y: 100 });
  });

  test("frames selected sibling layers as a real frame and supports undo", () => {
    const initial = setMultiSelection(
      createEditorState(sampleDocumentWithTopLevelRectangle()),
      ["frame-1", "rectangle-1"],
      "rectangle-1"
    );

    const framed = frameSelectedNodes(initial, "frame-selection-1", "선택 프레임");
    const frame = findNodeById(framed.document, "frame-selection-1");

    expect(frame).toMatchObject({
      id: "frame-selection-1",
      kind: "frame",
      name: "선택 프레임",
      transform: { x: 120, y: 80, rotation: 0 },
      size: { width: 420, height: 280 },
      style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 }
    });
    expect(frame?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);
    expect(frame?.children[0]?.transform).toMatchObject({ x: 0, y: 0 });
    expect(frame?.children[1]?.transform).toMatchObject({ x: 60, y: 60 });
    expect(framed.document.pages[0]?.children.map((node) => node.id)).toEqual(["frame-selection-1"]);
    expect(framed.selection).toEqual({ nodeId: "frame-selection-1", nodeIds: ["frame-selection-1"] });

    const undone = undo(framed);
    expect(findNodeById(undone.document, "frame-selection-1")).toBeNull();
    expect(undone.document.pages[0]?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);
    expect(findNodeById(undone.document, "rectangle-1")?.transform).toMatchObject({ x: 180, y: 140 });
  });

  test("ungroups a selected group back into sibling layers and supports undo", () => {
    const initial = setMultiSelection(
      createEditorState(sampleDocumentWithTopLevelRectangle()),
      ["frame-1", "rectangle-1"],
      "rectangle-1"
    );
    const grouped = groupSelectedNodes(initial, "group-1", "그룹 1");

    const ungrouped = ungroupSelectedNode(grouped);
    expect(findNodeById(ungrouped.document, "group-1")).toBeNull();
    expect(ungrouped.document.pages[0]?.children.map((node) => node.id)).toEqual(["frame-1", "rectangle-1"]);
    expect(findNodeById(ungrouped.document, "frame-1")?.transform).toMatchObject({ x: 120, y: 80 });
    expect(findNodeById(ungrouped.document, "rectangle-1")?.transform).toMatchObject({ x: 180, y: 140 });
    expect(ungrouped.selection).toEqual({
      nodeId: "rectangle-1",
      nodeIds: ["frame-1", "rectangle-1"]
    });

    const undone = undo(ungrouped);
    expect(findNodeById(undone.document, "group-1")?.children.map((node) => node.id)).toEqual([
      "frame-1",
      "rectangle-1"
    ]);
  });

  test("locks selected nodes and prevents direct mutation commands until unlocked", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const locked = setSelectedNodeLocked(initial, true);
    expect(findNodeById(locked.document, "text-1")?.locked).toBe(true);
    expect(moveSelectedNodesBy(locked, { x: 24, y: 0 })).toBe(locked);
    expect(deleteSelectedNode(locked)).toBe(locked);
    expect(findNodeById(locked.document, "text-1")).not.toBeNull();
    expect(getTopmostNodeIdAtPoint(locked.document, { x: 160, y: 130 })).toBe("frame-1");

    const unlocked = setSelectedNodeLocked(locked, false);
    expect(findNodeById(unlocked.document, "text-1")?.locked).toBe(false);
    expect(moveSelectedNodesBy(unlocked, { x: 24, y: 0 })).not.toBe(unlocked);
  });

  test("hides selected nodes from canvas hit testing while preserving layer state", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const hidden = setSelectedNodeVisible(initial, false);
    expect(findNodeById(hidden.document, "text-1")?.visible).toBe(false);
    expect(getTopmostNodeIdAtPoint(hidden.document, { x: 160, y: 130 })).toBe("frame-1");
    expect(hidden.selection.nodeId).toBe("text-1");

    const shown = setSelectedNodeVisible(hidden, true);
    expect(findNodeById(shown.document, "text-1")?.visible).toBe(true);
    expect(getTopmostNodeIdAtPoint(shown.document, { x: 160, y: 130 })).toBe("text-1");
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
