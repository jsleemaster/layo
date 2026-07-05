import { createAgentBatchResult as createBaseAgentBatchResult, inspectCanvas as inspectBaseCanvas } from "./agent-control-base.js";
import type {
  AgentBatchInput,
  AgentBatchResult as BaseAgentBatchResult,
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

type ClippedDesignNode = DesignNode & { clip?: NodeClip | null };

export interface AgentNodeSummary extends BaseAgentNodeSummary {
  clip?: NodeClip;
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

export function createAgentBatchResult(
  fileId: string,
  before: DesignFile,
  preview: DesignFile,
  input: AgentBatchInput,
  persisted: boolean,
  changedNodeIds: string[]
): AgentBatchResult {
  const result = createBaseAgentBatchResult(fileId, before, preview, input, persisted, changedNodeIds);
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

function nodeClip(node: DesignNode): NodeClip | undefined {
  const clip = (node as ClippedDesignNode).clip;
  return clip?.type === "bounds" ? cloneNodeClip(clip) : undefined;
}

function cloneNodeClip(clip: NodeClip): NodeClip {
  return clip.source ? { type: "bounds", source: structuredClone(clip.source) } : { type: "bounds" };
}
