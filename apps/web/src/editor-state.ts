import type {
  ComponentVariant,
  DesignStyle,
  DesignToken,
  DesignTokenSet,
  GridArea,
  GridTrack,
  ImageFitMode,
  NodeConstraints,
  NodeExportPreset,
  NodeLayout,
  NodeLayoutItem,
  RendererDocument,
  RendererNode,
  TextWritingMode
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

interface StyleBindingSnapshot {
  nodeId: string;
  fillStyle?: string | null;
  typographyStyle?: string | null;
}

export type EditorCommand =
  | {
      type: "update_node_geometry";
      nodeId: string;
      patch: GeometryPatch;
      layoutItem?: NodeLayoutItem | null;
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
      type: "create_style";
      style: DesignStyle;
    }
  | {
      type: "rename_style";
      styleId: string;
      name: string;
    }
  | {
      type: "delete_style";
      styleId: string;
    }
  | {
      type: "set_document_styles";
      styles: DesignStyle[];
      bindings?: StyleBindingSnapshot[];
    }
  | {
      type: "set_fill_token";
      nodeId: string;
      tokenId: string;
    }
  | {
      type: "set_fill_style";
      nodeId: string;
      styleId: string;
    }
  | {
      type: "set_token_set_enabled";
      tokenSetId: string;
      enabled: boolean;
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
      type: "set_text_writing_mode";
      nodeId: string;
      writingMode: TextWritingMode;
    }
  | {
      type: "set_text_typography_token";
      nodeId: string;
      tokenId: string;
    }
  | {
      type: "set_text_typography_style";
      nodeId: string;
      styleId: string;
    }
  | {
      type: "set_text_content";
      nodeId: string;
      content: Extract<RendererNode["content"], { type: "text" }>;
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
      type: "set_node_export_presets";
      nodeId: string;
      presets: NodeExportPreset[];
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
      type: "set_component_instance_variant";
      nodeId: string;
      variantId: string | null;
    }
  | {
      type: "set_component_variants";
      componentId: string;
      variants: ComponentVariant[];
      instanceVariantIds?: Record<string, string | null>;
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
      type: "delete_grid_track_with_children";
      nodeId: string;
      axis: "column" | "row";
      index: number;
      previousNode?: RendererNode;
    }
  | {
      type: "reorder_grid_track_with_children";
      nodeId: string;
      axis: "column" | "row";
      fromIndex: number;
      toIndex: number;
      preserveChildren?: boolean;
      previousNode?: RendererNode;
    }
  | {
      type: "set_node_layout_item";
      nodeId: string;
      layoutItem: NodeLayoutItem | null;
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
const DEFAULT_LAYOUT_ITEM: NodeLayoutItem = { position: "static", margin: { top: 0, right: 0, bottom: 0, left: 0 } };
const PASTE_OFFSET = 24;
const VERTICAL_TEXT_WRITING_MODES = new Set<TextWritingMode>(["vertical_rl", "vertical_lr"]);

function isVerticalTextWritingMode(mode: TextWritingMode | undefined): boolean {
  return mode ? VERTICAL_TEXT_WRITING_MODES.has(mode) : false;
}

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

function findColorToken(document: RendererDocument, tokenId: string): DesignToken | null {
  const token = activeDesignTokenReferenceMap(document).get(tokenId);
  return token?.type === "color" ? token : null;
}

function findColorStyle(document: RendererDocument, styleId: string): DesignStyle | null {
  const style = (document.styles ?? []).find((candidate) => candidate.id === styleId);
  return style?.type === "color" ? style : null;
}

function findTypographyToken(document: RendererDocument, tokenId: string): DesignToken | null {
  const token = activeDesignTokenReferenceMap(document).get(tokenId);
  return token?.type === "typography" ? token : null;
}

function findTypographyStyle(document: RendererDocument, styleId: string): DesignStyle | null {
  const style = (document.styles ?? []).find((candidate) => candidate.id === styleId);
  return style?.type === "typography" ? style : null;
}

function parseTypographyValue(source: Pick<DesignToken | DesignStyle, "value">): { fontFamily: string; fontSize: number; lineHeight?: number } | null {
  try {
    const parsed = JSON.parse(source.value) as Partial<{ fontFamily: string; fontSize: number; lineHeight: number }>;
    const fontFamily = typeof parsed.fontFamily === "string" ? parsed.fontFamily.trim() : "";
    const fontSize = Number(parsed.fontSize);
    const lineHeight = parsed.lineHeight === undefined ? undefined : Number(parsed.lineHeight);
    if (!fontFamily || !Number.isFinite(fontSize) || fontSize <= 0) {
      return null;
    }
    if (lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)) {
      return null;
    }
    return { fontFamily, fontSize, ...(lineHeight !== undefined ? { lineHeight } : {}) };
  } catch {
    return null;
  }
}

function parseTypographyToken(token: DesignToken): { fontFamily: string; fontSize: number; lineHeight?: number } | null {
  return parseTypographyValue(token);
}

function activeDesignTokenReferenceMap(document: RendererDocument): Map<string, DesignToken> {
  const tokens = document.tokens ?? [];
  const tokenSets = document.token_sets ?? [];
  if (!tokenSets.length) {
    return new Map(tokens.map((token) => [token.id, token]));
  }

  const activeTokens = resolveActiveDesignTokens(tokens, tokenSets);
  const activeTokenByKey = new Map(activeTokens.map((token) => [tokenResolutionKey(token), token]));
  const tokenMap = new Map<string, DesignToken>();
  for (const token of tokens) {
    const activeToken = activeTokenByKey.get(tokenResolutionKey(token));
    if (activeToken) {
      tokenMap.set(token.id, activeToken);
    }
  }
  for (const token of activeTokens) {
    tokenMap.set(token.id, token);
  }
  return tokenMap;
}

export function resolveActiveDesignTokens(tokens: DesignToken[], tokenSets: DesignTokenSet[] = []): DesignToken[] {
  if (!tokenSets.length) {
    return [...tokens];
  }

  const enabledSetIds = new Set(tokenSets.filter((tokenSet) => tokenSet.enabled).map((tokenSet) => tokenSet.id));
  const winners = new Map<string, DesignToken>();
  const keyOrder: string[] = [];
  const remember = (token: DesignToken) => {
    const key = tokenResolutionKey(token);
    if (!winners.has(key)) {
      keyOrder.push(key);
    }
    winners.set(key, token);
  };

  for (const token of tokens.filter((token) => !token.set_id)) {
    remember(token);
  }
  for (const tokenSet of tokenSets) {
    if (!enabledSetIds.has(tokenSet.id)) {
      continue;
    }
    for (const token of tokens.filter((candidate) => candidate.set_id === tokenSet.id)) {
      remember(token);
    }
  }

  return keyOrder.map((key) => winners.get(key)).filter((token): token is DesignToken => Boolean(token));
}

function tokenResolutionKey(token: DesignToken): string {
  return `${token.type}\u0000${token.name.trim().toLowerCase()}`;
}

function materializeTokenBindings(document: RendererDocument): void {
  const tokenMap = activeDesignTokenReferenceMap(document);
  for (const page of document.pages) {
    for (const node of page.children) {
      materializeNodeTokenBindings(node, tokenMap);
    }
  }
  relayoutDocument(document);
}

function materializeStyleBindings(document: RendererDocument): void {
  const styleMap = new Map((document.styles ?? []).map((style) => [style.id, style]));
  for (const page of document.pages) {
    for (const node of page.children) {
      materializeNodeStyleBindings(node, styleMap);
    }
  }
  relayoutDocument(document);
}

function materializeNodeStyleBindings(node: RendererNode, styleMap: Map<string, DesignStyle>): void {
  if (node.style.fill_style) {
    const style = styleMap.get(node.style.fill_style);
    if (style?.type === "color") {
      node.style = { ...node.style, fill: style.value };
    }
  }
  if (node.content.type === "text" && node.content.typography_style) {
    const style = styleMap.get(node.content.typography_style);
    const typography = style?.type === "typography" ? parseTypographyValue(style) : null;
    if (typography) {
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize
      };
    }
  }
  for (const child of node.children) {
    materializeNodeStyleBindings(child, styleMap);
  }
}

function collectStyleBindingSnapshots(document: RendererDocument): StyleBindingSnapshot[] {
  const snapshots: StyleBindingSnapshot[] = [];
  forEachNode(document, (node) => {
    snapshots.push({
      nodeId: node.id,
      fillStyle: node.style.fill_style ?? null,
      typographyStyle: node.content.type === "text" ? node.content.typography_style ?? null : null
    });
  });
  return snapshots;
}

function applyStyleBindingSnapshots(document: RendererDocument, snapshots: StyleBindingSnapshot[]): void {
  for (const snapshot of snapshots) {
    const node = findNodeById(document, snapshot.nodeId);
    if (!node) {
      continue;
    }
    if (snapshot.fillStyle !== undefined) {
      node.style = { ...node.style, fill_style: snapshot.fillStyle };
    }
    if (snapshot.typographyStyle !== undefined && node.content.type === "text") {
      node.content = { ...node.content, typography_style: snapshot.typographyStyle };
    }
  }
}

function clearStyleBindings(document: RendererDocument, styleId: string): void {
  forEachNode(document, (node) => {
    if (node.style.fill_style === styleId) {
      node.style = { ...node.style, fill_style: null };
    }
    if (node.content.type === "text" && node.content.typography_style === styleId) {
      node.content = { ...node.content, typography_style: null };
    }
  });
}

function materializeNodeTokenBindings(node: RendererNode, tokenMap: Map<string, DesignToken>): void {
  if (node.style.fill_token) {
    const token = tokenMap.get(node.style.fill_token);
    if (token?.type === "color") {
      node.style = { ...node.style, fill: token.value };
    }
  }
  if (node.content.type === "text" && node.content.typography_token) {
    const token = tokenMap.get(node.content.typography_token);
    const typography = token?.type === "typography" ? parseTypographyToken(token) : null;
    if (typography) {
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize
      };
    }
  }
  for (const child of node.children) {
    materializeNodeTokenBindings(child, tokenMap);
  }
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
      font_family: "Inter",
      writing_mode: "horizontal_tb"
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
      const previousLayoutItem = node.layout_item ? structuredClone(node.layout_item) : null;

      const inverse: EditorCommand = {
        type: "update_node_geometry",
        nodeId: command.nodeId,
        patch: {
          x: node.transform.x,
          y: node.transform.y,
          width: node.size.width,
          height: node.size.height
        },
        layoutItem: previousLayoutItem
      };

      if ("layoutItem" in command) {
        restoreNodeLayoutItemForGeometry(node, command.layoutItem);
      } else {
        pinDirectlyResizedLayoutItemAxes(next, command.nodeId, command.patch);
      }
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

      const previousStyle = { ...node.style };
      const inverse: EditorCommand = {
        type: "set_node_style",
        nodeId: command.nodeId,
        style: previousStyle
      };
      node.style = { ...node.style, fill: command.fill, fill_token: null, fill_style: null };
      relayoutDocument(next);

      return { document: next, inverse };
    }
    case "create_style": {
      const previousStyles = [...(next.styles ?? [])];
      const nextStyle = {
        id: command.style.id,
        name: command.style.name,
        type: command.style.type,
        value: command.style.value
      };
      const existingIndex = previousStyles.findIndex((style) => style.id === nextStyle.id);
      next.styles = [...previousStyles];
      if (existingIndex >= 0) {
        next.styles[existingIndex] = nextStyle;
      } else {
        next.styles.push(nextStyle);
      }
      materializeStyleBindings(next);

      return {
        document: next,
        inverse: { type: "set_document_styles", styles: previousStyles }
      };
    }
    case "rename_style": {
      const style = (next.styles ?? []).find((candidate) => candidate.id === command.styleId);
      const name = command.name.trim();
      if (!style || !name || style.name === name) {
        return { document, inverse: null };
      }

      const previousName = style.name;
      style.name = name;

      return {
        document: next,
        inverse: { type: "rename_style", styleId: command.styleId, name: previousName }
      };
    }
    case "delete_style": {
      const previousStyles = [...(next.styles ?? [])];
      const previousBindings = collectStyleBindingSnapshots(next);
      if (!previousStyles.some((style) => style.id === command.styleId)) {
        return { document, inverse: null };
      }

      next.styles = previousStyles.filter((style) => style.id !== command.styleId);
      clearStyleBindings(next, command.styleId);
      relayoutDocument(next);

      return {
        document: next,
        inverse: { type: "set_document_styles", styles: previousStyles, bindings: previousBindings }
      };
    }
    case "set_document_styles": {
      const previousStyles = [...(next.styles ?? [])];
      const previousBindings = collectStyleBindingSnapshots(next);
      next.styles = command.styles.map((style) => ({ ...style }));
      if (command.bindings) {
        applyStyleBindingSnapshots(next, command.bindings);
      }
      materializeStyleBindings(next);

      return {
        document: next,
        inverse: { type: "set_document_styles", styles: previousStyles, bindings: previousBindings }
      };
    }
    case "set_fill_token": {
      const node = findNodeById(next, command.nodeId);
      const token = findColorToken(next, command.tokenId);
      if (!node || !token || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousStyle = { ...node.style };
      if (previousStyle.fill === token.value && previousStyle.fill_token === command.tokenId && !previousStyle.fill_style) {
        return { document, inverse: null };
      }

      node.style = { ...node.style, fill: token.value, fill_token: command.tokenId, fill_style: null };
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
    case "set_fill_style": {
      const node = findNodeById(next, command.nodeId);
      const style = findColorStyle(next, command.styleId);
      if (!node || !style || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousStyle = { ...node.style };
      if (previousStyle.fill === style.value && previousStyle.fill_style === command.styleId && !previousStyle.fill_token) {
        return { document, inverse: null };
      }

      node.style = { ...node.style, fill: style.value, fill_token: null, fill_style: command.styleId };
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
    case "set_token_set_enabled": {
      const tokenSet = (next.token_sets ?? []).find((candidate) => candidate.id === command.tokenSetId);
      if (!tokenSet) {
        return { document, inverse: null };
      }
      const previousEnabled = tokenSet.enabled;
      if (previousEnabled === command.enabled) {
        return { document, inverse: null };
      }

      tokenSet.enabled = command.enabled;
      materializeTokenBindings(next);

      return {
        document: next,
        inverse: {
          type: "set_token_set_enabled",
          tokenSetId: command.tokenSetId,
          enabled: previousEnabled
        }
      };
    }
    case "set_node_style": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousStyle = { ...node.style };
      if (
        previousStyle.fill === command.style.fill &&
        previousStyle.fill_token === command.style.fill_token &&
        previousStyle.fill_style === command.style.fill_style &&
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
    case "set_text_writing_mode": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || node.content.type !== "text") {
        return { document, inverse: null };
      }

      const previousWritingMode = node.content.writing_mode ?? "horizontal_tb";
      if (previousWritingMode === command.writingMode) {
        return { document, inverse: null };
      }

      node.content = { ...node.content, writing_mode: command.writingMode };
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_text_writing_mode",
          nodeId: command.nodeId,
          writingMode: previousWritingMode
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_text_typography_token": {
      const node = findNodeById(next, command.nodeId);
      const token = findTypographyToken(next, command.tokenId);
      const typography = token ? parseTypographyToken(token) : null;
      if (!node || isNodeLocked(node) || node.content.type !== "text" || !token || !typography) {
        return { document, inverse: null };
      }

      const previousContent = { ...node.content };
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize,
        typography_token: command.tokenId,
        typography_style: null
      };
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_text_content",
          nodeId: command.nodeId,
          content: previousContent
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_text_typography_style": {
      const node = findNodeById(next, command.nodeId);
      const style = findTypographyStyle(next, command.styleId);
      const typography = style ? parseTypographyValue(style) : null;
      if (!node || isNodeLocked(node) || node.content.type !== "text" || !style || !typography) {
        return { document, inverse: null };
      }

      const previousContent = { ...node.content };
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize,
        typography_token: null,
        typography_style: command.styleId
      };
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_text_content",
          nodeId: command.nodeId,
          content: previousContent
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_text_content": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || node.content.type !== "text") {
        return { document, inverse: null };
      }

      const previousContent = { ...node.content };
      node.content = { ...command.content };
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_text_content",
          nodeId: command.nodeId,
          content: previousContent
        },
        selectedNodeId: command.nodeId
      };
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
    case "set_node_export_presets": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousPresets = node.export_presets ? structuredClone(node.export_presets) : [];
      const nextPresets = normalizeNodeExportPresets(command.presets);
      if (JSON.stringify(previousPresets) === JSON.stringify(nextPresets)) {
        return { document, inverse: null };
      }

      if (nextPresets.length > 0) {
        node.export_presets = nextPresets;
      } else {
        delete node.export_presets;
      }
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_node_export_presets",
          nodeId: command.nodeId,
          presets: previousPresets
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
        variant_id: definition.variants[0]?.id ?? null,
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
    case "set_component_instance_variant": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || !node.component_instance) {
        return { document, inverse: null };
      }

      const definition = (next.components ?? []).find(
        (component) => component.id === node.component_instance?.definition_id
      );
      if (!definition) {
        return { document, inverse: null };
      }
      if (command.variantId !== null && !definition.variants.some((variant) => variant.id === command.variantId)) {
        return { document, inverse: null };
      }

      const previousVariantId = node.component_instance.variant_id ?? null;
      if (previousVariantId === command.variantId) {
        return { document, inverse: null };
      }

      node.component_instance = {
        ...node.component_instance,
        variant_id: command.variantId
      };

      return {
        document: next,
        inverse: {
          type: "set_component_instance_variant",
          nodeId: command.nodeId,
          variantId: previousVariantId
        },
        selectedNodeId: command.nodeId
      };
    }
    case "set_component_variants": {
      const component = (next.components ?? []).find((candidate) => candidate.id === command.componentId);
      if (!component || command.variants.length === 0) {
        return { document, inverse: null };
      }

      const previousVariants = structuredClone(component.variants);
      const nextVariants = structuredClone(command.variants);
      const validVariantIds = new Set(nextVariants.map((variant) => variant.id));
      const fallbackVariantId = nextVariants[0]?.id ?? null;
      const previousInstanceVariantIds: Record<string, string | null> = {};

      component.variants = nextVariants;
      forEachNode(next, (node) => {
        if (node.component_instance?.definition_id !== command.componentId) {
          return;
        }

        const previousVariantId = node.component_instance.variant_id ?? null;
        const explicitVariantId = command.instanceVariantIds?.[node.id];
        const nextVariantId =
          explicitVariantId !== undefined
            ? explicitVariantId
            : previousVariantId && validVariantIds.has(previousVariantId)
              ? previousVariantId
              : fallbackVariantId;

        if (previousVariantId === nextVariantId) {
          return;
        }

        previousInstanceVariantIds[node.id] = previousVariantId;
        node.component_instance = {
          ...node.component_instance,
          variant_id: nextVariantId
        };
      });

      return {
        document: next,
        inverse: {
          type: "set_component_variants",
          componentId: command.componentId,
          variants: previousVariants,
          instanceVariantIds: previousInstanceVariantIds
        },
        selectedNodeId: component.source_node.id
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
    case "delete_grid_track_with_children": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || (node.kind !== "frame" && node.kind !== "component")) {
        return { document, inverse: null };
      }

      if (command.previousNode) {
        replaceNodeById(next, command.nodeId, structuredClone(command.previousNode));
        relayoutDocument(next);
        return {
          document: next,
          inverse: {
            type: "delete_grid_track_with_children",
            nodeId: command.nodeId,
            axis: command.axis,
            index: command.index
          },
          selectedNodeId: command.nodeId
        };
      }

      const layout = normalizedFlowLayout(node.layout);
      if (!layout || layout.mode !== "grid") {
        return { document, inverse: null };
      }

      const flowChildren = node.children.filter((child) => layoutItemPosition(child.layout_item) === "static");
      const placementPlan = gridPlacementPlan(layout, flowChildren);
      const trackCount = command.axis === "column" ? placementPlan.columns : placementPlan.rows;
      if (trackCount <= 1 || command.index < 0 || command.index >= trackCount) {
        return { document, inverse: null };
      }

      const affectedChildIds = new Set(
        flowChildren
          .filter((child) => {
            const placement = placementPlan.placements.get(child.id);
            return placement ? gridPlacementIntersectsTrack(placement, command.axis, command.index) : false;
          })
          .map((child) => child.id)
      );
      if (flowChildren.some((child) => affectedChildIds.has(child.id) && isNodeLocked(child))) {
        return { document, inverse: null };
      }

      const previousNode = structuredClone(node);
      if (command.axis === "column") {
        const tracks = resolveGridTracks(layout.grid_column_tracks, placementPlan.columns);
        node.layout = normalizeNodeLayout({
          ...layout,
          grid_columns: placementPlan.columns - 1,
          grid_column_tracks: tracks.filter((_, index) => index !== command.index)
        });
      } else {
        const tracks = resolveGridTracks(layout.grid_row_tracks, placementPlan.rows);
        node.layout = normalizeNodeLayout({
          ...layout,
          grid_rows: placementPlan.rows - 1,
          grid_row_tracks: tracks.filter((_, index) => index !== command.index)
        });
      }
      node.children = node.children.filter((child) => !affectedChildIds.has(child.id));
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "delete_grid_track_with_children",
          nodeId: command.nodeId,
          axis: command.axis,
          index: command.index,
          previousNode
        },
        selectedNodeId: command.nodeId
      };
    }
    case "reorder_grid_track_with_children": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node) || (node.kind !== "frame" && node.kind !== "component")) {
        return { document, inverse: null };
      }

      if (command.previousNode) {
        replaceNodeById(next, command.nodeId, structuredClone(command.previousNode));
        relayoutDocument(next);
        return {
          document: next,
          inverse: {
            type: "reorder_grid_track_with_children",
            nodeId: command.nodeId,
            axis: command.axis,
            fromIndex: command.fromIndex,
            toIndex: command.toIndex,
            preserveChildren: command.preserveChildren
          },
          selectedNodeId: command.nodeId
        };
      }

      const layout = normalizedFlowLayout(node.layout);
      if (!layout || layout.mode !== "grid") {
        return { document, inverse: null };
      }

      const flowChildren = node.children.filter((child) => layoutItemPosition(child.layout_item) === "static");
      const placementPlan = gridPlacementPlan(layout, flowChildren);
      const trackCount = command.axis === "column" ? placementPlan.columns : placementPlan.rows;
      const fromIndex = Math.trunc(command.fromIndex);
      const toIndex = Math.trunc(command.toIndex);
      if (
        trackCount <= 1 ||
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= trackCount ||
        toIndex < 0 ||
        toIndex >= trackCount
      ) {
        return { document, inverse: null };
      }
      if (
        flowChildren.some((child) => {
          const placement = placementPlan.placements.get(child.id);
          return placement ? isNodeLocked(child) && gridPlacementMoves(placement, command.axis, fromIndex, toIndex) : false;
        })
      ) {
        return { document, inverse: null };
      }

      const previousNode = structuredClone(node);
      const previousChildSnapshots = new Map(
        flowChildren.map((child) => [
          child.id,
          {
            transform: { ...child.transform },
            size: { ...child.size }
          }
        ])
      );
      const columnTracks = resolveGridTracks(layout.grid_column_tracks, placementPlan.columns);
      const rowTracks = resolveGridTracks(layout.grid_row_tracks, placementPlan.rows);
      const nextLayout = normalizeNodeLayout({
        ...layout,
        grid_columns: placementPlan.columns,
        grid_rows: placementPlan.rows,
        grid_column_tracks:
          command.axis === "column" ? moveArrayItem(columnTracks, fromIndex, toIndex) : columnTracks,
        grid_row_tracks: command.axis === "row" ? moveArrayItem(rowTracks, fromIndex, toIndex) : rowTracks,
        grid_areas: moveGridAreas(layout, command.axis, fromIndex, toIndex)
      });
      node.layout = nextLayout;

      if (command.preserveChildren) {
        materializePreservedGridChildPlacements(
          node,
          nextLayout,
          flowChildren,
          placementPlan.placements,
          previousChildSnapshots
        );
      } else {
        for (const child of flowChildren) {
          const placement = placementPlan.placements.get(child.id);
          if (!placement) {
            continue;
          }
          const movedPlacement = moveGridPlacementAlongAxis(placement, command.axis, fromIndex, toIndex);
          const currentLayoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
          if (currentLayoutItem.grid_area) {
            child.layout_item = normalizeNodeLayoutItem(currentLayoutItem);
            continue;
          }
          child.layout_item = normalizeNodeLayoutItem({
            ...currentLayoutItem,
            grid_area: undefined,
            grid_column: movedPlacement.column + 1,
            grid_row: movedPlacement.row + 1,
            grid_column_span: movedPlacement.columnSpan,
            grid_row_span: movedPlacement.rowSpan
          });
        }
      }
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "reorder_grid_track_with_children",
          nodeId: command.nodeId,
          axis: command.axis,
          fromIndex,
          toIndex,
          preserveChildren: command.preserveChildren,
          previousNode
        },
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
    case "set_node_layout_item": {
      const node = findNodeById(next, command.nodeId);
      if (!node || isNodeLocked(node)) {
        return { document, inverse: null };
      }

      const previousLayoutItem = node.layout_item ? structuredClone(node.layout_item) : null;
      if (command.layoutItem) {
        node.layout_item = normalizeNodeLayoutItem(command.layoutItem);
      } else {
        delete node.layout_item;
      }
      relayoutDocument(next);

      return {
        document: next,
        inverse: {
          type: "set_node_layout_item",
          nodeId: command.nodeId,
          layoutItem: previousLayoutItem
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
  const layout = normalizedFlowLayout(node.layout);
  if (layout) {
    const isVertical = isVerticalLayoutDirection(layout.direction);
    const isReverse = isReverseLayoutDirection(layout.direction);
    const flowChildren = node.children.filter((child) => layoutItemPosition(child.layout_item) === "static");
    applyLayoutContainerSizeLimits(node, layout);
    flowChildren.forEach(applyLayoutItemSizeLimits);
    if (layout.mode === "grid") {
      relayoutGridChildren(node, layout, flowChildren);
    } else if (layout.wrap === "wrap") {
      relayoutWrappedChildren(node, layout, flowChildren, isVertical, isReverse);
    } else {
      relayoutSingleLineChildren(node, layout, flowChildren, isVertical, isReverse);
    }
  }

  for (const child of node.children) {
    relayoutNode(child);
  }
}

type GridCell = { row: number; column: number };

type GridPlacement = GridCell & { rowSpan: number; columnSpan: number };

type GridAutoCell = GridCell & { nextCursor: number };

interface GridPlacementPlan {
  columns: number;
  rows: number;
  placements: Map<string, GridPlacement>;
}

function relayoutGridChildren(node: RendererNode, layout: NodeLayout, flowChildren: RendererNode[]): void {
  const columnGap = layout.column_gap ?? layout.gap;
  const rowGap = layout.row_gap ?? layout.gap;
  const justifyItems = layout.justify_items ?? "start";
  const { columns, rows, placements } = gridPlacementPlan(layout, flowChildren);
  const availableWidth = Math.max(
    0,
    node.size.width - layout.padding.left - layout.padding.right - columnGap * Math.max(0, columns - 1)
  );
  const availableHeight = Math.max(
    0,
    node.size.height - layout.padding.top - layout.padding.bottom - rowGap * Math.max(0, rows - 1)
  );
  const columnTracks = resolveGridTracks(layout.grid_column_tracks, columns);
  const rowTracks = resolveGridTracks(layout.grid_row_tracks, rows);
  const columnSizes = resolveGridTrackSizes(columnTracks, availableWidth, "column", flowChildren, placements);
  const rowSizes = resolveGridTrackSizes(rowTracks, availableHeight, "row", flowChildren, placements);
  const columnStarts = gridTrackStarts(columnSizes, columnGap);
  const rowStarts = gridTrackStarts(rowSizes, rowGap);

  const entries = flowChildren.map((child) => {
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    const justifySelf = layoutItem.justify_self ?? justifyItems;
    const alignSelf = layoutItem.align_self ?? layout.align_items;
    const placement = placements.get(child.id) ?? { row: 0, column: 0, rowSpan: 1, columnSpan: 1 };
    const { row, column } = placement;
    const margin = layoutItem.margin;
    const placementWidth = gridPlacementTrackSize(columnSizes, column, placement.columnSpan, columnGap);
    const placementHeight = gridPlacementTrackSize(rowSizes, row, placement.rowSpan, rowGap);
    const innerWidth = Math.max(0, placementWidth - margin.left - margin.right);
    const innerHeight = Math.max(0, placementHeight - margin.top - margin.bottom);
    return { child, layoutItem, justifySelf, alignSelf, placement, row, column, margin, innerWidth, innerHeight };
  });

  for (const entry of entries) {
    const { child, layoutItem, justifySelf, alignSelf, innerWidth, innerHeight } = entry;
    if (layoutItem.width_sizing === "fill" || justifySelf === "stretch") {
      child.size.width = clampLayoutItemWidth(child, innerWidth);
    }
    if (layoutItem.height_sizing === "fill" || alignSelf === "stretch") {
      child.size.height = clampLayoutItemHeight(child, innerHeight);
    }
  }

  const rowBaselines = new Map<number, number>();
  for (const entry of entries) {
    if (entry.alignSelf === "baseline") {
      const baseline = entry.margin.top + nodeBaselineOffset(entry.child);
      rowBaselines.set(entry.row, Math.max(rowBaselines.get(entry.row) ?? 0, baseline));
    }
  }

  for (const entry of entries) {
    const { child, justifySelf, alignSelf, row, column, margin, innerWidth, innerHeight } = entry;
    const rowBaseline = alignSelf === "baseline" ? rowBaselines.get(row) : undefined;
    child.transform = {
      ...child.transform,
      x: layout.padding.left + columnStarts[column] + margin.left + gridAxisOffset(justifySelf, innerWidth, child.size.width),
      y:
        rowBaseline === undefined
          ? layout.padding.top + rowStarts[row] + margin.top + gridAxisOffset(alignSelf, innerHeight, child.size.height)
          : layout.padding.top + rowStarts[row] + rowBaseline - nodeBaselineOffset(child)
    };
  }
}

function gridPlacementPlan(layout: NodeLayout, flowChildren: RendererNode[]): GridPlacementPlan {
  let columns = gridTrackCount(layout.grid_column_tracks, layout.grid_columns, 2);
  let rows = gridTrackCount(layout.grid_row_tracks, layout.grid_rows, Math.max(1, Math.ceil(flowChildren.length / columns)));
  if (isVerticalLayoutDirection(layout.direction)) {
    columns = Math.max(columns, Math.ceil(flowChildren.length / rows), 1);
  } else {
    rows = Math.max(rows, Math.ceil(flowChildren.length / columns), 1);
  }
  const placements = new Map<string, GridPlacement>();
  const areaPlacements = gridAreaPlacementsByName(layout.grid_areas, columns, rows);
  const occupiedCells = new Set<string>();

  for (const child of flowChildren) {
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    const manualPlacement = namedGridAreaPlacement(layoutItem, areaPlacements) ?? manualGridPlacement(layoutItem, columns, rows);
    if (manualPlacement) {
      placements.set(child.id, manualPlacement);
      for (const occupiedCell of gridPlacementCells(manualPlacement)) {
        occupiedCells.add(gridCellKey(occupiedCell));
      }
    }
  }

  let autoCursor = 0;

  flowChildren.forEach((child) => {
    const manualPlacement = placements.get(child.id);
    let placement: GridPlacement;
    if (manualPlacement) {
      placement = manualPlacement;
    } else {
      const autoCell = nextAutoGridCell(autoCursor, columns, rows, occupiedCells, layout.direction);
      autoCursor = autoCell.nextCursor;
      placement = { row: autoCell.row, column: autoCell.column, rowSpan: 1, columnSpan: 1 };
      occupiedCells.add(gridCellKey(autoCell));
    }
    placements.set(child.id, placement);
  });

  return { columns, rows, placements };
}

function gridPlacementIntersectsTrack(placement: GridPlacement, axis: "column" | "row", index: number): boolean {
  return axis === "column"
    ? placement.column <= index && index < placement.column + placement.columnSpan
    : placement.row <= index && index < placement.row + placement.rowSpan;
}

function materializePreservedGridChildPlacements(
  parent: RendererNode,
  layout: NodeLayout,
  flowChildren: RendererNode[],
  placements: Map<string, GridPlacement>,
  previousChildSnapshots: Map<
    string,
    { transform: RendererNode["transform"]; size: RendererNode["size"] }
  >
): void {
  const columns = gridTrackCount(layout.grid_column_tracks, layout.grid_columns, 2);
  const rows = gridTrackCount(layout.grid_row_tracks, layout.grid_rows, 1);
  const columnGap = layout.column_gap ?? layout.gap;
  const rowGap = layout.row_gap ?? layout.gap;
  const availableWidth = Math.max(
    0,
    parent.size.width - layout.padding.left - layout.padding.right - columnGap * Math.max(0, columns - 1)
  );
  const availableHeight = Math.max(
    0,
    parent.size.height - layout.padding.top - layout.padding.bottom - rowGap * Math.max(0, rows - 1)
  );
  const columnTracks = resolveGridTracks(layout.grid_column_tracks, columns);
  const rowTracks = resolveGridTracks(layout.grid_row_tracks, rows);
  const columnSizes = resolveGridTrackSizes(columnTracks, availableWidth, "column", flowChildren, placements);
  const rowSizes = resolveGridTrackSizes(rowTracks, availableHeight, "row", flowChildren, placements);
  const columnStarts = gridTrackStarts(columnSizes, columnGap);
  const rowStarts = gridTrackStarts(rowSizes, rowGap);

  for (const child of flowChildren) {
    const placement = placements.get(child.id);
    const previous = previousChildSnapshots.get(child.id);
    if (!placement || !previous) {
      continue;
    }
    const currentLayoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    const column = gridTrackIndexForPreservedPosition(
      previous.transform.x,
      layout.padding.left,
      columnStarts,
      placement.columnSpan
    );
    const row = gridTrackIndexForPreservedPosition(
      previous.transform.y,
      layout.padding.top,
      rowStarts,
      placement.rowSpan
    );
    child.size = { ...previous.size };
    child.layout_item = normalizeNodeLayoutItem({
      ...currentLayoutItem,
      grid_area: undefined,
      grid_column: column + 1,
      grid_row: row + 1,
      grid_column_span: placement.columnSpan,
      grid_row_span: placement.rowSpan,
      margin: {
        ...currentLayoutItem.margin,
        left: layoutOffsetForPreservedPosition(previous.transform.x, layout.padding.left, columnStarts[column] ?? 0),
        top: layoutOffsetForPreservedPosition(previous.transform.y, layout.padding.top, rowStarts[row] ?? 0)
      }
    });
  }
}

function gridTrackIndexForPreservedPosition(
  position: number,
  paddingStart: number,
  starts: number[],
  span: number
): number {
  const maxIndex = Math.max(0, starts.length - Math.max(1, span));
  let targetIndex = 0;
  const relativePosition = position - paddingStart;
  for (let index = 0; index <= maxIndex; index += 1) {
    if (starts[index] <= relativePosition + 0.001) {
      targetIndex = index;
    }
  }
  return targetIndex;
}

function layoutOffsetForPreservedPosition(position: number, paddingStart: number, trackStart: number): number {
  return Math.round(Math.max(0, position - paddingStart - trackStart) * 1000) / 1000;
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  if (item === undefined) {
    return items;
  }
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function moveTrackIndex(index: number, fromIndex: number, toIndex: number): number {
  if (index === fromIndex) {
    return toIndex;
  }
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return index - 1;
  }
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
    return index + 1;
  }
  return index;
}

function moveGridPlacementAlongAxis(
  placement: GridPlacement,
  axis: "column" | "row",
  fromIndex: number,
  toIndex: number
): GridPlacement {
  const start = axis === "column" ? placement.column : placement.row;
  const span = axis === "column" ? placement.columnSpan : placement.rowSpan;
  const movedIndexes = Array.from({ length: span }, (_, offset) =>
    moveTrackIndex(start + offset, fromIndex, toIndex)
  );
  const nextStart = Math.min(...movedIndexes);
  const nextEnd = Math.max(...movedIndexes);
  if (axis === "column") {
    return {
      ...placement,
      column: nextStart,
      columnSpan: nextEnd - nextStart + 1
    };
  }
  return {
    ...placement,
    row: nextStart,
    rowSpan: nextEnd - nextStart + 1
  };
}

function gridPlacementMoves(
  placement: GridPlacement,
  axis: "column" | "row",
  fromIndex: number,
  toIndex: number
): boolean {
  const nextPlacement = moveGridPlacementAlongAxis(placement, axis, fromIndex, toIndex);
  return (
    nextPlacement.column !== placement.column ||
    nextPlacement.row !== placement.row ||
    nextPlacement.columnSpan !== placement.columnSpan ||
    nextPlacement.rowSpan !== placement.rowSpan
  );
}

function moveGridAreas(
  layout: NodeLayout,
  axis: "column" | "row",
  fromIndex: number,
  toIndex: number
): GridArea[] | undefined {
  const areas = layout.grid_areas ?? [];
  if (!areas.length) {
    return undefined;
  }
  const columns = gridTrackCount(layout.grid_column_tracks, layout.grid_columns, 2);
  const rows = gridTrackCount(layout.grid_row_tracks, layout.grid_rows, 2);
  return areas.map((area) => {
    const normalizedArea = normalizeGridArea(area, columns, rows);
    if (!normalizedArea) {
      return area;
    }
    const movedArea = moveGridPlacementAlongAxis(
      {
        column: normalizedArea.column - 1,
        row: normalizedArea.row - 1,
        columnSpan: normalizedArea.column_span,
        rowSpan: normalizedArea.row_span
      },
      axis,
      fromIndex,
      toIndex
    );
    return {
      ...normalizedArea,
      column: movedArea.column + 1,
      row: movedArea.row + 1,
      column_span: movedArea.columnSpan,
      row_span: movedArea.rowSpan
    };
  });
}

function relayoutSingleLineChildren(
  node: RendererNode,
  layout: NodeLayout,
  flowChildren: RendererNode[],
  isVertical: boolean,
  isReverse: boolean
): void {
  const childCount = flowChildren.length;
  const mainStartPadding = mainStartPaddingFor(layout, isVertical, isReverse);
  const mainEndPadding = mainEndPaddingFor(layout, isVertical, isReverse);
  const crossStartPadding = isVertical ? layout.padding.left : layout.padding.top;
  const crossEndPadding = isVertical ? layout.padding.right : layout.padding.bottom;
  const mainGap = mainAxisGap(layout, isVertical);
  applyFillSizingForSingleLine(node, layout, flowChildren, isVertical, isReverse, mainGap);
  const childMetrics = flowChildren.map((child) => childLayoutMetrics(child, isVertical, isReverse));
  const totalChildMain =
    childMetrics.reduce(
      (total, metrics) => total + metrics.mainBefore + metrics.mainSize + metrics.mainAfter,
      0
    ) + mainGap * Math.max(0, childCount - 1);
  const totalChildCross = childMetrics.reduce(
    (maximum, metrics) => Math.max(maximum, metrics.crossBefore + metrics.crossSize + metrics.crossAfter),
    0
  );
  applyFitSizing(node, layout, isVertical, {
    main: mainStartPadding + totalChildMain + mainEndPadding,
    cross: crossStartPadding + totalChildCross + crossEndPadding
  });
  const availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  const availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
  const remainingMain = Math.max(0, availableMain - totalChildMain);
  let cursor = mainStartPadding + justifyStartOffset(layout.justify_content, remainingMain, childCount);
  const distributedGap = mainGap + justifyGapOffset(layout.justify_content, remainingMain, childCount);
  const baselineOffset =
    !isVertical && layout.align_items === "baseline"
      ? Math.max(...flowChildren.map((child, index) => childMetrics[index].crossBefore + nodeBaselineOffset(child)))
      : null;

  flowChildren.forEach((child, index) => {
    const metrics = childMetrics[index];
    const crossAxisPosition =
      baselineOffset === null
        ? crossAxisOffset(
            layout.align_items,
            crossStartPadding,
            crossEndPadding,
            availableCross,
            metrics.crossSize,
            isVertical ? node.size.width : node.size.height,
            metrics.crossBefore,
            metrics.crossAfter
          )
        : crossStartPadding + baselineOffset - nodeBaselineOffset(child);
    if (layout.align_items === "stretch") {
      if (isVertical) {
        child.size.width = clampLayoutItemWidth(
          child,
          availableCross - metrics.crossBefore - metrics.crossAfter
        );
      } else {
        child.size.height = clampLayoutItemHeight(
          child,
          availableCross - metrics.crossBefore - metrics.crossAfter
        );
      }
    }
    const mainAxisPosition = mainAxisChildPosition(
      isVertical ? node.size.height : node.size.width,
      cursor,
      metrics,
      child,
      isVertical,
      isReverse
    );
    child.transform = {
      ...child.transform,
      x: isVertical ? crossAxisPosition : mainAxisPosition,
      y: isVertical ? mainAxisPosition : crossAxisPosition
    };
    cursor += metrics.mainBefore + (isVertical ? child.size.height : child.size.width) + metrics.mainAfter + distributedGap;
  });
}

function relayoutWrappedChildren(
  node: RendererNode,
  layout: NodeLayout,
  flowChildren: RendererNode[],
  isVertical: boolean,
  isReverse: boolean
): void {
  const mainStartPadding = mainStartPaddingFor(layout, isVertical, isReverse);
  const mainEndPadding = mainEndPaddingFor(layout, isVertical, isReverse);
  const crossStartPadding = isVertical ? layout.padding.left : layout.padding.top;
  const crossEndPadding = isVertical ? layout.padding.right : layout.padding.bottom;
  let availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  let availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
  const mainGap = mainAxisGap(layout, isVertical);
  const crossGap = crossAxisGap(layout, isVertical);
  const lines = buildFlexLines(flowChildren, isVertical, isReverse, availableMain, mainGap);
  applyFillSizingForWrappedLines(layout, lines, isVertical, isReverse, availableMain);
  const totalLineMain = lines.reduce((maximum, line) => Math.max(maximum, line.mainSize), 0);
  const totalLineCross =
    lines.reduce((total, line) => total + line.crossSize, 0) + crossGap * Math.max(0, lines.length - 1);
  applyFitSizing(node, layout, isVertical, {
    main: mainStartPadding + totalLineMain + mainEndPadding,
    cross: crossStartPadding + totalLineCross + crossEndPadding
  });
  availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
  const remainingCross = Math.max(0, availableCross - totalLineCross);
  const alignContent = layout.align_content ?? "start";
  let crossCursor = crossStartPadding + justifyStartOffset(alignContent, remainingCross, lines.length);
  const lineGap = crossGap + justifyGapOffset(alignContent, remainingCross, lines.length);

  for (const line of lines) {
    const remainingMain = Math.max(0, availableMain - line.mainSize);
    let mainCursor = mainStartPadding + justifyStartOffset(layout.justify_content, remainingMain, line.children.length);
    const distributedGap = mainGap + justifyGapOffset(layout.justify_content, remainingMain, line.children.length);
    const baselineOffset =
      !isVertical && layout.align_items === "baseline"
        ? Math.max(...line.children.map((entry) => entry.metrics.crossBefore + nodeBaselineOffset(entry.child)))
        : null;

    for (const entry of line.children) {
      const { child, metrics } = entry;
      const crossAxisPosition =
        baselineOffset === null
          ? crossAxisLineOffset(
              layout.align_items,
              crossCursor,
              line.crossSize,
              metrics.crossSize,
              metrics.crossBefore,
              metrics.crossAfter
            )
          : crossCursor + baselineOffset - nodeBaselineOffset(child);
      if (layout.align_items === "stretch") {
        if (isVertical) {
          child.size.width = clampLayoutItemWidth(
            child,
            line.crossSize - metrics.crossBefore - metrics.crossAfter
          );
        } else {
          child.size.height = clampLayoutItemHeight(
            child,
            line.crossSize - metrics.crossBefore - metrics.crossAfter
          );
        }
      }
      const mainAxisPosition = mainAxisChildPosition(
        isVertical ? node.size.height : node.size.width,
        mainCursor,
        metrics,
        child,
        isVertical,
        isReverse
      );
      child.transform = {
        ...child.transform,
        x: isVertical ? crossAxisPosition : mainAxisPosition,
        y: isVertical ? mainAxisPosition : crossAxisPosition
      };
      mainCursor += metrics.mainBefore + (isVertical ? child.size.height : child.size.width) + metrics.mainAfter + distributedGap;
    }

    crossCursor += line.crossSize + lineGap;
  }
}

function mainAxisGap(layout: NodeLayout, isVertical: boolean): number {
  return isVertical ? layout.row_gap ?? layout.gap : layout.column_gap ?? layout.gap;
}

function crossAxisGap(layout: NodeLayout, isVertical: boolean): number {
  return isVertical ? layout.column_gap ?? layout.gap : layout.row_gap ?? layout.gap;
}

function applyFillSizingForSingleLine(
  node: RendererNode,
  layout: NodeLayout,
  flowChildren: RendererNode[],
  isVertical: boolean,
  isReverse: boolean,
  mainGap: number
): void {
  const mainStartPadding = mainStartPaddingFor(layout, isVertical, isReverse);
  const mainEndPadding = mainEndPaddingFor(layout, isVertical, isReverse);
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
  const mainAxisIsFixed = isVertical ? layout.height_sizing !== "fit" : layout.width_sizing !== "fit";
  const crossAxisIsFixed = isVertical ? layout.width_sizing !== "fit" : layout.height_sizing !== "fit";
  const childMetrics = flowChildren.map((child) => childLayoutMetrics(child, isVertical, isReverse));
  const fillMainChildren = flowChildren.filter((child) => layoutItemMainSizing(child, isVertical) === "fill");

  if (mainAxisIsFixed && fillMainChildren.length > 0) {
    const fixedMainTotal = flowChildren.reduce((total, child, index) => {
      const metrics = childMetrics[index];
      const base = metrics.mainBefore + metrics.mainAfter;
      return total + base + (layoutItemMainSizing(child, isVertical) === "fill" ? 0 : metrics.mainSize);
    }, 0);
    const remainingMain = Math.max(0, availableMain - fixedMainTotal - mainGap * Math.max(0, flowChildren.length - 1));
    const filledMainSize = clampSize(remainingMain / fillMainChildren.length);
    for (const child of fillMainChildren) {
      if (isVertical) {
        child.size.height = clampLayoutItemHeight(child, filledMainSize);
      } else {
        child.size.width = clampLayoutItemWidth(child, filledMainSize);
      }
    }
  }

  if (crossAxisIsFixed) {
    flowChildren.forEach((child, index) => {
      if (layoutItemCrossSizing(child, isVertical) !== "fill") {
        return;
      }
      const metrics = childMetrics[index];
      const filledCrossSize = clampSize(availableCross - metrics.crossBefore - metrics.crossAfter);
      if (isVertical) {
        child.size.width = clampLayoutItemWidth(child, filledCrossSize);
      } else {
        child.size.height = clampLayoutItemHeight(child, filledCrossSize);
      }
    });
  }
}

function applyFillSizingForWrappedLines(
  layout: NodeLayout,
  lines: Array<{
    children: Array<{ child: RendererNode; metrics: ReturnType<typeof childLayoutMetrics> }>;
    mainSize: number;
    crossSize: number;
  }>,
  isVertical: boolean,
  isReverse: boolean,
  availableMain: number
): void {
  const mainAxisIsFixed = isVertical ? layout.height_sizing !== "fit" : layout.width_sizing !== "fit";
  const crossAxisIsFixed = isVertical ? layout.width_sizing !== "fit" : layout.height_sizing !== "fit";

  for (const line of lines) {
    const fillMainChildren = line.children.filter((entry) => layoutItemMainSizing(entry.child, isVertical) === "fill");
    if (mainAxisIsFixed && fillMainChildren.length > 0) {
      const fixedMainTotal = line.children.reduce((total, entry) => {
        const base = entry.metrics.mainBefore + entry.metrics.mainAfter;
        return total + base + (layoutItemMainSizing(entry.child, isVertical) === "fill" ? 0 : entry.metrics.mainSize);
      }, 0);
      const remainingMain = Math.max(0, availableMain - fixedMainTotal - mainAxisGap(layout, isVertical) * Math.max(0, line.children.length - 1));
      const filledMainSize = clampSize(remainingMain / fillMainChildren.length);
      for (const entry of fillMainChildren) {
        if (isVertical) {
          entry.child.size.height = clampLayoutItemHeight(entry.child, filledMainSize);
        } else {
          entry.child.size.width = clampLayoutItemWidth(entry.child, filledMainSize);
        }
      }
    }

    line.children = line.children.map((entry) => ({
      child: entry.child,
      metrics: childLayoutMetrics(entry.child, isVertical, isReverse)
    }));
    line.mainSize = line.children.reduce(
      (total, entry, index) =>
        total + entry.metrics.mainBefore + entry.metrics.mainSize + entry.metrics.mainAfter +
        (index > 0 ? mainAxisGap(layout, isVertical) : 0),
      0
    );
    line.crossSize = line.children.reduce(
      (maximum, entry) => Math.max(maximum, entry.metrics.crossBefore + entry.metrics.crossSize + entry.metrics.crossAfter),
      0
    );

    if (crossAxisIsFixed) {
      for (const entry of line.children) {
        if (layoutItemCrossSizing(entry.child, isVertical) !== "fill") {
          continue;
        }
        const filledCrossSize = clampSize(line.crossSize - entry.metrics.crossBefore - entry.metrics.crossAfter);
        if (isVertical) {
          entry.child.size.width = clampLayoutItemWidth(entry.child, filledCrossSize);
        } else {
          entry.child.size.height = clampLayoutItemHeight(entry.child, filledCrossSize);
        }
      }
      line.children = line.children.map((entry) => ({
        child: entry.child,
        metrics: childLayoutMetrics(entry.child, isVertical, isReverse)
      }));
      line.crossSize = line.children.reduce(
        (maximum, entry) => Math.max(maximum, entry.metrics.crossBefore + entry.metrics.crossSize + entry.metrics.crossAfter),
        0
      );
    }
  }
}

function applyFitSizing(
  node: RendererNode,
  layout: NodeLayout,
  isVertical: boolean,
  contentSize: { main: number; cross: number }
): void {
  const fittedMain = clampSize(contentSize.main);
  const fittedCross = clampSize(contentSize.cross);
  if (isVertical) {
    if (layout.width_sizing === "fit") {
      node.size.width = clampLayoutWidth(layout, fittedCross);
    }
    if (layout.height_sizing === "fit") {
      node.size.height = clampLayoutHeight(layout, fittedMain);
    }
    return;
  }

  if (layout.width_sizing === "fit") {
    node.size.width = clampLayoutWidth(layout, fittedMain);
  }
  if (layout.height_sizing === "fit") {
    node.size.height = clampLayoutHeight(layout, fittedCross);
  }
}

function buildFlexLines(
  children: RendererNode[],
  isVertical: boolean,
  isReverse: boolean,
  availableMain: number,
  gap: number
) {
  const lines: Array<{
    children: Array<{ child: RendererNode; metrics: ReturnType<typeof childLayoutMetrics> }>;
    mainSize: number;
    crossSize: number;
  }> = [];
  let currentLine: (typeof lines)[number] | null = null;

  for (const child of children) {
    const metrics = childLayoutMetrics(child, isVertical, isReverse);
    const itemMainSize = metrics.mainBefore + metrics.mainSize + metrics.mainAfter;
    const itemCrossSize = metrics.crossBefore + metrics.crossSize + metrics.crossAfter;
    const nextMainSize = currentLine
      ? currentLine.mainSize + gap + itemMainSize
      : itemMainSize;

    if (currentLine && currentLine.children.length > 0 && nextMainSize > availableMain) {
      lines.push(currentLine);
      currentLine = null;
    }

    if (!currentLine) {
      currentLine = { children: [], mainSize: 0, crossSize: 0 };
    }

    currentLine.children.push({ child, metrics });
    currentLine.mainSize = currentLine.children.length === 1
      ? itemMainSize
      : currentLine.mainSize + gap + itemMainSize;
    currentLine.crossSize = Math.max(currentLine.crossSize, itemCrossSize);
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function pinDirectlyResizedLayoutItemAxes(
  document: RendererDocument,
  nodeId: string,
  patch: GeometryPatch
): void {
  if (patch.width === undefined && patch.height === undefined) {
    return;
  }

  const selected = findNodeWithParent(document, nodeId);
  const parent = selected ? findNodeById(document, selected.parentId) : null;
  if (!selected || !parent || !normalizedFlowLayout(parent.layout)) {
    return;
  }

  const node = selected.node;
  if (layoutItemPosition(node.layout_item) !== "static") {
    return;
  }

  const layoutItem = normalizeNodeLayoutItem(node.layout_item ?? DEFAULT_LAYOUT_ITEM);
  let changed = false;
  if (patch.width !== undefined && layoutItem.width_sizing === "fill") {
    delete layoutItem.width_sizing;
    changed = true;
  }
  if (patch.height !== undefined && layoutItem.height_sizing === "fill") {
    delete layoutItem.height_sizing;
    changed = true;
  }

  if (!changed) {
    return;
  }

  restoreNodeLayoutItemForGeometry(node, layoutItem);
}

function restoreNodeLayoutItemForGeometry(node: RendererNode, layoutItem: NodeLayoutItem | null | undefined): void {
  if (!layoutItem) {
    delete node.layout_item;
    return;
  }

  const normalized = normalizeNodeLayoutItem(layoutItem);
  if (hasLayoutItemMetadata(normalized)) {
    node.layout_item = normalized;
  } else {
    delete node.layout_item;
  }
}

function hasLayoutItemMetadata(layoutItem: NodeLayoutItem): boolean {
  return Boolean(
    layoutItem.position ||
      layoutItem.width_sizing ||
      layoutItem.height_sizing ||
      layoutItem.justify_self ||
      layoutItem.align_self ||
      layoutItem.min_width !== undefined ||
      layoutItem.max_width !== undefined ||
      layoutItem.min_height !== undefined ||
      layoutItem.max_height !== undefined ||
      layoutItem.grid_area ||
      layoutItem.grid_column !== undefined ||
      layoutItem.grid_row !== undefined ||
      layoutItem.grid_column_span !== undefined ||
      layoutItem.grid_row_span !== undefined ||
      layoutItem.margin.top !== 0 ||
      layoutItem.margin.right !== 0 ||
      layoutItem.margin.bottom !== 0 ||
      layoutItem.margin.left !== 0
  );
}

function normalizedFlowLayout(layout: NodeLayout | null | undefined): NodeLayout | null {
  if (!layout || (layout.mode !== "auto" && layout.mode !== "grid")) {
    return null;
  }

  return normalizeNodeLayout(layout);
}

function normalizeNodeLayout(layout: NodeLayout): NodeLayout {
  const mode = layout.mode === "grid" ? "grid" : layout.mode === "auto" ? "auto" : "none";
  const direction = normalizeLayoutDirection(layout.direction);
  const wrap = isLayoutWrap(layout.wrap) ? layout.wrap : "nowrap";
  const alignContent = isLayoutAlignContent(layout.align_content) ? layout.align_content : "start";
  const justifyItems = isLayoutJustifyItems(layout.justify_items) ? layout.justify_items : "start";
  const widthSizing = isLayoutSizing(layout.width_sizing) ? layout.width_sizing : "fixed";
  const heightSizing = isLayoutSizing(layout.height_sizing) ? layout.height_sizing : "fixed";
  const minWidth = normalizeMinSizeLimit(layout.min_width);
  const maxWidth = normalizeMaxSizeLimit(layout.max_width, minWidth);
  const minHeight = normalizeMinSizeLimit(layout.min_height);
  const maxHeight = normalizeMaxSizeLimit(layout.max_height, minHeight);
  const gap = Math.max(0, finiteNumber(layout.gap, 0));
  const rowGap = Math.max(0, finiteNumber(layout.row_gap, gap));
  const columnGap = Math.max(0, finiteNumber(layout.column_gap, gap));
  const gridColumns = gridTrackCount(layout.grid_column_tracks, layout.grid_columns, 2);
  const gridRows = gridTrackCount(layout.grid_row_tracks, layout.grid_rows, 1);
  const gridColumnTracks = normalizeOptionalGridTracks(layout.grid_column_tracks, gridColumns);
  const gridRowTracks = normalizeOptionalGridTracks(layout.grid_row_tracks, gridRows);
  const gridAreas = normalizeOptionalGridAreas(layout.grid_areas, gridColumns, gridRows);
  const spacingTokens = normalizeLayoutSpacingTokens(layout.spacing_tokens);
  return {
    mode,
    direction,
    ...(wrap === "wrap" ? { wrap } : {}),
    align_items: isLayoutAlignItems(layout.align_items) ? layout.align_items : "start",
    justify_content: isLayoutJustifyContent(layout.justify_content) ? layout.justify_content : "start",
    ...(mode === "grid" && justifyItems !== "start" ? { justify_items: justifyItems } : {}),
    ...(wrap === "wrap" || alignContent !== "start" ? { align_content: alignContent } : {}),
    ...(widthSizing === "fit" ? { width_sizing: widthSizing } : {}),
    ...(heightSizing === "fit" ? { height_sizing: heightSizing } : {}),
    ...(minWidth !== undefined ? { min_width: minWidth } : {}),
    ...(maxWidth !== undefined ? { max_width: maxWidth } : {}),
    ...(minHeight !== undefined ? { min_height: minHeight } : {}),
    ...(maxHeight !== undefined ? { max_height: maxHeight } : {}),
    gap,
    ...(rowGap !== gap || spacingTokens?.row_gap ? { row_gap: rowGap } : {}),
    ...(columnGap !== gap || spacingTokens?.column_gap ? { column_gap: columnGap } : {}),
    ...(mode === "grid"
      ? {
          grid_columns: gridColumns,
          grid_rows: gridRows,
          ...(gridColumnTracks ? { grid_column_tracks: gridColumnTracks } : {}),
          ...(gridRowTracks ? { grid_row_tracks: gridRowTracks } : {}),
          ...(gridAreas ? { grid_areas: gridAreas } : {})
        }
      : {}),
    ...(spacingTokens ? { spacing_tokens: spacingTokens } : {}),
    padding: {
      top: Math.max(0, finiteNumber(layout.padding?.top, 0)),
      right: Math.max(0, finiteNumber(layout.padding?.right, 0)),
      bottom: Math.max(0, finiteNumber(layout.padding?.bottom, 0)),
      left: Math.max(0, finiteNumber(layout.padding?.left, 0))
    }
  };
}

function normalizeLayoutSpacingTokens(
  tokens: NodeLayout["spacing_tokens"] | null | undefined
): NonNullable<NodeLayout["spacing_tokens"]> | undefined {
  if (!tokens || typeof tokens !== "object") {
    return undefined;
  }
  const normalized: NonNullable<NodeLayout["spacing_tokens"]> = {};
  for (const key of [
    "gap",
    "row_gap",
    "column_gap",
    "padding_top",
    "padding_right",
    "padding_bottom",
    "padding_left"
  ] as const) {
    const value = tokens[key];
    if (typeof value === "string" && value.trim()) {
      normalized[key] = value.trim();
    } else if (value === null) {
      normalized[key] = null;
    }
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeNodeLayoutItem(layoutItem: NodeLayoutItem): NodeLayoutItem {
  const position = layoutItemPosition(layoutItem);
  const widthSizing = isLayoutItemSizing(layoutItem.width_sizing) ? layoutItem.width_sizing : "fixed";
  const heightSizing = isLayoutItemSizing(layoutItem.height_sizing) ? layoutItem.height_sizing : "fixed";
  const justifySelf = isLayoutSelfAlignment(layoutItem.justify_self) ? layoutItem.justify_self : undefined;
  const alignSelf = isLayoutSelfAlignment(layoutItem.align_self) ? layoutItem.align_self : undefined;
  const minWidth = normalizeMinSizeLimit(layoutItem.min_width);
  const maxWidth = normalizeMaxSizeLimit(layoutItem.max_width, minWidth);
  const minHeight = normalizeMinSizeLimit(layoutItem.min_height);
  const maxHeight = normalizeMaxSizeLimit(layoutItem.max_height, minHeight);
  const gridColumn = normalizeGridPlacement(layoutItem.grid_column);
  const gridRow = normalizeGridPlacement(layoutItem.grid_row);
  const gridColumnSpan = normalizeGridSpan(layoutItem.grid_column_span);
  const gridRowSpan = normalizeGridSpan(layoutItem.grid_row_span);
  const gridArea = normalizeGridAreaName(layoutItem.grid_area);
  return {
    ...(position === "absolute" ? { position } : {}),
    ...(widthSizing === "fill" ? { width_sizing: widthSizing } : {}),
    ...(heightSizing === "fill" ? { height_sizing: heightSizing } : {}),
    ...(justifySelf ? { justify_self: justifySelf } : {}),
    ...(alignSelf ? { align_self: alignSelf } : {}),
    ...(minWidth !== undefined ? { min_width: minWidth } : {}),
    ...(maxWidth !== undefined ? { max_width: maxWidth } : {}),
    ...(minHeight !== undefined ? { min_height: minHeight } : {}),
    ...(maxHeight !== undefined ? { max_height: maxHeight } : {}),
    ...(gridArea ? { grid_area: gridArea } : {}),
    ...(gridColumn !== undefined ? { grid_column: gridColumn } : {}),
    ...(gridRow !== undefined ? { grid_row: gridRow } : {}),
    ...(gridColumnSpan !== undefined ? { grid_column_span: gridColumnSpan } : {}),
    ...(gridRowSpan !== undefined ? { grid_row_span: gridRowSpan } : {}),
    margin: {
      top: Math.max(0, finiteNumber(layoutItem.margin?.top, 0)),
      right: Math.max(0, finiteNumber(layoutItem.margin?.right, 0)),
      bottom: Math.max(0, finiteNumber(layoutItem.margin?.bottom, 0)),
      left: Math.max(0, finiteNumber(layoutItem.margin?.left, 0))
    }
  };
}

function layoutItemPosition(layoutItem: NodeLayoutItem | null | undefined): "static" | "absolute" {
  return layoutItem?.position === "absolute" ? "absolute" : "static";
}

function normalizeNodeConstraints(constraints: NodeConstraints): NodeConstraints {
  return {
    horizontal: isHorizontalConstraint(constraints.horizontal) ? constraints.horizontal : "left",
    vertical: isVerticalConstraint(constraints.vertical) ? constraints.vertical : "top"
  };
}

function normalizeNodeExportPresets(presets: NodeExportPreset[]): NodeExportPreset[] {
  return presets.map((preset, index) => {
    const format = ["png", "jpeg", "webp", "svg", "pdf"].includes(preset.format)
      ? preset.format
      : "png";
    const scale = Number.isFinite(preset.scale) && preset.scale > 0 ? Math.max(1, Math.round(preset.scale)) : 1;
    return {
      id: preset.id.trim() || `export-preset-${index + 1}`,
      format,
      scale,
      suffix: preset.suffix.trim()
    };
  });
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
  if (normalizedFlowLayout(parent.layout)) {
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

function normalizeGridTrackCount(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(finiteNumber(value, fallback)));
}

function gridTrackCount(tracks: GridTrack[] | undefined, explicitCount: number | undefined, fallback: number): number {
  return normalizeGridTrackCount(explicitCount, tracks?.length ?? fallback);
}

function normalizeOptionalGridTracks(tracks: GridTrack[] | undefined, count: number): GridTrack[] | undefined {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return undefined;
  }
  return Array.from({ length: count }, (_, index) => normalizeGridTrack(tracks[index]));
}

function normalizeOptionalGridAreas(areas: GridArea[] | undefined, columns: number, rows: number): GridArea[] | undefined {
  if (!Array.isArray(areas) || areas.length === 0) {
    return undefined;
  }
  const normalizedAreas = areas
    .map((area) => normalizeGridArea(area, columns, rows))
    .filter((area): area is GridArea => area !== null);
  return normalizedAreas.length > 0 ? normalizedAreas : undefined;
}

function normalizeGridArea(area: GridArea | undefined, columns: number, rows: number): GridArea | null {
  const name = normalizeGridAreaName(area?.name);
  if (!name) {
    return null;
  }
  const column = normalizeGridPlacementLine(area?.column, columns, 1);
  const row = normalizeGridPlacementLine(area?.row, rows, 1);
  return {
    name,
    column,
    row,
    column_span: gridPlacementSpan(normalizeGridSpan(area?.column_span), columns - (column - 1)),
    row_span: gridPlacementSpan(normalizeGridSpan(area?.row_span), rows - (row - 1))
  };
}

function resolveGridTracks(tracks: GridTrack[] | undefined, count: number): GridTrack[] {
  return Array.from({ length: count }, (_, index) => normalizeGridTrack(tracks?.[index]));
}

function normalizeGridTrack(track: GridTrack | undefined): GridTrack {
  if (track?.type === "px") {
    return { type: "px", value: Math.max(0, finiteNumber(track.value, 0)) };
  }
  if (track?.type === "auto") {
    return { type: "auto" };
  }
  return { type: "fr", value: Math.max(0.0001, finiteNumber(track?.value, 1)) };
}

function resolveGridTrackSizes(
  tracks: GridTrack[],
  availableSize: number,
  axis: "column" | "row",
  flowChildren: RendererNode[],
  placements: Map<string, GridPlacement>
): number[] {
  const sizes = tracks.map((track, index) =>
    track.type === "px" ? track.value ?? 0 : track.type === "auto" ? autoGridTrackSize(index, axis, flowChildren, placements) : 0
  );
  const fixedSize = sizes.reduce((total, size) => total + size, 0);
  const frTotal = tracks.reduce((total, track) => total + (track.type === "fr" ? track.value ?? 1 : 0), 0);
  const remainingSize = Math.max(0, availableSize - fixedSize);
  return sizes.map((size, index) =>
    tracks[index].type === "fr" && frTotal > 0 ? remainingSize * ((tracks[index].value ?? 1) / frTotal) : size
  );
}

function autoGridTrackSize(
  index: number,
  axis: "column" | "row",
  flowChildren: RendererNode[],
  placements: Map<string, GridPlacement>
): number {
  return flowChildren.reduce((maximum, child) => {
    const placement = placements.get(child.id);
    if (!placement) {
      return maximum;
    }
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    if (axis === "column" && placement.column === index && placement.columnSpan === 1) {
      return Math.max(maximum, child.size.width + layoutItem.margin.left + layoutItem.margin.right);
    }
    if (axis === "row" && placement.row === index && placement.rowSpan === 1) {
      return Math.max(maximum, child.size.height + layoutItem.margin.top + layoutItem.margin.bottom);
    }
    return maximum;
  }, 0);
}

function gridTrackStarts(trackSizes: number[], gap: number): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const size of trackSizes) {
    starts.push(cursor);
    cursor += size + gap;
  }
  return starts;
}

function gridPlacementTrackSize(trackSizes: number[], start: number, span: number, gap: number): number {
  const tracks = trackSizes.slice(start, start + span);
  return tracks.reduce((total, size) => total + size, 0) + gap * Math.max(0, tracks.length - 1);
}

function normalizeGridPlacement(value: number | undefined): number | undefined {
  const normalized = finiteNumber(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(1, Math.round(normalized)) : undefined;
}

function normalizeGridSpan(value: number | undefined): number | undefined {
  const normalized = finiteNumber(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(1, Math.round(normalized)) : undefined;
}

function normalizeGridAreaName(value: string | undefined): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function normalizeGridPlacementLine(value: number | undefined, max: number, fallback: number): number {
  return Math.min(normalizeGridPlacement(value) ?? fallback, Math.max(1, max));
}

function namedGridAreaPlacement(
  layoutItem: NodeLayoutItem,
  areaPlacements: Map<string, GridPlacement>
): GridPlacement | null {
  const name = normalizeGridAreaName(layoutItem.grid_area);
  return name ? areaPlacements.get(name) ?? null : null;
}

function gridAreaPlacementsByName(
  areas: GridArea[] | undefined,
  columns: number,
  rows: number
): Map<string, GridPlacement> {
  const placements = new Map<string, GridPlacement>();
  for (const area of normalizeOptionalGridAreas(areas, columns, rows) ?? []) {
    if (!placements.has(area.name)) {
      placements.set(area.name, {
        column: area.column - 1,
        row: area.row - 1,
        columnSpan: area.column_span,
        rowSpan: area.row_span
      });
    }
  }
  return placements;
}

function manualGridPlacement(layoutItem: NodeLayoutItem, columns: number, rows: number): GridPlacement | null {
  const columnSpan = normalizeGridSpan(layoutItem.grid_column_span);
  const rowSpan = normalizeGridSpan(layoutItem.grid_row_span);
  if (
    layoutItem.grid_column === undefined &&
    layoutItem.grid_row === undefined &&
    columnSpan === undefined &&
    rowSpan === undefined
  ) {
    return null;
  }
  const column = gridPlacementIndex(layoutItem.grid_column, columns, 1);
  const row = gridPlacementIndex(layoutItem.grid_row, rows, 1);
  return {
    column,
    row,
    columnSpan: gridPlacementSpan(columnSpan, columns - column),
    rowSpan: gridPlacementSpan(rowSpan, rows - row)
  };
}

function gridPlacementSpan(value: number | undefined, remainingTracks: number): number {
  return Math.min(value ?? 1, Math.max(1, remainingTracks));
}

function gridPlacementCells(placement: GridPlacement): GridCell[] {
  return Array.from({ length: placement.rowSpan }, (_, rowOffset) =>
    Array.from({ length: placement.columnSpan }, (__, columnOffset) => ({
      row: placement.row + rowOffset,
      column: placement.column + columnOffset
    }))
  ).flat();
}

function gridPlacementIndex(value: number | undefined, max: number, fallback: number): number {
  const line = normalizeGridPlacement(value) ?? fallback;
  return Math.min(Math.max(0, line - 1), Math.max(0, max - 1));
}

function nextAutoGridCell(
  startCursor: number,
  columns: number,
  rows: number,
  occupiedCells: Set<string>,
  direction: NodeLayout["direction"]
): GridAutoCell {
  const capacity = Math.max(1, columns * rows);
  for (let cursor = startCursor; cursor < capacity; cursor += 1) {
    const cell = gridCellAt(cursor, columns, rows, direction);
    if (cell && !occupiedCells.has(gridCellKey(cell))) {
      return { ...cell, nextCursor: cursor + 1 };
    }
  }
  return { row: Math.max(0, rows - 1), column: Math.max(0, columns - 1), nextCursor: capacity };
}

function gridCellAt(index: number, columns: number, rows: number, direction: NodeLayout["direction"]): GridCell | null {
  if (isVerticalLayoutDirection(direction)) {
    const rowOffset = index % rows;
    const row = direction === "vertical_reverse" ? rows - 1 - rowOffset : rowOffset;
    const column = Math.floor(index / rows);
    return row < rows && column < columns ? { row, column } : null;
  }

  const columnOffset = index % columns;
  const row = Math.floor(index / columns);
  const column = direction === "horizontal_reverse" ? columns - 1 - columnOffset : columnOffset;
  return row < rows && column < columns ? { row, column } : null;
}

function gridCellKey(cell: GridCell): string {
  return `${cell.row}:${cell.column}`;
}

function gridAxisOffset(
  alignment: NodeLayout["align_items"] | NodeLayout["justify_content"] | NonNullable<NodeLayout["justify_items"]>,
  available: number,
  size: number
): number {
  const remaining = Math.max(0, available - size);
  if (alignment === "center") {
    return remaining / 2;
  }
  if (alignment === "end") {
    return remaining;
  }
  return 0;
}

function isLayoutWrap(value: string | undefined): value is NonNullable<NodeLayout["wrap"]> {
  return value === "nowrap" || value === "wrap";
}

function isLayoutAlignItems(value: string): value is NodeLayout["align_items"] {
  return ["start", "center", "end", "stretch", "baseline"].includes(value);
}

function isLayoutJustifyContent(value: string): value is NodeLayout["justify_content"] {
  return ["start", "center", "end", "space_between", "space_around", "space_evenly"].includes(value);
}

function isLayoutJustifyItems(value: string | undefined): value is NonNullable<NodeLayout["justify_items"]> {
  return value === "start" || value === "center" || value === "end" || value === "stretch";
}

function isLayoutSelfAlignment(value: string | undefined): value is NonNullable<NodeLayoutItem["justify_self"]> {
  return value === "start" || value === "center" || value === "end" || value === "stretch";
}

function isLayoutAlignContent(value: string | undefined): value is NonNullable<NodeLayout["align_content"]> {
  return value === "start" || value === "center" || value === "end" || value === "space_between" || value === "space_around" || value === "space_evenly";
}

function isLayoutSizing(value: string | undefined): value is NonNullable<NodeLayout["width_sizing"]> {
  return value === "fixed" || value === "fit";
}

function isLayoutItemSizing(value: string | undefined): value is NonNullable<NodeLayoutItem["width_sizing"]> {
  return value === "fixed" || value === "fill";
}

function layoutItemMainSizing(child: { layout_item?: NodeLayoutItem | null }, isVertical: boolean): "fixed" | "fill" {
  const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
  return isVertical ? layoutItem.height_sizing ?? "fixed" : layoutItem.width_sizing ?? "fixed";
}

function layoutItemCrossSizing(child: { layout_item?: NodeLayoutItem | null }, isVertical: boolean): "fixed" | "fill" {
  const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
  return isVertical ? layoutItem.width_sizing ?? "fixed" : layoutItem.height_sizing ?? "fixed";
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
  parentCrossSize: number,
  crossBefore: number,
  crossAfter: number
): number {
  if (alignItems === "center") {
    return crossStartPadding + Math.max(0, availableCross - crossBefore - childCrossSize - crossAfter) / 2 + crossBefore;
  }
  if (alignItems === "end") {
    return parentCrossSize - crossEndPadding - crossAfter - childCrossSize;
  }
  return crossStartPadding + crossBefore;
}

function crossAxisLineOffset(
  alignItems: NodeLayout["align_items"],
  lineCrossStart: number,
  lineCrossSize: number,
  childCrossSize: number,
  crossBefore: number,
  crossAfter: number
): number {
  if (alignItems === "center") {
    return lineCrossStart + Math.max(0, lineCrossSize - crossBefore - childCrossSize - crossAfter) / 2 + crossBefore;
  }
  if (alignItems === "end") {
    return lineCrossStart + lineCrossSize - crossAfter - childCrossSize;
  }
  return lineCrossStart + crossBefore;
}

function nodeBaselineOffset(node: RendererNode): number {
  if (node.content.type === "text") {
    if (isVerticalTextWritingMode(node.content.writing_mode)) {
      return Math.max(0, Math.min(node.size.height, Math.round(node.size.width / 2)));
    }
    return Math.max(0, Math.min(node.size.height, Math.round(node.content.font_size * 0.8)));
  }
  return node.size.height;
}

function mainStartPaddingFor(layout: NodeLayout, isVertical: boolean, isReverse: boolean): number {
  if (isVertical) {
    return isReverse ? layout.padding.bottom : layout.padding.top;
  }
  return isReverse ? layout.padding.right : layout.padding.left;
}

function mainEndPaddingFor(layout: NodeLayout, isVertical: boolean, isReverse: boolean): number {
  if (isVertical) {
    return isReverse ? layout.padding.top : layout.padding.bottom;
  }
  return isReverse ? layout.padding.left : layout.padding.right;
}

function mainAxisChildPosition(
  parentMainSize: number,
  cursor: number,
  metrics: ReturnType<typeof childLayoutMetrics>,
  child: RendererNode,
  isVertical: boolean,
  isReverse: boolean
): number {
  const childMainSize = isVertical ? child.size.height : child.size.width;
  if (isReverse) {
    return parentMainSize - cursor - metrics.mainBefore - childMainSize;
  }
  return cursor + metrics.mainBefore;
}

function childLayoutMetrics(child: RendererNode, isVertical: boolean, isReverse = false) {
  const margin = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM).margin;
  const mainBefore = isVertical
    ? isReverse ? margin.bottom : margin.top
    : isReverse ? margin.right : margin.left;
  const mainAfter = isVertical
    ? isReverse ? margin.top : margin.bottom
    : isReverse ? margin.left : margin.right;
  return {
    mainBefore,
    mainAfter,
    mainSize: isVertical ? child.size.height : child.size.width,
    crossBefore: isVertical ? margin.left : margin.top,
    crossAfter: isVertical ? margin.right : margin.bottom,
    crossSize: isVertical ? child.size.width : child.size.height
  };
}

function normalizeLayoutDirection(direction: NodeLayout["direction"] | string | undefined): NodeLayout["direction"] {
  if (
    direction === "horizontal" ||
    direction === "horizontal_reverse" ||
    direction === "vertical_reverse"
  ) {
    return direction;
  }
  return "vertical";
}

function isVerticalLayoutDirection(direction: NodeLayout["direction"]): boolean {
  return direction === "vertical" || direction === "vertical_reverse";
}

function isReverseLayoutDirection(direction: NodeLayout["direction"]): boolean {
  return direction === "horizontal_reverse" || direction === "vertical_reverse";
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
    if (normalizedFlowLayout(parentLayout)) {
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

function forEachNode(document: RendererDocument, visitor: (node: RendererNode) => void): void {
  for (const page of document.pages) {
    for (const node of page.children) {
      visitNodeTree(node, visitor);
    }
  }
}

function visitNodeTree(node: RendererNode, visitor: (node: RendererNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    visitNodeTree(child, visitor);
  }
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
  return selectedNodeId ? findNodeWithParent(state.document, selectedNodeId) : null;
}

function findNodeWithParent(
  document: RendererDocument,
  nodeId: string
): { parentId: string; node: RendererNode } | null {
  for (const page of document.pages) {
    const topLevelNode = page.children.find((node) => node.id === nodeId);
    if (topLevelNode) {
      return { parentId: page.id, node: topLevelNode };
    }

    for (const node of page.children) {
      const found = findNodeParentInTree(node, nodeId);
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

function applyLayoutContainerSizeLimits(node: RendererNode, layout: NodeLayout): void {
  node.size = {
    width: clampLayoutWidth(layout, node.size.width),
    height: clampLayoutHeight(layout, node.size.height)
  };
}

function applyLayoutItemSizeLimits(node: RendererNode): void {
  node.size = {
    width: clampLayoutItemWidth(node, node.size.width),
    height: clampLayoutItemHeight(node, node.size.height)
  };
}

function clampLayoutWidth(layout: NodeLayout, value: number): number {
  return clampSizeWithLimits(value, layout.min_width, layout.max_width);
}

function clampLayoutHeight(layout: NodeLayout, value: number): number {
  return clampSizeWithLimits(value, layout.min_height, layout.max_height);
}

function clampLayoutItemWidth(node: RendererNode, value: number): number {
  const layoutItem = normalizeNodeLayoutItem(node.layout_item ?? DEFAULT_LAYOUT_ITEM);
  return clampSizeWithLimits(value, layoutItem.min_width, layoutItem.max_width);
}

function clampLayoutItemHeight(node: RendererNode, value: number): number {
  const layoutItem = normalizeNodeLayoutItem(node.layout_item ?? DEFAULT_LAYOUT_ITEM);
  return clampSizeWithLimits(value, layoutItem.min_height, layoutItem.max_height);
}

function clampSizeWithLimits(value: number, minLimit: number | undefined, maxLimit: number | undefined): number {
  const minimum = Math.max(MIN_NODE_SIZE, minLimit ?? MIN_NODE_SIZE);
  const maximum = maxLimit !== undefined && maxLimit >= minimum ? maxLimit : undefined;
  return Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(minimum, finiteNumber(value, minimum)));
}

function normalizeMinSizeLimit(value: number | undefined): number | undefined {
  const normalized = finiteNumber(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : undefined;
}

function normalizeMaxSizeLimit(value: number | undefined, minLimit: number | undefined): number | undefined {
  const normalized = normalizeMinSizeLimit(value);
  const minimum = Math.max(MIN_NODE_SIZE, minLimit ?? MIN_NODE_SIZE);
  return normalized !== undefined && normalized >= minimum ? normalized : undefined;
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
