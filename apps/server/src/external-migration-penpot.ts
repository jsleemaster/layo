import type {
  ExternalMigrationDocumentCandidate,
  ExternalMigrationImportedAsset,
  ExternalMigrationImportResult,
  ExternalMigrationReviewOptions
} from "./external-migration.js";
import type { DesignFile, DesignNode, ImageFitMode } from "./storage.js";

type JsonRecord = Record<string, unknown>;

interface PenpotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PenpotShape {
  id: string;
  name: string;
  type: string;
  bounds: PenpotBounds;
  childIds: string[];
  json: JsonRecord;
}

interface PenpotPage {
  id: string;
  name: string;
  path: string;
  json: JsonRecord;
  shapesById: Map<string, PenpotShape>;
  rootIds: string[];
}

interface PenpotPackageAsset extends ExternalMigrationImportedAsset {
  mediaId: string;
  storageObjectId: string;
  path: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

interface PenpotPackage {
  fileId: string;
  fileName: string;
  documentCandidates: ExternalMigrationDocumentCandidate[];
  pages: PenpotPage[];
  mediaById: Map<string, PenpotPackageAsset>;
  warnings: string[];
}

interface PenpotReviewResult {
  canImport: boolean;
  documentCandidates: ExternalMigrationDocumentCandidate[];
  warnings: string[];
}

interface PenpotMappingState {
  mappedNodeCount: number;
  skippedNodeCount: number;
  warnings: string[];
  assetsById: Map<string, PenpotPackageAsset>;
  usedAssets: Map<string, PenpotPackageAsset>;
}

interface PenpotSolidFillPaint {
  color: string;
  opacity: number;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const ASSET_MEDIA_TYPES = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".avif", "image/avif"]
]);
const IMPORTABLE_IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function reviewPenpotZipEntries(
  entries: Map<string, Buffer>,
  options: ExternalMigrationReviewOptions = {}
): PenpotReviewResult | null {
  const penpotPackage = readPenpotPackage(entries, options);
  if (!penpotPackage) {
    return null;
  }

  return {
    canImport: penpotPackage.pages.length > 0,
    documentCandidates: penpotPackage.documentCandidates,
    warnings: penpotPackage.warnings
  };
}

export function importPenpotZipEntries(
  entries: Map<string, Buffer>,
  options: { fileId?: string; name?: string; fileName?: string } = {}
): ExternalMigrationImportResult {
  const penpotPackage = readPenpotPackage(entries, { fileName: options.fileName, sourceHint: "penpot" });
  if (!penpotPackage || penpotPackage.pages.length === 0) {
    throw inputValidationError("Penpot ZIP export does not contain importable pages.");
  }

  const state: PenpotMappingState = {
    mappedNodeCount: 0,
    skippedNodeCount: 0,
    warnings: [...penpotPackage.warnings],
    assetsById: penpotPackage.mediaById,
    usedAssets: new Map()
  };
  const pages = penpotPackage.pages.map((page, index) => ({
    id: penpotStorageId(page.id, `page-${index + 1}`),
    name: page.name,
    children: mapPenpotPageChildren(page, state)
  }));
  const fileName = normalizeImportName(options.name, penpotPackage.fileName);
  const file: DesignFile = {
    id: safeStorageId(options.fileId, "penpot-import"),
    name: fileName,
    pages
  };

  return {
    source: "penpot",
    sourceLabel: "Penpot",
    file,
    importedAssets: [...state.usedAssets.values()].map((asset) => ({ metadata: asset.metadata, data: asset.data })),
    mappedNodeCount: state.mappedNodeCount,
    skippedNodeCount: state.skippedNodeCount,
    warnings: state.warnings
  };
}

function readPenpotPackage(
  entries: Map<string, Buffer>,
  options: ExternalMigrationReviewOptions = {}
): PenpotPackage | null {
  const manifest = parseJsonEntry(entries, "manifest.json");
  if (!isPenpotExportManifest(manifest)) {
    return null;
  }

  const manifestFiles = Array.isArray(manifest.files) ? manifest.files.filter(isRecord) : [];
  const fileMetadata = manifestFiles[0];
  const fileId = stringValue(fileMetadata?.id) ?? firstFileIdFromEntries(entries);
  if (!fileId) {
    return null;
  }

  const filePath = `files/${fileId}.json`;
  const fileJson = asRecord(parseJsonEntry(entries, filePath)) ?? {};
  const fileName =
    normalizeImportName(options.fileName, stringValue(fileMetadata?.name) ?? stringValue(fileJson.name) ?? "Imported Penpot");
  const pages = readPenpotPages(entries, fileId);
  const warnings = pages.length === 0 ? ["Penpot ZIP export did not contain readable page JSON entries."] : [];
  const mediaById = readPenpotMedia(entries, fileId, warnings);
  const totalShapeCount = pages.reduce((total, page) => total + page.shapesById.size, 0);
  const documentCandidates: ExternalMigrationDocumentCandidate[] = [
    {
      path: filePath,
      name: stringValue(fileMetadata?.name) ?? stringValue(fileJson.name) ?? fileName,
      pageCount: pages.length,
      nodeCount: totalShapeCount
    },
    ...pages.map((page) => ({
      path: page.path,
      name: page.name,
      pageCount: 1,
      nodeCount: page.shapesById.size
    }))
  ];

  return {
    fileId,
    fileName: stringValue(fileMetadata?.name) ?? stringValue(fileJson.name) ?? fileName,
    documentCandidates,
    pages,
    mediaById,
    warnings
  };
}

function readPenpotPages(entries: Map<string, Buffer>, fileId: string): PenpotPage[] {
  const pagePathPattern = new RegExp(`^files/${escapeRegExp(fileId)}/pages/([^/]+)\\.json$`);
  return [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath, data, match: entryPath.match(pagePathPattern) }))
    .filter((entry): entry is { entryPath: string; data: Buffer; match: RegExpMatchArray } => entry.match !== null)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath))
    .flatMap(({ entryPath, data, match }) => {
      const pageJson = asRecord(parseJsonBuffer(data));
      if (!pageJson) {
        return [];
      }
      const pageId = stringValue(pageJson.id) ?? match[1];
      const shapesById = readPenpotShapes(entries, fileId, pageId, pageJson);
      return [
        {
          id: pageId,
          name: stringValue(pageJson.name) ?? `Page ${match[1]}`,
          path: entryPath,
          json: pageJson,
          shapesById,
          rootIds: rootShapeIds(pageJson, shapesById)
        }
      ];
    });
}

function readPenpotShapes(
  entries: Map<string, Buffer>,
  fileId: string,
  pageId: string,
  pageJson: JsonRecord
): Map<string, PenpotShape> {
  const shapesById = new Map<string, PenpotShape>();
  const objects = valueFor(pageJson, "objects");
  if (isRecord(objects)) {
    for (const [fallbackId, value] of Object.entries(objects)) {
      const shape = normalizePenpotShape(value, fallbackId);
      if (shape) {
        shapesById.set(shape.id, shape);
      }
    }
  }

  const inlineShapes = valueFor(pageJson, "shapes", "children");
  if (Array.isArray(inlineShapes)) {
    for (const value of inlineShapes) {
      const shape = normalizePenpotShape(value);
      if (shape) {
        shapesById.set(shape.id, shape);
      }
    }
  }

  const shapePathPattern = new RegExp(`^files/${escapeRegExp(fileId)}/pages/${escapeRegExp(pageId)}/([^/]+)\\.json$`);
  const shapeEntries = [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath, data, match: entryPath.match(shapePathPattern) }))
    .filter((entry): entry is { entryPath: string; data: Buffer; match: RegExpMatchArray } => entry.match !== null)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath));

  for (const { data, match } of shapeEntries) {
    const shape = normalizePenpotShape(parseJsonBuffer(data), match[1]);
    if (shape) {
      shapesById.set(shape.id, shape);
    }
  }

  return shapesById;
}

function normalizePenpotShape(value: unknown, fallbackId?: string): PenpotShape | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(valueFor(value, "id")) ?? fallbackId;
  if (!id) {
    return null;
  }
  const type = normalizeShapeType(stringValue(valueFor(value, "type", "shapeType", "shape-type")));
  return {
    id,
    name: stringValue(valueFor(value, "name")) ?? type ?? id,
    type: type ?? "unknown",
    bounds: boundsForShape(value),
    childIds: childIdsForShape(value),
    json: value
  };
}

function mapPenpotPageChildren(page: PenpotPage, state: PenpotMappingState): DesignNode[] {
  return page.rootIds.flatMap((shapeId) => {
    const shape = page.shapesById.get(shapeId);
    if (!shape) {
      state.skippedNodeCount += 1;
      state.warnings.push(`Skipped missing Penpot root shape ${shapeId}.`);
      return [];
    }
    const mapped = mapPenpotShape(shape, undefined, page.shapesById, state, new Set());
    return mapped ? [mapped] : [];
  });
}

function mapPenpotShape(
  shape: PenpotShape,
  parentBounds: PenpotBounds | undefined,
  shapesById: Map<string, PenpotShape>,
  state: PenpotMappingState,
  visiting: Set<string>
): DesignNode | null {
  if (shape.json.hidden === true || shape.json.visible === false) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped hidden Penpot shape ${shape.name}.`);
    return null;
  }

  if (visiting.has(shape.id)) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped recursive Penpot shape ${shape.name}.`);
    return null;
  }

  if (shape.type !== "frame" && shape.type !== "rect" && shape.type !== "text" && shape.type !== "image") {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped unsupported Penpot shape type ${shape.type} (${shape.name}).`);
    return null;
  }

  const imageMediaId = imageMediaIdForShape(shape);
  const imageAsset = imageMediaId ? state.assetsById.get(imageMediaId) : undefined;
  if (shape.type === "image" && !imageAsset) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped Penpot image shape ${shape.name} because its packaged asset was not found.`);
    return null;
  }

  if (shape.type === "rect" && imageMediaId && !imageAsset) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped Penpot fill-image shape ${shape.name} because its packaged asset was not found.`);
    return null;
  }

  if (shape.type === "frame" && imageMediaId && !imageAsset) {
    state.warnings.push(`Skipped Penpot frame fill-image on ${shape.name} because its packaged asset was not found.`);
  }

  const transform = {
    x: roundGeometry(shape.bounds.x - (parentBounds?.x ?? 0)),
    y: roundGeometry(shape.bounds.y - (parentBounds?.y ?? 0)),
    rotation: finiteNumber(valueFor(shape.json, "rotation"), 0)
  };
  const mapsAsImage = Boolean(imageAsset) && shape.type !== "frame";
  const solidFillPaint = mapsAsImage ? null : penpotSolidFillPaint(shape.json);
  const fill = mapsAsImage
    ? "#f3f4f6"
    : solidFillPaint?.color ?? penpotFillColor(shape.json) ?? defaultFillForPenpotType(shape.type);
  const stroke = mapsAsImage ? null : penpotStrokeColor(shape.json);
  const opacity = finiteNumber(
    valueFor(shape.json, "opacity"),
    solidFillPaint?.opacity ?? finiteNumber(valueFor(firstRecord(valueFor(shape.json, "fills")) ?? {}, "fillOpacity", "fill-opacity", "opacity"), 1)
  );
  const nodeId = penpotStorageId(shape.id, `${shape.type}-${state.mappedNodeCount + 1}`);
  state.mappedNodeCount += 1;

  const mapped: DesignNode = {
    id: nodeId,
    kind: mapsAsImage ? "image" : shape.type === "frame" ? "frame" : shape.type === "text" ? "text" : "rectangle",
    name: shape.name,
    transform,
    size: {
      width: roundGeometry(Math.max(1, shape.bounds.width)),
      height: roundGeometry(Math.max(1, shape.bounds.height))
    },
    style: {
      fill,
      stroke,
      stroke_width: stroke ? finiteNumber(valueFor(firstRecord(valueFor(shape.json, "strokes")) ?? {}, "strokeWidth", "stroke-width", "width"), 1) : 0,
      opacity
    },
    content: mapsAsImage && imageAsset
      ? imageContentForAsset(imageAsset, "fill")
      : shape.type === "text"
      ? {
          type: "text",
          value: stringValue(valueFor(shape.json, "content", "characters", "text")) ?? "",
          font_size: finiteNumber(valueFor(shape.json, "fontSize", "font-size"), 16),
          font_family: stringValue(valueFor(shape.json, "fontFamily", "font-family")) ?? "Inter"
        }
      : { type: "empty" },
    children: []
  };

  if (imageAsset && shape.type !== "frame") {
    state.usedAssets.set(imageAsset.metadata.assetId, imageAsset);
  }

  if (shape.type === "frame") {
    const nextVisiting = new Set(visiting);
    nextVisiting.add(shape.id);
    const mappedChildren = shape.childIds.flatMap((childId) => {
      const child = shapesById.get(childId);
      if (!child) {
        state.skippedNodeCount += 1;
        state.warnings.push(`Skipped missing Penpot child shape ${childId} in ${shape.name}.`);
        return [];
      }
      const mappedChild = mapPenpotShape(child, shape.bounds, shapesById, state, nextVisiting);
      return mappedChild ? [mappedChild] : [];
    });
    if (imageAsset) {
      mapped.children = [frameFillImageNode(shape, imageAsset), ...mappedChildren];
      state.mappedNodeCount += 1;
      state.usedAssets.set(imageAsset.metadata.assetId, imageAsset);
    } else {
      mapped.children = mappedChildren;
    }
  }

  return mapped;
}

function readPenpotMedia(
  entries: Map<string, Buffer>,
  fileId: string,
  warnings: string[]
): Map<string, PenpotPackageAsset> {
  const mediaById = new Map<string, PenpotPackageAsset>();
  const mediaPathPattern = new RegExp(`^files/${escapeRegExp(fileId)}/media/([^/]+)\\.json$`);
  const mediaEntries = [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath, data, match: entryPath.match(mediaPathPattern) }))
    .filter((entry): entry is { entryPath: string; data: Buffer; match: RegExpMatchArray } => entry.match !== null)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath));

  for (const { data, entryPath, match } of mediaEntries) {
    const media = asRecord(parseJsonBuffer(data));
    if (!media) {
      warnings.push(`Skipped unreadable Penpot media metadata ${entryPath}.`);
      continue;
    }
    const mediaId = stringValue(valueFor(media, "id")) ?? match[1];
    const storageObjectId = stringValue(valueFor(media, "mediaId", "media-id", "objectId", "object-id"));
    const mediaType = stringValue(valueFor(media, "mtype", "mimeType", "mime-type", "contentType", "content-type"));
    if (!mediaId || !storageObjectId || !mediaType || !IMPORTABLE_IMAGE_MEDIA_TYPES.has(mediaType)) {
      warnings.push(`Skipped unsupported Penpot media metadata ${entryPath}.`);
      continue;
    }

    const storageObject = findPenpotStorageObject(entries, storageObjectId, mediaType);
    if (!storageObject) {
      warnings.push(`Skipped Penpot media ${mediaId} because storage object ${storageObjectId} was not packaged.`);
      continue;
    }
    if (storageObject.mediaType !== mediaType) {
      warnings.push(`Skipped Penpot media ${mediaId} because metadata type ${mediaType} does not match ${storageObject.mediaType}.`);
      continue;
    }

    const declaredSize = positiveNumber(valueFor(storageObject.metadata, "size"));
    if (declaredSize && declaredSize !== storageObject.data.length) {
      warnings.push(`Skipped Penpot media ${mediaId} because storage object size does not match metadata.`);
      continue;
    }

    const dimensions = dimensionsForImage(storageObject.data, mediaType);
    const naturalWidth = positiveNumber(valueFor(media, "width")) ?? dimensions?.width;
    const naturalHeight = positiveNumber(valueFor(media, "height")) ?? dimensions?.height;
    const assetId = penpotAssetStorageId(mediaId);
    mediaById.set(mediaId, {
      mediaId,
      storageObjectId,
      path: storageObject.path,
      naturalWidth,
      naturalHeight,
      metadata: {
        assetId,
        name: stringValue(valueFor(media, "name")) ?? fileNameForPath(storageObject.path),
        mimeType: mediaType,
        byteLength: storageObject.data.length,
        url: `/assets/${assetId}`
      },
      data: storageObject.data
    });
  }

  return mediaById;
}

function findPenpotStorageObject(
  entries: Map<string, Buffer>,
  storageObjectId: string,
  expectedMediaType: string
): { data: Buffer; mediaType: string; metadata: JsonRecord; path: string } | null {
  const metadata = asRecord(parseJsonEntry(entries, `objects/${storageObjectId}.json`)) ?? {};
  const expectedExtension = extensionForMediaType(expectedMediaType);
  const exactPath = expectedExtension ? `objects/${storageObjectId}${expectedExtension}` : undefined;
  const exactData = exactPath ? entries.get(exactPath) : undefined;
  if (exactData && exactPath) {
    return { data: exactData, mediaType: expectedMediaType, metadata, path: exactPath };
  }

  for (const [entryPath, data] of [...entries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const match = entryPath.match(new RegExp(`^objects/${escapeRegExp(storageObjectId)}(\\.[^/]+)$`));
    if (!match) {
      continue;
    }
    const mediaType = ASSET_MEDIA_TYPES.get(match[1].toLowerCase());
    if (mediaType && IMPORTABLE_IMAGE_MEDIA_TYPES.has(mediaType)) {
      return { data, mediaType, metadata, path: entryPath };
    }
  }

  return null;
}

function imageMediaIdForShape(shape: PenpotShape): string | undefined {
  if (shape.type === "image") {
    const metadata = asRecord(valueFor(shape.json, "metadata"));
    return stringValue(valueFor(metadata ?? {}, "id"));
  }
  if (shape.type !== "rect" && shape.type !== "frame") {
    return undefined;
  }
  const fillRecord = firstRecord(valueFor(shape.json, "fills"));
  const fillImage = asRecord(valueFor(fillRecord ?? {}, "fillImage", "fill-image"));
  return stringValue(valueFor(fillImage ?? {}, "id"));
}

function frameFillImageNode(shape: PenpotShape, asset: PenpotPackageAsset): DesignNode {
  const fillRecord = firstRecord(valueFor(shape.json, "fills"));
  return {
    id: penpotStorageId(`${shape.id}-fill-image`, `${shape.type}-fill-image`),
    kind: "image",
    name: `${shape.name} background`,
    transform: { x: 0, y: 0, rotation: 0 },
    size: {
      width: roundGeometry(Math.max(1, shape.bounds.width)),
      height: roundGeometry(Math.max(1, shape.bounds.height))
    },
    style: {
      fill: "#f3f4f6",
      stroke: null,
      stroke_width: 0,
      opacity: finiteNumber(valueFor(fillRecord ?? {}, "fillOpacity", "fill-opacity", "opacity"), 1)
    },
    content: imageContentForAsset(asset, "fill"),
    children: []
  };
}

function imageContentForAsset(
  asset: PenpotPackageAsset,
  fitMode: ImageFitMode
): Extract<DesignNode["content"], { type: "image" }> {
  const content: Extract<DesignNode["content"], { type: "image" }> = {
    type: "image",
    asset_id: asset.metadata.assetId,
    fit_mode: fitMode
  };
  if (asset.naturalWidth) {
    content.natural_width = asset.naturalWidth;
  }
  if (asset.naturalHeight) {
    content.natural_height = asset.naturalHeight;
  }
  return content;
}

function rootShapeIds(pageJson: JsonRecord, shapesById: Map<string, PenpotShape>): string[] {
  const explicitRoots = arrayIds(valueFor(pageJson, "rootShapes", "root-shapes", "children"))
    .filter((shapeId) => shapesById.has(shapeId));
  if (explicitRoots.length > 0) {
    return explicitRoots;
  }

  const referencedIds = new Set<string>();
  for (const shape of shapesById.values()) {
    for (const childId of shape.childIds) {
      referencedIds.add(childId);
    }
  }
  const inferredRoots = [...shapesById.keys()].filter((shapeId) => !referencedIds.has(shapeId));
  return inferredRoots.length > 0 ? inferredRoots : [...shapesById.keys()];
}

function childIdsForShape(shape: JsonRecord): string[] {
  return arrayIds(valueFor(shape, "shapes", "children"));
}

function arrayIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const direct = stringValue(entry);
    if (direct) {
      return [direct];
    }
    if (isRecord(entry)) {
      const id = stringValue(valueFor(entry, "id"));
      return id ? [id] : [];
    }
    return [];
  });
}

function isPenpotExportManifest(value: unknown): value is JsonRecord {
  if (!isRecord(value)) {
    return false;
  }
  const type = stringValue(valueFor(value, "type"));
  return type === "penpot/export-files" && Array.isArray(value.files);
}

function firstFileIdFromEntries(entries: Map<string, Buffer>): string | undefined {
  for (const entryPath of entries.keys()) {
    const match = entryPath.match(/^files\/([^/]+)\.json$/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function parseJsonEntry(entries: Map<string, Buffer>, entryPath: string): unknown | undefined {
  const data = entries.get(entryPath);
  return data ? parseJsonBuffer(data) : undefined;
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

function boundsForShape(shape: JsonRecord): PenpotBounds {
  const selrect = asRecord(valueFor(shape, "selrect", "selRect"));
  const size = asRecord(valueFor(shape, "size"));
  return {
    x: finiteNumber(valueFor(shape, "x", "left"), finiteNumber(valueFor(selrect ?? {}, "x", "left"), 0)),
    y: finiteNumber(valueFor(shape, "y", "top"), finiteNumber(valueFor(selrect ?? {}, "y", "top"), 0)),
    width: finiteNumber(valueFor(shape, "width", "w"), finiteNumber(valueFor(selrect ?? {}, "width", "w", "x2"), finiteNumber(valueFor(size ?? {}, "width", "x"), 100))),
    height: finiteNumber(valueFor(shape, "height", "h"), finiteNumber(valueFor(selrect ?? {}, "height", "h", "y2"), finiteNumber(valueFor(size ?? {}, "height", "y"), 48)))
  };
}

function penpotFillColor(shape: JsonRecord): string | null {
  const fillRecord = firstRecord(valueFor(shape, "fills"));
  return colorValue(valueFor(fillRecord ?? shape, "fillColor", "fill-color", "color"));
}

function penpotStrokeColor(shape: JsonRecord): string | null {
  const strokeRecord = firstRecord(valueFor(shape, "strokes"));
  return colorValue(valueFor(strokeRecord ?? shape, "strokeColor", "stroke-color", "color"));
}

function firstRecord(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    return value.find(isRecord) ?? null;
  }
  return isRecord(value) ? value : null;
}

function colorValue(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) {
    return null;
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
  return hex ? `#${hex[1]}`.toLowerCase() : null;
}

function defaultFillForPenpotType(type: string): string {
  if (type === "text") {
    return "#111827";
  }
  if (type === "frame") {
    return "#ffffff";
  }
  return "#e5e7eb";
}

function normalizeShapeType(value: string | undefined): string | undefined {
  return value?.replace(/^:/, "").toLowerCase();
}

function penpotStorageId(value: unknown, fallback: string): string {
  const source = stringValue(value) ?? fallback;
  return `penpot-${storageIdSegment(source)}`;
}

function penpotAssetStorageId(value: string): string {
  return `penpot-asset-${storageIdSegment(value)}`;
}

function safeStorageId(value: string | undefined, fallback: string): string {
  const source = value?.trim() || `${fallback}-${Date.now().toString(36)}`;
  return storageIdSegment(source);
}

function storageIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "imported";
}

function normalizeImportName(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback.trim() || "Imported Penpot";
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function positiveNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function valueFor(record: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extensionForPath(entryPath: string): string {
  const lastSegment = entryPath.toLowerCase().split("/").pop() ?? entryPath.toLowerCase();
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex >= 0 ? lastSegment.slice(dotIndex) : "";
}

function extensionForMediaType(mediaType: string): string | undefined {
  for (const [extension, candidate] of ASSET_MEDIA_TYPES.entries()) {
    if (candidate === mediaType) {
      return extension;
    }
  }
  return undefined;
}

function fileNameForPath(entryPath: string): string {
  return entryPath.split("/").pop()?.trim() || "image";
}

function dimensionsForImage(data: Buffer, mediaType: string): { width: number; height: number } | null {
  if (mediaType === "image/png" && data.length >= 24 && data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  const textHeader = data.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (mediaType === "image/svg+xml" && textHeader.startsWith("<svg")) {
    const width = numberAttribute(textHeader, "width");
    const height = numberAttribute(textHeader, "height");
    return width && height ? { width, height } : null;
  }

  return null;
}

function numberAttribute(text: string, attributeName: "width" | "height"): number | null {
  const match = text.match(new RegExp(`${attributeName}=["']([0-9.]+)`));
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inputValidationError(message: string): Error {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "CANVAS_INPUT_VALIDATION";
  error.statusCode = 400;
  return error;
}
