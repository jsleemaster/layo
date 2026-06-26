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
  setSelectedNodeStyle,
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

  test("applies copied object style with undo support", () => {
    const initial = setSelection(createEditorState(sampleDocument()), "text-1");

    const styled = setSelectedNodeStyle(initial, {
      fill: "#f97316",
      stroke: "#7c2d12",
      stroke_width: 2,
      opacity: 0.7
    });

    expect(findNodeById(styled.document, "text-1")?.style).toEqual({
      fill: "#f97316",
      stroke: "#7c2d12",
      stroke_width: 2,
      opacity: 0.7
    });
    expect(findNodeById(undo(styled).document, "text-1")?.style).toEqual({
      fill: "#111827",
      stroke: null,
      stroke_width: 0,
      opacity: 1
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

  test("auto layout fits container size to direct children", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 280 };
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "start",
      justify_content: "start",
      width_sizing: "fit",
      height_sizing: "fit",
      gap: 12,
      padding: { top: 20, right: 24, bottom: 20, left: 24 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 120, height: 40 };
    frame.children.push({
      id: "fit-rectangle-1",
      kind: "rectangle",
      name: "맞춤 사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 30 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "fit-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "frame-1")?.size).toEqual({ width: 168, height: 122 });
    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 24, y: 20 });
    expect(findNodeById(relaid.document, "fit-rectangle-1")?.transform).toMatchObject({ x: 24, y: 72 });
  });

  test("auto layout supports horizontal reverse direction", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "auto",
      direction: "horizontal_reverse",
      align_items: "start",
      justify_content: "start",
      gap: 12,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    } as any;
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 260, height: 48 };
    frame.children.push({
      id: "reverse-row-rectangle-1",
      kind: "rectangle",
      name: "역방향 행 사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 30 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "reverse-row-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 140, y: 20 });
    expect(findNodeById(relaid.document, "reverse-row-rectangle-1")?.transform).toMatchObject({ x: 48, y: 20 });
  });

  test("auto layout supports vertical reverse direction", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "auto",
      direction: "vertical_reverse",
      align_items: "start",
      justify_content: "start",
      gap: 12,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    } as any;
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 260, height: 48 };
    frame.children.push({
      id: "reverse-column-rectangle-1",
      kind: "rectangle",
      name: "역방향 열 사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 30 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "reverse-column-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 20, y: 212 });
    expect(findNodeById(relaid.document, "reverse-column-rectangle-1")?.transform).toMatchObject({ x: 20, y: 170 });
  });

  test("auto layout clamps fit containers and fill children with min and max sizing rules", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 280 };
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "start",
      justify_content: "start",
      width_sizing: "fit",
      height_sizing: "fit",
      min_width: 220,
      max_width: 240,
      min_height: 160,
      max_height: 170,
      gap: 12,
      padding: { top: 20, right: 24, bottom: 20, left: 24 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 260, height: 40 };
    frame.children.push({
      id: "max-rectangle-1",
      kind: "rectangle",
      name: "최대 사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 30 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const fitted = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "max-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(fitted.document, "frame-1")?.size).toEqual({ width: 240, height: 160 });

    const fixedDocument = fitted.document;
    const fixedFrame = findNodeById(fixedDocument, "frame-1") as any;
    fixedFrame.layout = {
      ...fixedFrame.layout,
      width_sizing: "fixed",
      height_sizing: "fixed",
      max_width: undefined,
      min_height: undefined,
      max_height: undefined
    };
    fixedFrame.size = { width: 360, height: 240 };
    const fillText = findNodeById(fixedDocument, "text-1") as any;
    fillText.size = { width: 100, height: 40 };
    fillText.layout_item = {
      width_sizing: "fill",
      height_sizing: "fill",
      max_width: 180,
      min_height: 100,
      max_height: 120,
      margin: { top: 0, right: 6, bottom: 0, left: 6 }
    };

    const filled = executeEditorCommand(createEditorState(fixedDocument), {
      type: "update_node_geometry",
      nodeId: "max-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(filled.document, "text-1")?.layout_item).toMatchObject({
      width_sizing: "fill",
      height_sizing: "fill",
      max_width: 180,
      min_height: 100,
      max_height: 120
    });
    expect(findNodeById(filled.document, "text-1")?.size).toEqual({ width: 180, height: 120 });
    expect(findNodeById(filled.document, "text-1")?.transform).toMatchObject({ x: 30, y: 20 });
    expect(findNodeById(filled.document, "max-rectangle-1")?.transform).toMatchObject({ x: 24, y: 152 });
  });

  test("auto layout centers children on the cross axis and distributes them on the main axis", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      gap: 12,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      align_items: "center",
      justify_content: "space_between"
    };
    frame.children.push({
      id: "rectangle-1",
      kind: "rectangle",
      name: "사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 120, height: 40 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "rectangle-1",
      patch: { width: 120 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 80, y: 20 });
    expect(findNodeById(relaid.document, "rectangle-1")?.transform).toMatchObject({ x: 150, y: 220 });
  });

  test("auto layout lets static children fill fixed parent axes", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 360, height: 240 };
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "start",
      justify_content: "start",
      gap: 12,
      padding: { top: 20, right: 24, bottom: 20, left: 24 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 100, height: 40 };
    text.layout_item = {
      width_sizing: "fill",
      height_sizing: "fill",
      margin: { top: 0, right: 6, bottom: 0, left: 6 }
    };
    frame.children.push({
      id: "fixed-rectangle-1",
      kind: "rectangle",
      name: "고정 사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 30 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "fixed-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.size).toEqual({ width: 300, height: 158 });
    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 30, y: 20 });
    expect(findNodeById(relaid.document, "fixed-rectangle-1")?.transform).toMatchObject({ x: 24, y: 190 });
  });

  test("grid layout auto-places static children into equal cells", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 360, height: 240 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 2,
      align_items: "start",
      justify_content: "start",
      gap: 0,
      row_gap: 12,
      column_gap: 16,
      padding: { top: 20, right: 24, bottom: 20, left: 24 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["grid-rectangle-1", "#e0f2fe"],
      ["grid-rectangle-2", "#fde68a"],
      ["grid-rectangle-3", "#dcfce7"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "grid-rectangle-3",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 24, y: 20 });
    expect(findNodeById(relaid.document, "grid-rectangle-1")?.transform).toMatchObject({ x: 188, y: 20 });
    expect(findNodeById(relaid.document, "grid-rectangle-2")?.transform).toMatchObject({ x: 24, y: 126 });
    expect(findNodeById(relaid.document, "grid-rectangle-3")?.transform).toMatchObject({ x: 188, y: 126 });
  });

  test("grid layout justify_items stretch expands children horizontally within cells", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 320, height: 140 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 1,
      align_items: "start",
      justify_content: "start",
      justify_items: "stretch",
      gap: 0,
      row_gap: 0,
      column_gap: 0,
      padding: { top: 10, right: 10, bottom: 10, left: 10 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 40, height: 40 };

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "text-1",
      patch: { height: 40 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 10, y: 10 });
    expect(findNodeById(relaid.document, "text-1")?.size).toEqual({ width: 150, height: 40 });
  });

  test("grid layout item self alignment overrides container stretch", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 320, height: 160 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 1,
      align_items: "stretch",
      justify_content: "start",
      justify_items: "stretch",
      gap: 0,
      row_gap: 0,
      column_gap: 0,
      padding: { top: 10, right: 10, bottom: 10, left: 10 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 40, height: 40 };
    text.layout_item = {
      justify_self: "end",
      align_self: "center",
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "text-1",
      patch: { width: 40 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 120, y: 60 });
    expect(findNodeById(relaid.document, "text-1")?.size).toEqual({ width: 40, height: 40 });
    expect(findNodeById(relaid.document, "text-1")?.layout_item).toMatchObject({
      justify_self: "end",
      align_self: "center"
    });
  });

  test("grid layout respects manual child row and column placement", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 390, height: 220 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 2,
      align_items: "start",
      justify_content: "start",
      gap: 0,
      row_gap: 10,
      column_gap: 12,
      padding: { top: 20, right: 15, bottom: 20, left: 15 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    text.layout_item = {
      grid_column: 3,
      grid_row: 2,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };
    for (const [id, fill] of [
      ["manual-grid-rectangle-1", "#e0f2fe"],
      ["manual-grid-rectangle-2", "#fde68a"],
      ["manual-grid-rectangle-3", "#dcfce7"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "manual-grid-rectangle-3",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.layout_item).toMatchObject({
      grid_column: 3,
      grid_row: 2
    });
    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 263, y: 115 });
    expect(findNodeById(relaid.document, "manual-grid-rectangle-1")?.transform).toMatchObject({ x: 15, y: 20 });
    expect(findNodeById(relaid.document, "manual-grid-rectangle-2")?.transform).toMatchObject({ x: 139, y: 20 });
    expect(findNodeById(relaid.document, "manual-grid-rectangle-3")?.transform).toMatchObject({ x: 263, y: 20 });
  });

  test("grid layout spans a manual child across multiple cells", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 390, height: 220 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 2,
      align_items: "start",
      justify_content: "start",
      gap: 0,
      row_gap: 10,
      column_gap: 12,
      padding: { top: 20, right: 15, bottom: 20, left: 15 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    text.layout_item = {
      grid_column: 1,
      grid_row: 1,
      grid_column_span: 2,
      grid_row_span: 2,
      width_sizing: "fill",
      height_sizing: "fill",
      margin: { top: 5, right: 6, bottom: 7, left: 8 }
    };
    for (const [id, fill] of [
      ["spanned-grid-rectangle-1", "#e0f2fe"],
      ["spanned-grid-rectangle-2", "#fde68a"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "spanned-grid-rectangle-2",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.layout_item).toMatchObject({
      grid_column: 1,
      grid_row: 1,
      grid_column_span: 2,
      grid_row_span: 2
    });
    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 23, y: 25 });
    expect(findNodeById(relaid.document, "text-1")?.size).toEqual({ width: 222, height: 168 });
    expect(findNodeById(relaid.document, "spanned-grid-rectangle-1")?.transform).toMatchObject({
      x: 263,
      y: 20
    });
    expect(findNodeById(relaid.document, "spanned-grid-rectangle-2")?.transform).toMatchObject({
      x: 263,
      y: 115
    });
  });

  test("grid layout sizes tracks with pixel and fraction units", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 500, height: 260 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 2,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "fr", value: 2 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      row_gap: 10,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["track-grid-rectangle-1", "#e0f2fe"],
      ["track-grid-rectangle-2", "#fde68a"],
      ["track-grid-rectangle-3", "#dcfce7"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "track-grid-rectangle-3",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(relaid.document, "track-grid-rectangle-1")?.transform).toMatchObject({ x: 150, y: 20 });
    expect(findNodeById(relaid.document, "track-grid-rectangle-2")?.transform.x).toBeCloseTo(373.33, 1);
    expect(findNodeById(relaid.document, "track-grid-rectangle-2")?.transform.y).toBe(20);
    expect(findNodeById(relaid.document, "track-grid-rectangle-3")?.transform).toMatchObject({ x: 20, y: 110 });
  });

  test("deletes a grid track with placed children in one undoable command", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 240 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 2,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [
        { type: "px", value: 90 },
        { type: "fr", value: 1 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["delete-track-rectangle-1", "#e0f2fe"],
      ["delete-track-rectangle-2", "#fde68a"],
      ["delete-track-rectangle-3", "#dcfce7"],
      ["delete-track-rectangle-4", "#fee2e2"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const deleted = executeEditorCommand(createEditorState(document), {
      type: "delete_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      index: 1
    });
    const deletedFrame = findNodeById(deleted.document, "frame-1");

    expect(deletedFrame?.layout).toMatchObject({
      mode: "grid",
      grid_columns: 2,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "fr", value: 1 }
      ]
    });
    expect(findNodeById(deleted.document, "delete-track-rectangle-1")).toBeNull();
    expect(findNodeById(deleted.document, "delete-track-rectangle-4")).toBeNull();
    expect(findNodeById(deleted.document, "delete-track-rectangle-2")?.transform).toMatchObject({ x: 150, y: 20 });
    expect(deleted.history.past).toHaveLength(1);

    const restored = undo(deleted);
    expect(findNodeById(restored.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_columns: 3,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ]
    });
    expect(findNodeById(restored.document, "delete-track-rectangle-1")?.name).toBe("delete-track-rectangle-1");
    expect(findNodeById(restored.document, "delete-track-rectangle-4")?.name).toBe("delete-track-rectangle-4");
  });

  test("does not delete a grid track when an affected child is locked", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 1,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 120 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.locked = true;

    const deleted = executeEditorCommand(createEditorState(document), {
      type: "delete_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      index: 0
    });

    expect(findNodeById(deleted.document, "text-1")?.locked).toBe(true);
    expect(findNodeById(deleted.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_columns: 2,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 120 }
      ]
    });
    expect(deleted.history.past).toHaveLength(0);
  });

  test("reorders a grid column with static children in one undoable command", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 240 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 2,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [
        { type: "px", value: 90 },
        { type: "fr", value: 1 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["reorder-column-rectangle-1", "#e0f2fe"],
      ["reorder-column-rectangle-2", "#fde68a"],
      ["reorder-column-rectangle-3", "#dcfce7"],
      ["reorder-column-rectangle-4", "#fee2e2"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const reordered = executeEditorCommand(createEditorState(document), {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      fromIndex: 0,
      toIndex: 2
    });
    const reorderedFrame = findNodeById(reordered.document, "frame-1");

    expect(reorderedFrame?.layout).toMatchObject({
      mode: "grid",
      grid_columns: 3,
      grid_column_tracks: [
        { type: "px", value: 80 },
        { type: "fr", value: 1 },
        { type: "px", value: 120 }
      ]
    });
    expect(findNodeById(reordered.document, "text-1")?.transform).toMatchObject({ x: 280, y: 20 });
    expect(findNodeById(reordered.document, "reorder-column-rectangle-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(reordered.document, "reorder-column-rectangle-2")?.transform).toMatchObject({ x: 110, y: 20 });
    expect(findNodeById(reordered.document, "reorder-column-rectangle-3")?.transform).toMatchObject({ x: 280, y: 110 });
    expect(findNodeById(reordered.document, "reorder-column-rectangle-4")?.transform).toMatchObject({ x: 20, y: 110 });
    expect(findNodeById(reordered.document, "text-1")?.layout_item).toMatchObject({ grid_column: 3, grid_row: 1 });
    expect(reordered.history.past).toHaveLength(1);

    const restored = undo(reordered);
    expect(findNodeById(restored.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ]
    });
    expect(findNodeById(restored.document, "text-1")?.layout_item).toBeUndefined();
  });

  test("reorders a grid row with static children in one undoable command", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 300, height: 260 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 3,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [
        { type: "px", value: 90 },
        { type: "px", value: 40 },
        { type: "fr", value: 1 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["reorder-row-rectangle-1", "#e0f2fe"],
      ["reorder-row-rectangle-2", "#fde68a"],
      ["reorder-row-rectangle-3", "#dcfce7"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const reordered = executeEditorCommand(createEditorState(document), {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "row",
      fromIndex: 0,
      toIndex: 2
    });

    expect(findNodeById(reordered.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_rows: 3,
      grid_row_tracks: [
        { type: "px", value: 40 },
        { type: "fr", value: 1 },
        { type: "px", value: 90 }
      ]
    });
    expect(findNodeById(reordered.document, "text-1")?.transform).toMatchObject({ x: 20, y: 150 });
    expect(findNodeById(reordered.document, "reorder-row-rectangle-1")?.transform).toMatchObject({ x: 150, y: 150 });
    expect(findNodeById(reordered.document, "reorder-row-rectangle-2")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(reordered.document, "reorder-row-rectangle-3")?.transform).toMatchObject({ x: 150, y: 20 });
    expect(findNodeById(reordered.document, "text-1")?.layout_item).toMatchObject({ grid_column: 1, grid_row: 3 });
  });

  test("does not reorder a grid track when a moving child is locked", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 1,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 120 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.locked = true;

    const reordered = executeEditorCommand(createEditorState(document), {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      fromIndex: 0,
      toIndex: 1
    });

    expect(findNodeById(reordered.document, "text-1")?.locked).toBe(true);
    expect(findNodeById(reordered.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 120 }
      ]
    });
    expect(reordered.history.past).toHaveLength(0);
  });

  test("reorders a grid column while preserving child positions when requested", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 240 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 1,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [{ type: "px", value: 90 }],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["preserve-column-rectangle-1", "#fde68a"],
      ["preserve-column-rectangle-2", "#dcfce7"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const laidOut = executeEditorCommand(createEditorState(document), {
      type: "set_node_layout",
      nodeId: "frame-1",
      layout: frame.layout
    });
    const originalTextTransform = findNodeById(laidOut.document, "text-1")?.transform;
    const originalFirstRectangleTransform = findNodeById(laidOut.document, "preserve-column-rectangle-1")?.transform;
    const originalSecondRectangleTransform = findNodeById(laidOut.document, "preserve-column-rectangle-2")?.transform;

    const reordered = executeEditorCommand(laidOut, {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      fromIndex: 0,
      toIndex: 2,
      preserveChildren: true
    });

    expect(findNodeById(reordered.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_column_tracks: [
        { type: "px", value: 80 },
        { type: "fr", value: 1 },
        { type: "px", value: 120 }
      ]
    });
    expect(findNodeById(reordered.document, "text-1")?.transform).toMatchObject(originalTextTransform ?? {});
    expect(findNodeById(reordered.document, "preserve-column-rectangle-1")?.transform).toMatchObject(
      originalFirstRectangleTransform ?? {}
    );
    expect(findNodeById(reordered.document, "preserve-column-rectangle-2")?.transform).toMatchObject(
      originalSecondRectangleTransform ?? {}
    );
    expect(findNodeById(reordered.document, "text-1")?.layout_item?.position).toBeUndefined();
    expect(findNodeById(reordered.document, "preserve-column-rectangle-1")?.layout_item).toMatchObject({
      grid_column: 2,
      grid_row: 1,
      margin: { left: 40 }
    });
    expect(reordered.history.past).toHaveLength(2);

    const restored = undo(reordered);
    expect(findNodeById(restored.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ]
    });
    expect(findNodeById(restored.document, "preserve-column-rectangle-1")?.layout_item).toBeUndefined();
  });

  test("reorders a grid row while preserving child positions when requested", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 300, height: 260 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 1,
      grid_rows: 3,
      grid_column_tracks: [{ type: "px", value: 120 }],
      grid_row_tracks: [
        { type: "px", value: 90 },
        { type: "px", value: 40 },
        { type: "fr", value: 1 }
      ],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      row_gap: 0,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    for (const [id, fill] of [
      ["preserve-row-rectangle-1", "#fde68a"],
      ["preserve-row-rectangle-2", "#dcfce7"]
    ]) {
      frame.children.push({
        id,
        kind: "rectangle",
        name: id,
        transform: { x: 0, y: 0, rotation: 0 },
        size: { width: 80, height: 40 },
        style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: []
      });
    }

    const laidOut = executeEditorCommand(createEditorState(document), {
      type: "set_node_layout",
      nodeId: "frame-1",
      layout: frame.layout
    });
    const originalTextTransform = findNodeById(laidOut.document, "text-1")?.transform;
    const originalFirstRectangleTransform = findNodeById(laidOut.document, "preserve-row-rectangle-1")?.transform;
    const originalSecondRectangleTransform = findNodeById(laidOut.document, "preserve-row-rectangle-2")?.transform;

    const reordered = executeEditorCommand(laidOut, {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "row",
      fromIndex: 0,
      toIndex: 2,
      preserveChildren: true
    });

    expect(findNodeById(reordered.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_row_tracks: [
        { type: "px", value: 40 },
        { type: "fr", value: 1 },
        { type: "px", value: 90 }
      ]
    });
    expect(findNodeById(reordered.document, "text-1")?.transform).toMatchObject(originalTextTransform ?? {});
    expect(findNodeById(reordered.document, "preserve-row-rectangle-1")?.transform).toMatchObject(
      originalFirstRectangleTransform ?? {}
    );
    expect(findNodeById(reordered.document, "preserve-row-rectangle-2")?.transform).toMatchObject(
      originalSecondRectangleTransform ?? {}
    );
    expect(findNodeById(reordered.document, "preserve-row-rectangle-1")?.layout_item).toMatchObject({
      grid_column: 1,
      grid_row: 2,
      margin: { top: 50 }
    });
  });

  test("reorders a spanned grid column item by bounding moved tracks", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 160 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 1,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [{ type: "px", value: 90 }],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    text.layout_item = {
      grid_column: 1,
      grid_row: 1,
      grid_column_span: 2,
      width_sizing: "fill",
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };

    const reordered = executeEditorCommand(createEditorState(document), {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      fromIndex: 0,
      toIndex: 2
    });

    expect(findNodeById(reordered.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_column_tracks: [
        { type: "px", value: 80 },
        { type: "fr", value: 1 },
        { type: "px", value: 120 }
      ]
    });
    expect(findNodeById(reordered.document, "text-1")?.layout_item).toMatchObject({
      grid_column: 1,
      grid_row: 1,
      grid_column_span: 3
    });
    expect(findNodeById(reordered.document, "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(reordered.document, "text-1")?.size).toMatchObject({ width: 380, height: 40 });
    expect(reordered.history.past).toHaveLength(1);
  });

  test("reorders a named grid area span while preserving the child area assignment", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 420, height: 160 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 1,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "px", value: 80 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [{ type: "px", value: 90 }],
      grid_areas: [{ name: "hero", column: 1, row: 1, column_span: 2, row_span: 1 }],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      column_gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    text.layout_item = {
      grid_area: "hero",
      width_sizing: "fill",
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };

    const reordered = executeEditorCommand(createEditorState(document), {
      type: "reorder_grid_track_with_children",
      nodeId: "frame-1",
      axis: "column",
      fromIndex: 0,
      toIndex: 2
    });

    expect(findNodeById(reordered.document, "frame-1")?.layout).toMatchObject({
      mode: "grid",
      grid_column_tracks: [
        { type: "px", value: 80 },
        { type: "fr", value: 1 },
        { type: "px", value: 120 }
      ],
      grid_areas: [{ name: "hero", column: 1, row: 1, column_span: 3, row_span: 1 }]
    });
    expect(findNodeById(reordered.document, "text-1")?.layout_item).toMatchObject({ grid_area: "hero" });
    expect(findNodeById(reordered.document, "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(reordered.document, "text-1")?.size).toMatchObject({ width: 380, height: 40 });
    expect(reordered.history.past).toHaveLength(1);
  });

  test("grid layout places a child into a named area", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 390, height: 220 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 3,
      grid_rows: 2,
      grid_areas: [{ name: "hero", column: 2, row: 1, column_span: 2, row_span: 2 }],
      align_items: "start",
      justify_content: "start",
      gap: 0,
      row_gap: 10,
      column_gap: 12,
      padding: { top: 20, right: 15, bottom: 20, left: 15 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 80, height: 40 };
    text.layout_item = {
      grid_area: "hero",
      width_sizing: "fill",
      height_sizing: "fill",
      margin: { top: 5, right: 6, bottom: 7, left: 8 }
    };
    frame.children.push({
      id: "area-grid-rectangle-1",
      kind: "rectangle",
      name: "Area grid rectangle 1",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 40 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "area-grid-rectangle-1",
      patch: { width: 80 }
    });

    expect(findNodeById(relaid.document, "text-1")?.layout_item).toMatchObject({ grid_area: "hero" });
    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 147, y: 25 });
    expect(findNodeById(relaid.document, "text-1")?.size).toEqual({ width: 222, height: 168 });
    expect(findNodeById(relaid.document, "area-grid-rectangle-1")?.transform).toMatchObject({ x: 15, y: 20 });
  });

  test("auto layout includes child margins in flow and cross-axis position", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      gap: 12,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      align_items: "start",
      justify_content: "start"
    };
    const text = findNodeById(document, "text-1") as any;
    text.layout_item = {
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    };
    frame.children.push({
      id: "rectangle-1",
      kind: "rectangle",
      name: "사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 120, height: 40 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "rectangle-1",
      patch: { width: 120 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 26, y: 30 });
    expect(findNodeById(relaid.document, "rectangle-1")?.transform).toMatchObject({ x: 20, y: 104 });
  });

  test("sets layout item margin through an editor command and supports undo", () => {
    const updated = executeEditorCommand(createEditorState(sampleDocument()), {
      type: "set_node_layout_item",
      nodeId: "text-1",
      layoutItem: { margin: { top: 10, right: 8, bottom: 14, left: 6 } }
    } as any);

    expect(findNodeById(updated.document, "text-1")?.layout_item).toEqual({
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    });

    const undone = undo(updated);
    expect(findNodeById(undone.document, "text-1")?.layout_item).toBeUndefined();
  });

  test("auto layout excludes absolute layout items from flow", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.layout = {
      mode: "auto",
      direction: "vertical",
      gap: 12,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      align_items: "start",
      justify_content: "start"
    };
    const text = findNodeById(document, "text-1") as any;
    text.layout_item = {
      position: "absolute",
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    };
    text.transform = { x: 140, y: 160, rotation: 0 };
    frame.children.push({
      id: "rectangle-1",
      kind: "rectangle",
      name: "사각형",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 120, height: 40 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "rectangle-1",
      patch: { width: 120 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 140, y: 160 });
    expect(findNodeById(relaid.document, "rectangle-1")?.transform).toMatchObject({ x: 20, y: 20 });
  });

  test("sets layout item position through an editor command and supports undo", () => {
    const updated = executeEditorCommand(createEditorState(sampleDocument()), {
      type: "set_node_layout_item",
      nodeId: "text-1",
      layoutItem: { position: "absolute", margin: { top: 10, right: 8, bottom: 14, left: 6 } }
    } as any);

    expect(findNodeById(updated.document, "text-1")?.layout_item).toEqual({
      position: "absolute",
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    });

    const undone = undo(updated);
    expect(findNodeById(undone.document, "text-1")?.layout_item).toBeUndefined();
  });


  test("auto layout uses separate row and column gaps for wrapped rows", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 200, height: 220 };
    frame.layout = {
      mode: "auto",
      direction: "horizontal",
      wrap: "wrap",
      align_content: "start",
      align_items: "start",
      justify_content: "start",
      gap: 12,
      row_gap: 24,
      column_gap: 6,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 70, height: 40 };
    frame.children.push({
      id: "gap-rectangle-1",
      kind: "rectangle",
      name: "간격 사각형 1",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 70, height: 40 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    frame.children.push({
      id: "gap-rectangle-2",
      kind: "rectangle",
      name: "간격 사각형 2",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 70, height: 40 },
      style: { fill: "#fde68a", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "gap-rectangle-2",
      patch: { width: 70 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(relaid.document, "gap-rectangle-1")?.transform).toMatchObject({ x: 96, y: 20 });
    expect(findNodeById(relaid.document, "gap-rectangle-2")?.transform).toMatchObject({ x: 20, y: 84 });
  });

  test("auto layout wraps horizontal children into new rows", () => {
    const document = sampleDocument();
    const frame = findNodeById(document, "frame-1") as any;
    frame.size = { width: 180, height: 220 };
    frame.layout = {
      mode: "auto",
      direction: "horizontal",
      wrap: "wrap",
      align_content: "start",
      align_items: "start",
      justify_content: "start",
      gap: 12,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const text = findNodeById(document, "text-1") as any;
    text.size = { width: 90, height: 40 };
    frame.children.push({
      id: "wrap-rectangle-1",
      kind: "rectangle",
      name: "줄바꿈 사각형 1",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 90, height: 40 },
      style: { fill: "#e0f2fe", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    frame.children.push({
      id: "wrap-rectangle-2",
      kind: "rectangle",
      name: "줄바꿈 사각형 2",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 90, height: 40 },
      style: { fill: "#fde68a", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "empty" },
      children: []
    });

    const relaid = executeEditorCommand(createEditorState(document), {
      type: "update_node_geometry",
      nodeId: "wrap-rectangle-2",
      patch: { width: 90 }
    });

    expect(findNodeById(relaid.document, "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(findNodeById(relaid.document, "wrap-rectangle-1")?.transform).toMatchObject({ x: 20, y: 72 });
    expect(findNodeById(relaid.document, "wrap-rectangle-2")?.transform).toMatchObject({ x: 20, y: 124 });
  });

  test("sets auto layout through an editor command and supports undo", () => {
    const layout = {
      mode: "auto",
      direction: "vertical",
      wrap: "wrap",
      align_content: "space_between",
      align_items: "start",
      justify_content: "start",
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
