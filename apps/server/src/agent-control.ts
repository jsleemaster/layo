import {
  applyAgentCommandsToDocument as applyBaseAgentCommandsToDocument,
  createAgentBatchResult as createBaseAgentBatchResult,
  inspectCanvas as inspectBaseCanvas
} from "./agent-control-base.js";
import type {
  AgentBatchInput as BaseAgentBatchInput,
  AgentBatchResult as BaseAgentBatchResult,
  AgentCommand as BaseAgentCommand,
  AgentFindQuery,
  AgentNodeSummary as BaseAgentNodeSummary,
  CanvasInspection as BaseCanvasInspection
} from "./agent-control-base.js";
import type { DesignFile, DesignNode } from "./storage";

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
  | { type: "set_vector_source"; nodeId: string; vectorSource: NodeVectorSource | null };

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

export interface AgentNodeSummary extends BaseAgentNodeSummary {
  clip?: NodeClip;
  paintSources?: NodePaintSource[];
  vectorSource?: NodeVectorSource;
}

export interface CanvasInspection extends Omit<BaseCanvasInspection, "nodes"> {
  nodes: AgentNodeSummary[];
}

export type AgentBatchResult = Omit<BaseAgentBatchResult, "inspection"> & { inspection: CanvasInspection };

export function inspectCanvas(document: DesignFile): CanvasInspection {
  const inspection = inspectBaseCanvas(document);
  return {
    ...inspection,
    nodes: summarizeNodes(document)
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
    inspection: inspectCanvas(preview)
  };
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
    paintSources: paintSources.length > 0 ? paintSources : undefined,
    ...(vectorSource ? { vectorSource: structuredClone(vectorSource) } : {}),
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
