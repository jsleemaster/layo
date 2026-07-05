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

type ClippedDesignNode = DesignNode & { clip?: NodeClip | null };

export function importExternalMigrationArchive(
  archive: Buffer,
  options: ExternalMigrationImportOptions = {}
): ExternalMigrationImportResult {
  const imported = importBaseExternalMigrationArchive(archive, options);
  if (imported.source !== "penpot" || !looksLikeZip(archive)) {
    return imported;
  }

  try {
    return enrichPenpotMaskedGroupClipSources(imported, readZipArchive(archive));
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
  return Math.round(Math.max(0, Math.min(1, opacity)) * 1000) / 1000;
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
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

function normalizeShapeType(value: string | undefined): string | undefined {
  return value?.replace(/^:/, "").toLowerCase();
}

function storageIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "imported";
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
