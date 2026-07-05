import { exportDesignToCode as exportBaseDesignToCode } from "./code-export-base.js";
import type { CodeExportOptions, CodeExportResult, CodeStructureNode } from "./code-export-base.js";
import type { DesignFile, DesignNode } from "./storage";

export * from "./code-export-base.js";

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
type ClipStructureNode = CodeStructureNode & { clip?: NodeClip; children: ClipStructureNode[] };

export function exportDesignToCode(document: DesignFile, options: CodeExportOptions = {}): CodeExportResult {
  const result = exportBaseDesignToCode(document, options);
  const clipsByNodeId = clippedNodesById(document);
  if (clipsByNodeId.size === 0) {
    return result;
  }

  for (const element of result.elements) {
    enrichStructureClipSources(element.structure as ClipStructureNode, clipsByNodeId);
  }
  for (const component of result.implementationSpec.components) {
    enrichStructureClipSources(component.structure as ClipStructureNode, clipsByNodeId);
  }

  return result;
}

function enrichStructureClipSources(structure: ClipStructureNode, clipsByNodeId: Map<string, NodeClip>): void {
  const clip = clipsByNodeId.get(structure.id);
  if (clip) {
    structure.clip = cloneNodeClip(clip);
    const clipAnnotation = structure.annotations.find((annotation) => annotation.kind === "clip");
    if (clipAnnotation && clip.source) {
      const pointCount = clip.source.points?.length ?? 0;
      clipAnnotation.detail = pointCount > 0
        ? `Penpot mask source ${clip.source.name} preserves ${pointCount} point(s); CSS uses bounds clipping fallback`
        : `Penpot mask source ${clip.source.name}; CSS uses bounds clipping fallback`;
    }
  }

  for (const child of structure.children) {
    enrichStructureClipSources(child, clipsByNodeId);
  }
}

function clippedNodesById(document: DesignFile): Map<string, NodeClip> {
  const clipsByNodeId = new Map<string, NodeClip>();
  for (const page of document.pages) {
    for (const node of page.children) {
      collectClippedNodes(node, clipsByNodeId);
    }
  }
  return clipsByNodeId;
}

function collectClippedNodes(node: DesignNode, clipsByNodeId: Map<string, NodeClip>): void {
  const clip = nodeClip(node);
  if (clip) {
    clipsByNodeId.set(node.id, clip);
  }
  for (const child of node.children) {
    collectClippedNodes(child, clipsByNodeId);
  }
}

function nodeClip(node: DesignNode): NodeClip | undefined {
  const clip = (node as ClippedDesignNode).clip;
  return clip?.type === "bounds" ? cloneNodeClip(clip) : undefined;
}

function cloneNodeClip(clip: NodeClip): NodeClip {
  return clip.source ? { type: "bounds", source: structuredClone(clip.source) } : { type: "bounds" };
}
