import { readZipArchive } from "./file-archive.js";

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
  canImport: false;
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

type JsonRecord = Record<string, unknown>;

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
  const documentCandidates = summaries
    .filter((entry) => entry.kind === "document" || entry.kind === "manifest" || entry.kind === "metadata")
    .flatMap((entry) => {
      const data = entries.get(entry.path);
      const parsed = data ? parseJsonBuffer(data) : undefined;
      return parsed === undefined ? [] : [summarizeJsonDocument(entry.path, parsed)];
    });
  const source = detectSource({
    fileName: options.fileName,
    sourceHint: options.sourceHint,
    entries: summaries,
    documentCandidates
  });

  return baseReview({
    source,
    archiveKind: "zip",
    fileName: options.fileName,
    entries: summaries,
    assetCandidates,
    documentCandidates,
    warnings,
    blockedBy: blockedByForSource(source, "zip")
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

  return baseReview({
    source,
    archiveKind: "json",
    fileName: options.fileName,
    entries: [entry],
    assetCandidates: [],
    documentCandidates: [documentCandidate],
    warnings: source === "figma" ? ["Figma image fills still require exported image assets from the Images API."] : [],
    blockedBy: blockedByForSource(source, "json")
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

function baseReview(input: {
  source: ExternalMigrationSource;
  archiveKind: ExternalMigrationArchiveKind;
  fileName?: string;
  entries: ExternalMigrationEntrySummary[];
  assetCandidates: ExternalMigrationAssetCandidate[];
  documentCandidates: ExternalMigrationDocumentCandidate[];
  blockedBy: string[];
  warnings: string[];
}): ExternalMigrationReview {
  return {
    schemaVersion: 1,
    source: input.source,
    sourceLabel: sourceLabel(input.source),
    archiveKind: input.archiveKind,
    fileName: input.fileName,
    canImport: false,
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
