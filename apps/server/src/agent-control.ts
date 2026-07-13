import { evaluateBooleanPath, flattenPathGeometry } from "@layo/renderer";
import {
  applyAgentCommandsToDocument as applyBaseAgentCommandsToDocument,
  createAgentBatchResult as createBaseAgentBatchResult,
  inspectCanvas as inspectBaseCanvas,
  validateDocument as validateBaseDocument
} from "./agent-control-base.js";
import type {
  AgentBatchInput as BaseAgentBatchInput,
  AgentBatchResult as BaseAgentBatchResult,
  AgentCommand as BaseAgentCommand,
  AgentFindQuery,
  AgentNodeSummary as BaseAgentNodeSummary,
  CanvasInspection as BaseCanvasInspection
} from "./agent-control-base.js";
import type { DesignFile, DesignNode, NodeFill, PathBooleanRelation } from "./storage";

export * from "./agent-control-base.js";

export interface NodeClipPoint {
  x: number;
  y: number;
}

export interface NodeClipBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeClipSource {
  origin: "penpot";
  shapeId: string;
  name: string;
  shapeType: string;
  bounds: NodeClipBounds;
  opacity?: number;
  points?: NodeClipPoint[];
}

export interface NodeClip {
  type: "bounds";
  source?: NodeClipSource;
}

export interface NodePaintStop {
  color: string;
  opacity: number;
  offset: number;
}

export interface NodePaintGradient {
  type?: string;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  width?: number;
  stops: NodePaintStop[];
}

export interface NodePaintSource {
  origin: "penpot";
  kind: "fill" | "stroke";
  paintType: "solid" | "gradient" | "image";
  index: number;
  color?: string;
  opacity?: number;
  blendMode?: string;
  imageId?: string;
  gradient?: NodePaintGradient;
}

export interface NodeVectorSource {
  origin: "penpot";
  shapeId: string;
  shapeType: "path";
  bounds: NodeClipBounds;
  pathData: string;
  fillRule?: "nonzero" | "evenodd";
}

export type AgentCommand =
  | BaseAgentCommand
  | { type: "set_vector_source"; nodeId: string; vectorSource: NodeVectorSource | null }
  | { type: "set_path_data"; nodeId: string; pathData: string; fillRule: "nonzero" | "evenodd" }
  | {
      type: "create_path";
      parentId: string;
      id: string;
      name?: string;
      pathData: string;
      fillRule?: "nonzero" | "evenodd";
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      fill?: string;
      stroke?: string | null;
      strokeWidth?: number;
      strokeCap?: "butt" | "round" | "square";
      strokeJoin?: "miter" | "round" | "bevel";
      strokeDasharray?: number[];
      strokeStartMarker?: "none" | "line_arrow" | "triangle" | "square" | "circle" | "diamond";
      strokeEndMarker?: "none" | "line_arrow" | "triangle" | "square" | "circle" | "diamond";
    }
  | {
      type: "create_boolean_path";
      nodeId: string;
      name: string;
      operation: "union" | "difference" | "intersection" | "exclusion";
      sourceNodeIds: string[];
    }
  | {
      type: "set_boolean_path_operation";
      nodeId: string;
      operation: "union" | "difference" | "intersection" | "exclusion";
    }
  | { type: "detach_boolean_path"; nodeId: string }
  | {
      type: "flatten_path";
      nodeId: string;
      sourceNodeIds: string[];
      name?: string;
    };

export type AgentBatchInput = Omit<BaseAgentBatchInput, "commands"> & { commands: AgentCommand[] };

type ClippedDesignNode = DesignNode & { clip?: NodeClip | null };
type PaintSourceDesignNode = DesignNode & {
  style: DesignNode["style"] & { paint_sources?: NodePaintSource[] | null };
};
type VectorSourceDesignNode = DesignNode & {
  content: Extract<DesignNode["content"], { type: "image" }> & { vector_source?: NodeVectorSource | null };
};
type ImageContentWithVectorSource = Extract<DesignNode["content"], { type: "image" }> & {
  vector_source?: NodeVectorSource | null;
};
type SetVectorSourceCommand = Extract<AgentCommand, { type: "set_vector_source" }>;
type SetPathDataCommand = Extract<AgentCommand, { type: "set_path_data" }>;
type CreatePathCommand = Extract<AgentCommand, { type: "create_path" }>;
type CreateBooleanPathCommand = Extract<AgentCommand, { type: "create_boolean_path" }>;
type SetBooleanPathOperationCommand = Extract<AgentCommand, { type: "set_boolean_path_operation" }>;
type DetachBooleanPathCommand = Extract<AgentCommand, { type: "detach_boolean_path" }>;
type FlattenPathCommand = Extract<AgentCommand, { type: "flatten_path" }>;

export interface AgentNodeSummary extends BaseAgentNodeSummary {
  clip?: NodeClip;
  fills?: NodeFill[];
  paintSources?: NodePaintSource[];
  vectorSource?: NodeVectorSource;
  pathData?: string;
  fillRule?: "nonzero" | "evenodd";
  booleanRelation?: PathBooleanRelation;
}

export interface CanvasInspection extends Omit<BaseCanvasInspection, "nodes"> {
  nodes: AgentNodeSummary[];
}

export type AgentBatchResult = Omit<BaseAgentBatchResult, "inspection"> & { inspection: CanvasInspection };

export function inspectCanvas(document: DesignFile): CanvasInspection {
  const inspection = inspectBaseCanvas(document);
  return {
    ...inspection,
    validation: validateDocument(document),
    nodes: summarizeNodes(document)
  };
}

export function validateDocument(document: DesignFile) {
  const base = validateBaseDocument(document);
  const issues = [...base.issues];

  for (const page of document.pages) {
    for (const node of page.children) {
      collectBooleanValidationIssues(node, [page.id, node.id], issues);
    }
  }

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}

export function findNodes(document: DesignFile, query: AgentFindQuery): AgentNodeSummary[] {
  const id = query.id?.toLowerCase();
  const name = query.name?.toLowerCase();
  const text = query.text?.toLowerCase();
  const componentDefinitionId = query.componentDefinitionId?.toLowerCase();

  return summarizeNodes(document).filter((node) => {
    if (id && !node.id.toLowerCase().includes(id)) {
      return false;
    }
    if (name && !node.name.toLowerCase().includes(name)) {
      return false;
    }
    if (query.kind && node.kind !== query.kind) {
      return false;
    }
    if (text && !(node.text ?? "").toLowerCase().includes(text)) {
      return false;
    }
    if (componentDefinitionId && (node.componentDefinitionId ?? "").toLowerCase() !== componentDefinitionId) {
      return false;
    }
    return true;
  });
}

export function applyAgentCommandsToDocument(
  document: DesignFile,
  commands: AgentCommand[]
): { document: DesignFile; changedNodeIds: string[] } {
  let draft = structuredClone(document);
  const changedNodeIds: string[] = [];

  for (const command of commands) {
    if (command.type === "set_vector_source") {
      changedNodeIds.push(applyVectorSourceCommand(draft, command));
      continue;
    }
    if (command.type === "set_path_data") {
      changedNodeIds.push(applyPathDataCommand(draft, command));
      continue;
    }
    if (command.type === "create_path") {
      changedNodeIds.push(applyCreatePathCommand(draft, command));
      continue;
    }
    if (command.type === "create_boolean_path") {
      changedNodeIds.push(...applyCreateBooleanPathCommand(draft, command));
      continue;
    }
    if (command.type === "set_boolean_path_operation") {
      changedNodeIds.push(...applySetBooleanPathOperationCommand(draft, command));
      continue;
    }
    if (command.type === "detach_boolean_path") {
      changedNodeIds.push(...applyDetachBooleanPathCommand(draft, command));
      continue;
    }
    if (command.type === "flatten_path") {
      changedNodeIds.push(...applyFlattenPathCommand(draft, command));
      continue;
    }

    const result = applyBaseAgentCommandsToDocument(draft, [command]);
    draft = result.document;
    changedNodeIds.push(...result.changedNodeIds);
  }

  return {
    document: draft,
    changedNodeIds: [...new Set(changedNodeIds)]
  };
}

export function createAgentBatchResult(
  fileId: string,
  before: DesignFile,
  preview: DesignFile,
  input: AgentBatchInput,
  persisted: boolean,
  changedNodeIds: string[]
): AgentBatchResult {
  const result = createBaseAgentBatchResult(
    fileId,
    before,
    preview,
    input as unknown as BaseAgentBatchInput,
    persisted,
    changedNodeIds
  );
  return {
    ...result,
    validation: validateDocument(preview),
    inspection: inspectCanvas(preview)
  };
}

function collectBooleanValidationIssues(
  node: DesignNode,
  path: string[],
  issues: Array<{ code: string; message: string; nodeId?: string; path?: string[] }>
) {
  if (node.content.type === "boolean_path") {
    const operation = node.content.relation.operation as string;
    if (!["union", "difference", "intersection", "exclusion"].includes(operation)) {
      issues.push({
        code: "invalid_boolean_path_operation",
        message: `boolean path operation is invalid: ${node.id} -> ${operation}`,
        nodeId: node.id,
        path
      });
    }
    const sourceIds = node.content.relation.source_node_ids;
    if (sourceIds.length < 2 || new Set(sourceIds).size !== sourceIds.length) {
      issues.push({
        code: "invalid_boolean_path_sources",
        message: `boolean path requires at least two unique sources: ${node.id}`,
        nodeId: node.id,
        path
      });
    }
    for (const sourceId of sourceIds) {
      const source = node.children.find((child) => child.id === sourceId);
      if (!source) {
        issues.push({
          code: "missing_boolean_path_source",
          message: `boolean path source is missing: ${node.id} -> ${sourceId}`,
          nodeId: node.id,
          path
        });
      } else if (
        source.kind !== "path" ||
        (source.content.type !== "path" && source.content.type !== "boolean_path")
      ) {
        issues.push({
          code: "invalid_boolean_path_source_geometry",
          message: `boolean path source is not path geometry: ${node.id} -> ${sourceId}`,
          nodeId: node.id,
          path
        });
      }
    }
    if (!node.content.path_data.trim()) {
      issues.push({
        code: "empty_boolean_path_result",
        message: `boolean path evaluated geometry is empty: ${node.id}`,
        nodeId: node.id,
        path
      });
    }
  }

  for (const child of node.children) {
    collectBooleanValidationIssues(child, [...path, child.id], issues);
  }
}

function summarizeNodes(document: DesignFile): AgentNodeSummary[] {
  const nodes: AgentNodeSummary[] = [];

  for (const page of document.pages) {
    for (const node of page.children) {
      collectSummary(node, [page.id, node.id], nodes);
    }
  }

  return nodes;
}

function collectSummary(node: DesignNode, path: string[], nodes: AgentNodeSummary[]) {
  const paintSources = nodePaintSources(node);
  const vectorSource = nodeVectorSource(node);
  nodes.push({
    id: node.id,
    name: node.name,
    kind: node.kind,
    path,
    text: node.content.type === "text" ? node.content.value : undefined,
    writingMode: node.content.type === "text" ? node.content.writing_mode : undefined,
    textOrientation: node.content.type === "text" ? node.content.text_orientation : undefined,
    componentDefinitionId: node.component_instance?.definition_id,
    layout: node.layout ?? undefined,
    layout_item: node.layout_item ?? undefined,
    constraints: node.constraints ?? undefined,
    exportPresets: node.export_presets ? node.export_presets.map((preset) => ({ ...preset })) : undefined,
    clip: nodeClip(node),
    fills: node.style.fills ? structuredClone(node.style.fills) : undefined,
    paintSources: paintSources.length > 0 ? paintSources : undefined,
    ...(vectorSource ? { vectorSource: structuredClone(vectorSource) } : {}),
    ...(node.content.type === "path" || node.content.type === "boolean_path"
      ? { pathData: node.content.path_data, fillRule: node.content.fill_rule }
      : {}),
    ...(node.content.type === "boolean_path"
      ? { booleanRelation: structuredClone(node.content.relation) }
      : {}),
    bounds: {
      x: node.transform.x,
      y: node.transform.y,
      width: node.size.width,
      height: node.size.height
    }
  });

  for (const child of node.children) {
    collectSummary(child, [...path, child.id], nodes);
  }
}

interface NodeContainer {
  children: DesignNode[];
}

function applyCreatePathCommand(
  document: DesignFile,
  command: CreatePathCommand
): string {
  const id = command.id.trim();
  const pathData = command.pathData.trim();
  if (!id || !pathData) {
    throw new Error("path id and path data are required");
  }
  if (findNodeById(document, id)) {
    throw new Error(`node already exists: ${id}`);
  }
  const parent =
    document.pages.find((page) => page.id === command.parentId) ??
    findNodeById(document, command.parentId);
  if (!parent) {
    throw new Error(`parent not found: ${command.parentId}`);
  }
  const fillRule = command.fillRule ?? "nonzero";
  if (fillRule !== "nonzero" && fillRule !== "evenodd") {
    throw new Error("path fill rule must be nonzero or evenodd");
  }
  const width = command.width ?? 100;
  const height = command.height ?? 100;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("path size must be positive");
  }
  const node: DesignNode = {
    id,
    kind: "path",
    name: command.name?.trim() || "경로",
    transform: {
      x: command.x ?? 0,
      y: command.y ?? 0,
      rotation: 0
    },
    size: { width, height },
    style: {
      fill: command.fill ?? "#0ea5e9",
      stroke: command.stroke ?? null,
      stroke_width: Math.max(0, command.strokeWidth ?? 0),
      ...(command.strokeCap ? { stroke_cap: command.strokeCap } : {}),
      ...(command.strokeJoin ? { stroke_join: command.strokeJoin } : {}),
      ...(command.strokeDasharray ? { stroke_dasharray: normalizeStrokeDasharray(command.strokeDasharray) } : {}),
      ...(command.strokeStartMarker ? { stroke_start_marker: command.strokeStartMarker } : {}),
      ...(command.strokeEndMarker ? { stroke_end_marker: command.strokeEndMarker } : {}),
      opacity: 1
    },
    content: {
      type: "path",
      path_data: pathData,
      fill_rule: fillRule
    },
    children: []
  };
  parent.children.push(node);
  return node.id;
}

function applyCreateBooleanPathCommand(
  document: DesignFile,
  command: CreateBooleanPathCommand
): string[] {
  if (findNodeById(document, command.nodeId)) {
    throw new Error(`node already exists: ${command.nodeId}`);
  }
  const sourceNodeIds = normalizeBooleanSourceIds(command.sourceNodeIds);
  const sourceContainer = findNodeContainer(document, sourceNodeIds[0]);
  if (!sourceContainer) {
    throw new Error(`boolean path source not found: ${sourceNodeIds[0]}`);
  }

  const sourceEntries = sourceNodeIds.map((nodeId) => {
    const index = sourceContainer.children.findIndex((node) => node.id === nodeId);
    if (index < 0) {
      if (findNodeById(document, nodeId)) {
        throw new Error("boolean path sources must share one parent");
      }
      throw new Error(`boolean path source not found: ${nodeId}`);
    }
    const node = sourceContainer.children[index];
    assertBooleanPathSource(node);
    return { index, node };
  });
  const evaluation = evaluateBooleanPath(
    command.operation,
    sourceEntries.map(({ node }) => ({
      pathData: pathDataFromBooleanSource(node),
      fillRule: booleanSourceFillRule(node),
      transform: node.transform
    }))
  );
  const firstSource = sourceEntries[0].node;
  const children = sourceEntries.map(({ node }) => ({
    ...structuredClone(node),
    transform: {
      ...node.transform,
      x: node.transform.x - evaluation.bounds.x,
      y: node.transform.y - evaluation.bounds.y
    }
  }));
  const booleanNode: DesignNode = {
    id: command.nodeId.trim(),
    kind: "path",
    name: command.name.trim() || "Boolean path",
    transform: {
      x: evaluation.bounds.x,
      y: evaluation.bounds.y,
      rotation: 0
    },
    size: {
      width: evaluation.bounds.width,
      height: evaluation.bounds.height
    },
    style: structuredClone(firstSource.style),
    content: {
      type: "boolean_path",
      relation: {
        operation: command.operation,
        source_node_ids: sourceNodeIds
      },
      path_data: evaluation.pathData,
      fill_rule: evaluation.fillRule
    },
    children
  };

  const insertionIndex = Math.min(...sourceEntries.map(({ index }) => index));
  const sourceIdSet = new Set(sourceNodeIds);
  sourceContainer.children = sourceContainer.children.filter((node) => !sourceIdSet.has(node.id));
  sourceContainer.children.splice(insertionIndex, 0, booleanNode);
  return [booleanNode.id, ...sourceNodeIds];
}

function applySetBooleanPathOperationCommand(
  document: DesignFile,
  command: SetBooleanPathOperationCommand
): string[] {
  const node = findNodeById(document, command.nodeId);
  if (!node || node.content.type !== "boolean_path") {
    throw new Error(`node is not boolean path: ${command.nodeId}`);
  }
  const sources = node.content.relation.source_node_ids.map((sourceId) => {
    const source = node.children.find((child) => child.id === sourceId);
    if (!source) {
      throw new Error(`boolean path source not found: ${sourceId}`);
    }
    assertBooleanPathSource(source);
    return source;
  });
  const evaluation = evaluateBooleanPath(
    command.operation,
    sources.map((source) => ({
      pathData: pathDataFromBooleanSource(source),
      fillRule: booleanSourceFillRule(source),
      transform: source.transform
    }))
  );
  const rotation = (node.transform.rotation * Math.PI) / 180;
  const offsetX =
    evaluation.bounds.x * Math.cos(rotation) - evaluation.bounds.y * Math.sin(rotation);
  const offsetY =
    evaluation.bounds.x * Math.sin(rotation) + evaluation.bounds.y * Math.cos(rotation);
  node.transform.x += offsetX;
  node.transform.y += offsetY;
  node.size = {
    width: evaluation.bounds.width,
    height: evaluation.bounds.height
  };
  node.children = node.children.map((child) => ({
    ...child,
    transform: {
      ...child.transform,
      x: child.transform.x - evaluation.bounds.x,
      y: child.transform.y - evaluation.bounds.y
    }
  }));
  node.content = {
    ...node.content,
    relation: {
      operation: command.operation,
      source_node_ids: [...node.content.relation.source_node_ids]
    },
    path_data: evaluation.pathData,
    fill_rule: evaluation.fillRule
  };
  return [node.id, ...node.content.relation.source_node_ids];
}

function applyDetachBooleanPathCommand(
  document: DesignFile,
  command: DetachBooleanPathCommand
): string[] {
  const container = findNodeContainer(document, command.nodeId);
  const index = container?.children.findIndex((node) => node.id === command.nodeId) ?? -1;
  const node = index >= 0 ? container?.children[index] : null;
  if (!container || !node || node.content.type !== "boolean_path") {
    throw new Error(`node is not boolean path: ${command.nodeId}`);
  }

  const rotation = (node.transform.rotation * Math.PI) / 180;
  const children = node.children.map((child) => {
    const x = child.transform.x * Math.cos(rotation) - child.transform.y * Math.sin(rotation);
    const y = child.transform.x * Math.sin(rotation) + child.transform.y * Math.cos(rotation);
    return {
      ...structuredClone(child),
      transform: {
        ...child.transform,
        x: node.transform.x + x,
        y: node.transform.y + y,
        rotation: node.transform.rotation + child.transform.rotation
      }
    };
  });
  container.children.splice(index, 1, ...children);
  return [node.id, ...children.map((child) => child.id)];
}


function applyFlattenPathCommand(
  document: DesignFile,
  command: FlattenPathCommand
): string[] {
  const sourceNodeIds = command.sourceNodeIds.map((nodeId) => nodeId.trim()).filter(Boolean);
  if (sourceNodeIds.length === 0 || new Set(sourceNodeIds).size !== sourceNodeIds.length) {
    throw new Error("path flatten sources must contain at least one unique node");
  }
  const resultNodeId = command.nodeId.trim();
  if (!resultNodeId) {
    throw new Error("flattened path node id is required");
  }
  const existingResult = findNodeById(document, resultNodeId);
  if (existingResult && !(sourceNodeIds.length === 1 && sourceNodeIds[0] === resultNodeId)) {
    throw new Error(`node already exists: ${resultNodeId}`);
  }

  const sourceContainer = findNodeContainer(document, sourceNodeIds[0]);
  if (!sourceContainer) {
    throw new Error(`path flatten source not found: ${sourceNodeIds[0]}`);
  }
  const sourceEntries = sourceNodeIds.map((nodeId) => {
    const index = sourceContainer.children.findIndex((node) => node.id === nodeId);
    if (index < 0) {
      if (findNodeById(document, nodeId)) {
        throw new Error("path flatten sources must share one parent");
      }
      throw new Error(`path flatten source not found: ${nodeId}`);
    }
    const node = sourceContainer.children[index];
    assertBooleanPathSource(node);
    return { index, node };
  });
  const evaluation = flattenPathGeometry(
    sourceEntries.map(({ node }) => ({
      pathData: pathDataFromBooleanSource(node),
      fillRule: booleanSourceFillRule(node),
      transform: node.transform
    }))
  );
  const firstSource = sourceEntries[0].node;
  if (
    !evaluation.closed &&
    sourceEntries.some(({ node }) => strokeContractKey(node) !== strokeContractKey(firstSource))
  ) {
    throw new Error("open path flatten stroke contracts must match");
  }
  const flattenedNode: DesignNode = {
    ...structuredClone(firstSource),
    id: resultNodeId,
    kind: "path",
    name: command.name?.trim() || firstSource.name,
    transform: {
      x: evaluation.bounds.x,
      y: evaluation.bounds.y,
      rotation: 0
    },
    size: {
      width: evaluation.bounds.width,
      height: evaluation.bounds.height
    },
    content: {
      type: "path",
      path_data: evaluation.pathData,
      fill_rule: evaluation.fillRule
    },
    children: []
  };

  const insertionIndex = Math.min(...sourceEntries.map(({ index }) => index));
  const sourceIdSet = new Set(sourceNodeIds);
  sourceContainer.children = sourceContainer.children.filter((node) => !sourceIdSet.has(node.id));
  sourceContainer.children.splice(insertionIndex, 0, flattenedNode);
  return [flattenedNode.id, ...sourceNodeIds.filter((nodeId) => nodeId !== flattenedNode.id)];
}


function normalizeStrokeDasharray(values: number[]) {
  const normalized = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (normalized.length !== values.length || normalized.every((value) => value === 0)) {
    throw new Error("stroke dasharray must contain non-negative finite values and one positive value");
  }
  return normalized;
}

function strokeContractKey(node: DesignNode) {
  return JSON.stringify({
    stroke: node.style.stroke,
    stroke_width: node.style.stroke_width,
    stroke_cap: node.style.stroke_cap ?? "butt",
    stroke_join: node.style.stroke_join ?? "miter",
    stroke_dasharray: node.style.stroke_dasharray ?? [],
    stroke_start_marker: node.style.stroke_start_marker ?? "none",
    stroke_end_marker: node.style.stroke_end_marker ?? "none",
    opacity: node.style.opacity
  });
}

function normalizeBooleanSourceIds(sourceNodeIds: string[]) {
  const normalized = sourceNodeIds.map((nodeId) => nodeId.trim()).filter(Boolean);
  if (normalized.length < 2) {
    throw new Error("boolean paths require at least two sources");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("boolean path sources must be unique");
  }
  return normalized;
}

function assertBooleanPathSource(node: DesignNode) {
  if (
    node.kind !== "path" ||
    (node.content.type !== "path" && node.content.type !== "boolean_path")
  ) {
    throw new Error(`boolean path source must be path geometry: ${node.id}`);
  }
}

function pathDataFromBooleanSource(node: DesignNode) {
  assertBooleanPathSource(node);
  return node.content.type === "path" || node.content.type === "boolean_path"
    ? node.content.path_data
    : "";
}

function booleanSourceFillRule(node: DesignNode) {
  assertBooleanPathSource(node);
  return node.content.type === "path" || node.content.type === "boolean_path"
    ? node.content.fill_rule
    : "nonzero";
}

function findNodeContainer(document: DesignFile, nodeId: string): NodeContainer | null {
  for (const page of document.pages) {
    if (page.children.some((node) => node.id === nodeId)) {
      return page;
    }
    for (const node of page.children) {
      const container = findNodeContainerInNode(node, nodeId);
      if (container) {
        return container;
      }
    }
  }
  return null;
}

function findNodeContainerInNode(node: DesignNode, nodeId: string): NodeContainer | null {
  if (node.children.some((child) => child.id === nodeId)) {
    return node;
  }
  for (const child of node.children) {
    const container = findNodeContainerInNode(child, nodeId);
    if (container) {
      return container;
    }
  }
  return null;
}

function applyPathDataCommand(document: DesignFile, command: SetPathDataCommand): string {
  const node = findNodeById(document, command.nodeId);
  if (!node) {
    throw new Error(`node not found: ${command.nodeId}`);
  }
  if (node.content.type !== "path") {
    throw new Error(`node is not path: ${command.nodeId}`);
  }

  const pathData = command.pathData.trim();
  if (!pathData) {
    throw new Error("path data is required");
  }
  if (command.fillRule !== "nonzero" && command.fillRule !== "evenodd") {
    throw new Error("path fill rule must be nonzero or evenodd");
  }

  node.content = {
    type: "path",
    path_data: pathData,
    fill_rule: command.fillRule
  };
  return node.id;
}

function applyVectorSourceCommand(document: DesignFile, command: SetVectorSourceCommand): string {
  const node = findNodeById(document, command.nodeId);
  if (!node) {
    throw new Error(`node not found: ${command.nodeId}`);
  }
  if (node.content.type !== "image") {
    throw new Error(`node is not image: ${command.nodeId}`);
  }

  const content = node.content as ImageContentWithVectorSource;
  if (command.vectorSource === null) {
    const nextContent: ImageContentWithVectorSource = { ...content };
    delete nextContent.vector_source;
    node.content = nextContent;
    return node.id;
  }

  node.content = {
    ...content,
    vector_source: normalizeNodeVectorSource(command.vectorSource)
  } as DesignNode["content"];
  return node.id;
}

function normalizeNodeVectorSource(source: NodeVectorSource): NodeVectorSource {
  if (source.origin !== "penpot") {
    throw new Error("vector source origin must be penpot");
  }
  if (source.shapeType !== "path") {
    throw new Error("vector source shape type must be path");
  }

  const shapeId = source.shapeId.trim();
  if (!shapeId) {
    throw new Error("vector source shape id is required");
  }

  const pathData = source.pathData.trim();
  if (!pathData) {
    throw new Error("vector source path data is required");
  }

  if (source.fillRule !== undefined && source.fillRule !== "nonzero" && source.fillRule !== "evenodd") {
    throw new Error("vector source fill rule must be nonzero or evenodd");
  }

  return {
    origin: "penpot",
    shapeId,
    shapeType: "path",
    bounds: normalizeVectorSourceBounds(source.bounds),
    pathData,
    ...(source.fillRule ? { fillRule: source.fillRule } : {})
  };
}

function normalizeVectorSourceBounds(bounds: NodeClipBounds | undefined): NodeClipBounds {
  if (!bounds) {
    throw new Error("vector source bounds are required");
  }

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![x, y, width, height].every(Number.isFinite)) {
    throw new Error("vector source bounds must be finite numbers");
  }
  if (width <= 0 || height <= 0) {
    throw new Error("vector source bounds must have positive size");
  }

  return { x, y, width, height };
}

function findNodeById(document: DesignFile, nodeId: string): DesignNode | null {
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

function findInNode(node: DesignNode, nodeId: string): DesignNode | null {
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

function nodeClip(node: DesignNode): NodeClip | undefined {
  const clip = (node as ClippedDesignNode).clip;
  return clip?.type === "bounds" ? cloneNodeClip(clip) : undefined;
}

function nodePaintSources(node: DesignNode): NodePaintSource[] {
  const paintSources = (node as PaintSourceDesignNode).style.paint_sources;
  return Array.isArray(paintSources) ? paintSources.map((source) => structuredClone(source)) : [];
}

function nodeVectorSource(node: DesignNode): NodeVectorSource | undefined {
  if (node.content.type !== "image") {
    return undefined;
  }
  const vectorSource = (node as VectorSourceDesignNode).content.vector_source;
  return vectorSource ?? undefined;
}

function cloneNodeClip(clip: NodeClip): NodeClip {
  return clip.source ? { type: "bounds", source: structuredClone(clip.source) } : { type: "bounds" };
}
