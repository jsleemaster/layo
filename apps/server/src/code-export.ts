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

type ClippedDesignNode = DesignNode & { clip?: NodeClip | null };
type PaintSourceDesignNode = DesignNode & {
  style: DesignNode["style"] & { paint_sources?: NodePaintSource[] | null };
};
type ClipStructureNode = CodeStructureNode & { clip?: NodeClip; children: ClipStructureNode[] };
type PaintStructureNode = CodeStructureNode & {
  style: CodeStructureNode["style"] & { paintSources?: NodePaintSource[] };
  children: PaintStructureNode[];
};

export function exportDesignToCode(document: DesignFile, options: CodeExportOptions = {}): CodeExportResult {
  const result = exportBaseDesignToCode(document, options);
  const clipsByNodeId = clippedNodesById(document);
  const paintSourcesByNodeId = paintSourcesByNodeIdForDocument(document);
  if (clipsByNodeId.size === 0 && paintSourcesByNodeId.size === 0) {
    return result;
  }

  if (clipsByNodeId.size > 0) {
    result.css = enrichCssClipPaths(result.css, clipsByNodeId);
  }

  for (const element of result.elements) {
    if (clipsByNodeId.size > 0) {
      enrichStructureClipSources(element.structure as ClipStructureNode, clipsByNodeId);
      element.css = enrichCssClipPaths(element.css, clipsByNodeId);
    }
    if (paintSourcesByNodeId.size > 0) {
      enrichStructurePaintSources(element.structure as PaintStructureNode, paintSourcesByNodeId);
    }
    refreshElementJsModule(element);
  }
  for (const component of result.implementationSpec.components) {
    if (clipsByNodeId.size > 0) {
      enrichStructureClipSources(component.structure as ClipStructureNode, clipsByNodeId);
    }
    if (paintSourcesByNodeId.size > 0) {
      enrichStructurePaintSources(component.structure as PaintStructureNode, paintSourcesByNodeId);
    }
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
      const polygon = cssClipPathPolygonFor(clip);
      if (polygon) {
        clipAnnotation.value = "Polygon clip-path clipping";
        clipAnnotation.detail = `Penpot mask source ${clip.source.name} preserves ${pointCount} point(s); CSS uses polygon clip-path with bounds clipping fallback`;
      } else {
        clipAnnotation.detail = pointCount > 0
          ? `Penpot mask source ${clip.source.name} preserves ${pointCount} point(s); CSS uses bounds clipping fallback`
          : `Penpot mask source ${clip.source.name}; CSS uses bounds clipping fallback`;
      }
    }
  }

  for (const child of structure.children) {
    enrichStructureClipSources(child, clipsByNodeId);
  }
}

function enrichStructurePaintSources(
  structure: PaintStructureNode,
  paintSourcesByNodeId: Map<string, NodePaintSource[]>
): void {
  const paintSources = paintSourcesByNodeId.get(structure.id);
  if (paintSources && paintSources.length > 0) {
    structure.style.paintSources = paintSources.map((source) => structuredClone(source));
    if (!structure.annotations.some((annotation) => annotation.id === `${structure.id}-paint-source`)) {
      const gradientCount = paintSources.filter((source) => source.paintType === "gradient").length;
      structure.annotations.push({
        id: `${structure.id}-paint-source`,
        label: "Penpot paint",
        value: `${paintSources.length} paint source(s) preserved`,
        detail:
          gradientCount > 0
            ? `${gradientCount} gradient source(s) keep stops and geometry while Layo uses flattened paint for rendering`
            : "Original Penpot paint source metadata is available for migration handoff",
        kind: "style",
        sourceNodeIds: [structure.id]
      });
    }
  }

  for (const child of structure.children) {
    enrichStructurePaintSources(child, paintSourcesByNodeId);
  }
}

function enrichCssClipPaths(css: string, clipsByNodeId: Map<string, NodeClip>): string {
  let enriched = css;
  for (const [nodeId, clip] of clipsByNodeId.entries()) {
    const polygon = cssClipPathPolygonFor(clip);
    if (!polygon) {
      continue;
    }
    enriched = addClipPathToCssBlock(enriched, classNameFor(nodeId), polygon);
  }
  return enriched;
}

function addClipPathToCssBlock(css: string, className: string, polygon: string): string {
  const selector = `.${className} {`;
  const blockStart = css.indexOf(selector);
  if (blockStart < 0) {
    return css;
  }
  const blockEnd = css.indexOf("\n}", blockStart);
  if (blockEnd < 0) {
    return css;
  }
  const block = css.slice(blockStart, blockEnd);
  if (block.includes("clip-path:")) {
    return css;
  }

  const clipPathLine = `  clip-path: ${polygon};\n`;
  const overflowLine = "  overflow: hidden;\n";
  const overflowIndex = css.indexOf(overflowLine, blockStart);
  if (overflowIndex >= 0 && overflowIndex < blockEnd) {
    const insertionIndex = overflowIndex + overflowLine.length;
    return `${css.slice(0, insertionIndex)}${clipPathLine}${css.slice(insertionIndex)}`;
  }

  return `${css.slice(0, blockEnd)}\n${clipPathLine.trimEnd()}${css.slice(blockEnd)}`;
}

function cssClipPathPolygonFor(clip: NodeClip): string | null {
  const source = clip.source;
  const points = source?.points;
  const bounds = source?.bounds;
  if (!points || points.length < 3 || !bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const coordinates = points.map((point) => {
    const x = ((point.x - bounds.x) / bounds.width) * 100;
    const y = ((point.y - bounds.y) / bounds.height) * 100;
    return `${formatPercent(x)} ${formatPercent(y)}`;
  });

  return `polygon(${coordinates.join(", ")})`;
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function refreshElementJsModule(element: CodeExportResult["elements"][number]): void {
  element.jsModule = [
    `export default ${JSON.stringify(
      {
        id: element.id,
        name: element.name,
        className: element.className,
        html: element.html,
        css: element.css,
        structure: element.structure,
        implementation: element.implementation
      },
      null,
      2
    )};`,
    ""
  ].join("\n");
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

function paintSourcesByNodeIdForDocument(document: DesignFile): Map<string, NodePaintSource[]> {
  const paintSourcesByNodeId = new Map<string, NodePaintSource[]>();
  for (const page of document.pages) {
    for (const node of page.children) {
      collectPaintSourceNodes(node, paintSourcesByNodeId);
    }
  }
  return paintSourcesByNodeId;
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

function collectPaintSourceNodes(node: DesignNode, paintSourcesByNodeId: Map<string, NodePaintSource[]>): void {
  const paintSources = nodePaintSources(node);
  if (paintSources.length > 0) {
    paintSourcesByNodeId.set(node.id, paintSources);
  }
  for (const child of node.children) {
    collectPaintSourceNodes(child, paintSourcesByNodeId);
  }
}

function nodeClip(node: DesignNode): NodeClip | undefined {
  const clip = (node as ClippedDesignNode).clip;
  return clip?.type === "bounds" ? cloneNodeClip(clip) : undefined;
}

function nodePaintSources(node: DesignNode): NodePaintSource[] {
  const paintSources = (node as PaintSourceDesignNode).style.paint_sources;
  return Array.isArray(paintSources) ? paintSources.map((source) => structuredClone(source)) : [];
}

function cloneNodeClip(clip: NodeClip): NodeClip {
  return clip.source ? { type: "bounds", source: structuredClone(clip.source) } : { type: "bounds" };
}

function classNameFor(nodeId: string): string {
  return `node-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
