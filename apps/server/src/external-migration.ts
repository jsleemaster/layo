import { readZipArchive } from "./file-archive.js";
import { importExternalMigrationArchive as importBaseExternalMigrationArchive } from "./external-migration-base.js";
import type {
  ExternalMigrationImportOptions,
  ExternalMigrationImportResult
} from "./external-migration-base.js";
import type { DesignFile, DesignNode } from "./storage";

export * from "./external-migration-base.js";

interface JsonRecord {
  [key: string]: unknown;
}

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

export function importExternalMigrationArchive(
  archive: Buffer,
  options: ExternalMigrationImportOptions = {}
): ExternalMigrationImportResult {
  const imported = importBaseExternalMigrationArchive(archive, options);
  if (imported.source !== "penpot" || !looksLikeZip(archive)) {
    return imported;
  }

  try {
    const entries = readZipArchive(archive);
    return enrichPenpotPaintSources(enrichPenpotMaskedGroupClipSources(imported, entries), entries);
  } catch {
    return imported;
  }
}

function enrichPenpotMaskedGroupClipSources(
  imported: ExternalMigrationImportResult,
  entries: Map<string, Buffer>
): ExternalMigrationImportResult {
  const clipsByNodeId = penpotMaskedGroupClipSources(entries);
  if (clipsByNodeId.size === 0) {
    return imported;
  }

  for (const [nodeId, clip] of clipsByNodeId.entries()) {
    const node = findDesignNodeById(imported.file, nodeId);
    if (!node) {
      continue;
    }
    const existingClip = (node as ClippedDesignNode).clip;
    (node as ClippedDesignNode).clip = existingClip?.type === "bounds" ? { ...existingClip, ...clip } : clip;
  }

  return imported;
}

function enrichPenpotPaintSources(
  imported: ExternalMigrationImportResult,
  entries: Map<string, Buffer>
): ExternalMigrationImportResult {
  const paintSourcesByNodeId = penpotPaintSources(entries);
  if (paintSourcesByNodeId.size === 0) {
    return imported;
  }

  for (const [nodeId, paintSources] of paintSourcesByNodeId.entries()) {
    const node = findDesignNodeById(imported.file, nodeId) as PaintSourceDesignNode | null;
    if (!node) {
      continue;
    }
    node.style = {
      ...node.style,
      paint_sources: paintSources.map((source) => structuredClone(source))
    };
  }

  return imported;
}

function penpotMaskedGroupClipSources(entries: Map<string, Buffer>): Map<string, NodeClip> {
  const clipsByNodeId = new Map<string, NodeClip>();
  for (const [entryPath, data] of entries.entries()) {
    const match = entryPath.match(/^files\/[^/]+\/pages\/[^/]+\/([^/]+)\.json$/);
    if (!match) {
      continue;
    }
    const shape = parseJsonBuffer(data);
    if (!isRecord(shape) || stringValue(valueFor(shape, "type"))?.toLowerCase() !== "group") {
      continue;
    }
    if (valueFor(shape, "maskedGroup", "masked-group") !== true) {
      continue;
    }
    const sourceId = stringValue(valueFor(shape, "id")) ?? match[1];
    const name = stringValue(valueFor(shape, "name")) ?? sourceId;
    clipsByNodeId.set(`penpot-${storageIdSegment(sourceId)}`, {
      type: "bounds",
      source: penpotMaskSource(sourceId, name, shape)
    });
  }
  return clipsByNodeId;
}

function penpotPaintSources(entries: Map<string, Buffer>): Map<string, NodePaintSource[]> {
  const paintSourcesByNodeId = new Map<string, NodePaintSource[]>();
  for (const [entryPath, data] of entries.entries()) {
    const match = entryPath.match(/^files\/[^/]+\/pages\/[^/]+\/([^/]+)\.json$/);
    if (!match) {
      continue;
    }
    const shape = parseJsonBuffer(data);
    if (!isRecord(shape)) {
      continue;
    }
    const sourceId = stringValue(valueFor(shape, "id")) ?? match[1];
    const paintSources = paintSourcesForShape(shape);
    if (paintSources.length > 0) {
      paintSourcesByNodeId.set(`penpot-${storageIdSegment(sourceId)}`, paintSources);
    }
  }
  return paintSourcesByNodeId;
}

function penpotMaskSource(sourceId: string, name: string, shape: JsonRecord): NodeClipSource {
  const source: NodeClipSource = {
    origin: "penpot",
    shapeId: sourceId,
    name,
    shapeType: normalizeShapeType(stringValue(valueFor(shape, "type", "shapeType", "shape-type"))) ?? "group",
    bounds: boundsForPenpotShape(shape)
  };
  const opacity = opacityForShape(shape);
  if (opacity !== undefined) {
    source.opacity = opacity;
  }
  const points = pointsForShape(shape);
  if (points.length > 0) {
    source.points = points;
  }
  return source;
}

function paintSourcesForShape(shape: JsonRecord): NodePaintSource[] {
  return [
    ...recordsFor(valueFor(shape, "fills")).flatMap((record, index) => paintSourceForRecord(record, "fill", index)),
    ...recordsFor(valueFor(shape, "strokes")).flatMap((record, index) => paintSourceForRecord(record, "stroke", index))
  ];
}

function paintSourceForRecord(record: JsonRecord, kind: "fill" | "stroke", index: number): NodePaintSource[] {
  const gradient = gradientForPaintRecord(record, kind);
  const image = recordValue(valueFor(record, kind === "fill" ? "fillImage" : "strokeImage", kind === "fill" ? "fill-image" : "stroke-image"));
  const color = colorValue(
    kind === "fill"
      ? valueFor(record, "fillColor", "fill-color", "color")
      : valueFor(record, "strokeColor", "stroke-color", "color")
  );
  const paintType = gradient ? "gradient" : image ? "image" : color ? "solid" : null;
  if (!paintType) {
    return [];
  }

  const source: NodePaintSource = {
    origin: "penpot",
    kind,
    paintType,
    index
  };
  const opacity = opacityForPaintRecord(record, kind);
  if (opacity !== undefined) {
    source.opacity = opacity;
  }
  const blendMode = stringValue(valueFor(record, "blendMode", "blend-mode", "mixBlendMode", "mix-blend-mode"));
  if (blendMode) {
    source.blendMode = blendMode;
  }
  if (color) {
    source.color = color;
  }
  if (gradient) {
    source.gradient = gradient;
  }
  const imageId = stringValue(valueFor(image ?? {}, "id"));
  if (imageId) {
    source.imageId = imageId;
  }
  return [source];
}

function gradientForPaintRecord(record: JsonRecord, kind: "fill" | "stroke"): NodePaintGradient | null {
  const gradient = recordValue(
    kind === "fill"
      ? valueFor(record, "fillColorGradient", "fill-color-gradient", "gradient")
      : valueFor(record, "strokeColorGradient", "stroke-color-gradient", "gradient")
  );
  if (!gradient) {
    return null;
  }

  const stops = recordsFor(valueFor(gradient, "stops")).flatMap((stop) => {
    const color = colorValue(valueFor(stop, "color", "fillColor", "fill-color", "strokeColor", "stroke-color"));
    if (!color) {
      return [];
    }
    return [
      {
        color,
        opacity: opacityForPaintRecord(stop, kind) ?? 1,
        offset: roundOpacity(finiteNumber(valueFor(stop, "offset"), 0))
      }
    ];
  });
  if (stops.length === 0) {
    return null;
  }

  const source: NodePaintGradient = {
    stops
  };
  const type = stringValue(valueFor(gradient, "type"));
  if (type) {
    source.type = type;
  }
  const start = pointForGradient(gradient, "start");
  if (start) {
    source.start = start;
  }
  const end = pointForGradient(gradient, "end");
  if (end) {
    source.end = end;
  }
  const width = finiteOptionalNumber(valueFor(gradient, "width"));
  if (width !== undefined) {
    source.width = roundGeometry(width);
  }
  return source;
}

function pointForGradient(gradient: JsonRecord, prefix: "start" | "end"): { x: number; y: number } | null {
  const dashedX = `${prefix}-x`;
  const dashedY = `${prefix}-y`;
  const camelX = `${prefix}X`;
  const camelY = `${prefix}Y`;
  const x = finiteOptionalNumber(valueFor(gradient, dashedX, camelX));
  const y = finiteOptionalNumber(valueFor(gradient, dashedY, camelY));
  return x === undefined || y === undefined ? null : { x: roundGeometry(x), y: roundGeometry(y) };
}

function opacityForPaintRecord(record: JsonRecord, kind: "fill" | "stroke"): number | undefined {
  const opacity = finiteOptionalNumber(
    kind === "fill"
      ? valueFor(record, "fillOpacity", "fill-opacity", "opacity")
      : valueFor(record, "strokeOpacity", "stroke-opacity", "opacity")
  );
  return opacity === undefined ? undefined : roundOpacity(opacity);
}

function boundsForPenpotShape(shape: JsonRecord): NodeClipBounds {
  const selrect = recordValue(valueFor(shape, "selrect", "selRect"));
  const size = recordValue(valueFor(shape, "size"));
  return {
    x: roundGeometry(finiteNumber(valueFor(shape, "x", "left"), finiteNumber(valueFor(selrect ?? {}, "x", "left"), 0))),
    y: roundGeometry(finiteNumber(valueFor(shape, "y", "top"), finiteNumber(valueFor(selrect ?? {}, "y", "top"), 0))),
    width: roundGeometry(
      finiteNumber(
        valueFor(shape, "width", "w"),
        finiteNumber(valueFor(selrect ?? {}, "width", "w", "x2"), finiteNumber(valueFor(size ?? {}, "width", "x"), 100))
      )
    ),
    height: roundGeometry(
      finiteNumber(
        valueFor(shape, "height", "h"),
        finiteNumber(valueFor(selrect ?? {}, "height", "h", "y2"), finiteNumber(valueFor(size ?? {}, "height", "y"), 48))
      )
    )
  };
}

function pointsForShape(shape: JsonRecord): NodeClipPoint[] {
  const points = valueFor(shape, "points");
  if (!Array.isArray(points)) {
    return [];
  }
  return points.flatMap((point) => {
    const record = recordValue(point);
    if (!record) {
      return [];
    }
    const x = finiteOptionalNumber(valueFor(record, "x"));
    const y = finiteOptionalNumber(valueFor(record, "y"));
    return x === undefined || y === undefined ? [] : [{ x: roundGeometry(x), y: roundGeometry(y) }];
  });
}

function opacityForShape(shape: JsonRecord): number | undefined {
  const opacity = finiteOptionalNumber(valueFor(shape, "opacity"));
  if (opacity === undefined) {
    return undefined;
  }
  return roundOpacity(opacity);
}

function findDesignNodeById(document: DesignFile, nodeId: string): DesignNode | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = findDesignNodeInTree(node, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findDesignNodeInTree(node: DesignNode, nodeId: string): DesignNode | null {
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children) {
    const found = findDesignNodeInTree(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function parseJsonBuffer(data: Buffer): unknown | undefined {
  const text = data.toString("utf8").trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function looksLikeZip(data: Buffer): boolean {
  return data.length >= 4 && data.readUInt32LE(0) === 0x04034b50;
}

function valueFor(record: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function recordValue(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function recordsFor(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  return isRecord(value) ? [value] : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function colorValue(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  const trimmed = text.trim();
  const shortHex = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    return `#${shortHex[1]
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`.toLowerCase();
  }
  const hex = trimmed.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  return hex ? `#${hex[1]}`.toLowerCase() : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function finiteOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundOpacity(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function normalizeShapeType(value: string | undefined): string | undefined {
  return value?.replace(/^:/, "").toLowerCase();
}

function storageIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "imported";
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
