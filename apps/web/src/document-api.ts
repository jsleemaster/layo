import type { DesignToken, DesignTokenSet, DesignTokenTheme, RendererDocument } from "@layo/renderer";
import { apiUrl } from "./api-base";
import type { ProjectManifest } from "./project-api";

export interface FileVersionSummary {
  schemaVersion: 1;
  versionId: string;
  fileId: string;
  name: string;
  message: string;
  source: "manual" | "restore" | "auto";
  pinned: boolean;
  createdAt: string;
  nodeCount: number;
}

export interface FileVersion extends FileVersionSummary {
  document: RendererDocument;
}

export interface RestoreFileVersionResult {
  file: RendererDocument;
  restoredVersion: FileVersionSummary;
  recoveryVersion: FileVersionSummary;
}

export interface DeleteFileVersionResult extends FileVersionSummary {
  deleted: true;
}

export interface PruneFileVersionsResult {
  fileId: string;
  keepUnpinned: number;
  deletedVersions: DeleteFileVersionResult[];
  keptVersions: FileVersionSummary[];
}

export type CommentMentionTargetRole = "owner" | "editor" | "viewer";

export interface CommentMentionTarget {
  userId: string;
  displayName: string;
  role: CommentMentionTargetRole;
}

export interface CommentThread {
  schemaVersion: 1;
  threadId: string;
  fileId: string;
  nodeId: string;
  nodeName: string;
  body: string;
  authorName: string;
  createdAt: string;
  resolvedAt: string | null;
  mentions: string[];
  mentionTargets: CommentMentionTarget[];
  readBy: string[];
  unread?: boolean;
  replies: CommentReply[];
}

export interface CommentReply {
  schemaVersion: 1;
  replyId: string;
  body: string;
  authorName: string;
  createdAt: string;
  mentions: string[];
  mentionTargets: CommentMentionTarget[];
}

export interface CommentNotificationFileSummary {
  fileId: string;
  name: string;
  unreadCount: number;
  mentionCount: number;
}

export interface CommentNotificationProjectSummary {
  projectId: string;
  name: string;
  unreadCount: number;
  mentionCount: number;
  files: CommentNotificationFileSummary[];
}

export interface CommentNotificationSummary {
  viewerId: string;
  totalUnread: number;
  totalMentions: number;
  projects: CommentNotificationProjectSummary[];
}

export type CommentActivityType = "created" | "replied" | "resolved";

export interface CommentActivityEvent {
  schemaVersion: 1;
  eventId: string;
  type: CommentActivityType;
  projectId: string;
  projectName: string;
  fileId: string;
  fileName: string;
  threadId: string;
  replyId?: string;
  nodeId: string;
  nodeName: string;
  actorName: string;
  body: string;
  mentions: string[];
  mentionTargets: CommentMentionTarget[];
  createdAt: string;
}

export interface CommentActivityFeed {
  viewerId: string;
  events: CommentActivityEvent[];
}

export type CommentLiveEventType = "created" | "replied" | "resolved" | "read";

export interface CommentLiveEvent {
  schemaVersion: 1;
  eventId?: string;
  sequence?: number;
  type: CommentLiveEventType;
  fileId: string;
  threadId?: string;
  viewerId?: string;
  createdAt: string;
}

export interface SubscribeToCommentEventsOptions {
  fileId?: string;
  viewerId?: string;
  after?: number;
  onCommentEvent: (event: CommentLiveEvent) => void;
  onError?: () => void;
}

export interface CreateCommentThreadInput {
  nodeId: string;
  body: string;
  authorName?: string;
  mentionTargets?: CommentMentionTarget[];
}

export interface CreateCommentReplyInput {
  body: string;
  authorName?: string;
  mentionTargets?: CommentMentionTarget[];
}

export interface FileVersionChangeSummary {
  createdNodeIds: string[];
  updatedNodeIds: string[];
  removedNodeIds: string[];
  unchangedNodeCount: number;
  changedNodeIds: string[];
}

export interface FileArchiveReview {
  originalFileId: string;
  originalName: string;
  suggestedName: string;
  assetCount: number;
  pageCount: number;
  nodeCount: number;
}

export type ExternalMigrationSource = "penpot" | "figma" | "unknown";
export type ExternalMigrationArchiveKind = "zip" | "json" | "binary";
export type ExternalMigrationEntryKind = "manifest" | "document" | "asset" | "metadata" | "unknown";

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

export interface ReviewExternalMigrationArchiveOptions {
  fileName?: string;
  sourceHint?: ExternalMigrationSource;
}

export interface ImportExternalMigrationArchiveInput {
  archiveBase64: string;
  fileName?: string;
  sourceHint?: ExternalMigrationSource;
  projectId?: string;
  documentId?: string;
  name?: string;
  documentName?: string;
}

export interface ImportedExternalMigrationArchive {
  project: ProjectManifest;
  file: RendererDocument;
  source: ExternalMigrationSource;
  sourceLabel: string;
  assetCount: number;
  mappedNodeCount: number;
  skippedNodeCount: number;
  warnings: string[];
}

export interface ImportedFileArchive {
  fileId: string;
  name: string;
  originalFileId: string;
  originalName: string;
  assetCount: number;
}

export interface ImportFileArchiveInput {
  archiveBase64: string;
  fileId?: string;
  name?: string;
}

export interface ExportedFileArchiveDownload {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface LibraryArchiveReview {
  originalFileId: string;
  originalName: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  components: Array<{ originalComponentId: string; name: string; nodeCount: number; conflict: boolean }>;
  tokens: Array<{
    originalTokenId: string;
    name: string;
    type: "color" | "spacing";
    value: string;
    conflict: boolean;
  }>;
}

export interface ImportedLibraryArchive {
  fileId: string;
  originalFileId: string;
  originalName: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  componentIdMap: Record<string, string>;
  tokenIdMap: Record<string, string>;
}

export interface ImportLibraryArchiveInput {
  archiveBase64: string;
  idPrefix?: string;
}

export interface ExportedLibraryArchiveDownload {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface LibraryRegistryEntry {
  libraryId: string;
  name: string;
  sourceFileId: string;
  sourceName: string;
  teamId?: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  publishedAt: string;
  updatedAt: string;
}

export interface LibraryRegistryLiveEvent {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  type: "published";
  libraryId: string;
  libraryName: string;
  sourceFileId: string;
  sourceName: string;
  teamId?: string;
  componentCount: number;
  tokenCount: number;
  tokenSetCount: number;
  tokenThemeCount: number;
  assetCount: number;
  registryUpdatedAt: string;
  createdAt: string;
}

export interface LibraryRegistrySubscription {
  fileId: string;
  libraryId: string;
  libraryName: string;
  sourceFileId: string;
  sourceName: string;
  idPrefix?: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  componentIdMap: Record<string, string>;
  tokenIdMap: Record<string, string>;
  importedAt: string;
  importedRegistryUpdatedAt: string;
}

export interface LibraryRegistryUpdateNotification {
  fileId: string;
  libraryId: string;
  libraryName: string;
  sourceFileId: string;
  sourceName: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  importedRegistryUpdatedAt: string;
  registryUpdatedAt: string;
}

export interface LibraryRegistryTokenSubscription {
  fileId: string;
  libraryId: string;
  libraryName: string;
  sourceFileId: string;
  sourceName: string;
  tokenCount: number;
  tokenSetCount: number;
  tokenThemeCount: number;
  importedAt: string;
  importedRegistryUpdatedAt: string;
}

export interface LibraryRegistryTokenUpdateNotification {
  fileId: string;
  libraryId: string;
  libraryName: string;
  sourceFileId: string;
  sourceName: string;
  tokenCount: number;
  tokenSetCount: number;
  tokenThemeCount: number;
  importedRegistryUpdatedAt: string;
  registryUpdatedAt: string;
}

export interface PublishLibraryRegistryInput {
  libraryId?: string;
  name?: string;
}

export interface SubscribeToLibraryRegistryEventsOptions {
  fileId?: string;
  after?: number;
  onLibraryRegistryEvent: (event: LibraryRegistryLiveEvent) => void;
  onError?: EventListener;
}

export interface LibraryRegistryReview extends LibraryArchiveReview {
  libraryId: string;
  libraryName: string;
}

export interface ImportedLibraryRegistryItem extends ImportedLibraryArchive {
  libraryId: string;
  libraryName: string;
}

export interface ImportLibraryRegistryInput {
  libraryId: string;
  idPrefix?: string;
}

export interface LibraryRegistryTokenReview {
  libraryId: string;
  libraryName: string;
  originalFileId: string;
  originalName: string;
  tokenCount: number;
  tokenSetCount: number;
  tokenThemeCount: number;
  replacesTokenCount: number;
  replacesTokenSetCount: number;
  replacesTokenThemeCount: number;
  tokens: DesignToken[];
  tokenSets: DesignTokenSet[];
  tokenThemes: DesignTokenTheme[];
}

export interface ImportedLibraryRegistryTokens {
  fileId: string;
  libraryId: string;
  libraryName: string;
  originalFileId: string;
  originalName: string;
  tokenCount: number;
  tokenSetCount: number;
  tokenThemeCount: number;
  replacedTokenCount: number;
  replacedTokenSetCount: number;
  replacedTokenThemeCount: number;
}

export interface ExportCodeOptions {
  moduleBasePath?: string;
}

export interface CodeStructureNode {
  id: string;
  name: string;
  kind: string;
  className: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  style: {
    fill: string;
    fillToken?: string;
    stroke: string | null;
    strokeWidth: number;
    opacity: number;
    effectShadow?: string;
  };
  annotations: CodeHandoffAnnotation[];
  content:
    | { type: "empty" }
    | { type: "text"; value: string; fontSize: number; fontFamily: string }
    | { type: "image"; assetId: string; fitMode: "fill" | "fit" };
  componentRef?: {
    definitionId: string;
    detached: boolean;
    overrides: Array<{ nodeId: string; field: string; value: string }>;
  };
  repoMapping?: CodeComponentMappingArtifact;
  layout?: unknown;
  layout_item?: unknown;
  constraints?: unknown;
  children: CodeStructureNode[];
}

export interface CodeHandoffAnnotation {
  id: string;
  label: string;
  value: string;
  detail?: string;
  kind: "identity" | "geometry" | "style" | "content" | "layout" | "component" | "asset";
  sourceNodeIds: string[];
}

export interface CodeElementImplementation {
  componentName: string;
  suggestedProps: Array<{ name: string; type: "string"; sourceNodeId: string; defaultValue: string }>;
  slots: Array<{ name: string; sourceNodeIds: string[] }>;
  cssClassNames: string[];
  sourceNodeIds: string[];
  repoMapping?: CodeComponentMappingArtifact;
}

export interface CodeComponentMappingArtifact {
  id: string;
  componentId: string;
  packageName?: string;
  importPath: string;
  exportName: string;
  importMode: "named" | "default";
  importStatement: string;
  usage: string;
  props: Array<{
    name: string;
    type: "string";
    sourceNodeId: string;
    sourceField: "text";
    defaultValue: string;
  }>;
  variantProps: Array<{
    name: string;
    type: "string";
    variantProperty: string;
    defaultValue: string;
  }>;
  docsUrl?: string;
}

export interface CodeElementArtifact {
  id: string;
  name: string;
  className: string;
  html: string;
  css: string;
  jsModule: string;
  structure: CodeStructureNode;
  implementation: CodeElementImplementation;
}

export interface CodeExportPayload {
  css: string;
  html: string;
  elements: CodeElementArtifact[];
  implementationSpec: {
    elements: CodeElementArtifact[];
    components: unknown[];
    tokens: {
      tokenSets?: DesignTokenSet[];
      colors: DesignToken[];
      spacing: DesignToken[];
      typography?: DesignToken[];
    };
    tokenCandidates: {
      colors: string[];
      fontFamilies: string[];
      fontSizes: number[];
      spacings: number[];
    };
  };
  indexModule: string;
}

export function parseDocumentPayload(payload: unknown): RendererDocument {
  if (!payload || typeof payload !== "object" || !("file" in payload)) {
    throw new Error("문서 응답에 파일이 없습니다");
  }

  return (payload as { file: RendererDocument }).file;
}

export async function reviewFileArchive(
  archiveBase64: string,
  fetcher: typeof fetch = fetch
): Promise<FileArchiveReview> {
  const response = await fetcher(apiUrl("/files/import/archive/review"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archiveBase64 })
  });
  const payload = await readDocumentJson(response);
  return (payload as { review: FileArchiveReview }).review;
}

export async function reviewExternalMigrationArchive(
  archiveBase64: string,
  options: ReviewExternalMigrationArchiveOptions = {},
  fetcher: typeof fetch = fetch
): Promise<ExternalMigrationReview> {
  const response = await fetcher(apiUrl("/migrations/external/review"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      archiveBase64,
      fileName: options.fileName,
      sourceHint: options.sourceHint
    })
  });
  const payload = await readDocumentJson(response);
  return (payload as { review: ExternalMigrationReview }).review;
}

export async function importExternalMigrationArchive(
  input: ImportExternalMigrationArchiveInput,
  fetcher: typeof fetch = fetch
): Promise<ImportedExternalMigrationArchive> {
  const response = await fetcher(apiUrl("/migrations/external/import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedExternalMigrationArchive }).imported;
}

export async function importFileArchive(
  input: ImportFileArchiveInput,
  fetcher: typeof fetch = fetch
): Promise<ImportedFileArchive> {
  const response = await fetcher(apiUrl("/files/import/archive"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedFileArchive }).imported;
}

export async function exportFileArchive(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<ExportedFileArchiveDownload> {
  const response = await fetcher(apiUrl(`/files/${fileId}/export/archive`));
  if (!response.ok) {
    throw new Error(`문서 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  const mimeType = response.headers.get("Content-Type") ?? "application/vnd.layo.file-archive+zip";
  const fileName =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ?? `${fileId}.layo.zip`;
  return {
    blob: await response.blob(),
    fileName,
    mimeType
  };
}

export async function reviewLibraryArchive(
  fileId: string,
  archiveBase64: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryArchiveReview> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/review`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archiveBase64 })
  });
  const payload = await readDocumentJson(response);
  return (payload as { review: LibraryArchiveReview }).review;
}

export async function importLibraryArchive(
  fileId: string,
  input: ImportLibraryArchiveInput,
  fetcher: typeof fetch = fetch
): Promise<ImportedLibraryArchive> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedLibraryArchive }).imported;
}

export async function exportLibraryArchive(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<ExportedLibraryArchiveDownload> {
  const response = await fetcher(apiUrl(`/files/${fileId}/export/library`));
  if (!response.ok) {
    throw new Error(`문서 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  const mimeType = response.headers.get("Content-Type") ?? "application/vnd.layo.library-archive+zip";
  const fileName =
    parseContentDispositionFilename(response.headers.get("Content-Disposition")) ??
    `${fileId}.layo-library.zip`;
  return {
    blob: await response.blob(),
    fileName,
    mimeType
  };
}

export async function publishLibraryToRegistry(
  fileId: string,
  input: PublishLibraryRegistryInput = {},
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistryEntry> {
  const response = await fetcher(apiUrl("/libraries"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, ...input })
  });
  const payload = await readDocumentJson(response);
  return (payload as { library: LibraryRegistryEntry }).library;
}

export async function listLibraryRegistry(fetcher?: typeof fetch): Promise<LibraryRegistryEntry[]>;
export async function listLibraryRegistry(fileId: string, fetcher?: typeof fetch): Promise<LibraryRegistryEntry[]>;
export async function listLibraryRegistry(
  fileIdOrFetcher?: string | typeof fetch,
  maybeFetcher: typeof fetch = fetch
): Promise<LibraryRegistryEntry[]> {
  const fileId = typeof fileIdOrFetcher === "string" ? fileIdOrFetcher : undefined;
  const fetcher = typeof fileIdOrFetcher === "function" ? fileIdOrFetcher : maybeFetcher;
  const response = await fetcher(apiUrl(fileId ? `/libraries?fileId=${encodeURIComponent(fileId)}` : "/libraries"));
  const payload = await readDocumentJson(response);
  return (payload as { libraries: LibraryRegistryEntry[] }).libraries;
}

export async function reviewLibraryRegistryItem(
  fileId: string,
  libraryId: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistryReview> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/registry/review`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { review: LibraryRegistryReview }).review;
}

export async function importLibraryRegistryItem(
  fileId: string,
  input: ImportLibraryRegistryInput,
  fetcher: typeof fetch = fetch
): Promise<ImportedLibraryRegistryItem> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/registry`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedLibraryRegistryItem }).imported;
}

export async function reviewLibraryRegistryTokens(
  fileId: string,
  libraryId: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistryTokenReview> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/registry/tokens/review`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { review: LibraryRegistryTokenReview }).review;
}

export async function importLibraryRegistryTokens(
  fileId: string,
  libraryId: string,
  fetcher: typeof fetch = fetch
): Promise<ImportedLibraryRegistryTokens> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/registry/tokens`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedLibraryRegistryTokens }).imported;
}

export async function listLibraryRegistryTokenSubscriptions(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistryTokenSubscription[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/libraries/token-subscriptions`));
  const payload = await readDocumentJson(response);
  return (payload as { subscriptions: LibraryRegistryTokenSubscription[] }).subscriptions;
}

export async function listLibraryRegistryTokenUpdates(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistryTokenUpdateNotification[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/libraries/token-updates`));
  const payload = await readDocumentJson(response);
  return (payload as { updates: LibraryRegistryTokenUpdateNotification[] }).updates;
}

export async function updateLibraryRegistryTokens(
  fileId: string,
  libraryId: string,
  fetcher: typeof fetch = fetch
): Promise<ImportedLibraryRegistryTokens> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/registry/tokens/update`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedLibraryRegistryTokens }).imported;
}

export async function listLibraryRegistrySubscriptions(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistrySubscription[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/libraries/subscriptions`));
  const payload = await readDocumentJson(response);
  return (payload as { subscriptions: LibraryRegistrySubscription[] }).subscriptions;
}

export async function listLibraryRegistryUpdates(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<LibraryRegistryUpdateNotification[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/libraries/updates`));
  const payload = await readDocumentJson(response);
  return (payload as { updates: LibraryRegistryUpdateNotification[] }).updates;
}

export async function updateLibraryRegistryItem(
  fileId: string,
  libraryId: string,
  fetcher: typeof fetch = fetch
): Promise<ImportedLibraryRegistryItem> {
  const response = await fetcher(apiUrl(`/files/${fileId}/import/library/registry/update`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ libraryId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { imported: ImportedLibraryRegistryItem }).imported;
}

export async function exportCode(
  fileId: string,
  options: ExportCodeOptions = {},
  fetcher: typeof fetch = fetch
): Promise<CodeExportPayload> {
  const searchParams = new URLSearchParams();
  if (options.moduleBasePath?.trim()) {
    searchParams.set("moduleBasePath", options.moduleBasePath);
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const response = await fetcher(apiUrl(`/files/${fileId}/export/code${suffix}`));
  const payload = await readDocumentJson(response);
  return (payload as { export: CodeExportPayload }).export;
}

export async function exportDesignTokensDtcg(fileId: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(apiUrl(`/files/${fileId}/tokens/dtcg`));
  const payload = await readDocumentJson(response);
  return (payload as { tokens: unknown }).tokens;
}

export async function importDesignTokensDtcg(
  fileId: string,
  tokens: unknown,
  fetcher: typeof fetch = fetch
): Promise<RendererDocument> {
  const response = await fetcher(apiUrl(`/files/${fileId}/tokens/dtcg`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokens)
  });
  return parseDocumentPayload(await readDocumentJson(response));
}

export async function listFileVersions(
  fileId: string,
  fetcher: typeof fetch = fetch
): Promise<FileVersionSummary[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions`));
  const payload = await readDocumentJson(response);
  return (payload as { versions: FileVersionSummary[] }).versions;
}

export async function saveFileVersion(
  fileId: string,
  message: string,
  fetcher: typeof fetch = fetch
): Promise<FileVersionSummary> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  const payload = await readDocumentJson(response);
  return (payload as { version: FileVersionSummary }).version;
}

export async function readFileVersion(
  fileId: string,
  versionId: string,
  fetcher: typeof fetch = fetch
): Promise<FileVersion> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/${versionId}`));
  const payload = await readDocumentJson(response);
  return (payload as { version: FileVersion }).version;
}

export async function restoreFileVersion(
  fileId: string,
  versionId: string,
  fetcher: typeof fetch = fetch
): Promise<RestoreFileVersionResult> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/${versionId}/restore`), {
    method: "POST"
  });
  return (await readDocumentJson(response)) as RestoreFileVersionResult;
}

export async function setFileVersionPinned(
  fileId: string,
  versionId: string,
  pinned: boolean,
  fetcher: typeof fetch = fetch
): Promise<FileVersionSummary> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/${versionId}/pin`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned })
  });
  const payload = await readDocumentJson(response);
  return (payload as { version: FileVersionSummary }).version;
}

export async function deleteFileVersion(
  fileId: string,
  versionId: string,
  fetcher: typeof fetch = fetch
): Promise<DeleteFileVersionResult> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/${versionId}`), {
    method: "DELETE"
  });
  const payload = await readDocumentJson(response);
  return (payload as { version: DeleteFileVersionResult }).version;
}

export async function pruneFileVersions(
  fileId: string,
  keepUnpinned: number,
  fetcher: typeof fetch = fetch
): Promise<PruneFileVersionsResult> {
  const response = await fetcher(apiUrl(`/files/${fileId}/versions/prune`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keepUnpinned })
  });
  const payload = await readDocumentJson(response);
  return (payload as { result: PruneFileVersionsResult }).result;
}

export async function listCommentThreads(
  fileId: string,
  includeResolved = false,
  fetcher: typeof fetch = fetch,
  viewerId?: string
): Promise<CommentThread[]> {
  const params = new URLSearchParams();
  if (includeResolved) {
    params.set("includeResolved", "true");
  }
  if (viewerId?.trim()) {
    params.set("viewerId", viewerId);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetcher(apiUrl(`/files/${fileId}/comments${query}`));
  const payload = await readDocumentJson(response);
  return (payload as { threads: CommentThread[] }).threads;
}

export async function createCommentThread(
  fileId: string,
  input: CreateCommentThreadInput,
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function addCommentReply(
  fileId: string,
  threadId: string,
  input: CreateCommentReplyInput,
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/${threadId}/replies`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function resolveCommentThread(
  fileId: string,
  threadId: string,
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/${threadId}/resolve`), {
    method: "POST"
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function markCommentThreadRead(
  fileId: string,
  threadId: string,
  viewerId = "사용자",
  fetcher: typeof fetch = fetch
): Promise<CommentThread> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/${threadId}/read`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewerId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { thread: CommentThread }).thread;
}

export async function listCommentNotifications(
  viewerId = "사용자",
  fetcher: typeof fetch = fetch
): Promise<CommentNotificationSummary> {
  const params = new URLSearchParams();
  if (viewerId.trim()) {
    params.set("viewerId", viewerId);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetcher(apiUrl(`/comments/notifications${query}`));
  const payload = await readDocumentJson(response);
  return (payload as { summary: CommentNotificationSummary }).summary;
}

export async function listCommentActivity(
  viewerId = "사용자",
  limit = 10,
  fetcher: typeof fetch = fetch
): Promise<CommentActivityFeed> {
  const params = new URLSearchParams();
  if (viewerId.trim()) {
    params.set("viewerId", viewerId);
  }
  params.set("limit", String(limit));
  const response = await fetcher(apiUrl(`/comments/activity?${params.toString()}`));
  const payload = await readDocumentJson(response);
  return (payload as { feed: CommentActivityFeed }).feed;
}

export async function markFileCommentsRead(
  fileId: string,
  viewerId = "사용자",
  fetcher: typeof fetch = fetch
): Promise<CommentThread[]> {
  const response = await fetcher(apiUrl(`/files/${fileId}/comments/read`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewerId })
  });
  const payload = await readDocumentJson(response);
  return (payload as { threads: CommentThread[] }).threads;
}

export function subscribeToCommentEvents(options: SubscribeToCommentEventsOptions): () => void {
  if (typeof EventSource === "undefined") {
    return () => {};
  }

  const params = new URLSearchParams();
  if (options.viewerId?.trim()) {
    params.set("viewerId", options.viewerId);
  }
  if (options.fileId?.trim()) {
    params.set("fileId", options.fileId);
  }
  if (typeof options.after === "number" && Number.isFinite(options.after) && options.after > 0) {
    params.set("after", String(Math.floor(options.after)));
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const source = new EventSource(apiUrl(`/comments/events${query}`));
  const handleComment = (message: MessageEvent<string>) => {
    try {
      const event = JSON.parse(message.data) as Partial<CommentLiveEvent>;
      if (event.schemaVersion !== 1 || typeof event.fileId !== "string") {
        return;
      }
      options.onCommentEvent(event as CommentLiveEvent);
    } catch {
      // Ignore malformed stream messages. EventSource will keep the connection alive.
    }
  };

  source.addEventListener("comment", handleComment as EventListener);
  if (options.onError) {
    source.addEventListener("error", options.onError);
  }

  return () => {
    source.removeEventListener("comment", handleComment as EventListener);
    if (options.onError) {
      source.removeEventListener("error", options.onError);
    }
    source.close();
  };
}

export function subscribeToLibraryRegistryEvents(options: SubscribeToLibraryRegistryEventsOptions): () => void {
  if (typeof EventSource === "undefined") {
    return () => {};
  }

  const params = new URLSearchParams();
  if (options.fileId?.trim()) {
    params.set("fileId", options.fileId);
  }
  if (typeof options.after === "number" && Number.isFinite(options.after) && options.after > 0) {
    params.set("after", String(Math.floor(options.after)));
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const source = new EventSource(apiUrl(`/libraries/events${query}`));
  const handleLibraryRegistry = (message: MessageEvent<string>) => {
    try {
      const event = JSON.parse(message.data) as Partial<LibraryRegistryLiveEvent>;
      if (
        event.schemaVersion !== 1 ||
        event.type !== "published" ||
        typeof event.sequence !== "number" ||
        typeof event.libraryId !== "string" ||
        typeof event.registryUpdatedAt !== "string"
      ) {
        return;
      }
      options.onLibraryRegistryEvent(event as LibraryRegistryLiveEvent);
    } catch {
      // Ignore malformed stream messages. EventSource will keep the connection alive.
    }
  };

  source.addEventListener("library-registry", handleLibraryRegistry as EventListener);
  if (options.onError) {
    source.addEventListener("error", options.onError);
  }

  return () => {
    source.removeEventListener("library-registry", handleLibraryRegistry as EventListener);
    if (options.onError) {
      source.removeEventListener("error", options.onError);
    }
    source.close();
  };
}

export async function summarizeDocumentChanges(
  fileId: string,
  before: RendererDocument,
  after: RendererDocument,
  fetcher: typeof fetch = fetch
): Promise<FileVersionChangeSummary> {
  const response = await fetcher(apiUrl(`/files/${fileId}/agent/change-summary`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ before, after })
  });
  const payload = await readDocumentJson(response);
  return (payload as { summary: FileVersionChangeSummary }).summary;
}

async function readDocumentJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`문서 요청 실패: ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}

function parseContentDispositionFilename(header: string | null): string | null {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
