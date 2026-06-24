import type {
  ImageFitMode,
  NodeConstraints,
  NodeLayout,
  RendererDocument,
  RendererNode
} from "@layo/renderer";

export interface EditorSelection {
  nodeId: string | null;
  nodeIds: string[];
}

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeDragGeometry {
  nodeId: string;
  transform: { x: number; y: number };
  parentAbsolutePosition: { x: number; y: number };
  bounds: SelectionBounds;
}

export type SnapGuide =
  | {
      orientation: "vertical";
      x: number;
      y1: number;
      y2: number;
    }
  | {
      orientation: "horizontal";
      y: number;
      x1: number;
      x2: number;
    };

export interface SnapResult {
  delta: { x: number; y: number };
  guides: SnapGuide[];
}

export type AlignmentMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributionMode = "horizontal" | "vertical";
export type FlipAxis = "horizontal" | "vertical";
export type ReorderDirection = "front" | "forward" | "backward" | "back";

export interface EditorViewport {
  scale: number;
  x: number;
  y: number;
}

export interface EditorHistory {
  past: EditorCommand[];
  future: EditorCommand[];
}

export interface EditorState {
  document: RendererDocument;
  selection: EditorSelection;
  viewport: EditorViewport;
  history: EditorHistory;
}

export interface EditorNodeClipboard {
  sourceNodeId: string;
  parentId: string;
  node: RendererNode;
}

export type EditorNodeStyle = RendererNode["style"];

export type GeometryPatch = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type EditorCommand =
  | {
      type: "update_node_geometry";
      nodeId: string;
      patch: GeometryPatch;
    }
  | {
      type: "update_nodes_geometry";
      patches: Array<{ nodeId: string; patch: GeometryPatch }>;
    }
  | {
      type: "set_fill";
      nodeId: string;
      fill: string;
    }
  | {
      type: "set_node_style";
      nodeId: string;
      style: EditorNodeStyle;
    }
  | {
      type: "update_text";
      nodeId: string;
      value: string;
    }
  | {
      type: "replace_image_asset";
      nodeId: string;
      assetId: string;
      naturalWidth?: number;
      naturalHeight?: number;
    }
  | {
      type: "set_image_fit_mode";
      nodeId: string;
      fitMode: ImageFitMode;
    }
  | {
      type: "create_node";
      parentId: string;
      node: RendererNode;
    }
  | {
      type: "delete_node";
      parentId: string;
      node: RendererNode;
    }
  | {
      type: "reorder_node";
      parentId: string;
      nodeId: string;
      toIndex: number;
    }
  | {
      type: "set_node_name";
      nodeId: string;
      name: string;
    }
  | {
      type: "group_nodes";
      parentId: string;
      nodeIds: string[];
      groupId: string;
      name: string;
    }
  | {
      type: "frame_nodes";
      parentId: string;
      nodeIds: string[];
      frameId: string;
      name: string;
    }
  | {
      type: "ungroup_node";
      parentId: string;
      groupId: string;
      previousGroup?: RendererNode;
    }
  | {
      type: "restore_group_node";
      parentId: string;
      group: RendererNode;
    }
  | {
      type: "unframe_node";
      parentId: string;
      frameId: string;
      previousFrame?: RendererNode;
    }
  | {
      type: "restore_frame_node";
      parentId: string;
      frame: RendererNode;
    }
  | {
      type: "set_node_locked";
      nodeId: string;
      locked: boolean;
    }
  | {
      type: "set_node_visible";
      nodeId: string;
      visible: boolean;
    }
  | {
      type: "create_component";
      nodeId: string;
      componentId: string;
      name: string;
    }
  | {
      type: "delete_component";
      nodeId: string;
      componentId: string;
      previousNode: RendererNode;
    }
  | {
      type: "create_component_instance";
      parentId: string;
      definitionId: string;
      instanceId: string;
      x: number;
      y: number;
    }
  | {
      type: "detach_instance";
      nodeId: string;
      previousNode?: RendererNode;
    }
  | {
      type: "set_node_layout";
      nodeId: string;
      layout: NodeLayout | null;
      previousChildren?: Array<{
        id: string;
        transform: RendererNode["transform"];
        size: RendererNode["size"];
      }>;
    }
  | {
      type: "set_node_constraints";
      nodeId: string;
      constraints: NodeConstraints | null;
    };

interface CommandResult {
  document: RendererDocument;
  inverse: EditorCommand | null;
  selectedNodeId?: string | null;
}

const MIN_NODE_SIZE = 1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const DEFAULT_SNAP_THRESHOLD = 6;
const DEFAULT_CONSTRAINTS: NodeConstraints = { horizontal: "left", vertical: "top" };
const PASTE_OFFSET = 24;

export function createEditorState(document: RendererDocument): EditorState {
  return {
    document,
    selection: { nodeId: null, nodeIds: [] },
    viewport: { scale: 1, x: 0, y: 0 },
    history: { past: [], future: [] }
  };
}

export function findNodeById(document: RendererDocument, nodeId: string): RendererNode | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = findInNode(node, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function getNodeAbsolutePosition(
  document: RendererDocument,
  nodeId: string
): { x: number; y: number } | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = absolutePositionInNode(node, nodeId, { x: 0, y: 0 });
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function getNodeBounds(document: RendererDocument, nodeId: string): SelectionBounds | null {
  return findNodeGeometry(document, nodeId)?.bounds ?? null;
}

export function isNodeLocked(node: RendererNode | null | undefined): boolean {
  return node?.locked === true;
}

export function isNodeVisible(node: RendererNode | null | undefined): boolean {
  return node?.visible !== false;
}

export function getTopmostNodeIdAtPoint(
  document: RendererDocument,
  point: { x: number; y: number },
  excludedNodeIds = new Set<string>()
): string | null {
  for (const page of document.pages) {
    for (let index = page.children.length - 1; index >= 0; index -= 1) {
      const found = topmostNodeIdAtPointInTree(page.children[index], point, { x: 0, y: 0 }, excludedNodeIds);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function executeEditorCommand(state: EditorState, command: EditorCommand): EditorState {
  const result = applyCommand(state.document, command);
  if (!result.inverse) {
    return state;
  }

  return {
    ...state,
    document: result.document,
    selection:
      result.selectedNodeId === undefined
        ? retainExistingSelection(result.document, state.selection)
        : normalizeSelection(result.document, result.selectedNodeId ? [result.selectedNodeId] : [], result.selectedNodeId),
    history: {
      past: [...state.history.past, result.inverse],
      future: []
    }
  };
}

export function undo(state: EditorState): EditorState {
  const inverse = state.history.past.at(-1);
  if (!inverse) {
    return state;
  }

  const result = applyCommand(state.document, inverse);
  if (!result.inverse) {
    return state;
  }

  return {
    ...state,
    document: result.document,
    selection: retainExistingSelection(result.document, state.selection),
    history: {
      past: state.history.past.slice(0, -1),
      future: [result.inverse, ...state.history.future]
    }
  };
}

export function redo(state: EditorState): EditorState {
  const command = state.history.future[0];
  if (!command) {
    return state;
  }

  const result = applyCommand(state.document, command);
  if (!result.inverse) {
    return state;
  }

  return {
    ...state,
    document: result.document,
    selection:
      result.selectedNodeId === undefined
        ? retainExistingSelection(result.document, state.selection)
        : normalizeSelection(result.document, result.selectedNodeId ? [result.selectedNodeId] : [], result.selectedNodeId),
    history: {
      past: [...state.history.past, result.inverse],
      future: state.history.future.slice(1)
    }
  };
}

export function setSelection(state: EditorState, nodeId: string | null): EditorState {
  return setMultiSelection(state, nodeId ? [nodeId] : [], nodeId);
}

export function setMultiSelection(
  state: EditorState,
  nodeIds: string[],
  primaryNodeId: string | null = nodeIds.at(-1) ?? null
): EditorState {
  return {
    ...state,
    selection: normalizeSelection(state.document, nodeIds, primaryNodeId)
  };
}

export function toggleSelection(state: EditorState, nodeId: string): EditorState {
  if (!findNodeById(state.document, nodeId)) {
    return state;
  }

  const currentNodeIds = selectionNodeIds(state.selection);
  if (currentNodeIds.includes(nodeId)) {
    const nextNodeIds = currentNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId);
    const nextPrimaryNodeId =
      state.selection.nodeId === nodeId ? nextNodeIds.at(-1) ?? null : state.selection.nodeId;
    return setMultiSelection(state, nextNodeIds, nextPrimaryNodeId);
  }

  return setMultiSelection(state, [...currentNodeIds, nodeId], nodeId);
}

export function setSelectedNodeLocked(state: EditorState, locked: boolean): EditorState {
  const selectedNodeId = state.selection.nodeId;
  if (!selectedNodeId) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "set_node_locked",
    nodeId: selectedNodeId,
    locked
  });
}

export function setSelectedNodeVisible(state: EditorState, visible: boolean): EditorState {
  const selectedNodeId = state.selection.nodeId;
  if (!selectedNodeId) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "set_node_visible",
    nodeId: selectedNodeId,
    visible
  });
}

export function renameSelectedNode(state: EditorState, name: string): EditorState {
  const selectedNodeId = state.selection.nodeId;
  const nextName = name.trim();
  if (!selectedNodeId || !nextName) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "set_node_name",
    nodeId: selectedNodeId,
    name: nextName
  });
}

export function groupSelectedNodes(
  state: EditorState,
  groupId: string,
  name: string
): EditorState {
  const nodeIds = selectionNodeIds(state.selection);
  if (nodeIds.length < 2 || findNodeById(state.document, groupId)) {
    return state;
  }

  const siblings = findSiblingSelection(state.document, nodeIds);
  if (!siblings || siblings.nodes.some(isNodeLocked)) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "group_nodes",
    parentId: siblings.parentId,
    nodeIds: siblings.nodes.map((node) => node.id),
    groupId,
    name: name.trim() || "그룹"
  });
}

export function frameSelectedNodes(
  state: EditorState,
  frameId: string,
  name: string
): EditorState {
  const nodeIds = selectionNodeIds(state.selection);
  if (nodeIds.length < 2 || findNodeById(state.document, frameId)) {
    return state;
  }

  const siblings = findSiblingSelection(state.document, nodeIds);
  if (!siblings || siblings.nodes.some(isNodeLocked)) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "frame_nodes",
    parentId: siblings.parentId,
    nodeIds: siblings.nodes.map((node) => node.id),
    frameId,
    name: name.trim() || "프레임"
  });
}

export function ungroupSelectedNode(state: EditorState): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || selected.node.kind !== "group" || isNodeLocked(selected.node)) {
    return state;
  }

  const childNodeIds = selected.node.children.map((child) => child.id);
  const nextState = executeEditorCommand(state, {
    type: "ungroup_node",
    parentId: selected.parentId,
    groupId: selected.node.id
  });
  return nextState === state ? state : setMultiSelection(nextState, childNodeIds, childNodeIds.at(-1) ?? null);
}

export function selectNodesInBounds(
  state: EditorState,
  bounds: SelectionBounds,
  mode: "replace" | "add" = "replace"
): EditorState {
  const normalizedBounds = normalizeBounds(bounds);
  const selectedNodeIds: string[] = [];

  for (const page of state.document.pages) {
    for (const node of page.children) {
      selectedNodeIds.push(...collectNodeIdsInBounds(node, normalizedBounds, { x: 0, y: 0 }));
    }
  }

  if (mode === "add") {
    const nextNodeIds = [...selectionNodeIds(state.selection), ...selectedNodeIds];
    return setMultiSelection(state, nextNodeIds, selectedNodeIds.at(-1) ?? state.selection.nodeId);
  }

  return setMultiSelection(state, selectedNodeIds, selectedNodeIds.at(-1) ?? null);
}

export function selectAllPageNodes(state: EditorState): EditorState {
  const firstPage = state.document.pages[0];
  if (!firstPage) {
    return state;
  }

  const nodeIds = firstPage.children
    .filter((node) => !isNodeLocked(node) && isNodeVisible(node))
    .map((node) => node.id);

  return setMultiSelection(state, nodeIds, nodeIds.at(-1) ?? null);
}

export function selectNodesWithSameKind(state: EditorState): EditorState {
  const selectedNodeId = state.selection.nodeId;
  const selectedNode = selectedNodeId ? findNodeById(state.document, selectedNodeId) : null;
  if (!selectedNode) {
    return state;
  }

  const nodeIds: string[] = [];
  for (const page of state.document.pages) {
    for (const node of page.children) {
      collectNodeIdsByKind(node, selectedNode.kind, nodeIds);
    }
  }

  return setMultiSelection(state, nodeIds, nodeIds.at(-1) ?? null);
}

export function setViewport(state: EditorState, patch: Partial<EditorViewport>): EditorState {
  return {
    ...state,
    viewport: {
      scale: clamp(patch.scale ?? state.viewport.scale, MIN_ZOOM, MAX_ZOOM),
      x: patch.x ?? state.viewport.x,
      y: patch.y ?? state.viewport.y
    }
  };
}

export function panViewport(state: EditorState, delta: Pick<EditorViewport, "x" | "y">): EditorState {
  return setViewport(state, {
    x: state.viewport.x + delta.x,
    y: state.viewport.y + delta.y
  });
}

export function zoomViewport(state: EditorState, delta: number): EditorState {
  return setViewport(state, {
    scale: state.viewport.scale + delta
  });
}

export function zoomViewportAtPoint(
  state: EditorState,
  delta: number,
  point: { x: number; y: number }
): EditorState {
  const nextScale = clamp(state.viewport.scale + delta, MIN_ZOOM, MAX_ZOOM);
  const documentPoint = {
    x: (point.x - state.viewport.x) / state.viewport.scale,
    y: (point.y - state.viewport.y) / state.viewport.scale
  };

  return setViewport(state, {
    scale: nextScale,
    x: point.x - documentPoint.x * nextScale,
    y: point.y - documentPoint.y * nextScale
  });
}

export function nudgeSelectedNode(
  state: EditorState,
  delta: { x: number; y: number }
): EditorState {
  const selectedNodeId = state.selection.nodeId;
  if (!selectedNodeId) {
    return state;
  }

  const selectedNode = findNodeById(state.document, selectedNodeId);
  if (!selectedNode) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "update_node_geometry",
    nodeId: selectedNodeId,
    patch: {
      x: selectedNode.transform.x + delta.x,
      y: selectedNode.transform.y + delta.y
    }
  });
}

export function getNodeDragGeometriesForNodeIds(
  document: RendererDocument,
  nodeIds: string[]
): NodeDragGeometry[] {
  return selectedNodeGeometries(document, nodeIds).map(toNodeDragGeometry);
}

export function getSelectionBoundsForNodeIds(
  document: RendererDocument,
  nodeIds: string[]
): SelectionBounds | null {
  const geometries = selectedNodeGeometries(document, nodeIds);
  return geometries.length ? geometryBounds(geometries) : null;
}

export function moveSelectedNodesBy(
  state: EditorState,
  delta: { x: number; y: number },
  nodeIds = selectionNodeIds(state.selection)
): EditorState {
  const geometries = selectedNodeGeometries(state.document, nodeIds);
  const patches = geometries.flatMap((geometry) => {
    const nextX = Math.round(geometry.node.transform.x + delta.x);
    const nextY = Math.round(geometry.node.transform.y + delta.y);

    if (nextX === geometry.node.transform.x && nextY === geometry.node.transform.y) {
      return [];
    }

    return [{ nodeId: geometry.node.id, patch: { x: nextX, y: nextY } }];
  });

  return executeBatchGeometryCommand(state, patches);
}

export function flipSelectedNodes(state: EditorState, axis: FlipAxis): EditorState {
  const geometries = selectedNodeGeometries(state.document, selectionNodeIds(state.selection));
  if (geometries.length < 2 || geometries.some((geometry) => isNodeLocked(geometry.node))) {
    return state;
  }

  const bounds = geometryBounds(geometries);
  const patches = geometries.flatMap((geometry) => {
    if (axis === "horizontal") {
      const targetX = bounds.x + bounds.width - (geometry.bounds.x - bounds.x) - geometry.bounds.width;
      const patch = xPatch(geometry, targetX);
      return patch ? [{ nodeId: geometry.node.id, patch }] : [];
    }

    const targetY = bounds.y + bounds.height - (geometry.bounds.y - bounds.y) - geometry.bounds.height;
    const patch = yPatch(geometry, targetY);
    return patch ? [{ nodeId: geometry.node.id, patch }] : [];
  });

  return executeBatchGeometryCommand(state, patches);
}

export function fitViewportToSelection(
  state: EditorState,
  viewportSize: { width: number; height: number },
  padding = 64
): EditorState {
  const bounds = getSelectionBoundsForNodeIds(state.document, selectionNodeIds(state.selection));
  if (!bounds) {
    return state;
  }

  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const scale = clamp(
    Math.min(availableWidth / Math.max(1, bounds.width), availableHeight / Math.max(1, bounds.height)),
    MIN_ZOOM,
    MAX_ZOOM
  );
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };

  return setViewport(state, {
    scale,
    x: viewportSize.width / 2 - center.x * scale,
    y: viewportSize.height / 2 - center.y * scale
  });
}

export function calculateSnapForMovingBounds(
  document: RendererDocument,
  movingNodeIds: string[],
  movingBounds: SelectionBounds,
  rawDelta: { x: number; y: number },
  threshold = DEFAULT_SNAP_THRESHOLD
): SnapResult {
  const targetGeometries = collectSnapTargetGeometries(document, new Set(movingNodeIds));
  const xSnap = findBestAxisSnap("x", movingBounds, rawDelta, targetGeometries, threshold);
  const ySnap = findBestAxisSnap("y", movingBounds, rawDelta, targetGeometries, threshold);
  const delta = {
    x: rawDelta.x + (xSnap?.offset ?? 0),
    y: rawDelta.y + (ySnap?.offset ?? 0)
  };
  const movedBounds = translateBounds(movingBounds, delta);
  const guides: SnapGuide[] = [];

  if (xSnap) {
    guides.push({
      orientation: "vertical",
      x: xSnap.targetPosition,
      y1: Math.min(movedBounds.y, xSnap.target.bounds.y) - 24,
      y2:
        Math.max(
          movedBounds.y + movedBounds.height,
          xSnap.target.bounds.y + xSnap.target.bounds.height
        ) + 24
    });
  }

  if (ySnap) {
    guides.push({
      orientation: "horizontal",
      y: ySnap.targetPosition,
      x1: Math.min(movedBounds.x, ySnap.target.bounds.x) - 24,
      x2:
        Math.max(
          movedBounds.x + movedBounds.width,
          ySnap.target.bounds.x + ySnap.target.bounds.width
        ) + 24
    });
  }

  return { delta, guides };
}

export function alignSelectedNodes(state: EditorState, mode: AlignmentMode): EditorState {
  const geometries = selectedNodeGeometries(state.document, selectionNodeIds(state.selection));
  if (geometries.length < 2) {
    return state;
  }

  const selectionBounds = geometryBounds(geometries);
  const patches = geometries.flatMap((geometry) => {
    const patch = alignmentPatch(geometry, selectionBounds, mode);
    return patch ? [{ nodeId: geometry.node.id, patch }] : [];
  });

  return executeBatchGeometryCommand(state, patches);
}

export function alignSelectedNodeToParent(state: EditorState, mode: AlignmentMode): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected) {
    return state;
  }

  const geometry = findNodeGeometry(state.document, selected.node.id);
  const parentBounds = getNodeBounds(state.document, selected.parentId);
  if (!geometry || !parentBounds) {
    return state;
  }

  const patch = alignmentPatch(geometry, parentBounds, mode);
  return patch ? executeBatchGeometryCommand(state, [{ nodeId: selected.node.id, patch }]) : state;
}

export function distributeSelectedNodes(state: EditorState, mode: DistributionMode): EditorState {
  const geometries = selectedNodeGeometries(state.document, selectionNodeIds(state.selection));
  if (geometries.length < 3) {
    return state;
  }

  const sortedGeometries = [...geometries].sort((a, b) => {
    const firstStart = mode === "horizontal" ? a.bounds.x : a.bounds.y;
    const secondStart = mode === "horizontal" ? b.bounds.x : b.bounds.y;
    return firstStart - secondStart;
  });
  const first = sortedGeometries[0];
  const last = sortedGeometries.at(-1);
  if (!first || !last) {
    return state;
  }

  const totalSize = sortedGeometries.reduce(
    (sum, geometry) => sum + (mode === "horizontal" ? geometry.bounds.width : geometry.bounds.height),
    0
  );
  const start = mode === "horizontal" ? first.bounds.x : first.bounds.y;
  const end =
    mode === "horizontal"
      ? last.bounds.x + last.bounds.width
      : last.bounds.y + last.bounds.height;
  const gap = (end - start - totalSize) / (sortedGeometries.length - 1);

  let cursor = start;
  const patches = sortedGeometries.flatMap((geometry) => {
    const patch = distributionPatch(geometry, mode, cursor);
    cursor += (mode === "horizontal" ? geometry.bounds.width : geometry.bounds.height) + gap;
    return patch ? [{ nodeId: geometry.node.id, patch }] : [];
  });

  return executeBatchGeometryCommand(state, patches);
}

export function deleteSelectedNode(state: EditorState): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || isNodeLocked(selected.node)) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "delete_node",
    parentId: selected.parentId,
    node: selected.node
  });
}

export function duplicateSelectedNode(state: EditorState): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || isNodeLocked(selected.node)) {
    return state;
  }

  const copyIndex = nextCopyIndex(state.document, selected.node.id);
  const copiedNode = structuredClone(selected.node);
  const copiedNodeId = `${selected.node.id}-copy-${copyIndex}`;
  renameNodeTreeForCopy(copiedNode, selected.node.id, copiedNodeId);
  copiedNode.name =
    copyIndex === 1 ? `${selected.node.name} 복사본` : `${selected.node.name} 복사본 ${copyIndex}`;

  return executeEditorCommand(state, {
    type: "create_node",
    parentId: selected.parentId,
    node: copiedNode
  });
}

export function copySelectedNode(state: EditorState): EditorNodeClipboard | null {
  const selected = findSelectedNodeWithParent(state);
  if (!selected) {
    return null;
  }

  return {
    sourceNodeId: selected.node.id,
    parentId: selected.parentId,
    node: structuredClone(selected.node)
  };
}

export function setSelectedNodeStyle(state: EditorState, style: EditorNodeStyle): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || isNodeLocked(selected.node)) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "set_node_style",
    nodeId: selected.node.id,
    style
  });
}

export function pasteCopiedNode(
  state: EditorState,
  clipboard: EditorNodeClipboard | null
): EditorState {
  if (!clipboard) {
    return state;
  }

  const { copiedNode, copyIndex } = createClipboardNodeCopy(state.document, clipboard);
  copiedNode.transform = {
    ...copiedNode.transform,
    x: copiedNode.transform.x + PASTE_OFFSET * copyIndex,
    y: copiedNode.transform.y + PASTE_OFFSET * copyIndex
  };

  return insertCopiedNode(state, clipboard, copiedNode);
}

export function pasteCopiedNodeAt(
  state: EditorState,
  clipboard: EditorNodeClipboard | null,
  point: { x: number; y: number } | null
): EditorState {
  if (!clipboard || !point) {
    return state;
  }

  const { copiedNode } = createClipboardNodeCopy(state.document, clipboard);
  const parentId = findParentChildren(state.document, clipboard.parentId)
    ? clipboard.parentId
    : state.document.pages[0]?.id;
  if (!parentId) {
    return state;
  }

  const parentAbsolute = getParentAbsolutePosition(state.document, parentId);
  copiedNode.transform = {
    ...copiedNode.transform,
    x: Math.round(point.x - parentAbsolute.x),
    y: Math.round(point.y - parentAbsolute.y)
  };

  return executeEditorCommand(state, {
    type: "create_node",
    parentId,
    node: copiedNode
  });
}

export function reorderSelectedNode(state: EditorState, direction: ReorderDirection): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || isNodeLocked(selected.node)) {
    return state;
  }

  const parent = findParentChildren(state.document, selected.parentId);
  if (!parent) {
    return state;
  }

  const currentIndex = parent.children.findIndex((node) => node.id === selected.node.id);
  const lastIndex = parent.children.length - 1;
  if (currentIndex === -1 || lastIndex < 1) {
    return state;
  }

  const targetIndex = {
    front: lastIndex,
    forward: Math.min(lastIndex, currentIndex + 1),
    backward: Math.max(0, currentIndex - 1),
    back: 0
  }[direction];

  if (targetIndex === currentIndex) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "reorder_node",
    parentId: selected.parentId,
    nodeId: selected.node.id,
    toIndex: targetIndex
  });
}

export function createRectangleNode(sequence: number): RendererNode {
  return {
    id: `rectangle-${sequence}`,
    kind: "rectangle",
    name: `사각형 ${sequence}`,
    transform: { x: 180, y: 140, rotation: 0 },
    size: { width: 160, height: 96 },
    style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
    content: { type: "empty" },
    children: []
  };
}

export function createTextNode(sequence: number): RendererNode {
  return {
    id: `text-${sequence}`,
    kind: "text",
    name: `텍스트 ${sequence}`,
    transform: { x: 220, y: 180, rotation: 0 },
    size: { width: 220, height: 44 },
    style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
    content: {
      type: "text",
      value: "새 텍스트",
      font_size: 24,
      font_family: "Inter"
    },
    children: []
  };
}

export function createImageNode(
  sequence: number,
  input: {
    assetId: string;
    name?: string;
    naturalWidth?: number;
    naturalHeight?: number;
    fitMode?: ImageFitMode;
    x: number;
    y: number;
    width: number;
    height: number;
  }
): RendererNode {
  const content: RendererNode["content"] = {
    type: "image",
    asset_id: input.assetId,
    fit_mode: input.fitMode ?? "fill"
  };
  if (input.naturalWidth) {
    content.natural_width = clampSize(input.naturalWidth);
  }
  if (input.naturalHeight) {
    content.natural_height = clampSize(input.naturalHeight);
  }

  return {
    id: `image-${sequence}`,
    kind: "image",
    name: input.name?.trim() || `이미지 ${sequence}`,
    transform: { x: Math.round(input.x), y: Math.round(input.y), rotation: 0 },
    size: { width: clampSize(input.width), height: clampSize(input.height) },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
    content,
    children: []
  };
}

export function resizeSelectedImageToNaturalSize(state: EditorState): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || selected.node.kind !== "image" || selected.node.content.type !== "image") {
    return state;
  }
  if (isNodeLocked(selected.node)) {
    return state;
  }

  const naturalWidth = selected.node.content.natural_width;
  const naturalHeight = selected.node.content.natural_height;
  if (!naturalWidth || !naturalHeight) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "update_node_geometry",
    nodeId: selected.node.id,
    patch: {
      width: naturalWidth,
      height: naturalHeight
    }
  });
}

export function replaceSelectedImageAsset(
  state: EditorState,
  input: { assetId: string; naturalWidth?: number; naturalHeight?: number }
): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || selected.node.kind !== "image" || selected.node.content.type !== "image") {
    return state;
  }
  if (isNodeLocked(selected.node)) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "replace_image_asset",
    nodeId: selected.node.id,
    assetId: input.assetId,
    naturalWidth: input.naturalWidth,
    naturalHeight: input.naturalHeight
  });
}

export function setSelectedImageFitMode(state: EditorState, fitMode: ImageFitMode): EditorState {
  const selected = findSelectedNodeWithParent(state);
  if (!selected || selected.node.kind !== "image" || selected.node.content.type !== "image") {
    return state;
  }
  if (isNodeLocked(selected.node)) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "set_image_fit_mode",
    nodeId: selected.node.id,
    fitMode
  });
}

function applyCommand(document: RendererDocument, command: EditorCommand): CommandResult {
  const next = structuredClone(document);

  switch (command.type) {
    case "update_node_geometry": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }
      const previousSize = { ...node.size };

      const inverse: EditorCommand = {
        type: "update_node_geometry",
        nodeId: command.nodeId,
        patch: {
          x: node.transform.x,
          y: node.transform.y,
          width: node.size.width,
          height: node.size.height
        }
      };

      node.transform = {
        ...node.transform,
        x: command.patch.x ?? node.transform.x,
        y: command.patch.y ?? node.transform.y
      };
      node.size = {
        width: clampSize(command.patch.width ?? node.size.width),
        height: clampSize(command.patch.height ?? node.size.height)
      };
      applyConstraintsAfterParentResize(node, previousSize);
      relayoutDocument(next);

      return { document: next, inverse };
    }
    case "update_nodes_geometry": {
      const inversePatches: Array<{ nodeId: string; patch: GeometryPatch }> = [];
      let changed = false;

      for (const geometryPatch of command.patches) {
        const node = findNodeById(next, geometryPatch.nodeId);
        if (!node || isNodeLocked(node)) {
          continue;
        }

        inversePatches.push({
          nodeId: node.id,
          patch: {
            x: node.transform.x,
            y: node.transform.y,
            width: node.size.width,
            height: node.size.height
          }
        });
        const previousSize = { ...node.size };
        node.transform = {
          ...node.transform,
          x: geometryPatch.patch.x ?? node.transform.x,
          y: geometryPatch.patch.y ?? node.transform.y
        };
        node.size = {
          width: clampSize(geometryPatch.patch.width ?? node.size.width),
          height: clampSize(geometryPatch.patch.height ?? node.size.height)
        };
        applyConstraintsAfterParentResize(node, previousSize);
        changed = true;
      }

      if (!changed) {
        return { document, inverse: null };
      }

      relayoutDocument(next);

      return {
        document: next,
        inverse: { type: "update_nodes_geometry", patches: inversePatches }
      };
    }
    case "set_fill": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const inverse: EditorCommand = {
        type: "set_fill",
        nodeId: command.nodeId,
        fill: node.style.fill
      };
      node.style = { ...node.style, fill: command.fill };
      relayoutDocument(next);

      return { document: next, inverse };
    }
    case "set_node_style": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousStyle = { ...node.style };
      if (
        previousStyle.fill === command.style.fill &&
        previousStyle.stroke === command.style.stroke &&
        previousStyle.stroke_width === command.style.stroke_width &&
        previousStyle.opacity === command.style.opacity
      ) {
        return { document, inverse: null };
      }

      node.style = { ...command.style };
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_node_style",
          nodeId: command.nodeId,
          style: previousStyle
        }
      };
    }
    case "update_text": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || node.content.type !== "text") {
        return { document, inverse: null };
      }

      const inverse: EditorCommand = {
        type: "update_text",
        nodeId: command.nodeId,
        value: node.content.value
      };
      node.content = { ...node.content, value: command.value };
      relayoutDocument(next);

      return { document: next, inverse };
    }
    case "replace_image_asset": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || node.kind !== "image" || node.content.type !== "image") {
        return { document, inverse: null };
      }

      const previousContent = node.content;
      const nextContent: RendererNode["content"] = {
        type: "image",
        asset_id: command.assetId,
        fit_mode: previousContent.fit_mode ?? "fill"
      };
      if (command.naturalWidth) {
        nextContent.natural_width = clampSize(command.naturalWidth);
      }
      if (command.naturalHeight) {
        nextContent.natural_height = clampSize(command.naturalHeight);
      }
      if (
        previousContent.asset_id === nextContent.asset_id &&
        previousContent.natural_width === nextContent.natural_width &&
        previousContent.natural_height === nextContent.natural_height &&
        (previousContent.fit_mode ?? "fill") === (nextContent.fit_mode ?? "fill")
      ) {
        return { document, inverse: null };
      }

      node.content = nextContent;
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "replace_image_asset",
          nodeId: command.nodeId,
          assetId: previousContent.asset_id,
          naturalWidth: previousContent.natural_width,
          naturalHeight: previousContent.natural_height
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_image_fit_mode": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || node.kind !== "image" || node.content.type !== "image") {
        return { document, inverse: null };
      }

      const previousFitMode = node.content.fit_mode ?? "fill";
      if (previousFitMode === command.fitMode) {
        return { document, inverse: null };
      }

      node.content = { ...node.content, fit_mode: command.fitMode };
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_image_fit_mode",
          nodeId: command.nodeId,
          fitMode: previousFitMode
        },
        selectedNodeId: command.nodeId
      };
    }
    case "create_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent || isParentNodeLocked(next, command.parentId)) {
        return { document, inverse: null };
      }

      const node = structuredClone(command.node);
      parent.children.push(node);
      relayoutDocument(next);

      return {
        document: next,
        inverse: { type: "delete_node", parentId: command.parentId, node },
        selectedNodeId: node.id
      };
    }
    case "delete_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent) {
        return { document, inverse: null };
      }

      const index = parent.children.findIndex((node) => node.id === command.node.id);
      if (index === -1) {
        return { document, inverse: null };
      }

      if (isNodeLocked(parent.children[index])) {
        return { document, inverse: null };
      }

      const [node] = parent.children.splice(index, 1);

      return {
        document: next,
        inverse: { type: "create_node", parentId: command.parentId, node },
        selectedNodeId: null
      };
    }
    case "reorder_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent) {
        return { document, inverse: null };
      }

      const fromIndex = parent.children.findIndex((node) => node.id === command.nodeId);
      if (fromIndex === -1 || parent.children.length < 2) {
        return { document, inverse: null };
      }

      if (isNodeLocked(parent.children[fromIndex])) {
        return { document, inverse: null };
      }

      const toIndex = clamp(Math.trunc(command.toIndex), 0, parent.children.length - 1);
      if (fromIndex === toIndex) {
        return { document, inverse: null };
      }

      const [node] = parent.children.splice(fromIndex, 1);
      if (!node) {
        return { document, inverse: null };
      }
      parent.children.splice(toIndex, 0, node);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "reorder_node",
          parentId: command.parentId,
          nodeId: command.nodeId,
          toIndex: fromIndex
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_node_name": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const nextName = command.name.trim();
      if (!nextName || node.name === nextName) {
        return { document, inverse: null };
      }

      const previousName = node.name;
      node.name = nextName;

      return {
        document: next,
        inverse: {
          type: "set_node_name",
          nodeId: command.nodeId,
          name: previousName
        },
        selectedNodeId: command.nodeId
      };
    }
    case "group_nodes": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent || isParentNodeLocked(next, command.parentId) || findNodeById(next, command.groupId)) {
        return { document, inverse: null };
      }

      const selectedNodes = command.nodeIds
        .map((nodeId) => parent.children.find((node) => node.id === nodeId))
        .filter((node): node is RendererNode => Boolean(node));
      if (selectedNodes.length < 2 || selectedNodes.length !== new Set(command.nodeIds).size) {
        return { document, inverse: null };
      }
      if (selectedNodes.some(isNodeLocked)) {
        return { document, inverse: null };
      }

      const selectedIds = new Set(selectedNodes.map((node) => node.id));
      const firstIndex = parent.children.findIndex((node) => selectedIds.has(node.id));
      const bounds = relativeBoundsForNodes(selectedNodes);
      const group: RendererNode = {
        id: command.groupId,
        kind: "group",
        name: command.name.trim() || "그룹",
        transform: { x: bounds.x, y: bounds.y, rotation: 0 },
        size: { width: bounds.width, height: bounds.height },
        style: { fill: "transparent", stroke: null, stroke_width: 0, opacity: 1 },
        content: { type: "empty" },
        children: selectedNodes.map((node) => {
          const child = structuredClone(node);
          child.transform = {
            ...child.transform,
            x: child.transform.x - bounds.x,
            y: child.transform.y - bounds.y
          };
          return child;
        })
      };

      parent.children.splice(0, parent.children.length, ...[
        ...parent.children.slice(0, firstIndex).filter((node) => !selectedIds.has(node.id)),
        group,
        ...parent.children.slice(firstIndex).filter((node) => !selectedIds.has(node.id))
      ]);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "ungroup_node",
          parentId: command.parentId,
          groupId: group.id,
          previousGroup: structuredClone(group)
        },
        selectedNodeId: group.id
      };
    }
    case "frame_nodes": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent || isParentNodeLocked(next, command.parentId) || findNodeById(next, command.frameId)) {
        return { document, inverse: null };
      }

      const selectedNodes = command.nodeIds
        .map((nodeId) => parent.children.find((node) => node.id === nodeId))
        .filter((node): node is RendererNode => Boolean(node));
      if (selectedNodes.length < 2 || selectedNodes.length !== new Set(command.nodeIds).size) {
        return { document, inverse: null };
      }
      if (selectedNodes.some(isNodeLocked)) {
        return { document, inverse: null };
      }

      const selectedIds = new Set(selectedNodes.map((node) => node.id));
      const firstIndex = parent.children.findIndex((node) => selectedIds.has(node.id));
      const bounds = relativeBoundsForNodes(selectedNodes);
      const frame: RendererNode = {
        id: command.frameId,
        kind: "frame",
        name: command.name.trim() || "프레임",
        transform: { x: bounds.x, y: bounds.y, rotation: 0 },
        size: { width: bounds.width, height: bounds.height },
        style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
        content: { type: "empty" },
        children: selectedNodes.map((node) => {
          const child = structuredClone(node);
          child.transform = {
            ...child.transform,
            x: child.transform.x - bounds.x,
            y: child.transform.y - bounds.y
          };
          return child;
        })
      };

      parent.children.splice(0, parent.children.length, ...[
        ...parent.children.slice(0, firstIndex).filter((node) => !selectedIds.has(node.id)),
        frame,
        ...parent.children.slice(firstIndex).filter((node) => !selectedIds.has(node.id))
      ]);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "unframe_node",
          parentId: command.parentId,
          frameId: frame.id,
          previousFrame: structuredClone(frame)
        },
        selectedNodeId: frame.id
      };
    }
    case "ungroup_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent) {
        return { document, inverse: null };
      }

      const groupIndex = parent.children.findIndex((node) => node.id === command.groupId);
      const group = parent.children[groupIndex];
      if (groupIndex === -1 || !group || group.kind !== "group" || isNodeLocked(group)) {
        return { document, inverse: null };
      }

      const previousGroup = command.previousGroup ?? structuredClone(group);
      const children = group.children.map((child) => {
        const nextChild = structuredClone(child);
        nextChild.transform = {
          ...nextChild.transform,
          x: nextChild.transform.x + group.transform.x,
          y: nextChild.transform.y + group.transform.y
        };
        return nextChild;
      });
      parent.children.splice(groupIndex, 1, ...children);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "restore_group_node",
          parentId: command.parentId,
          group: previousGroup
        },
        selectedNodeId: children.at(-1)?.id ?? null
      };
    }
    case "restore_group_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent || isParentNodeLocked(next, command.parentId)) {
        return { document, inverse: null };
      }

      const childIds = command.group.children.map((child) => child.id);
      const childIdSet = new Set(childIds);
      const firstIndex = parent.children.findIndex((node) => childIdSet.has(node.id));
      if (firstIndex === -1 || childIds.some((childId) => !parent.children.some((node) => node.id === childId))) {
        return { document, inverse: null };
      }

      parent.children.splice(0, parent.children.length, ...[
        ...parent.children.slice(0, firstIndex).filter((node) => !childIdSet.has(node.id)),
        structuredClone(command.group),
        ...parent.children.slice(firstIndex).filter((node) => !childIdSet.has(node.id))
      ]);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "ungroup_node",
          parentId: command.parentId,
          groupId: command.group.id,
          previousGroup: structuredClone(command.group)
        },
        selectedNodeId: command.group.id
      };
    }
    case "unframe_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent) {
        return { document, inverse: null };
      }

      const frameIndex = parent.children.findIndex((node) => node.id === command.frameId);
      const frame = parent.children[frameIndex];
      if (frameIndex === -1 || !frame || frame.kind !== "frame" || isNodeLocked(frame)) {
        return { document, inverse: null };
      }

      const previousFrame = command.previousFrame ?? structuredClone(frame);
      const children = frame.children.map((child) => {
        const nextChild = structuredClone(child);
        nextChild.transform = {
          ...nextChild.transform,
          x: nextChild.transform.x + frame.transform.x,
          y: nextChild.transform.y + frame.transform.y
        };
        return nextChild;
      });
      parent.children.splice(frameIndex, 1, ...children);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "restore_frame_node",
          parentId: command.parentId,
          frame: previousFrame
        },
        selectedNodeId: children.at(-1)?.id ?? null
      };
    }
    case "restore_frame_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent || isParentNodeLocked(next, command.parentId)) {
        return { document, inverse: null };
      }

      const childIds = command.frame.children.map((child) => child.id);
      const childIdSet = new Set(childIds);
      const firstIndex = parent.children.findIndex((node) => childIdSet.has(node.id));
      if (firstIndex === -1 || childIds.some((childId) => !parent.children.some((node) => node.id === childId))) {
        return { document, inverse: null };
      }

      parent.children.splice(0, parent.children.length, ...[
        ...parent.children.slice(0, firstIndex).filter((node) => !childIdSet.has(node.id)),
        structuredClone(command.frame),
        ...parent.children.slice(firstIndex).filter((node) => !childIdSet.has(node.id))
      ]);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "unframe_node",
          parentId: command.parentId,
          frameId: command.frame.id,
          previousFrame: structuredClone(command.frame)
        },
        selectedNodeId: command.frame.id
      };
    }
    case "set_node_locked": {
      const node = findNodeById(next, command.nodeId);
      if (!node) {
        return { document, inverse: null };
      }

      const previousLocked = isNodeLocked(node);
      if (previousLocked === command.locked) {
        return { document, inverse: null };
      }

      node.locked = command.locked;

      return {
        document: next,
        inverse: {
          type: "set_node_locked",
          nodeId: command.nodeId,
          locked: previousLocked
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_node_visible": {
      const node = findNodeById(next, command.nodeId);
      if (!node) {
        return { document, inverse: null };
      }

      const previousVisible = isNodeVisible(node);
      if (previousVisible === command.visible) {
        return { document, inverse: null };
      }

      node.visible = command.visible;

      return {
        document: next,
        inverse: {
          type: "set_node_visible",
          nodeId: command.nodeId,
          visible: previousVisible
        },
        selectedNodeId: command.nodeId
      };
    }
    case "create_component": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousNode = structuredClone(node);
      node.kind = "component";
      node.component_instance = null;
      next.components = next.components ?? [];
      relayoutDocument(next);
      next.components.push({
        id: command.componentId,
        name: command.name,
        source_node: structuredClone(node),
        variants: [{ id: "default", name: "Default", properties: [] }]
      });

      return {
        document: next,
        inverse: {
          type: "delete_component",
          nodeId: command.nodeId,
          componentId: command.componentId,
          previousNode
        },
        selectedNodeId: command.nodeId
      };
    }
    case "delete_component": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }
      replaceNodeById(next, command.nodeId, structuredClone(command.previousNode));
      next.components = (next.components ?? []).filter((component) => component.id !== command.componentId);
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "create_component",
          nodeId: command.nodeId,
          componentId: command.componentId,
          name: command.previousNode.name
        },
        selectedNodeId: command.nodeId
      };
    }
    case "create_component_instance": {
      const parent = findParentChildren(next, command.parentId);
      const definition = (next.components ?? []).find(
        (component) => component.id === command.definitionId
      );
      if (!parent || !definition || isParentNodeLocked(next, command.parentId)) {
        return { document, inverse: null };
      }

      const node = structuredClone(definition.source_node);
      renameInstanceTree(node, command.instanceId);
      node.id = command.instanceId;
      node.kind = "component_instance";
      node.name = `${definition.name} 인스턴스`;
      node.transform = { ...node.transform, x: command.x, y: command.y };
      node.component_instance = {
        definition_id: command.definitionId,
        overrides: [],
        detached: false
      };
      parent.children.push(node);
      relayoutDocument(next);

      return {
        document: next,
        inverse: { type: "delete_node", parentId: command.parentId, node },
        selectedNodeId: node.id
      };
    }
    case "detach_instance": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || !node.component_instance) {
        return { document, inverse: null };
      }

      const previousNode = command.previousNode ?? structuredClone(node);
      node.kind = "frame";
      node.component_instance = null;
      relayoutDocument(next);

      return {
        document: next,
        inverse: { type: "detach_instance", nodeId: command.nodeId, previousNode },
        selectedNodeId: command.nodeId
      };
    }
    case "set_node_layout": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousLayout = node.layout ? structuredClone(node.layout) : null;
      const previousChildren = node.children.map((child) => ({
        id: child.id,
        transform: { ...child.transform },
        size: { ...child.size }
      }));

      if (command.layout) {
        node.layout = normalizeNodeLayout(command.layout);
      } else {
        delete node.layout;
      }
      if (command.previousChildren) {
        restoreChildTransforms(node, command.previousChildren);
      }
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_node_layout",
          nodeId: command.nodeId,
          layout: previousLayout,
          previousChildren
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_node_constraints": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousConstraints = node.constraints ? structuredClone(node.constraints) : null;
      if (command.constraints) {
        node.constraints = normalizeNodeConstraints(command.constraints);
      } else {
        delete node.constraints;
      }
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_node_constraints",
          nodeId: command.nodeId,
          constraints: previousConstraints
        },
        selectedNodeId: command.nodeId
      };
    }
  }
}

function relayoutDocument(document: RendererDocument): void {
  for (const page of document.pages) {
    for (const node of page.children) {
      relayoutNode(node);
    }
  }
}

function relayoutNode(node: RendererNode): void {
  const layout = normalizedAutoLayout(node.layout);
  if (layout) {
    const isVertical = layout.direction === "vertical";
    const childCount = node.children.length;
    const mainStartPadding = isVertical ? layout.padding.top : layout.padding.left;
    const mainEndPadding = isVertical ? layout.padding.bottom : layout.padding.right;
    const crossStartPadding = isVertical ? layout.padding.left : layout.padding.top;
    const crossEndPadding = isVertical ? layout.padding.right : layout.padding.bottom;
    const availableMain = Math.max(
      0,
      (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
    );
    const availableCross = Math.max(
      0,
      (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
    );
    const totalChildMain =
      node.children.reduce((total, child) => total + (isVertical ? child.size.height : child.size.width), 0) +
      layout.gap * Math.max(0, childCount - 1);
    const remainingMain = Math.max(0, availableMain - totalChildMain);
    let cursor = mainStartPadding + justifyStartOffset(layout.justify_content, remainingMain, childCount);
    const distributedGap = layout.gap + justifyGapOffset(layout.justify_content, remainingMain, childCount);

    for (const child of node.children) {
      const crossAxisPosition = crossAxisOffset(
        layout.align_items,
        crossStartPadding,
        crossEndPadding,
        availableCross,
        isVertical ? child.size.width : child.size.height,
        isVertical ? node.size.width : node.size.height
      );
      if (layout.align_items === "stretch") {
        if (isVertical) {
          child.size.width = clampSize(availableCross);
        } else {
          child.size.height = clampSize(availableCross);
        }
      }
      child.transform = {
        ...child.transform,
        x: isVertical ? crossAxisPosition : cursor,
        y: isVertical ? cursor : crossAxisPosition
      };
      cursor += (isVertical ? child.size.height : child.size.width) + distributedGap;
    }
  }

  for (const child of node.children) {
    relayoutNode(child);
  }
}

function normalizedAutoLayout(layout: NodeLayout | null | undefined): NodeLayout | null {
  if (!layout || layout.mode !== "auto") {
    return null;
  }

  return normalizeNodeLayout(layout);
}

function normalizeNodeLayout(layout: NodeLayout): NodeLayout {
  return {
    mode: layout.mode === "auto" ? "auto" : "none",
    direction: layout.direction === "horizontal" ? "horizontal" : "vertical",
    align_items: isLayoutAlignItems(layout.align_items) ? layout.align_items : "start",
    justify_content: isLayoutJustifyContent(layout.justify_content) ? layout.justify_content : "start",
    gap: Math.max(0, finiteNumber(layout.gap, 0)),
    padding: {
      top: Math.max(0, finiteNumber(layout.padding?.top, 0)),
      right: Math.max(0, finiteNumber(layout.padding?.right, 0)),
      bottom: Math.max(0, finiteNumber(layout.padding?.bottom, 0)),
      left: Math.max(0, finiteNumber(layout.padding?.left, 0))
    }
  };
}

function normalizeNodeConstraints(constraints: NodeConstraints): NodeConstraints {
  return {
    horizontal: isHorizontalConstraint(constraints.horizontal) ? constraints.horizontal : "left",
    vertical: isVerticalConstraint(constraints.vertical) ? constraints.vertical : "top"
  };
}

function restoreChildTransforms(
  node: RendererNode,
  transforms: Array<{ id: string; transform: RendererNode["transform"]; size?: RendererNode["size"] }>
): void {
  const byId = new Map(transforms.map((entry) => [entry.id, entry.transform]));
  const sizeById = new Map(transforms.flatMap((entry) => (entry.size ? [[entry.id, entry.size] as const] : [])));
  for (const child of node.children) {
    const transform = byId.get(child.id);
    if (transform) {
      child.transform = { ...transform };
    }
    const size = sizeById.get(child.id);
    if (size) {
      child.size = { ...size };
    }
  }
}

function applyConstraintsAfterParentResize(
  parent: RendererNode,
  previousSize: { width: number; height: number }
): void {
  if (normalizedAutoLayout(parent.layout)) {
    return;
  }

  const deltaWidth = parent.size.width - previousSize.width;
  const deltaHeight = parent.size.height - previousSize.height;
  if (deltaWidth === 0 && deltaHeight === 0) {
    return;
  }

  for (const child of parent.children) {
    const constraints = child.constraints ?? DEFAULT_CONSTRAINTS;
    applyHorizontalConstraint(child, constraints.horizontal, previousSize.width, parent.size.width, deltaWidth);
    applyVerticalConstraint(child, constraints.vertical, previousSize.height, parent.size.height, deltaHeight);
  }
}

function applyHorizontalConstraint(
  node: RendererNode,
  constraint: NodeConstraints["horizontal"],
  previousParentWidth: number,
  nextParentWidth: number,
  deltaWidth: number
): void {
  if (constraint === "right") {
    node.transform.x += deltaWidth;
    return;
  }
  if (constraint === "center") {
    node.transform.x += deltaWidth / 2;
    return;
  }
  if (constraint === "left_right") {
    node.size.width = clampSize(node.size.width + deltaWidth);
    return;
  }
  if (constraint === "scale" && previousParentWidth > 0) {
    const xRatio = node.transform.x / previousParentWidth;
    const widthRatio = node.size.width / previousParentWidth;
    node.transform.x = xRatio * nextParentWidth;
    node.size.width = clampSize(widthRatio * nextParentWidth);
  }
}

function applyVerticalConstraint(
  node: RendererNode,
  constraint: NodeConstraints["vertical"],
  previousParentHeight: number,
  nextParentHeight: number,
  deltaHeight: number
): void {
  if (constraint === "bottom") {
    node.transform.y += deltaHeight;
    return;
  }
  if (constraint === "center") {
    node.transform.y += deltaHeight / 2;
    return;
  }
  if (constraint === "top_bottom") {
    node.size.height = clampSize(node.size.height + deltaHeight);
    return;
  }
  if (constraint === "scale" && previousParentHeight > 0) {
    const yRatio = node.transform.y / previousParentHeight;
    const heightRatio = node.size.height / previousParentHeight;
    node.transform.y = yRatio * nextParentHeight;
    node.size.height = clampSize(heightRatio * nextParentHeight);
  }
}

function isHorizontalConstraint(value: string): value is NodeConstraints["horizontal"] {
  return ["left", "right", "left_right", "center", "scale"].includes(value);
}

function isVerticalConstraint(value: string): value is NodeConstraints["vertical"] {
  return ["top", "bottom", "top_bottom", "center", "scale"].includes(value);
}

function isLayoutAlignItems(value: string): value is NodeLayout["align_items"] {
  return ["start", "center", "end", "stretch"].includes(value);
}

function isLayoutJustifyContent(value: string): value is NodeLayout["justify_content"] {
  return ["start", "center", "end", "space_between", "space_around", "space_evenly"].includes(value);
}

function justifyStartOffset(
  justifyContent: NodeLayout["justify_content"],
  remainingMain: number,
  childCount: number
): number {
  if (justifyContent === "center") {
    return remainingMain / 2;
  }
  if (justifyContent === "end") {
    return remainingMain;
  }
  if (justifyContent === "space_around" && childCount > 0) {
    return remainingMain / childCount / 2;
  }
  if (justifyContent === "space_evenly" && childCount > 0) {
    return remainingMain / (childCount + 1);
  }
  return 0;
}

function justifyGapOffset(
  justifyContent: NodeLayout["justify_content"],
  remainingMain: number,
  childCount: number
): number {
  if (justifyContent === "space_between" && childCount > 1) {
    return remainingMain / (childCount - 1);
  }
  if (justifyContent === "space_around" && childCount > 0) {
    return remainingMain / childCount;
  }
  if (justifyContent === "space_evenly" && childCount > 0) {
    return remainingMain / (childCount + 1);
  }
  return 0;
}

function crossAxisOffset(
  alignItems: NodeLayout["align_items"],
  crossStartPadding: number,
  crossEndPadding: number,
  availableCross: number,
  childCrossSize: number,
  parentCrossSize: number
): number {
  if (alignItems === "center") {
    return crossStartPadding + Math.max(0, availableCross - childCrossSize) / 2;
  }
  if (alignItems === "end") {
    return parentCrossSize - crossEndPadding - childCrossSize;
  }
  return crossStartPadding;
}

function findInNode(node: RendererNode, nodeId: string): RendererNode | null {
  if (node.id === nodeId) {
    return node;
  }

  for (const child of node.children) {
    const found = findInNode(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

function absolutePositionInNode(
  node: RendererNode,
  nodeId: string,
  parent: { x: number; y: number }
): { x: number; y: number } | null {
  const current = {
    x: parent.x + node.transform.x,
    y: parent.y + node.transform.y
  };

  if (node.id === nodeId) {
    return current;
  }

  for (const child of node.children) {
    const found = absolutePositionInNode(child, nodeId, current);
    if (found) {
      return found;
    }
  }

  return null;
}

function topmostNodeIdAtPointInTree(
  node: RendererNode,
  point: { x: number; y: number },
  parent: { x: number; y: number },
  excludedNodeIds: Set<string>
): string | null {
  if (excludedNodeIds.has(node.id) || isNodeLocked(node) || !isNodeVisible(node)) {
    return null;
  }

  const absolute = {
    x: parent.x + node.transform.x,
    y: parent.y + node.transform.y
  };

  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const found = topmostNodeIdAtPointInTree(node.children[index], point, absolute, excludedNodeIds);
    if (found) {
      return found;
    }
  }

  const bounds = {
    x: absolute.x,
    y: absolute.y,
    width: node.size.width,
    height: node.size.height
  };

  return containsPoint(bounds, point) ? node.id : null;
}

interface NodeGeometry {
  node: RendererNode;
  parentAbsolutePosition: { x: number; y: number };
  bounds: SelectionBounds;
}

function selectedNodeGeometries(document: RendererDocument, nodeIds: string[]): NodeGeometry[] {
  const geometries: NodeGeometry[] = [];
  for (const nodeId of nodeIds) {
    const geometry = findNodeGeometry(document, nodeId);
    if (geometry && isNodeVisible(geometry.node)) {
      geometries.push(geometry);
    }
  }

  return geometries;
}

function findNodeGeometry(document: RendererDocument, nodeId: string): NodeGeometry | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = nodeGeometryInTree(node, nodeId, { x: 0, y: 0 }, null);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function nodeGeometryInTree(
  node: RendererNode,
  nodeId: string,
  parentAbsolutePosition: { x: number; y: number },
  parentLayout: NodeLayout | null
): NodeGeometry | null {
  const currentAbsolutePosition = {
    x: parentAbsolutePosition.x + node.transform.x,
    y: parentAbsolutePosition.y + node.transform.y
  };

  if (node.id === nodeId) {
    if (normalizedAutoLayout(parentLayout)) {
      return null;
    }

    return {
      node,
      parentAbsolutePosition,
      bounds: {
        x: currentAbsolutePosition.x,
        y: currentAbsolutePosition.y,
        width: node.size.width,
        height: node.size.height
      }
    };
  }

  for (const child of node.children) {
    const found = nodeGeometryInTree(child, nodeId, currentAbsolutePosition, node.layout ?? null);
    if (found) {
      return found;
    }
  }

  return null;
}

function geometryBounds(geometries: NodeGeometry[]): SelectionBounds {
  const left = Math.min(...geometries.map((geometry) => geometry.bounds.x));
  const top = Math.min(...geometries.map((geometry) => geometry.bounds.y));
  const right = Math.max(
    ...geometries.map((geometry) => geometry.bounds.x + geometry.bounds.width)
  );
  const bottom = Math.max(
    ...geometries.map((geometry) => geometry.bounds.y + geometry.bounds.height)
  );

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function relativeBoundsForNodes(nodes: RendererNode[]): SelectionBounds {
  const left = Math.min(...nodes.map((node) => node.transform.x));
  const top = Math.min(...nodes.map((node) => node.transform.y));
  const right = Math.max(...nodes.map((node) => node.transform.x + node.size.width));
  const bottom = Math.max(...nodes.map((node) => node.transform.y + node.size.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function toNodeDragGeometry(geometry: NodeGeometry): NodeDragGeometry {
  return {
    nodeId: geometry.node.id,
    transform: { x: geometry.node.transform.x, y: geometry.node.transform.y },
    parentAbsolutePosition: geometry.parentAbsolutePosition,
    bounds: geometry.bounds
  };
}

function translateBounds(bounds: SelectionBounds, delta: { x: number; y: number }): SelectionBounds {
  return {
    ...bounds,
    x: bounds.x + delta.x,
    y: bounds.y + delta.y
  };
}

type SnapAxis = "x" | "y";

interface AxisSnap {
  offset: number;
  targetPosition: number;
  target: NodeGeometry;
}

function findBestAxisSnap(
  axis: SnapAxis,
  movingBounds: SelectionBounds,
  rawDelta: { x: number; y: number },
  targetGeometries: NodeGeometry[],
  threshold: number
): AxisSnap | null {
  let best: AxisSnap | null = null;
  const movingOffset = axis === "x" ? rawDelta.x : rawDelta.y;
  const movingAnchors = axisAnchorsForBounds(movingBounds, axis);

  for (const movingAnchor of movingAnchors) {
    const movedPosition = movingAnchor + movingOffset;

    for (const target of targetGeometries) {
      for (const targetPosition of axisAnchorsForBounds(target.bounds, axis)) {
        const offset = targetPosition - movedPosition;
        if (Math.abs(offset) > threshold) {
          continue;
        }
        if (!best || Math.abs(offset) < Math.abs(best.offset)) {
          best = { offset, targetPosition, target };
        }
      }
    }
  }

  return best;
}

function axisAnchorsForBounds(bounds: SelectionBounds, axis: SnapAxis): number[] {
  if (axis === "x") {
    return [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width];
  }

  return [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];
}

function collectSnapTargetGeometries(
  document: RendererDocument,
  excludedNodeIds: Set<string>
): NodeGeometry[] {
  const geometries: NodeGeometry[] = [];

  for (const page of document.pages) {
    for (const node of page.children) {
      if (excludedNodeIds.has(node.id) || !isNodeVisible(node)) {
        continue;
      }
      geometries.push({
        node,
        parentAbsolutePosition: { x: 0, y: 0 },
        bounds: {
          x: node.transform.x,
          y: node.transform.y,
          width: node.size.width,
          height: node.size.height
        }
      });
    }
  }

  return geometries;
}

function alignmentPatch(
  geometry: NodeGeometry,
  selectionBounds: SelectionBounds,
  mode: AlignmentMode
): GeometryPatch | null {
  if (mode === "left") {
    return xPatch(geometry, selectionBounds.x);
  }
  if (mode === "center") {
    return xPatch(
      geometry,
      selectionBounds.x + selectionBounds.width / 2 - geometry.bounds.width / 2
    );
  }
  if (mode === "right") {
    return xPatch(
      geometry,
      selectionBounds.x + selectionBounds.width - geometry.bounds.width
    );
  }
  if (mode === "top") {
    return yPatch(geometry, selectionBounds.y);
  }
  if (mode === "middle") {
    return yPatch(
      geometry,
      selectionBounds.y + selectionBounds.height / 2 - geometry.bounds.height / 2
    );
  }

  return yPatch(
    geometry,
    selectionBounds.y + selectionBounds.height - geometry.bounds.height
  );
}

function distributionPatch(
  geometry: NodeGeometry,
  mode: DistributionMode,
  targetDocumentPosition: number
): GeometryPatch | null {
  return mode === "horizontal"
    ? xPatch(geometry, targetDocumentPosition)
    : yPatch(geometry, targetDocumentPosition);
}

function xPatch(geometry: NodeGeometry, targetDocumentX: number): GeometryPatch | null {
  const nextX = targetDocumentX - geometry.parentAbsolutePosition.x;
  return nextX === geometry.node.transform.x ? null : { x: nextX };
}

function yPatch(geometry: NodeGeometry, targetDocumentY: number): GeometryPatch | null {
  const nextY = targetDocumentY - geometry.parentAbsolutePosition.y;
  return nextY === geometry.node.transform.y ? null : { y: nextY };
}

function executeBatchGeometryCommand(
  state: EditorState,
  patches: Array<{ nodeId: string; patch: GeometryPatch }>
): EditorState {
  if (!patches.length) {
    return state;
  }

  return executeEditorCommand(state, { type: "update_nodes_geometry", patches });
}

function createClipboardNodeCopy(
  document: RendererDocument,
  clipboard: EditorNodeClipboard
): { copiedNode: RendererNode; copyIndex: number } {
  const copyIndex = nextCopyIndex(document, clipboard.sourceNodeId);
  const copiedNode = structuredClone(clipboard.node);
  const copiedNodeId = `${clipboard.sourceNodeId}-copy-${copyIndex}`;
  renameNodeTreeForCopy(copiedNode, clipboard.sourceNodeId, copiedNodeId);
  copiedNode.name =
    copyIndex === 1
      ? `${clipboard.node.name} 복사본`
      : `${clipboard.node.name} 복사본 ${copyIndex}`;

  return { copiedNode, copyIndex };
}

function insertCopiedNode(
  state: EditorState,
  clipboard: EditorNodeClipboard,
  copiedNode: RendererNode
): EditorState {
  const parentId = findParentChildren(state.document, clipboard.parentId)
    ? clipboard.parentId
    : state.document.pages[0]?.id;
  if (!parentId) {
    return state;
  }

  return executeEditorCommand(state, {
    type: "create_node",
    parentId,
    node: copiedNode
  });
}

function getParentAbsolutePosition(
  document: RendererDocument,
  parentId: string
): { x: number; y: number } {
  return document.pages.some((page) => page.id === parentId)
    ? { x: 0, y: 0 }
    : getNodeAbsolutePosition(document, parentId) ?? { x: 0, y: 0 };
}

function selectionNodeIds(selection: EditorSelection): string[] {
  return selection.nodeIds.length ? selection.nodeIds : selection.nodeId ? [selection.nodeId] : [];
}

function retainExistingSelection(document: RendererDocument, selection: EditorSelection): EditorSelection {
  return normalizeSelection(document, selectionNodeIds(selection), selection.nodeId);
}

function normalizeSelection(
  document: RendererDocument,
  nodeIds: string[],
  primaryNodeId: string | null = nodeIds.at(-1) ?? null
): EditorSelection {
  const existingNodeIds: string[] = [];
  for (const nodeId of nodeIds) {
    if (!existingNodeIds.includes(nodeId) && findNodeById(document, nodeId)) {
      existingNodeIds.push(nodeId);
    }
  }

  const nodeId =
    primaryNodeId && existingNodeIds.includes(primaryNodeId)
      ? primaryNodeId
      : existingNodeIds.at(-1) ?? null;

  return { nodeId, nodeIds: existingNodeIds };
}

function normalizeBounds(bounds: SelectionBounds): SelectionBounds {
  const left = Math.min(bounds.x, bounds.x + bounds.width);
  const top = Math.min(bounds.y, bounds.y + bounds.height);
  const right = Math.max(bounds.x, bounds.x + bounds.width);
  const bottom = Math.max(bounds.y, bounds.y + bounds.height);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function collectNodeIdsInBounds(
  node: RendererNode,
  bounds: SelectionBounds,
  parent: { x: number; y: number }
): string[] {
  if (isNodeLocked(node) || !isNodeVisible(node)) {
    return [];
  }

  const absolute = {
    x: parent.x + node.transform.x,
    y: parent.y + node.transform.y
  };
  const childMatches =
    node.kind === "component_instance"
      ? []
      : node.children.flatMap((child) => collectNodeIdsInBounds(child, bounds, absolute));

  if (childMatches.length) {
    return childMatches;
  }

  const nodeBounds = {
    x: absolute.x,
    y: absolute.y,
    width: node.size.width,
    height: node.size.height
  };

  return containsBounds(bounds, nodeBounds) ? [node.id] : [];
}

function collectNodeIdsByKind(node: RendererNode, kind: RendererNode["kind"], nodeIds: string[]): void {
  if (isNodeLocked(node) || !isNodeVisible(node)) {
    return;
  }

  if (node.kind === kind) {
    nodeIds.push(node.id);
  }

  for (const child of node.children) {
    collectNodeIdsByKind(child, kind, nodeIds);
  }
}

function containsBounds(container: SelectionBounds, candidate: SelectionBounds): boolean {
  const containerRight = container.x + container.width;
  const containerBottom = container.y + container.height;
  const candidateRight = candidate.x + candidate.width;
  const candidateBottom = candidate.y + candidate.height;

  return (
    candidate.x >= container.x &&
    candidate.y >= container.y &&
    candidateRight <= containerRight &&
    candidateBottom <= containerBottom
  );
}

function containsPoint(bounds: SelectionBounds, point: { x: number; y: number }): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function findParentChildren(
  document: RendererDocument,
  parentId: string
): { children: RendererNode[] } | null {
  const page = document.pages.find((candidate) => candidate.id === parentId);
  if (page) {
    return page;
  }

  const node = findNodeById(document, parentId);
  return node ? { children: node.children } : null;
}

function isParentNodeLocked(document: RendererDocument, parentId: string): boolean {
  if (document.pages.some((page) => page.id === parentId)) {
    return false;
  }

  return isNodeLocked(findNodeById(document, parentId));
}

function findSelectedNodeWithParent(
  state: EditorState
): { parentId: string; node: RendererNode } | null {
  const selectedNodeId = state.selection.nodeId;
  if (!selectedNodeId) {
    return null;
  }

  for (const page of state.document.pages) {
    const topLevelNode = page.children.find((node) => node.id === selectedNodeId);
    if (topLevelNode) {
      return { parentId: page.id, node: topLevelNode };
    }

    for (const node of page.children) {
      const found = findNodeParentInTree(node, selectedNodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findSiblingSelection(
  document: RendererDocument,
  nodeIds: string[]
): { parentId: string; nodes: RendererNode[] } | null {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  if (uniqueNodeIds.length < 2) {
    return null;
  }

  for (const page of document.pages) {
    const nodes = siblingsFromChildren(page.children, uniqueNodeIds);
    if (nodes) {
      return { parentId: page.id, nodes };
    }

    for (const node of page.children) {
      const found = siblingSelectionInTree(node, uniqueNodeIds);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function siblingSelectionInTree(
  parent: RendererNode,
  nodeIds: string[]
): { parentId: string; nodes: RendererNode[] } | null {
  const nodes = siblingsFromChildren(parent.children, nodeIds);
  if (nodes) {
    return { parentId: parent.id, nodes };
  }

  for (const child of parent.children) {
    const found = siblingSelectionInTree(child, nodeIds);
    if (found) {
      return found;
    }
  }

  return null;
}

function siblingsFromChildren(children: RendererNode[], nodeIds: string[]): RendererNode[] | null {
  const nodeIdSet = new Set(nodeIds);
  const nodes = children.filter((node) => nodeIdSet.has(node.id));
  return nodes.length === nodeIds.length ? nodes : null;
}

function findNodeParentInTree(
  parent: RendererNode,
  nodeId: string
): { parentId: string; node: RendererNode } | null {
  const child = parent.children.find((candidate) => candidate.id === nodeId);
  if (child) {
    return { parentId: parent.id, node: child };
  }

  for (const candidate of parent.children) {
    const found = findNodeParentInTree(candidate, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

function nextCopyIndex(document: RendererDocument, nodeId: string): number {
  const existingIds = new Set<string>();
  for (const page of document.pages) {
    for (const node of page.children) {
      collectNodeIds(node, existingIds);
    }
  }

  let copyIndex = 1;
  while (existingIds.has(`${nodeId}-copy-${copyIndex}`)) {
    copyIndex += 1;
  }

  return copyIndex;
}

function collectNodeIds(node: RendererNode, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.children) {
    collectNodeIds(child, ids);
  }
}

function renameNodeTreeForCopy(node: RendererNode, originalRootId: string, copiedRootId: string): void {
  node.id = node.id === originalRootId ? copiedRootId : `${copiedRootId}__${node.id}`;
  for (const child of node.children) {
    renameNodeTreeForCopy(child, originalRootId, copiedRootId);
  }
}

function replaceNodeById(document: RendererDocument, nodeId: string, replacement: RendererNode): boolean {
  for (const page of document.pages) {
    const index = page.children.findIndex((node) => node.id === nodeId);
    if (index !== -1) {
      page.children[index] = replacement;
      return true;
    }

    for (const node of page.children) {
      if (replaceInNode(node, nodeId, replacement)) {
        return true;
      }
    }
  }

  return false;
}

function replaceInNode(node: RendererNode, nodeId: string, replacement: RendererNode): boolean {
  const index = node.children.findIndex((child) => child.id === nodeId);
  if (index !== -1) {
    node.children[index] = replacement;
    return true;
  }

  for (const child of node.children) {
    if (replaceInNode(child, nodeId, replacement)) {
      return true;
    }
  }

  return false;
}

function renameInstanceTree(node: RendererNode, instanceId: string) {
  for (const child of node.children) {
    child.id = `${instanceId}__${child.id}`;
    renameInstanceTree(child, instanceId);
  }
}

function clampSize(value: number): number {
  return Math.max(MIN_NODE_SIZE, value);
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
