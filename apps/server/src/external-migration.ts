import { readZipArchive } from "./file-archive.js";
import type { DesignFile, DesignNode, ImageFitMode, StoredAsset } from "./storage.js";

export type ExternalMigrationSource = "penpot" | "figma" | "unknown";
export type ExternalMigrationArchiveKind = "zip" | "json" | "binary";
export type ExternalMigrationEntryKind = "manifest" | "document" | "asset" | "metadata" | "unknown";

export interface ExternalMigrationReviewOptions {
  fileName?: string;
  sourceHint?: ExternalMigrationSource;
}

export interface ExternalMigrationEntrySummary {
  path: string;
  kind: ExternalMigrationEntryKind;
  bytes: number;
}

export interface ExternalMigrationAssetCandidate {
  path: string;
  bytes: number;
  mediaType: string;
}

export interface ExternalMigrationDocumentCandidate {
  path: string;
  name: string;
  pageCount: number;
  nodeCount: number;
}

export interface ExternalMigrationReview {
  schemaVersion: 1;
  source: ExternalMigrationSource;
  sourceLabel: string;
  archiveKind: ExternalMigrationArchiveKind;
  fileName?: string;
  canImport: boolean;
  entryCount: number;
  assetCount: number;
  documentCandidateCount: number;
  entries: ExternalMigrationEntrySummary[];
  assetCandidates: ExternalMigrationAssetCandidate[];
  documentCandidates: ExternalMigrationDocumentCandidate[];
  blockedBy: string[];
  warnings: string[];
  nextSteps: string[];
}

export interface ExternalMigrationImportOptions extends ExternalMigrationReviewOptions {
  fileId?: string;
  name?: string;
}

export interface ExternalMigrationImportedAsset {
  metadata: StoredAsset;
  data: Buffer;
}

export interface ExternalMigrationImportResult {
  source: ExternalMigrationSource;
  sourceLabel: string;
  file: DesignFile;
  importedAssets: ExternalMigrationImportedAsset[];
  mappedNodeCount: number;
  skippedNodeCount: number;
  warnings: string[];
}

type JsonRecord = Record<string, unknown>;

interface FigmaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FigmaMappingState {
  mappedNodeCount: number;
  skippedNodeCount: number;
  warnings: string[];
  assetsByRef: Map<string, FigmaPackageAsset>;
  usedAssets: Map<string, FigmaPackageAsset>;
}

interface FigmaPackageDocument {
  path: string;
  json: unknown;
}

interface FigmaPackageAsset extends ExternalMigrationImportedAsset {
  imageRef: string;
  path: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

const JSON_TEXT_EXTENSIONS = new Set([".json"]);
const ASSET_MEDIA_TYPES = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".avif", "image/avif"],
  [".pdf", "application/pdf"]
]);
const IMPORTABLE_IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function reviewExternalMigrationArchive(
  archive: Buffer,
  options: ExternalMigrationReviewOptions = {}
): ExternalMigrationReview {
  const fileName = safeFileName(options.fileName);
  const sourceHint = normalizeSourceHint(options.sourceHint);

  if (looksLikeZip(archive)) {
    return reviewZipArchive(archive, { fileName, sourceHint });
  }

  const parsedJson = parseJsonBuffer(archive);
  if (parsedJson !== undefined) {
    return reviewJsonArchive(parsedJson, archive.length, { fileName, sourceHint });
  }

  return reviewBinaryArchive(archive, { fileName, sourceHint });
}

export function importExternalMigrationArchive(
  archive: Buffer,
  options: ExternalMigrationImportOptions = {}
): ExternalMigrationImportResult {
  const fileName = safeFileName(options.fileName);
  const sourceHint = normalizeSourceHint(options.sourceHint);
  if (looksLikeZip(archive)) {
    let entries: Map<string, Buffer>;
    try {
      entries = readZipArchive(archive);
    } catch (error) {
      throw inputValidationError(`ZIP archive could not be inspected: ${messageFromError(error)}`);
    }
    const figmaPackage = readFigmaPackage(entries);
    if (!figmaPackage) {
      throw inputValidationError("Only Figma REST JSON exports are importable in this migration slice.");
    }

    const source = detectSource({
      fileName,
      sourceHint,
      json: figmaPackage.document.json,
      documentCandidates: [summarizeJsonDocument(figmaPackage.document.path, figmaPackage.document.json)]
    });
    if (source !== "figma") {
      throw inputValidationError("Only Figma REST JSON exports are importable in this migration slice.");
    }

    return mapFigmaRestJsonToDesignFile(figmaPackage.document.json, {
      assetsByRef: figmaPackage.assetsByRef,
      fileId: options.fileId,
      name: options.name ?? stringValue((figmaPackage.document.json as JsonRecord).name) ?? fileName
    });
  }

  const parsedJson = parseJsonBuffer(archive);
  if (!parsedJson || !isFigmaJson(parsedJson)) {
    throw inputValidationError("Only Figma REST JSON exports are importable in this migration slice.");
  }

  const source = detectSource({
    fileName,
    sourceHint,
    json: parsedJson,
    documentCandidates: [summarizeJsonDocument(fileName ?? "external-file.json", parsedJson)]
  });
  if (source !== "figma") {
    throw inputValidationError("Only Figma REST JSON exports are importable in this migration slice.");
  }

  return mapFigmaRestJsonToDesignFile(parsedJson, {
    assetsByRef: new Map(),
    fileId: options.fileId,
    name: options.name ?? stringValue((parsedJson as JsonRecord).name) ?? fileName
  });
}

function reviewZipArchive(
  archive: Buffer,
  options: { fileName?: string; sourceHint: ExternalMigrationSource | undefined }
): ExternalMigrationReview {
  let entries: Map<string, Buffer>;
  const warnings: string[] = [];
  try {
    entries = readZipArchive(archive);
  } catch (error) {
    warnings.push(`ZIP archive could not be inspected: ${messageFromError(error)}`);
    return baseReview({
      source: detectSource({ fileName: options.fileName, sourceHint: options.sourceHint }),
      archiveKind: "binary",
      fileName: options.fileName,
      entries: [],
      assetCandidates: [],
      documentCandidates: [],
      warnings,
      blockedBy: ["zip_reader_failed", "mapping_not_implemented"]
    });
  }

  const summaries = [...entries.entries()]
    .map(([entryPath, data]) => summarizeEntry(entryPath, data))
    .sort((left, right) => left.path.localeCompare(right.path));
  const assetCandidates = summaries
    .filter((entry) => entry.kind === "asset")
    .map((entry) => ({
      path: entry.path,
      bytes: entry.bytes,
      mediaType: ASSET_MEDIA_TYPES.get(extensionForPath(entry.path)) ?? "application/octet-stream"
    }));
  const parsedDocuments = summaries
    .filter((entry) => entry.kind === "document" || entry.kind === "manifest" || entry.kind === "metadata")
    .flatMap((entry) => {
      const data = entries.get(entry.path);
      const parsed = data ? parseJsonBuffer(data) : undefined;
      return parsed === undefined ? [] : [{ path: entry.path, json: parsed, summary: summarizeJsonDocument(entry.path, parsed) }];
    });
  const documentCandidates = parsedDocuments.map((entry) => entry.summary);
  const figmaDocument = parsedDocuments.find((entry) => isFigmaJson(entry.json));
  const source = detectSource({
    fileName: options.fileName,
    sourceHint: options.sourceHint,
    entries: summaries,
    json: figmaDocument?.json,
    documentCandidates
  });
  const canImport = source === "figma" && (figmaDocument?.summary.pageCount ?? 0) > 0;

  return baseReview({
    source,
    archiveKind: "zip",
    fileName: options.fileName,
    entries: summaries,
    assetCandidates,
    documentCandidates,
    warnings,
    blockedBy: canImport ? [] : blockedByForSource(source, "zip"),
    canImport
  });
}

function reviewJsonArchive(
  parsedJson: unknown,
  byteLength: number,
  options: { fileName?: string; sourceHint: ExternalMigrationSource | undefined }
): ExternalMigrationReview {
  const entryPath = options.fileName ?? "external-file.json";
  const documentCandidate = summarizeJsonDocument(entryPath, parsedJson);
  const source = detectSource({
    fileName: options.fileName,
    sourceHint: options.sourceHint,
    json: parsedJson,
    documentCandidates: [documentCandidate]
  });
  const entry: ExternalMigrationEntrySummary = {
    path: entryPath,
    kind: "document",
    bytes: byteLength
  };
  const canImport = source === "figma" && isFigmaJson(parsedJson) && documentCandidate.pageCount > 0;

  return baseReview({
    source,
    archiveKind: "json",
    fileName: options.fileName,
    entries: [entry],
    assetCandidates: [],
    documentCandidates: [documentCandidate],
    warnings: source === "figma" ? ["Figma image fills still require exported image assets from the Images API."] : [],
    blockedBy: canImport ? [] : blockedByForSource(source, "json"),
    canImport
  });
}

function reviewBinaryArchive(
  archive: Buffer,
  options: { fileName?: string; sourceHint: ExternalMigrationSource | undefined }
): ExternalMigrationReview {
  const source = detectSource({ fileName: options.fileName, sourceHint: options.sourceHint });
  const blockedBy =
    source === "figma"
      ? ["figma_api_json_required", "mapping_not_implemented"]
      : ["unsupported_source", "mapping_not_implemented"];
  return baseReview({
    source,
    archiveKind: "binary",
    fileName: options.fileName,
    entries: [
      {
        path: options.fileName ?? "external-design-file",
        kind: "unknown",
        bytes: archive.length
      }
    ],
    assetCandidates: [],
    documentCandidates: [],
    warnings:
      source === "figma"
        ? ["Figma .fig/.figma binary files are opaque binary files; use the REST API JSON export first."]
        : ["The external file is not a readable ZIP or JSON design export."],
    blockedBy
  });
}

function mapFigmaRestJsonToDesignFile(
  value: unknown,
  options: { assetsByRef: Map<string, FigmaPackageAsset>; fileId?: string; name?: string }
): ExternalMigrationImportResult {
  if (!isRecord(value) || !isRecord(value.document)) {
    throw inputValidationError("Figma REST JSON document root is required.");
  }
  const documentNode = value.document;
  const children = Array.isArray(documentNode.children) ? documentNode.children : [];
  const state: FigmaMappingState = {
    mappedNodeCount: 0,
    skippedNodeCount: 0,
    warnings: [],
    assetsByRef: options.assetsByRef,
    usedAssets: new Map()
  };
  const pages = children
    .filter((child): child is JsonRecord => isRecord(child) && child.type === "CANVAS")
    .map((page, index) => ({
      id: figmaStorageId(page.id, `page-${index + 1}`),
      name: stringValue(page.name) ?? `Page ${index + 1}`,
      children: mapFigmaNodeChildren(page, undefined, state)
    }));

  if (pages.length === 0) {
    throw inputValidationError("Figma REST JSON does not contain any CANVAS pages.");
  }

  const fileName = normalizeImportName(
    options.name,
    stringValue(value.name) ?? stringValue(documentNode.name) ?? "Imported Figma"
  );
  return {
    source: "figma",
    sourceLabel: sourceLabel("figma"),
    file: {
      id: safeStorageId(options.fileId, "figma-import"),
      name: fileName,
      pages
    },
    importedAssets: [...state.usedAssets.values()].map((asset) => ({
      metadata: asset.metadata,
      data: asset.data
    })),
    mappedNodeCount: state.mappedNodeCount,
    skippedNodeCount: state.skippedNodeCount,
    warnings: state.warnings
  };
}

function mapFigmaNodeChildren(
  parent: JsonRecord,
  parentBounds: FigmaBounds | undefined,
  state: FigmaMappingState
): DesignNode[] {
  const children = Array.isArray(parent.children) ? parent.children : [];
  return children.flatMap((child) => {
    if (!isRecord(child)) {
      return [];
    }
    const mapped = mapFigmaNode(child, parentBounds, state);
    return mapped ? [mapped] : [];
  });
}

function mapFigmaNode(
  node: JsonRecord,
  parentBounds: FigmaBounds | undefined,
  state: FigmaMappingState
): DesignNode | null {
  if (node.visible === false) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped hidden Figma node ${stringValue(node.name) ?? stringValue(node.id) ?? "unknown"}.`);
    return null;
  }

  const type = stringValue(node.type);
  if (type !== "FRAME" && type !== "RECTANGLE" && type !== "TEXT") {
    state.skippedNodeCount += 1;
    state.warnings.push(
      `Skipped unsupported Figma node type ${type ?? "unknown"} (${stringValue(node.name) ?? "unnamed"}).`
    );
    return null;
  }

  const bounds = boundsForNode(node);
  const transform = {
    x: roundGeometry(bounds.x - (parentBounds?.x ?? 0)),
    y: roundGeometry(bounds.y - (parentBounds?.y ?? 0)),
    rotation: 0
  };
  const imagePaint = type !== "TEXT" ? imagePaintForNode(node.fills) : null;
  const imageAsset = imagePaint ? state.assetsByRef.get(imagePaint.imageRef) : undefined;
  if (imagePaint && !imageAsset) {
    state.warnings.push(
      `Figma image fill ${imagePaint.imageRef} (${stringValue(node.name) ?? "unnamed"}) was not packaged with an asset.`
    );
  }
  const imageContent =
    type !== "FRAME" && imagePaint && imageAsset ? imageContentForAsset(imageAsset, imagePaint) : null;
  const frameImageContent =
    type === "FRAME" && imagePaint && imageAsset ? imageContentForAsset(imageAsset, imagePaint) : null;
  const mapsAsImage = imageContent !== null;
  const fill = mapsAsImage ? "#f3f4f6" : solidPaintHex(node.fills) ?? defaultFillForFigmaType(type);
  const stroke = solidPaintHex(node.strokes);
  const nodeId = figmaStorageId(node.id, `${type.toLowerCase()}-${state.mappedNodeCount + 1}`);
  state.mappedNodeCount += 1;

  const mapped: DesignNode = {
    id: nodeId,
    kind: mapsAsImage ? "image" : type === "FRAME" ? "frame" : type === "TEXT" ? "text" : "rectangle",
    name: stringValue(node.name) ?? type.toLowerCase(),
    transform,
    size: {
      width: roundGeometry(Math.max(1, bounds.width)),
      height: roundGeometry(Math.max(1, bounds.height))
    },
    style: {
      fill,
      stroke: mapsAsImage ? null : stroke,
      stroke_width: mapsAsImage ? 0 : finiteNumber(node.strokeWeight, stroke ? 1 : 0),
      opacity: finiteNumber(node.opacity, 1)
    },
    content:
      mapsAsImage
        ? imageContent
        : type === "TEXT"
        ? {
            type: "text",
            value: stringValue(node.characters) ?? "",
            font_size: finiteNumber(isRecord(node.style) ? node.style.fontSize : undefined, 16),
            font_family: stringValue(isRecord(node.style) ? node.style.fontFamily : undefined) ?? "Inter"
          }
        : { type: "empty" },
    children: []
  };

  if (frameImageContent && imageAsset) {
    mapped.children.push({
      id: `${nodeId}-image-fill`,
      kind: "image",
      name: `${mapped.name} image fill`,
      transform: { x: 0, y: 0, rotation: 0 },
      size: mapped.size,
      style: {
        fill: "#f3f4f6",
        stroke: null,
        stroke_width: 0,
        opacity: finiteNumber(node.opacity, 1)
      },
      content: frameImageContent,
      children: []
    });
    state.usedAssets.set(imageAsset.metadata.assetId, imageAsset);
  }

  if (mapsAsImage && imageAsset) {
    state.usedAssets.set(imageAsset.metadata.assetId, imageAsset);
  }

  if (type === "FRAME") {
    mapped.children = [...mapped.children, ...mapFigmaNodeChildren(node, bounds, state)];
  }

  return mapped;
}

function readFigmaPackage(entries: Map<string, Buffer>): {
  document: FigmaPackageDocument;
  assetsByRef: Map<string, FigmaPackageAsset>;
} | null {
  const document = [...entries.entries()]
    .filter(([entryPath]) => {
      const kind = entryKindForPath(entryPath);
      return kind === "document" || kind === "manifest" || kind === "metadata";
    })
    .map(([entryPath, data]) => ({ path: entryPath, json: parseJsonBuffer(data) }))
    .filter((entry): entry is FigmaPackageDocument => entry.json !== undefined && isFigmaJson(entry.json))
    .sort((left, right) => left.path.localeCompare(right.path))[0];
  if (!document) {
    return null;
  }

  return {
    document,
    assetsByRef: figmaPackageAssetsByRef(entries)
  };
}

function figmaPackageAssetsByRef(entries: Map<string, Buffer>): Map<string, FigmaPackageAsset> {
  const assetsByRef = new Map<string, FigmaPackageAsset>();
  const sortedEntries = [...entries.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [entryPath, data] of sortedEntries) {
    if (entryKindForPath(entryPath) !== "asset") {
      continue;
    }
    const mediaType = ASSET_MEDIA_TYPES.get(extensionForPath(entryPath));
    if (!mediaType || !IMPORTABLE_IMAGE_MEDIA_TYPES.has(mediaType)) {
      continue;
    }
    const imageRef = imageRefForAssetPath(entryPath);
    if (!imageRef || assetsByRef.has(imageRef)) {
      continue;
    }
    const dimensions = dimensionsForImage(data, mediaType);
    const assetId = figmaAssetStorageId(imageRef);
    assetsByRef.set(imageRef, {
      imageRef,
      path: entryPath,
      naturalWidth: dimensions?.width,
      naturalHeight: dimensions?.height,
      metadata: {
        assetId,
        name: fileNameForPath(entryPath),
        mimeType: mediaType,
        byteLength: data.length,
        url: `/assets/${assetId}`
      },
      data
    });
  }
  return assetsByRef;
}

function imagePaintForNode(value: unknown): { imageRef: string; fitMode: ImageFitMode } | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const paint = value.find((candidate) => {
    if (!isRecord(candidate)) {
      return false;
    }
    return candidate.type === "IMAGE" && candidate.visible !== false && typeof candidate.imageRef === "string";
  });
  if (!isRecord(paint)) {
    return null;
  }
  const imageRef = stringValue(paint.imageRef);
  if (!imageRef) {
    return null;
  }
  return {
    imageRef,
    fitMode: stringValue(paint.scaleMode) === "FIT" ? "fit" : "fill"
  };
}

function imageContentForAsset(
  asset: FigmaPackageAsset,
  imagePaint: { fitMode: ImageFitMode }
): Extract<DesignNode["content"], { type: "image" }> {
  const content: Extract<DesignNode["content"], { type: "image" }> = {
    type: "image",
    asset_id: asset.metadata.assetId,
    fit_mode: imagePaint.fitMode
  };
  if (asset.naturalWidth) {
    content.natural_width = asset.naturalWidth;
  }
  if (asset.naturalHeight) {
    content.natural_height = asset.naturalHeight;
  }
  return content;
}

function baseReview(input: {
  source: ExternalMigrationSource;
  archiveKind: ExternalMigrationArchiveKind;
  fileName?: string;
  entries: ExternalMigrationEntrySummary[];
  assetCandidates: ExternalMigrationAssetCandidate[];
  documentCandidates: ExternalMigrationDocumentCandidate[];
  blockedBy: string[];
  warnings: string[];
  canImport?: boolean;
}): ExternalMigrationReview {
  return {
    schemaVersion: 1,
    source: input.source,
    sourceLabel: sourceLabel(input.source),
    archiveKind: input.archiveKind,
    fileName: input.fileName,
    canImport: input.canImport ?? false,
    entryCount: input.entries.length,
    assetCount: input.assetCandidates.length,
    documentCandidateCount: input.documentCandidates.length,
    entries: input.entries,
    assetCandidates: input.assetCandidates,
    documentCandidates: input.documentCandidates,
    blockedBy: [...new Set(input.blockedBy)],
    warnings: input.warnings,
    nextSteps: nextStepsForSource(input.source, input.archiveKind)
  };
}

function summarizeEntry(entryPath: string, data: Buffer): ExternalMigrationEntrySummary {
  return {
    path: entryPath,
    kind: entryKindForPath(entryPath),
    bytes: data.length
  };
}

function entryKindForPath(entryPath: string): ExternalMigrationEntryKind {
  const normalized = entryPath.toLowerCase();
  const extension = extensionForPath(entryPath);
  if (normalized.endsWith("manifest.json")) {
    return "manifest";
  }
  if (normalized.endsWith("metadata.json") || normalized.includes("/metadata/")) {
    return "metadata";
  }
  if (ASSET_MEDIA_TYPES.has(extension) || normalized.startsWith("assets/") || normalized.includes("/assets/")) {
    return "asset";
  }
  if (JSON_TEXT_EXTENSIONS.has(extension)) {
    return "document";
  }
  return "unknown";
}

function summarizeJsonDocument(path: string, value: unknown): ExternalMigrationDocumentCandidate {
  const object = isRecord(value) ? value : {};
  const documentNode = isRecord(object.document) ? object.document : object;
  return {
    path,
    name: stringValue(object.name) ?? stringValue(documentNode.name) ?? path,
    pageCount: countPages(value),
    nodeCount: countDesignNodes(value)
  };
}

function detectSource(input: {
  fileName?: string;
  sourceHint?: ExternalMigrationSource;
  entries?: ExternalMigrationEntrySummary[];
  json?: unknown;
  documentCandidates?: ExternalMigrationDocumentCandidate[];
}): ExternalMigrationSource {
  if (input.sourceHint && input.sourceHint !== "unknown") {
    return input.sourceHint;
  }

  const fileName = input.fileName?.toLowerCase() ?? "";
  if (fileName.endsWith(".penpot")) {
    return "penpot";
  }
  if (fileName.endsWith(".fig") || fileName.endsWith(".figma") || fileName.endsWith(".figma.json")) {
    return "figma";
  }

  if (isFigmaJson(input.json)) {
    return "figma";
  }
  if (input.entries?.some((entry) => entry.path.toLowerCase().includes("penpot"))) {
    return "penpot";
  }
  if (input.documentCandidates?.some((candidate) => candidate.path.toLowerCase().includes("figma"))) {
    return "figma";
  }

  return "unknown";
}

function blockedByForSource(source: ExternalMigrationSource, archiveKind: ExternalMigrationArchiveKind): string[] {
  if (source === "figma") {
    return archiveKind === "binary"
      ? ["figma_api_json_required", "mapping_not_implemented"]
      : ["mapping_not_implemented", "figma_images_required"];
  }
  if (source === "penpot") {
    return ["mapping_not_implemented"];
  }
  return ["unsupported_source", "mapping_not_implemented"];
}

function nextStepsForSource(source: ExternalMigrationSource, archiveKind: ExternalMigrationArchiveKind): string[] {
  if (source === "figma") {
    return [
      "Export Figma structure with GET /v1/files/:key before enabling import.",
      "Export image fills with the Figma Images API and package them beside the JSON.",
      "Build the Layo mapper for frames, rectangles, text, images, styles, and assets."
    ];
  }
  if (source === "penpot") {
    return [
      "Use Penpot .penpot or ZIP export as the migration input.",
      "Map Penpot pages, shapes, text, assets, components, and tokens into Layo document primitives.",
      "Keep this preflight as the no-write review gate before enabling import."
    ];
  }
  return archiveKind === "binary"
    ? ["Provide a readable Penpot ZIP or Figma REST JSON export.", "Build a source-specific mapper before import."]
    : ["Classify the source format before enabling import.", "Build a source-specific mapper before import."];
}

function sourceLabel(source: ExternalMigrationSource): string {
  if (source === "penpot") {
    return "Penpot";
  }
  if (source === "figma") {
    return "Figma";
  }
  return "Unknown";
}

function countPages(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  if (Array.isArray(value.pages)) {
    return value.pages.length;
  }
  const documentNode = isRecord(value.document) ? value.document : value;
  const children = Array.isArray(documentNode.children) ? documentNode.children : [];
  const canvasCount = children.filter((child) => isRecord(child) && child.type === "CANVAS").length;
  return canvasCount || (children.length > 0 ? 1 : 0);
}

function countDesignNodes(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const documentNode = isRecord(value.document) ? value.document : value;
  if (Array.isArray(value.shapes)) {
    return value.shapes.length;
  }
  return countNodeTree(documentNode);
}

function countNodeTree(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const children = Array.isArray(value.children) ? value.children : [];
  return 1 + children.reduce((total, child) => total + countNodeTree(child), 0);
}

function isFigmaJson(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (isRecord(value.document) && value.document.type === "DOCUMENT") {
    return true;
  }
  return typeof value.version === "string" && isRecord(value.document);
}

function boundsForNode(node: JsonRecord): FigmaBounds {
  const absoluteBounds = isRecord(node.absoluteBoundingBox) ? node.absoluteBoundingBox : undefined;
  const size = isRecord(node.size) ? node.size : undefined;
  return {
    x: finiteNumber(absoluteBounds?.x, 0),
    y: finiteNumber(absoluteBounds?.y, 0),
    width: finiteNumber(absoluteBounds?.width ?? size?.x, 100),
    height: finiteNumber(absoluteBounds?.height ?? size?.y, 48)
  };
}

function solidPaintHex(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const paint = value.find((candidate) => {
    if (!isRecord(candidate)) {
      return false;
    }
    return candidate.type === "SOLID" && candidate.visible !== false && isRecord(candidate.color);
  });
  if (!isRecord(paint) || !isRecord(paint.color)) {
    return null;
  }
  return rgbToHex(paint.color);
}

function rgbToHex(color: JsonRecord): string {
  const red = colorChannelToHex(color.r);
  const green = colorChannelToHex(color.g);
  const blue = colorChannelToHex(color.b);
  return `#${red}${green}${blue}`;
}

function colorChannelToHex(value: unknown): string {
  return Math.round(Math.min(1, Math.max(0, finiteNumber(value, 0))) * 255)
    .toString(16)
    .padStart(2, "0");
}

function defaultFillForFigmaType(type: string): string {
  if (type === "TEXT") {
    return "#111827";
  }
  if (type === "FRAME") {
    return "#ffffff";
  }
  return "#e5e7eb";
}

function imageRefForAssetPath(entryPath: string): string | null {
  const fileName = fileNameForPath(entryPath);
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return stem.trim() || null;
}

function figmaAssetStorageId(imageRef: string): string {
  return `figma-asset-${storageIdSegment(imageRef)}`;
}

function figmaStorageId(value: unknown, fallback: string): string {
  const source = stringValue(value) ?? fallback;
  return `figma-${storageIdSegment(source)}`;
}

function safeStorageId(value: string | undefined, fallback: string): string {
  const source = value?.trim() || `${fallback}-${Date.now().toString(36)}`;
  return storageIdSegment(source);
}

function storageIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "imported";
}

function normalizeImportName(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback.trim() || "Imported Figma";
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function inputValidationError(message: string): Error {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "CANVAS_INPUT_VALIDATION";
  error.statusCode = 400;
  return error;
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

function normalizeSourceHint(value: ExternalMigrationSource | undefined): ExternalMigrationSource | undefined {
  return value === "penpot" || value === "figma" || value === "unknown" ? value : undefined;
}

function safeFileName(fileName: string | undefined): string | undefined {
  const value = fileName?.split(/[\\/]/).pop()?.trim();
  return value || undefined;
}

function extensionForPath(entryPath: string): string {
  const lastSegment = entryPath.toLowerCase().split("/").pop() ?? entryPath.toLowerCase();
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex >= 0 ? lastSegment.slice(dotIndex) : "";
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
