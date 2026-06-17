import type {
  NodeConstraints,
  NodeLayout,
  RendererDocument,
  RendererNode
} from "@canvas-mcp-editor/renderer";

export interface EditorSelection {
  nodeId: string | null;
}

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
      type: "set_fill";
      nodeId: string;
      fill: string;
    }
  | {
      type: "update_text";
      nodeId: string;
      value: string;
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
      previousChildren?: Array<{ id: string; transform: RendererNode["transform"] }>;
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
const DEFAULT_CONSTRAINTS: NodeConstraints = { horizontal: "left", vertical: "top" };

export function createEditorState(document: RendererDocument): EditorState {
  return {
    document,
    selection: { nodeId: null },
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

export function executeEditorCommand(state: EditorState, command: EditorCommand): EditorState {
  const result = applyCommand(state.document, command);
  if (!result.inverse) {
    return state;
  }

  return {
    ...state,
    document: result.document,
    selection: {
      nodeId: result.selectedNodeId === undefined ? state.selection.nodeId : result.selectedNodeId
    },
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
    selection: {
      nodeId:
        state.selection.nodeId && findNodeById(result.document, state.selection.nodeId)
          ? state.selection.nodeId
          : null
    },
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
    selection: {
      nodeId: result.selectedNodeId === undefined ? state.selection.nodeId : result.selectedNodeId
    },
    history: {
      past: [...state.history.past, result.inverse],
      future: state.history.future.slice(1)
    }
  };
}

export function setSelection(state: EditorState, nodeId: string | null): EditorState {
  return {
    ...state,
    selection: {
      nodeId: nodeId && findNodeById(state.document, nodeId) ? nodeId : null
    }
  };
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

function applyCommand(document: RendererDocument, command: EditorCommand): CommandResult {
  const next = structuredClone(document);

  switch (command.type) {
    case "update_node_geometry": {
      const node = findNodeById(next, command.nodeId);
      if (!node) {
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
    case "set_fill": {
      const node = findNodeById(next, command.nodeId);
      if (!node) {
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
    case "update_text": {
      const node = findNodeById(next, command.nodeId);
      if (!node || node.content.type !== "text") {
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
    case "create_node": {
      const parent = findParentChildren(next, command.parentId);
      if (!parent) {
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

      const [node] = parent.children.splice(index, 1);

      return {
        document: next,
        inverse: { type: "create_node", parentId: command.parentId, node },
        selectedNodeId: null
      };
    }
    case "create_component": {
      const node = findNodeById(next, command.nodeId);
      if (!node) {
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
      if (!parent || !definition) {
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
      if (!node || !node.component_instance) {
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
      if (!node) {
        return { document, inverse: null };
      }

      const previousLayout = node.layout ? structuredClone(node.layout) : null;
      const previousChildren = node.children.map((child) => ({
        id: child.id,
        transform: { ...child.transform }
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
      if (!node) {
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
    let cursor = layout.direction === "vertical" ? layout.padding.top : layout.padding.left;
    for (const child of node.children) {
      child.transform = {
        ...child.transform,
        x: layout.direction === "vertical" ? layout.padding.left : cursor,
        y: layout.direction === "vertical" ? cursor : layout.padding.top
      };
      cursor += (layout.direction === "vertical" ? child.size.height : child.size.width) + layout.gap;
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
  transforms: Array<{ id: string; transform: RendererNode["transform"] }>
): void {
  const byId = new Map(transforms.map((entry) => [entry.id, entry.transform]));
  for (const child of node.children) {
    const transform = byId.get(child.id);
    if (transform) {
      child.transform = { ...transform };
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
