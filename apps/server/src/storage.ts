import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  DocumentSnapshotConflictError,
  mergeConcurrentDocumentSnapshots as mergeRendererDocumentSnapshots
} from "@layo/renderer";
import {
  applyAgentCommandsToDocument,
  createAgentBatchResult,
  findNodes as findAgentNodes,
  getChangeSummary as summarizeChanges,
  inspectCanvas as inspectDesignFile,
  validateDocument as validateDesignFile,
  type AgentBatchInput,
  type AgentBatchResult,
  type AgentFindQuery,
  type AgentNodeSummary,
  type CanvasInspection,
  type ChangeSummary,
  type DocumentValidation
} from "./agent-control.js";
import {
  exportDesignToCode,
  type CodeExportOptions,
  type CodeExportResult
} from "./code-export.js";
import { applyAgentCommandsToCollaboration } from "./collaboration-agent.js";
import {
  exportDesignTokensToDtcg,
  importDesignTokenDocumentFromDtcg
} from "./design-token-io.js";
import {
  importExternalMigrationArchive as importExternalMigrationDesignArchive,
  type ExternalMigrationSource
} from "./external-migration.js";
import { createZipArchive, readZipArchive, type ZipArchiveEntry } from "./file-archive.js";
import {
  applyConstraintsAfterParentResize,
  normalizeNodeLayoutItem,
  relayoutDesignFile
} from "./layout.js";
import { sampleDocument } from "./sample-document.js";

const LEGACY_SAMPLE_PROJECT_ID = "sample-project";
const DEFAULT_STORAGE_DIR = ".layo";
const AUTO_FILE_VERSION_EDIT_INTERVAL = 3;
const COMMENT_ACTIVITY_RETENTION_LIMIT = 50;
const COMMENT_LIVE_EVENT_RETENTION_LIMIT = 200;
export const INPUT_VALIDATION_ERROR_CODE = "CANVAS_INPUT_VALIDATION";
export const FILE_ARCHIVE_MIME_TYPE = "application/vnd.layo.file-archive+zip";
export const PROJECT_ARCHIVE_MIME_TYPE = "application/vnd.layo.project-archive+zip";
export const LIBRARY_ARCHIVE_MIME_TYPE = "application/vnd.layo.library-archive+zip";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const storagePathMutationTails = new Map<string, Promise<void>>();
const assetReferenceMutationContext = new AsyncLocalStorage<ReadonlySet<string>>();
const STORAGE_PROCESS_LOCK_RETRY_MS = 25;
const STORAGE_PROCESS_LOCK_TIMEOUT_MS = 30_000;

interface StorageProcessLockOwner {
  schemaVersion: 1;
  token: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
}

async function acquireStorageProcessMutationLock(
  storagePath: string
): Promise<() => Promise<void>> {
  const storageRoot = path.dirname(path.dirname(storagePath));
  const locksDir = path.join(storageRoot, "locks");
  const resourceHash = createHash("sha256")
    .update(path.resolve(storagePath))
    .digest("hex");
  const lockName = `storage-mutation-${resourceHash}.lock`;
  const lockDir = path.join(locksDir, lockName);
  const ownerPath = path.join(lockDir, "owner.json");
  const owner: StorageProcessLockOwner = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: new Date().toISOString()
  };
  const timeoutMs = normalizeStorageProcessLockTimeout(
    process.env.LAYO_STORAGE_LOCK_TIMEOUT_MS
  );
  const staleMs = normalizeStorageProcessLockStale(
    process.env.LAYO_STORAGE_LOCK_STALE_MS
  );
  const startedAt = Date.now();

  await mkdir(locksDir, { recursive: true });
  while (true) {
    const candidateDir = path.join(locksDir, `${lockName}.candidate-${owner.token}`);
    const candidateOwnerPath = path.join(candidateDir, "owner.json");
    await mkdir(candidateDir);
    try {
      await writeFile(candidateOwnerPath, `${JSON.stringify(owner, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
      await syncDirectory(candidateDir);
      await rename(candidateDir, lockDir);
      await syncDirectory(locksDir);

      return async () => {
        const currentOwner = parseStorageProcessLockOwner(
          JSON.parse(await readFile(ownerPath, "utf8"))
        );
        if (currentOwner.token !== owner.token) {
          throw new Error("storage process mutation lock ownership changed before release");
        }
        const releasingDir = path.join(
          locksDir,
          `${lockName}.releasing-${owner.token}`
        );
        await rename(lockDir, releasingDir);
        await rm(releasingDir, { recursive: true, force: true });
        await syncDirectory(locksDir);
      };
    } catch (error) {
      await rm(candidateDir, { recursive: true, force: true });
      if (!isStorageProcessLockContention(error)) {
        throw error;
      }
    }

    if (await recoverAbandonedStorageProcessLock(lockDir, locksDir, staleMs)) {
      continue;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`storage process mutation lock timed out: ${lockDir}`);
    }
    await delay(STORAGE_PROCESS_LOCK_RETRY_MS);
  }
}

function isStorageProcessLockContention(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === "EEXIST" || code === "ENOTEMPTY";
}

async function recoverAbandonedStorageProcessLock(
  lockDir: string,
  locksDir: string,
  staleMs: number
): Promise<boolean> {
  const ownerPath = path.join(lockDir, "owner.json");
  let owner: StorageProcessLockOwner;
  try {
    owner = parseStorageProcessLockOwner(
      JSON.parse(await readFile(ownerPath, "utf8"))
    );
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return true;
    }
    throw error;
  }

  if (
    Date.now() - Date.parse(owner.acquiredAt) < staleMs
    || owner.hostname !== hostname()
    || isProcessAlive(owner.pid)
  ) {
    return false;
  }

  const claimPath = `${lockDir}.recovery-${owner.token}.claim`;
  try {
    await link(ownerPath, claimPath);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EEXIST") {
      return false;
    }
    if (code === "ENOENT") {
      return true;
    }
    throw error;
  }

  try {
    const claimedOwner = parseStorageProcessLockOwner(
      JSON.parse(await readFile(claimPath, "utf8"))
    );
    if (claimedOwner.token !== owner.token) {
      return false;
    }

    const abandonedDir = `${lockDir}.abandoned-${owner.token}-${randomUUID()}`;
    try {
      await rename(lockDir, abandonedDir);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return true;
      }
      throw error;
    }

    try {
      const movedOwner = parseStorageProcessLockOwner(
        JSON.parse(await readFile(path.join(abandonedDir, "owner.json"), "utf8"))
      );
      if (movedOwner.token !== owner.token) {
        throw new Error("storage process mutation lock changed during stale recovery");
      }
      await rm(abandonedDir, { recursive: true, force: true });
      await syncDirectory(locksDir);
      return true;
    } catch (error) {
      try {
        await rename(abandonedDir, lockDir);
      } catch {
        // Preserve the primary stale-recovery failure.
      }
      throw error;
    }
  } finally {
    await rm(claimPath, { force: true });
    await syncDirectory(locksDir);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === "EPERM";
  }
}

function normalizeStorageProcessLockTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 100
    ? Math.floor(parsed)
    : STORAGE_PROCESS_LOCK_TIMEOUT_MS;
}

function normalizeStorageProcessLockStale(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 50
    ? Math.floor(parsed)
    : 5_000;
}

function parseStorageProcessLockOwner(value: unknown): StorageProcessLockOwner {
  if (!value || typeof value !== "object") {
    throw new Error("invalid storage process mutation lock owner");
  }
  const candidate = value as Partial<StorageProcessLockOwner>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.token !== "string"
    || typeof candidate.pid !== "number"
    || !Number.isInteger(candidate.pid)
    || candidate.pid <= 0
    || typeof candidate.hostname !== "string"
    || typeof candidate.acquiredAt !== "string"
    || !Number.isFinite(Date.parse(candidate.acquiredAt))
  ) {
    throw new Error("invalid storage process mutation lock owner");
  }
  return {
    schemaVersion: 1,
    token: candidate.token,
    pid: candidate.pid,
    hostname: candidate.hostname,
    acquiredAt: candidate.acquiredAt
  };
}

async function withStoragePathMutationLock<T>(
  storagePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = storagePathMutationTails.get(storagePath) ?? Promise.resolve();
  let releaseInProcess!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseInProcess = resolve;
  });
  storagePathMutationTails.set(storagePath, current);
  await previous;
  let releaseProcessLock: (() => Promise<void>) | null = null;
  try {
    releaseProcessLock = await acquireStorageProcessMutationLock(storagePath);
    return await operation();
  } finally {
    try {
      await releaseProcessLock?.();
    } finally {
      releaseInProcess();
      if (storagePathMutationTails.get(storagePath) === current) {
        storagePathMutationTails.delete(storagePath);
      }
    }
  }
}

async function withAssetReferenceMutationLock<T>(
  storagePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const normalizedPath = path.resolve(storagePath);
  const activePaths = assetReferenceMutationContext.getStore();
  if (activePaths?.has(normalizedPath)) {
    return operation();
  }

  return withStoragePathMutationLock(storagePath, () =>
    assetReferenceMutationContext.run(
      new Set([...(activePaths ?? []), normalizedPath]),
      operation
    )
  );
}

export interface LayoutSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutSpacingTokens {
  gap?: string | null;
  row_gap?: string | null;
  column_gap?: string | null;
  padding_top?: string | null;
  padding_right?: string | null;
  padding_bottom?: string | null;
  padding_left?: string | null;
}

export interface GridTrack {
  type: "px" | "fr" | "auto";
  value?: number;
}

export interface GridArea {
  name: string;
  column: number;
  row: number;
  column_span: number;
  row_span: number;
}

export interface NodeLayout {
  mode: "none" | "auto" | "grid";
  direction: "horizontal" | "horizontal_reverse" | "vertical" | "vertical_reverse";
  wrap?: "nowrap" | "wrap";
  align_items: "start" | "center" | "end" | "stretch" | "baseline" | "last_baseline";
  justify_content: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
  justify_items?: "start" | "center" | "end" | "stretch";
  align_content?: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
  width_sizing?: "fixed" | "fit";
  height_sizing?: "fixed" | "fit";
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  gap: number;
  row_gap?: number;
  column_gap?: number;
  grid_columns?: number;
  grid_rows?: number;
  grid_column_tracks?: GridTrack[];
  grid_row_tracks?: GridTrack[];
  grid_areas?: GridArea[];
  spacing_tokens?: LayoutSpacingTokens | null;
  padding: LayoutSpacing;
}

export interface NodeLayoutItem {
  position?: "static" | "absolute";
  z_index?: number;
  width_sizing?: "fixed" | "fill";
  height_sizing?: "fixed" | "fill";
  justify_self?: "start" | "center" | "end" | "stretch";
  align_self?: "start" | "center" | "end" | "stretch" | "baseline" | "last_baseline";
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  grid_area?: string;
  grid_column?: number;
  grid_row?: number;
  grid_column_span?: number;
  grid_row_span?: number;
  margin: LayoutSpacing;
}

export interface NodeConstraints {
  horizontal: "left" | "right" | "left_right" | "center" | "scale";
  vertical: "top" | "bottom" | "top_bottom" | "center" | "scale";
}

export interface NodePaintPoint {
  x: number;
  y: number;
}

export interface NodePaintStop {
  color: string;
  opacity: number;
  offset: number;
}

export interface NodePaintGradient {
  type?: string;
  start?: NodePaintPoint;
  end?: NodePaintPoint;
  width?: number;
  stops?: NodePaintStop[];
}

export type NodePaint =
  | { type: "solid"; color: string }
  | { type: "gradient"; gradient: NodePaintGradient }
  | { type: "image"; asset_id: string };

export type NodeStrokePaint = NodePaint;
export type NodeFillPaint = NodePaint;
export type FillBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface NodeFill {
  id: string;
  /** Legacy solid fallback retained while older documents migrate. */
  color: string;
  paint?: NodeFillPaint;
  opacity: number;
  visible: boolean;
  blend_mode: FillBlendMode;
}

export type StrokePosition = "inside" | "center" | "outside";
export type StrokeStyle = "solid" | "dotted" | "dashed" | "mixed";
export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";
export type StrokeMarker = "none" | "line_arrow" | "triangle" | "square" | "circle" | "diamond";

export interface NodeStroke {
  id: string;
  /** Legacy solid fallback retained while older documents migrate. */
  color: string;
  paint?: NodeStrokePaint;
  opacity: number;
  width: number;
  position: StrokePosition;
  style: StrokeStyle;
  visible: boolean;
  dasharray: number[];
  cap: StrokeCap;
  join: StrokeJoin;
  start_marker: StrokeMarker;
  end_marker: StrokeMarker;
}

export type ImageFitMode = "fill" | "fit";
export type TextWritingMode = "horizontal_tb" | "vertical_rl" | "vertical_lr";
export type TextOrientation = "mixed" | "upright" | "sideways";
export type ExportPresetFormat = "png" | "jpeg" | "webp" | "svg" | "pdf";

export type BooleanPathOperation = "union" | "difference" | "intersection" | "exclusion";

export interface PathBooleanRelation {
  operation: BooleanPathOperation;
  source_node_ids: string[];
}

export interface NodeExportPreset {
  id: string;
  format: ExportPresetFormat;
  scale: number;
  suffix: string;
}

export interface DesignNode {
  id: string;
  kind: "frame" | "group" | "rectangle" | "text" | "image" | "path" | "component" | "component_instance";
  name: string;
  component_instance?: ComponentInstance | null;
  layout?: NodeLayout | null;
  layout_item?: NodeLayoutItem | null;
  constraints?: NodeConstraints | null;
  export_presets?: NodeExportPreset[];
  locked?: boolean;
  visible?: boolean;
  transform: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    fill_token?: string | null;
    fill_style?: string | null;
    /** Ordered authoritative fill stack. Legacy fill remains a migration input. */
    fills?: NodeFill[];
    stroke: string | null;
    stroke_width: number;
    /** Ordered authoritative stroke stack. Legacy stroke fields remain migration inputs. */
    strokes?: NodeStroke[];
    stroke_cap?: "butt" | "round" | "square";
    stroke_join?: "miter" | "round" | "bevel";
    stroke_dasharray?: number[];
    stroke_start_marker?: "none" | "line_arrow" | "triangle" | "square" | "circle" | "diamond";
    stroke_end_marker?: "none" | "line_arrow" | "triangle" | "square" | "circle" | "diamond";
    opacity: number;
    effect_shadow?: string | null;
    effect_shadows?: string[] | null;
    effect_shadow_token?: string | null;
    effect_shadow_style?: string | null;
  };
  content:
    | { type: "empty" }
    | {
        type: "text";
        value: string;
        font_size: number;
        font_family: string;
        writing_mode?: TextWritingMode;
        text_orientation?: TextOrientation;
        typography_token?: string | null;
        typography_style?: string | null;
      }
    | {
        type: "image";
        asset_id: string;
        natural_width?: number;
        natural_height?: number;
        fit_mode?: ImageFitMode;
      }
    | {
        type: "path";
        path_data: string;
        fill_rule: "nonzero" | "evenodd";
      }
    | {
        type: "boolean_path";
        relation: PathBooleanRelation;
        path_data: string;
        fill_rule: "nonzero" | "evenodd";
      };
  children: DesignNode[];
}

export interface ComponentDefinition {
  id: string;
  name: string;
  source_node: DesignNode;
  variant_area?: ComponentVariantArea | null;
  variants: Array<{ id: string; name: string; properties: ComponentProperty[]; source_node?: DesignNode | null }>;
}

export type ComponentVariantAreaLayout = "horizontal" | "vertical";

export interface ComponentVariantArea {
  layout: ComponentVariantAreaLayout;
  gap: number;
  padding: LayoutSpacing;
}

export type ComponentPropertyType = "select" | "boolean";

export interface ComponentProperty {
  name: string;
  value: string;
  type: ComponentPropertyType;
}

export interface ComponentInstance {
  definition_id: string;
  variant_id?: string | null;
  overrides: Array<{ node_id: string; field: string; value: string }>;
  detached: boolean;
}

type ComponentInstanceStyleOverrideField = "fill" | "fills" | "stroke" | "stroke_width" | "strokes" | "opacity" | "effect_shadow";
type ComponentInstanceGeometryOverrideField = "x" | "y" | "width" | "height";

const componentInstanceStyleOverrideFields: ComponentInstanceStyleOverrideField[] = [
  "fill",
  "fills",
  "stroke",
  "stroke_width",
  "strokes",
  "opacity",
  "effect_shadow"
];
const componentInstanceGeometryOverrideFields: ComponentInstanceGeometryOverrideField[] = [
  "x",
  "y",
  "width",
  "height"
];
const nullComponentOverrideValue = "__layo_component_override_null__";

export type CodeComponentMappingImportMode = "named" | "default";
export type CodeComponentMappingPropType = "string";
export type CodeComponentMappingSourceField = "text";

export interface CodeComponentMappingProp {
  name: string;
  type: CodeComponentMappingPropType;
  source_node_id: string;
  source_field: CodeComponentMappingSourceField;
  default_value: string;
}

export interface CodeComponentMappingVariantProp {
  name: string;
  type: CodeComponentMappingPropType;
  variant_property: string;
  default_value: string;
}

export interface CodeComponentMapping {
  id: string;
  component_id: string;
  package_name?: string;
  import_path: string;
  export_name: string;
  import_mode: CodeComponentMappingImportMode;
  props: CodeComponentMappingProp[];
  variant_props: CodeComponentMappingVariantProp[];
  docs_url?: string;
}

export interface DesignToken {
  id: string;
  name: string;
  type: "color" | "spacing" | "typography" | "shadow";
  value: string;
  set_id?: string | null;
}

export interface DesignTokenSet {
  id: string;
  name: string;
  enabled: boolean;
}

export interface DesignTokenTheme {
  id: string;
  name: string;
  group?: string | null;
  enabled: boolean;
  token_set_ids: string[];
}

export interface DesignStyle {
  id: string;
  name: string;
  type: "color" | "typography" | "effect";
  value: string;
}

export interface DesignFile {
  id: string;
  name: string;
  version?: number;
  tokens?: DesignToken[];
  token_sets?: DesignTokenSet[];
  token_themes?: DesignTokenTheme[];
  styles?: DesignStyle[];
  components?: ComponentDefinition[];
  code_mappings?: CodeComponentMapping[];
  pages: Array<{ id: string; name: string; children: DesignNode[] }>;
}

export type GeometryPatch = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export interface StoredFileSummary {
  id: string;
  name: string;
  path: string;
  modifiedAt: string;
}

export type FileVersionSource = "manual" | "restore" | "auto";

export interface StoredFileVersionSummary {
  schemaVersion: 1;
  versionId: string;
  fileId: string;
  name: string;
  message: string;
  source: FileVersionSource;
  pinned: boolean;
  createdAt: string;
  nodeCount: number;
}

export interface StoredFileVersion extends StoredFileVersionSummary {
  document: DesignFile;
}

export interface SaveFileVersionInput {
  message?: string;
  source?: FileVersionSource;
}

export interface RestoreFileVersionResult {
  file: DesignFile;
  restoredVersion: StoredFileVersionSummary;
  recoveryVersion: StoredFileVersionSummary;
}

export interface DeleteFileVersionResult extends StoredFileVersionSummary {
  deleted: true;
}

export interface PruneFileVersionsResult {
  fileId: string;
  keepUnpinned: number;
  deletedVersions: DeleteFileVersionResult[];
  keptVersions: StoredFileVersionSummary[];
}

export interface StoredCommentThread {
  schemaVersion: 1;
  threadId: string;
  fileId: string;
  nodeId: string;
  nodeName: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  modifiedAt: string;
  resolvedAt: string | null;
  mentions: string[];
  mentionTargets: StoredCommentMentionTarget[];
  readBy: string[];
  unread?: boolean;
  replies: StoredCommentReply[];
}

export interface StoredCommentReply {
  schemaVersion: 1;
  replyId: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  modifiedAt: string;
  mentions: string[];
  mentionTargets: StoredCommentMentionTarget[];
}

export type CommentActivityType = "created" | "replied" | "resolved";
export type CommentLiveEventType = CommentActivityType | "read" | "edited" | "deleted";
export type CommentMentionTargetRole = "owner" | "editor" | "viewer";

export interface StoredCommentMentionTarget {
  userId: string;
  displayName: string;
  role: CommentMentionTargetRole;
}

export interface StoredCommentActivityEvent {
  schemaVersion: 1;
  eventId: string;
  type: CommentActivityType;
  fileId: string;
  threadId: string;
  replyId?: string;
  nodeId: string;
  nodeName: string;
  actorName: string;
  body: string;
  mentions: string[];
  mentionTargets: StoredCommentMentionTarget[];
  createdAt: string;
}

export interface StoredCommentLiveEvent {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  type: CommentLiveEventType;
  fileId: string;
  threadId?: string;
  replyId?: string;
  viewerId?: string;
  createdAt: string;
}

export interface CreateCommentThreadInput {
  nodeId: string;
  body: string;
  authorId?: string;
  authorName?: string;
  mentionTargets?: StoredCommentMentionTarget[];
}

export interface CreateCommentReplyInput {
  body: string;
  authorId?: string;
  authorName?: string;
  mentionTargets?: StoredCommentMentionTarget[];
}

export interface UpdateCommentThreadInput {
  body: string;
  actorId: string;
  expectedModifiedAt: string;
  mentionTargets?: StoredCommentMentionTarget[];
}

export interface DeleteCommentThreadInput {
  actorId: string;
  expectedModifiedAt: string;
}

export interface UpdateCommentReplyInput extends UpdateCommentThreadInput {}

export interface DeleteCommentReplyInput extends DeleteCommentThreadInput {}

export interface DeleteCommentThreadResult {
  threadId: string;
  deleted: true;
}

export interface ListCommentThreadsOptions {
  includeResolved?: boolean;
  viewerId?: string;
}

export interface MarkCommentThreadReadInput {
  viewerId?: string;
}

export interface ListCommentNotificationsOptions {
  viewerId?: string;
}

export interface MarkFileCommentsReadInput {
  viewerId?: string;
}

export interface ListCommentActivityOptions {
  viewerId?: string;
  limit?: number;
}

export interface ListCommentLiveEventsOptions {
  fileId?: string;
  after?: number;
  limit?: number;
}

export interface CommentActivityEvent extends StoredCommentActivityEvent {
  projectId: string;
  projectName: string;
  fileName: string;
}

export interface CommentActivityFeed {
  viewerId: string;
  events: CommentActivityEvent[];
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

interface StoredCommentThreadFile {
  schemaVersion: 1;
  fileId: string;
  threads: StoredCommentThread[];
  activity: StoredCommentActivityEvent[];
  events: StoredCommentLiveEvent[];
}

interface AutoFileVersionState {
  schemaVersion: 1;
  fileId: string;
  editCount: number;
  lastAutoVersionId?: string;
  updatedAt: string;
}

export interface ProjectDocumentSummary {
  documentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectSharing =
  | { mode: "private" }
  | { mode: "team"; teamId: string };

export interface ProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentDocumentId: string;
  documents: ProjectDocumentSummary[];
  sharing: ProjectSharing;
}

export interface CreateProjectInput {
  projectId?: string;
  name?: string;
  documentId?: string;
  documentName?: string;
}

export interface UpdateProjectInput {
  name?: string;
  currentDocumentId?: string;
}

export interface CreateProjectDocumentInput {
  documentId?: string;
  name?: string;
}

export interface DuplicateProjectInput {
  projectId?: string;
  name?: string;
  documentIdPrefix?: string;
}

export interface CreateAssetInput {
  name?: string;
  mimeType: string;
  dataBase64: string;
}

export interface StoredAsset {
  assetId: string;
  name: string;
  mimeType: string;
  byteLength: number;
  url: string;
}

export interface StoredAssetData extends StoredAsset {
  data: Buffer;
}

export interface DeleteAssetResult {
  assetId: string;
  deleted: boolean;
  reason: "unreferenced" | "referenced" | "missing";
}

export interface FileArchiveManifest {
  schemaVersion: 1;
  format: "layo.file.archive";
  exportedAt: string;
  fileId: string;
  name: string;
  assetCount: number;
}

export interface ExportedFileArchive {
  fileId: string;
  name: string;
  assetCount: number;
  mimeType: typeof FILE_ARCHIVE_MIME_TYPE;
  fileName: string;
  archive: Buffer;
  manifest: FileArchiveManifest;
}

export interface ImportedFileArchive {
  fileId: string;
  name: string;
  originalFileId: string;
  originalName: string;
  assetCount: number;
}

export interface ReviewedFileArchive {
  originalFileId: string;
  originalName: string;
  suggestedName: string;
  assetCount: number;
  pageCount: number;
  nodeCount: number;
}

export interface ImportFileArchiveOptions {
  fileId?: string;
  name?: string;
}

export interface ProjectArchiveManifest {
  schemaVersion: 1;
  format: "layo.project.archive";
  exportedAt: string;
  projectId: string;
  name: string;
  currentDocumentId: string;
  documentCount: number;
  assetCount: number;
}

export interface ExportedProjectArchive {
  projectId: string;
  name: string;
  documentCount: number;
  assetCount: number;
  mimeType: typeof PROJECT_ARCHIVE_MIME_TYPE;
  fileName: string;
  archive: Buffer;
  manifest: ProjectArchiveManifest;
}

export interface ReviewedProjectArchiveDocument {
  originalFileId: string;
  originalName: string;
  pageCount: number;
  nodeCount: number;
}

export interface ReviewedProjectArchive {
  originalProjectId: string;
  originalName: string;
  suggestedName: string;
  documentCount: number;
  assetCount: number;
  documents: ReviewedProjectArchiveDocument[];
}

export interface ImportedProjectArchive {
  project: ProjectManifest;
  originalProjectId: string;
  originalName: string;
  documentCount: number;
  assetCount: number;
  documentIdMap: Record<string, string>;
}

export interface ImportProjectArchiveOptions {
  projectId?: string;
  name?: string;
  documentIdPrefix?: string;
}

export interface ImportExternalMigrationArchiveOptions {
  projectId?: string;
  documentId?: string;
  name?: string;
  documentName?: string;
  fileName?: string;
  sourceHint?: ExternalMigrationSource;
}

export interface ImportedExternalMigrationArchive {
  project: ProjectManifest;
  file: DesignFile;
  source: ExternalMigrationSource;
  sourceLabel: string;
  assetCount: number;
  mappedNodeCount: number;
  skippedNodeCount: number;
  warnings: string[];
}

export interface LibraryArchiveManifest {
  schemaVersion: 1;
  format: "layo.library.archive";
  exportedAt: string;
  fileId: string;
  name: string;
  componentCount: number;
  tokenCount: number;
  tokenSetCount?: number;
  tokenThemeCount?: number;
  assetCount: number;
}

export interface ExportedLibraryArchive {
  fileId: string;
  name: string;
  componentCount: number;
  tokenCount: number;
  tokenSetCount: number;
  tokenThemeCount: number;
  assetCount: number;
  mimeType: typeof LIBRARY_ARCHIVE_MIME_TYPE;
  fileName: string;
  archive: Buffer;
  manifest: LibraryArchiveManifest;
}

export interface ReviewedLibraryArchive {
  originalFileId: string;
  originalName: string;
  componentCount: number;
  tokenCount: number;
  tokenSetCount?: number;
  tokenThemeCount?: number;
  assetCount: number;
  components: Array<{ originalComponentId: string; name: string; nodeCount: number; conflict: boolean }>;
  tokens: Array<{
    originalTokenId: string;
    name: string;
    type: DesignToken["type"];
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
  tokenSetCount?: number;
  tokenThemeCount?: number;
  assetCount: number;
  componentIdMap: Record<string, string>;
  tokenIdMap: Record<string, string>;
}

export interface ImportLibraryArchiveOptions {
  idPrefix?: string;
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

export interface LibraryRegistryEvent {
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

export interface ListLibraryRegistryEventsOptions {
  after?: number;
  fileId?: string;
  limit?: number;
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

export interface LibraryRegistryDeletedComponentPreview {
  sourceComponentId: string;
  targetComponentId: string;
  affectedInstanceIds: string[];
}

export interface LibraryRegistryConflictedComponentPreview {
  sourceComponentId: string;
  targetComponentId: string;
  affectedInstanceIds: string[];
  missingOverrideNodeIds: string[];
}

export interface LibraryRegistryItemUpdatePreview {
  canUpdate: boolean;
  blockedBy: string[];
  deletedComponents: LibraryRegistryDeletedComponentPreview[];
  conflictedComponents: LibraryRegistryConflictedComponentPreview[];
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

export interface PublishLibraryRegistryOptions {
  libraryId?: string;
  name?: string;
  idempotencyKey?: string;
}

interface LibraryPublicationReceipt {
  schemaVersion: 1;
  idempotencyKey: string;
  fingerprint: string;
  entry: LibraryRegistryEntry;
}

export interface ReviewedLibraryRegistryItem extends ReviewedLibraryArchive {
  libraryId: string;
  libraryName: string;
}

export interface ImportedLibraryRegistryItem extends ImportedLibraryArchive {
  libraryId: string;
  libraryName: string;
}

export interface ReviewedLibraryRegistryTokens {
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

export class FileStorage {
  private readonly priorRootDir: string | null;
  private libraryUpdateRecoveryPromise: Promise<void> | null = null;

  constructor(private readonly rootDir = path.join(process.cwd(), DEFAULT_STORAGE_DIR)) {
    const defaultRootDir = path.resolve(process.cwd(), DEFAULT_STORAGE_DIR);
    this.priorRootDir =
      path.resolve(rootDir) === defaultRootDir
        ? path.join(process.cwd(), priorStorageDirectoryName())
        : null;
  }

  private get filesDir() {
    return path.join(this.rootDir, "files");
  }

  private get assetsDir() {
    return path.join(this.rootDir, "assets");
  }

  private get projectsDir() {
    return path.join(this.rootDir, "projects");
  }

  private get historyDir() {
    return path.join(this.rootDir, "history");
  }

  private get historyStateDir() {
    return path.join(this.rootDir, "history-state");
  }

  private get commentsDir() {
    return path.join(this.rootDir, "comments");
  }

  private get librariesDir() {
    return path.join(this.rootDir, "libraries");
  }

  private filePathFor(fileId: string) {
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    return path.join(this.filesDir, `${safeFileId}.json`);
  }

  private fileHistoryDirFor(fileId: string) {
    assertSafeStorageId(fileId);
    return path.join(this.historyDir, fileId);
  }

  private fileVersionPathFor(fileId: string, versionId: string) {
    assertSafeStorageId(versionId);
    return path.join(this.fileHistoryDirFor(fileId), `${versionId}.json`);
  }

  private fileHistoryStatePathFor(fileId: string) {
    assertSafeStorageId(fileId);
    return path.join(this.historyStateDir, `${fileId}.json`);
  }

  private commentThreadsPathFor(fileId: string) {
    assertSafeStorageId(fileId);
    return path.join(this.commentsDir, `${fileId}.json`);
  }

  private libraryRegistryPath() {
    return path.join(this.librariesDir, "registry.json");
  }

  private libraryRegistryEventsPath() {
    return path.join(this.librariesDir, "registry-events.json");
  }

  private librarySubscriptionsPath() {
    return path.join(this.librariesDir, "subscriptions.json");
  }

  private libraryTokenSubscriptionsPath() {
    return path.join(this.librariesDir, "token-subscriptions.json");
  }

  private libraryArchivePathFor(libraryId: string) {
    assertSafeStorageId(libraryId);
    return path.join(this.librariesDir, `${libraryId}.layo-library.zip`);
  }

  private libraryPublicationReceiptPathFor(libraryId: string, idempotencyKey: string) {
    assertSafeStorageId(libraryId);
    assertSafeStorageId(idempotencyKey);
    return path.join(
      this.librariesDir,
      "publication-receipts",
      libraryId,
      `${idempotencyKey}.json`
    );
  }

  private projectPathFor(projectId: string) {
    assertSafeStorageId(projectId);
    return path.join(this.projectsDir, `${projectId}.json`);
  }

  private assetPathFor(assetId: string) {
    assertSafeStorageId(assetId);
    return path.join(this.assetsDir, assetId);
  }

  private assetMetadataPathFor(assetId: string) {
    assertSafeStorageId(assetId);
    return path.join(this.assetsDir, `${assetId}.json`);
  }

  private assetReferenceMutationPath() {
    return path.join(this.filesDir, ".asset-references");
  }

  private async withFileMutationLock<T>(
    fileId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return withStoragePathMutationLock(
      this.filePathFor(fileId),
      () => withAssetReferenceMutationLock(this.assetReferenceMutationPath(), operation)
    );
  }

  private async withCommentMutationLock<T>(
    fileId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return withStoragePathMutationLock(this.commentThreadsPathFor(fileId), operation);
  }

  private async adoptPriorDefaultStoreIfNeeded() {
    if (!this.priorRootDir || (await pathExists(this.rootDir)) || !(await pathExists(this.priorRootDir))) {
      return;
    }

    await rename(this.priorRootDir, this.rootDir);
  }

  async prepareFiles() {
    await this.adoptPriorDefaultStoreIfNeeded();
    await this.recoverInterruptedLibraryUpdatesOnce();
    await mkdir(this.filesDir, { recursive: true });
    await this.removeUnreferencedLegacySampleDocument();
  }

  async prepareProjects() {
    await this.adoptPriorDefaultStoreIfNeeded();
    await this.recoverInterruptedLibraryUpdatesOnce();
    await mkdir(this.filesDir, { recursive: true });
    await mkdir(this.projectsDir, { recursive: true });
    await this.removeLegacySampleProject();
    await this.removeUnreferencedLegacySampleDocument();
  }

  private libraryUpdateRecoveryDir() {
    return path.join(this.rootDir, "recovery", "library-updates");
  }

  private libraryUpdateRecoveryPathFor(fileId: string) {
    assertSafeStorageId(fileId);
    return path.join(this.libraryUpdateRecoveryDir(), `${fileId}.json`);
  }

  private libraryPublicationRecoveryDir() {
    return path.join(this.rootDir, "recovery", "library-publications");
  }

  private libraryPublicationRecoveryPathFor(libraryId: string) {
    assertSafeStorageId(libraryId);
    return path.join(this.libraryPublicationRecoveryDir(), `${libraryId}.json`);
  }

  private async persistLibraryUpdateRecoveryJournal(
    fileId: string,
    original: StoragePathSnapshot[],
    intended: StoragePathSnapshot[],
    kind: LibraryUpdateRecoveryJournal["kind"] = "library-registry-update"
  ): Promise<void> {
    const journal: LibraryUpdateRecoveryJournal = {
      schemaVersion: 1,
      kind,
      fileId,
      original: original.map((snapshot) => serializeRecoverySnapshot(this.rootDir, snapshot)),
      intended: intended.map((snapshot) => serializeRecoverySnapshot(this.rootDir, snapshot))
    };
    const journalPath = kind === "library-registry-publication"
      ? this.libraryPublicationRecoveryPathFor(fileId)
      : this.libraryUpdateRecoveryPathFor(fileId);
    await mkdir(path.dirname(journalPath), { recursive: true });
    await durablyReplaceFile(
      journalPath,
      Buffer.from(`${JSON.stringify(journal, null, 2)}\n`, "utf8")
    );
  }

  private async removeLibraryUpdateRecoveryJournal(
    fileId: string,
    kind: LibraryUpdateRecoveryJournal["kind"] = "library-registry-update"
  ): Promise<void> {
    const journalPath = kind === "library-registry-publication"
      ? this.libraryPublicationRecoveryPathFor(fileId)
      : this.libraryUpdateRecoveryPathFor(fileId);
    await rm(journalPath, { force: true });
    await syncDirectory(path.dirname(journalPath));
  }

  private recoverInterruptedLibraryUpdatesOnce(): Promise<void> {
    this.libraryUpdateRecoveryPromise ??= this.recoverInterruptedLibraryUpdates();
    return this.libraryUpdateRecoveryPromise;
  }

  private async recoverInterruptedLibraryUpdates(): Promise<void> {
    const journalPaths: string[] = [];
    for (const recoveryDir of [
      this.libraryUpdateRecoveryDir(),
      this.libraryPublicationRecoveryDir()
    ]) {
      try {
        const entries = await readdir(recoveryDir);
        journalPaths.push(
          ...entries
            .filter((candidate) => candidate.endsWith(".json"))
            .map((entry) => path.join(recoveryDir, entry))
        );
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") {
          throw error;
        }
      }
    }

    for (const journalPath of journalPaths.sort()) {
      let pendingJournal: LibraryUpdateRecoveryJournal;
      try {
        pendingJournal = parseLibraryUpdateRecoveryJournal(
          JSON.parse(await readFile(journalPath, "utf8"))
        );
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") {
          continue;
        }
        throw error;
      }
      const recoverJournal = async (): Promise<void> => {
        let journal: LibraryUpdateRecoveryJournal;
        try {
          journal = parseLibraryUpdateRecoveryJournal(
            JSON.parse(await readFile(journalPath, "utf8"))
          );
        } catch (error) {
          if ((error as { code?: string }).code === "ENOENT") {
            return;
          }
          throw error;
        }
        const original = journal.original.map((snapshot) =>
          deserializeRecoverySnapshot(this.rootDir, snapshot)
        );
        const intended = new Map(
          journal.intended.map((snapshot) => {
            const restored = deserializeRecoverySnapshot(this.rootDir, snapshot);
            return [restored.filePath, restored.data] as const;
          })
        );
        const current = await captureStoragePathSnapshots(
          original.map((snapshot) => snapshot.filePath)
        );

        for (const snapshot of original) {
          const currentData = current.find(
            (candidate) => candidate.filePath === snapshot.filePath
          )?.data ?? null;
          const intendedData = intended.get(snapshot.filePath);
          if (
            !storageSnapshotDataEquals(currentData, snapshot.data)
            && (intendedData === undefined || !storageSnapshotDataEquals(currentData, intendedData))
          ) {
            const transactionName = journal.kind === "library-registry-publication"
              ? "library publication"
              : "library update";
            throw new StorageRollbackConflictError(
              `interrupted ${transactionName} path changed outside journal: ${snapshot.filePath}`
            );
          }
        }

        await restoreStoragePathSnapshots(original);
        await rm(journalPath, { force: true });
        await syncDirectory(path.dirname(journalPath));
      };

      if (pendingJournal.kind === "library-registry-publication") {
        await withStoragePathMutationLock(this.libraryRegistryPath(), recoverJournal);
      } else {
        await recoverJournal();
      }
    }
  }

  private async removeUnreferencedLegacySampleDocument() {
    const filePath = this.filePathFor(sampleDocument.id);
    if (!(await pathExists(filePath)) || (await this.isSampleDocumentReferencedByRealProject())) {
      return;
    }

    await unlink(filePath);
  }

  private async removeLegacySampleProject() {
    const projectPath = this.projectPathFor(LEGACY_SAMPLE_PROJECT_ID);
    const project = await readProjectIfPresent(projectPath);
    if (!project || !isLegacySampleProject(project)) {
      return;
    }

    await unlink(projectPath);
  }

  private async isSampleDocumentReferencedByRealProject() {
    let entries: string[];
    try {
      entries = await readdir(this.projectsDir);
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      const project = await readProjectIfPresent(path.join(this.projectsDir, entry));
      if (!project) {
        return true;
      }
      if (isLegacySampleProject(project)) {
        continue;
      }
      if (
        project.currentDocumentId === sampleDocument.id ||
        project.documents.some((document) => document.documentId === sampleDocument.id)
      ) {
        return true;
      }
    }

    return false;
  }

  async listFiles(): Promise<StoredFileSummary[]> {
    await this.prepareFiles();
    const entries = await readdir(this.filesDir);
    const files = entries.filter((entry) => entry.endsWith(".json"));

    return Promise.all(
      files.map(async (entry) => {
        const filePath = path.join(this.filesDir, entry);
        const raw = await readFile(filePath, "utf8");
        const document = JSON.parse(raw) as { id: string; name: string };
        const info = await stat(filePath);

        return {
          id: document.id,
          name: document.name,
          path: filePath,
          modifiedAt: info.mtime.toISOString()
        };
      })
    );
  }

  async listProjects(): Promise<ProjectManifest[]> {
    await this.prepareProjects();
    const entries = await readdir(this.projectsDir);
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const raw = await readFile(path.join(this.projectsDir, entry), "utf8");
          return parseProjectManifest(JSON.parse(raw));
        })
    );

    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async readProject(projectId: string): Promise<ProjectManifest> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const raw = await readFile(this.projectPathFor(projectId), "utf8");
    return parseProjectManifest(JSON.parse(raw));
  }

  async createProject(input: CreateProjectInput = {}): Promise<ProjectManifest> {
    const now = new Date().toISOString();
    const projectId = input.projectId ?? createStorageId("project");
    const documentId = input.documentId ?? createStorageId("document");
    assertSafeStorageId(projectId);
    assertSafeStorageId(documentId);
    const projectName = normalizeName(input.name, "새 프로젝트");
    const documentName = normalizeName(input.documentName, `${projectName} 문서`);

    await this.writeFile(documentId, createInitialDesignFile(documentId, documentName));
    return this.writeProject({
      schemaVersion: 1,
      projectId,
      name: projectName,
      createdAt: now,
      updatedAt: now,
      currentDocumentId: documentId,
      documents: [{ documentId, name: documentName, createdAt: now, updatedAt: now }],
      sharing: { mode: "private" }
    });
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectManifest> {
    const project = await this.readProject(projectId);
    const currentDocumentId = input.currentDocumentId ?? project.currentDocumentId;
    if (!project.documents.some((document) => document.documentId === currentDocumentId)) {
      throw new Error(`project document not found: ${currentDocumentId}`);
    }

    return this.writeProject({
      ...project,
      name: input.name === undefined ? project.name : normalizeName(input.name, project.name),
      currentDocumentId,
      updatedAt: new Date().toISOString()
    });
  }

  async createProjectDocument(
    projectId: string,
    input: CreateProjectDocumentInput = {}
  ): Promise<ProjectManifest> {
    const project = await this.readProject(projectId);
    const now = new Date().toISOString();
    const documentId = input.documentId ?? createStorageId("document");
    assertSafeStorageId(documentId);
    if (project.documents.some((document) => document.documentId === documentId)) {
      throw new Error(`project document already exists: ${documentId}`);
    }

    const name = normalizeName(input.name, "새 문서");
    await this.writeFile(documentId, createInitialDesignFile(documentId, name));
    return this.writeProject({
      ...project,
      updatedAt: now,
      currentDocumentId: documentId,
      documents: [...project.documents, { documentId, name, createdAt: now, updatedAt: now }]
    });
  }

  async setProjectSharing(projectId: string, sharing: ProjectSharing): Promise<ProjectManifest> {
    const project = await this.readProject(projectId);
    const nextSharing: ProjectSharing =
      sharing.mode === "team"
        ? { mode: "team", teamId: normalizeName(sharing.teamId, "") }
        : { mode: "private" };
    if (nextSharing.mode === "team" && !nextSharing.teamId) {
      throw new Error("team id is required for project sharing");
    }

    return this.writeProject({
      ...project,
      sharing: nextSharing,
      updatedAt: new Date().toISOString()
    });
  }

  async duplicateProject(
    sourceProjectId: string,
    input: DuplicateProjectInput = {}
  ): Promise<ProjectManifest> {
    const source = await this.readProject(sourceProjectId);
    const now = new Date().toISOString();
    const projectId = input.projectId ?? createStorageId("project");
    assertSafeStorageId(projectId);
    if (input.documentIdPrefix !== undefined) {
      assertSafeStorageId(input.documentIdPrefix);
    }
    if (await pathExists(this.projectPathFor(projectId))) {
      throw new Error(`project already exists: ${projectId}`);
    }

    const documents: ProjectDocumentSummary[] = [];
    let currentDocumentId = "";
    for (const sourceDocument of source.documents) {
      const documentId = input.documentIdPrefix
        ? `${input.documentIdPrefix}-${sourceDocument.documentId}`
        : createStorageId("document");
      assertSafeStorageId(documentId);
      if (await pathExists(this.filePathFor(documentId))) {
        throw new Error(`document already exists: ${documentId}`);
      }

      const document = await this.readFile(sourceDocument.documentId);
      const name = `${sourceDocument.name} 사본`;
      await this.writeFile(documentId, { ...structuredClone(document), id: documentId, name });
      documents.push({
        documentId,
        name,
        createdAt: now,
        updatedAt: now
      });
      if (sourceDocument.documentId === source.currentDocumentId) {
        currentDocumentId = documentId;
      }
    }

    return this.writeProject({
      schemaVersion: 1,
      projectId,
      name: normalizeName(input.name, `${source.name} 사본`),
      createdAt: now,
      updatedAt: now,
      currentDocumentId: currentDocumentId || documents[0].documentId,
      documents,
      sharing: { mode: "private" }
    });
  }

  async deleteProject(projectId: string): Promise<ProjectManifest> {
    const projects = await this.listProjects();
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      throw new Error(`project not found: ${projectId}`);
    }
    if (projects.length <= 1) {
      throw new Error("cannot delete last project");
    }

    const otherDocumentIds = new Set(
      projects
        .filter((candidate) => candidate.projectId !== projectId)
        .flatMap((candidate) => candidate.documents.map((document) => document.documentId))
    );
    await rm(this.projectPathFor(project.projectId), { force: true });
    await Promise.all(
      project.documents
        .filter((document) => !otherDocumentIds.has(document.documentId))
        .map((document) => rm(this.filePathFor(document.documentId), { force: true }))
    );

    return project;
  }

  async listCommentNotifications(
    options: ListCommentNotificationsOptions = {}
  ): Promise<CommentNotificationSummary> {
    const viewerId = normalizeName(options.viewerId, "사용자");
    const projects = await this.listProjects();
    const projectSummaries: Array<CommentNotificationProjectSummary & { latestUnreadAt: string }> = [];

    for (const project of projects) {
      const files: Array<CommentNotificationFileSummary & { latestUnreadAt: string }> = [];
      for (const document of project.documents) {
        const store = await this.readCommentThreadFile(document.documentId);
        const unreadThreads = unreadCommentThreads(store.threads, viewerId);
        const unreadCount = unreadThreads.length;
        const mentionCount = unreadThreads.filter((thread) => isCommentThreadMentionedForViewer(thread, viewerId)).length;
        if (unreadCount > 0) {
          files.push({
            fileId: document.documentId,
            name: document.name,
            unreadCount,
            mentionCount,
            latestUnreadAt: latestCommentThreadCreatedAt(unreadThreads)
          });
        }
      }

      files.sort(compareCommentNotificationRecency);
      const unreadCount = files.reduce((total, file) => total + file.unreadCount, 0);
      const mentionCount = files.reduce((total, file) => total + file.mentionCount, 0);
      if (unreadCount > 0) {
        projectSummaries.push({
          projectId: project.projectId,
          name: project.name,
          unreadCount,
          mentionCount,
          files: files.map(({ latestUnreadAt: _latestUnreadAt, ...file }) => file),
          latestUnreadAt: files[0]?.latestUnreadAt ?? new Date(0).toISOString()
        });
      }
    }

    projectSummaries.sort(compareCommentNotificationRecency);
    return {
      viewerId,
      totalUnread: projectSummaries.reduce((total, project) => total + project.unreadCount, 0),
      totalMentions: projectSummaries.reduce((total, project) => total + project.mentionCount, 0),
      projects: projectSummaries.map(({ latestUnreadAt: _latestUnreadAt, ...project }) => project)
    };
  }

  async listCommentActivity(options: ListCommentActivityOptions = {}): Promise<CommentActivityFeed> {
    const viewerId = normalizeName(options.viewerId, "사용자");
    const limit = normalizeListLimit(options.limit, COMMENT_ACTIVITY_RETENTION_LIMIT);
    const projects = await this.listProjects();
    const events: CommentActivityEvent[] = [];

    for (const project of projects) {
      for (const document of project.documents) {
        const store = await this.readCommentThreadFile(document.documentId);
        events.push(
          ...store.activity.map((event) => ({
            ...event,
            projectId: project.projectId,
            projectName: project.name,
            fileName: document.name
          }))
        );
      }
    }

    return {
      viewerId,
      events: events
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    };
  }

  async listCommentLiveEvents(
    options: ListCommentLiveEventsOptions = {}
  ): Promise<StoredCommentLiveEvent[]> {
    const after = Math.max(0, Math.floor(Number(options.after) || 0));
    const limit = Math.max(0, Math.floor(Number(options.limit) || 0));

    if (options.fileId) {
      await this.readFile(options.fileId);
      const store = await this.readCommentThreadFile(options.fileId);
      const events = store.events.filter((event) => event.sequence > after);
      return limit > 0 ? events.slice(-limit) : events;
    }

    const projects = await this.listProjects();
    const fileIds = new Set(
      projects.flatMap((project) => project.documents.map((document) => document.documentId))
    );
    const events: StoredCommentLiveEvent[] = [];
    for (const fileId of fileIds) {
      const store = await this.readCommentThreadFile(fileId);
      events.push(...store.events.filter((event) => event.sequence > after));
    }
    const sorted = events.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.fileId.localeCompare(b.fileId) || a.sequence - b.sequence
    );
    return limit > 0 ? sorted.slice(-limit) : sorted;
  }

  async readFile(fileId: string): Promise<DesignFile> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const filePath = this.filePathFor(fileId);
    const raw = await readFile(filePath, "utf8");
    const document = JSON.parse(raw) as DesignFile;
    if (document.id === sampleDocument.id && localizeLegacySampleLabels(document)) {
      await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    }
    return document;
  }

  async writeFile(fileId: string, document: DesignFile): Promise<DesignFile> {
    return this.withFileMutationLock(fileId, () =>
      this.writeFileWithoutMutationLock(fileId, document)
    );
  }

  async replaceFileSnapshot(
    fileId: string,
    document: DesignFile,
    baseDocument?: DesignFile
  ): Promise<DesignFile> {
    if (!document || typeof document !== "object" || !Array.isArray(document.pages)) {
      throw inputValidationError("document snapshot is required");
    }
    if (document.id !== fileId) {
      throw inputValidationError("document snapshot id must match the target file");
    }
    if (baseDocument && baseDocument.id !== fileId) {
      throw inputValidationError("base document snapshot id must match the target file");
    }

    return this.withFileMutationLock(fileId, async () => {
      const current = await this.readFile(fileId);
      const snapshot = baseDocument
        ? mergeConcurrentDocumentSnapshots(baseDocument, document, current)
        : structuredClone(document);
      const validation = validateDesignFile(snapshot);
      if (!validation.ok) {
        throw inputValidationError(
          `document snapshot is invalid: ${validation.issues.map((issue) => issue.message).join("; ")}`
        );
      }
      await this.writeFileWithoutMutationLock(fileId, snapshot);
      await this.recordFileEditForAutoVersion(fileId, snapshot);
      return snapshot;
    });
  }

  private async mutateFile<T>(
    fileId: string,
    mutation: (document: DesignFile) => Promise<T> | T,
    recordAutoVersion = true
  ): Promise<T> {
    return this.withFileMutationLock(fileId, async () => {
      const document = await this.readFile(fileId);
      const result = await mutation(document);
      await this.writeFileWithoutMutationLock(fileId, document);
      if (recordAutoVersion) {
        await this.recordFileEditForAutoVersion(fileId, document);
      }
      return result;
    });
  }

  private async writeFileWithoutMutationLock(
    fileId: string,
    document: DesignFile
  ): Promise<DesignFile> {
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.filesDir, { recursive: true });
    await writeFile(this.filePathFor(fileId), `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
  }

  private async writeFileDurablyWithoutMutationLock(
    fileId: string,
    document: DesignFile
  ): Promise<DesignFile> {
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.filesDir, { recursive: true });
    await durablyReplaceFile(
      this.filePathFor(fileId),
      Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8")
    );
    return document;
  }

  async exportFileArchive(fileId: string): Promise<ExportedFileArchive> {
    const document = await this.readFile(fileId);
    const assetIds = collectImageAssetIds(document);
    const assets = await Promise.all(assetIds.map((assetId) => this.readAsset(assetId)));
    const manifest: FileArchiveManifest = {
      schemaVersion: 1,
      format: "layo.file.archive",
      exportedAt: new Date().toISOString(),
      fileId: document.id,
      name: document.name,
      assetCount: assets.length
    };
    const entries: ZipArchiveEntry[] = [
      jsonArchiveEntry("manifest.json", manifest),
      jsonArchiveEntry("document.json", document),
      ...assets.flatMap((asset) => [
        jsonArchiveEntry(`assets/${asset.assetId}.json`, {
          assetId: asset.assetId,
          name: asset.name,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
          url: `/assets/${asset.assetId}`
        } satisfies StoredAsset),
        {
          path: `assets/${asset.assetId}.bin`,
          data: asset.data
        }
      ])
    ];

    return {
      fileId: document.id,
      name: document.name,
      assetCount: assets.length,
      mimeType: FILE_ARCHIVE_MIME_TYPE,
      fileName: `${document.id}.layo.zip`,
      archive: createZipArchive(entries),
      manifest
    };
  }

  async importFileArchive(
    archive: Buffer,
    options: ImportFileArchiveOptions = {}
  ): Promise<ImportedFileArchive> {
    const entries = readZipArchive(archive);
    const manifest = parseFileArchiveManifest(readJsonArchiveEntry(entries, "manifest.json"));
    const archivedDocument = parseDesignFileArchiveDocument(readJsonArchiveEntry(entries, "document.json"));
    if (archivedDocument.id !== manifest.fileId) {
      throw new Error(`file archive document mismatch: ${archivedDocument.id}`);
    }

    const fileId = options.fileId ?? archivedDocument.id;
    assertSafeStorageId(fileId);
    const document: DesignFile = {
      ...structuredClone(archivedDocument),
      id: fileId,
      name: normalizeName(options.name, archivedDocument.name)
    };
    const assetIds = collectImageAssetIds(document);
    if (assetIds.length !== manifest.assetCount) {
      throw new Error("file archive asset count mismatch");
    }

    const assets = readFileArchiveAssets(entries, assetIds);
    await Promise.all(assets.map((asset) => this.writeAsset(asset.metadata, asset.data)));
    await this.writeFile(fileId, document);
    return {
      fileId,
      name: document.name,
      originalFileId: manifest.fileId,
      originalName: manifest.name,
      assetCount: assetIds.length
    };
  }

  async reviewFileArchive(archive: Buffer): Promise<ReviewedFileArchive> {
    const entries = readZipArchive(archive);
    const manifest = parseFileArchiveManifest(readJsonArchiveEntry(entries, "manifest.json"));
    const archivedDocument = parseDesignFileArchiveDocument(readJsonArchiveEntry(entries, "document.json"));
    if (archivedDocument.id !== manifest.fileId) {
      throw new Error(`file archive document mismatch: ${archivedDocument.id}`);
    }

    const assetIds = collectImageAssetIds(archivedDocument);
    if (assetIds.length !== manifest.assetCount) {
      throw new Error("file archive asset count mismatch");
    }
    readFileArchiveAssets(entries, assetIds);

    return {
      originalFileId: manifest.fileId,
      originalName: manifest.name,
      suggestedName: archivedDocument.name,
      assetCount: assetIds.length,
      pageCount: archivedDocument.pages.length,
      nodeCount: countDocumentNodes(archivedDocument)
    };
  }

  async exportProjectArchive(projectId: string): Promise<ExportedProjectArchive> {
    const project = await this.readProject(projectId);
    const documents = await Promise.all(project.documents.map((document) => this.readFile(document.documentId)));
    const assetIds = collectProjectImageAssetIds(documents);
    const assets = await Promise.all(assetIds.map((assetId) => this.readAsset(assetId)));
    const manifest: ProjectArchiveManifest = {
      schemaVersion: 1,
      format: "layo.project.archive",
      exportedAt: new Date().toISOString(),
      projectId: project.projectId,
      name: project.name,
      currentDocumentId: project.currentDocumentId,
      documentCount: documents.length,
      assetCount: assets.length
    };
    const entries: ZipArchiveEntry[] = [
      jsonArchiveEntry("manifest.json", manifest),
      jsonArchiveEntry("project.json", project),
      ...documents.map((document) => jsonArchiveEntry(`documents/${document.id}.json`, document)),
      ...assets.flatMap((asset) => [
        jsonArchiveEntry(`assets/${asset.assetId}.json`, {
          assetId: asset.assetId,
          name: asset.name,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
          url: `/assets/${asset.assetId}`
        } satisfies StoredAsset),
        {
          path: `assets/${asset.assetId}.bin`,
          data: asset.data
        }
      ])
    ];

    return {
      projectId: project.projectId,
      name: project.name,
      documentCount: documents.length,
      assetCount: assets.length,
      mimeType: PROJECT_ARCHIVE_MIME_TYPE,
      fileName: `${project.projectId}.layo-project.zip`,
      archive: createZipArchive(entries),
      manifest
    };
  }

  async reviewProjectArchive(archive: Buffer): Promise<ReviewedProjectArchive> {
    const archiveProject = readProjectArchivePayload(readZipArchive(archive));
    return {
      originalProjectId: archiveProject.manifest.projectId,
      originalName: archiveProject.manifest.name,
      suggestedName: archiveProject.project.name,
      documentCount: archiveProject.documents.length,
      assetCount: archiveProject.assetIds.length,
      documents: archiveProject.documents.map((document) => ({
        originalFileId: document.id,
        originalName: document.name,
        pageCount: document.pages.length,
        nodeCount: countDocumentNodes(document)
      }))
    };
  }

  async importExternalMigrationArchive(
    archive: Buffer,
    options: ImportExternalMigrationArchiveOptions = {}
  ): Promise<ImportedExternalMigrationArchive> {
    const projectId = options.projectId ?? createStorageId("project");
    const documentId = options.documentId ?? createStorageId("document");
    assertSafeStorageId(projectId);
    assertSafeStorageId(documentId);
    if (await pathExists(this.projectPathFor(projectId))) {
      throw inputValidationError(`project already exists: ${projectId}`);
    }
    if (await pathExists(this.filePathFor(documentId))) {
      throw inputValidationError(`document already exists: ${documentId}`);
    }

    const imported = importExternalMigrationDesignArchive(archive, {
      fileId: documentId,
      fileName: options.fileName,
      sourceHint: options.sourceHint,
      name: options.documentName ?? options.name
    });
    const documentName = normalizeName(options.documentName ?? options.name, imported.file.name);
    const projectName = normalizeName(options.name, documentName);
    const now = new Date().toISOString();
    const file: DesignFile = {
      ...imported.file,
      id: documentId,
      name: documentName
    };
    const importedLibraries = imported.importedLibraries ?? [];
    const libraryFiles = importedLibraries.map((library) => ({
      sourceFileId: library.sourceFileId,
      file: structuredClone(library.file)
    }));
    const libraryFileIds = new Set<string>();
    for (const library of libraryFiles) {
      assertSafeStorageId(library.file.id);
      if (library.file.id === documentId || libraryFileIds.has(library.file.id)) {
        throw inputValidationError(`external migration library document id is ambiguous: ${library.file.id}`);
      }
      if (await pathExists(this.filePathFor(library.file.id))) {
        throw inputValidationError(`document already exists: ${library.file.id}`);
      }
      libraryFileIds.add(library.file.id);
    }

    await Promise.all(imported.importedAssets.map((asset) => this.writeAsset(asset.metadata, asset.data)));
    await this.writeFile(documentId, file);
    for (const library of libraryFiles) {
      await this.writeFile(library.file.id, library.file);
    }
    const documents: ProjectDocumentSummary[] = [
      { documentId, name: documentName, createdAt: now, updatedAt: now },
      ...libraryFiles.map((library) => ({
        documentId: library.file.id,
        name: library.file.name,
        createdAt: now,
        updatedAt: now
      }))
    ];
    const project = await this.writeProject({
      schemaVersion: 1,
      projectId,
      name: projectName,
      createdAt: now,
      updatedAt: now,
      currentDocumentId: documentId,
      documents,
      sharing: { mode: "private" }
    });

    for (const library of libraryFiles) {
      const entry = await this.publishLibraryToRegistry(library.file.id, {
        libraryId: library.file.id,
        name: library.file.name
      });
      const componentIdMap = Object.fromEntries(
        (library.file.components ?? []).map((component) => [component.id, component.id])
      );
      await this.upsertLibraryRegistrySubscription(
        documentId,
        entry,
        {
          fileId: documentId,
          originalFileId: library.sourceFileId,
          originalName: library.file.name,
          componentCount: library.file.components?.length ?? 0,
          tokenCount: library.file.tokens?.length ?? 0,
          assetCount: collectComponentImageAssetIds(library.file.components ?? []).length,
          componentIdMap,
          tokenIdMap: {},
          libraryId: entry.libraryId,
          libraryName: entry.name
        },
        undefined
      );
    }

    return {
      project,
      file,
      source: imported.source,
      sourceLabel: imported.sourceLabel,
      assetCount: imported.importedAssets.length,
      mappedNodeCount: imported.mappedNodeCount,
      skippedNodeCount: imported.skippedNodeCount,
      warnings: imported.warnings
    };
  }

  async importProjectArchive(
    archive: Buffer,
    options: ImportProjectArchiveOptions = {}
  ): Promise<ImportedProjectArchive> {
    const archiveProject = readProjectArchivePayload(readZipArchive(archive));
    const now = new Date().toISOString();
    const projectId = options.projectId ?? createStorageId("project");
    assertSafeStorageId(projectId);
    if (options.documentIdPrefix !== undefined) {
      assertSafeStorageId(options.documentIdPrefix);
    }
    if (await pathExists(this.projectPathFor(projectId))) {
      throw new Error(`project already exists: ${projectId}`);
    }

    const documentIdMap: Record<string, string> = {};
    for (const document of archiveProject.documents) {
      const nextDocumentId = options.documentIdPrefix
        ? `${options.documentIdPrefix}-${document.id}`
        : createStorageId("document");
      assertSafeStorageId(nextDocumentId);
      if (await pathExists(this.filePathFor(nextDocumentId))) {
        throw new Error(`document already exists: ${nextDocumentId}`);
      }
      documentIdMap[document.id] = nextDocumentId;
    }

    await Promise.all(archiveProject.assets.map((asset) => this.writeAsset(asset.metadata, asset.data)));

    const documents: ProjectDocumentSummary[] = [];
    for (const archivedSummary of archiveProject.project.documents) {
      const archivedDocument = archiveProject.documentsById.get(archivedSummary.documentId);
      const documentId = documentIdMap[archivedSummary.documentId];
      if (!archivedDocument || !documentId) {
        throw new Error(`project archive document missing: ${archivedSummary.documentId}`);
      }
      const document: DesignFile = {
        ...structuredClone(archivedDocument),
        id: documentId,
        name: normalizeName(archivedDocument.name, archivedSummary.name)
      };
      await this.writeFile(documentId, document);
      documents.push({
        documentId,
        name: document.name,
        createdAt: now,
        updatedAt: now
      });
    }

    const currentDocumentId = documentIdMap[archiveProject.project.currentDocumentId] ?? documents[0].documentId;
    const project = await this.writeProject({
      schemaVersion: 1,
      projectId,
      name: normalizeName(options.name, archiveProject.project.name),
      createdAt: now,
      updatedAt: now,
      currentDocumentId,
      documents,
      sharing: { mode: "private" }
    });

    return {
      project,
      originalProjectId: archiveProject.manifest.projectId,
      originalName: archiveProject.manifest.name,
      documentCount: archiveProject.documents.length,
      assetCount: archiveProject.assetIds.length,
      documentIdMap
    };
  }

  async exportLibraryArchive(fileId: string): Promise<ExportedLibraryArchive> {
    const document = await this.readFile(fileId);
    const tokens = document.tokens ?? [];
    const tokenSets = document.token_sets ?? [];
    const tokenThemes = document.token_themes ?? [];
    const components = document.components ?? [];
    const assetIds = collectComponentImageAssetIds(components);
    const assets = await Promise.all(assetIds.map((assetId) => this.readAsset(assetId)));
    const manifest: LibraryArchiveManifest = {
      schemaVersion: 1,
      format: "layo.library.archive",
      exportedAt: new Date().toISOString(),
      fileId: document.id,
      name: document.name,
      componentCount: components.length,
      tokenCount: tokens.length,
      tokenSetCount: tokenSets.length,
      tokenThemeCount: tokenThemes.length,
      assetCount: assets.length
    };
    const library: LibraryArchivePayloadFile = {
      fileId: document.id,
      name: document.name,
      tokens,
      token_sets: tokenSets,
      token_themes: tokenThemes,
      components
    };
    const entries: ZipArchiveEntry[] = [
      jsonArchiveEntry("manifest.json", manifest),
      jsonArchiveEntry("library.json", library),
      ...assets.flatMap((asset) => [
        jsonArchiveEntry(`assets/${asset.assetId}.json`, {
          assetId: asset.assetId,
          name: asset.name,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
          url: `/assets/${asset.assetId}`
        } satisfies StoredAsset),
        {
          path: `assets/${asset.assetId}.bin`,
          data: asset.data
        }
      ])
    ];

    return {
      fileId: document.id,
      name: document.name,
      componentCount: components.length,
      tokenCount: tokens.length,
      tokenSetCount: tokenSets.length,
      tokenThemeCount: tokenThemes.length,
      assetCount: assets.length,
      mimeType: LIBRARY_ARCHIVE_MIME_TYPE,
      fileName: `${document.id}.layo-library.zip`,
      archive: createZipArchive(entries),
      manifest
    };
  }

  async reviewLibraryArchive(fileId: string, archive: Buffer): Promise<ReviewedLibraryArchive> {
    const target = await this.readFile(fileId);
    const library = readLibraryArchivePayload(readZipArchive(archive));
    const tokenConflicts = library.library.tokens.map((token) => ({
      originalTokenId: token.id,
      name: token.name,
      type: token.type,
      value: token.value,
      conflict: hasConflictingToken(target, token)
    }));
    const componentConflicts = library.library.components.map((component) => ({
      originalComponentId: component.id,
      name: component.name,
      nodeCount: countNodeTree(component.source_node),
      conflict: Boolean((target.components ?? []).some((candidate) => candidate.id === component.id))
    }));

    return {
      originalFileId: library.manifest.fileId,
      originalName: library.manifest.name,
      componentCount: library.library.components.length,
      tokenCount: library.library.tokens.length,
      tokenSetCount: library.library.token_sets.length,
      tokenThemeCount: library.library.token_themes.length,
      assetCount: library.assetIds.length,
      components: componentConflicts,
      tokens: tokenConflicts
    };
  }

  async importLibraryArchive(
    fileId: string,
    archive: Buffer,
    options: ImportLibraryArchiveOptions = {}
  ): Promise<ImportedLibraryArchive> {
    return this.mutateFile(fileId, async (target) => {
    const library = readLibraryArchivePayload(readZipArchive(archive));
    const idPrefix = options.idPrefix?.trim() ? normalizeLibraryIdPrefix(options.idPrefix) : undefined;
    const tokenIdMap = createLibraryTokenIdMap(target, library.library.tokens, idPrefix);
    const componentIdMap = createLibraryComponentIdMap(target, library.library.components, idPrefix);

    await Promise.all(library.assets.map((asset) => this.writeAsset(asset.metadata, asset.data)));

    const targetTokens = [...(target.tokens ?? [])];
    for (const token of library.library.tokens) {
      const nextTokenId = tokenIdMap[token.id];
      if (!nextTokenId) {
        throw new Error(`library token missing from id map: ${token.id}`);
      }
      const existing = targetTokens.find((candidate) => candidate.id === nextTokenId);
      if (!existing) {
        targetTokens.push({ ...structuredClone(token), id: nextTokenId });
      }
    }

    const importedComponents = library.library.components.map((component) => {
      const nextComponentId = componentIdMap[component.id];
      if (!nextComponentId) {
        throw new Error(`library component missing from id map: ${component.id}`);
      }
      return remapLibraryComponent(component, nextComponentId, componentIdMap, tokenIdMap);
    });

    target.tokens = targetTokens;
    target.components = [...(target.components ?? []), ...importedComponents];

      return {
      fileId,
      originalFileId: library.manifest.fileId,
      originalName: library.manifest.name,
      componentCount: importedComponents.length,
      tokenCount: library.library.tokens.length,
      tokenSetCount: library.library.token_sets.length,
      tokenThemeCount: library.library.token_themes.length,
      assetCount: library.assetIds.length,
      componentIdMap,
      tokenIdMap
    };
    }, false);
  }

  async publishLibraryToRegistry(
    fileId: string,
    options: PublishLibraryRegistryOptions = {}
  ): Promise<LibraryRegistryEntry> {
    const exported = await this.exportLibraryArchive(fileId);
    const libraryId = normalizeLibraryRegistryId(options.libraryId ?? exported.fileId);
    const name = normalizeName(options.name, exported.name);
    const idempotencyKey = normalizeLibraryPublicationIdempotencyKey(options.idempotencyKey);
    const teamId = await this.findTeamIdForFile(fileId);
    const fingerprint = JSON.stringify({ fileId, libraryId, name, teamId: teamId ?? null });
    return withStoragePathMutationLock(this.libraryRegistryPath(), async () => {
      const existingEntries = await this.readLibraryRegistryEntries();
      const existing = existingEntries.find((entry) => entry.libraryId === libraryId);
      if (existing?.teamId && existing.teamId !== teamId) {
        throw forbiddenError(`library registry item is scoped to another team: ${libraryId}`);
      }
      const receiptPath = idempotencyKey
        ? this.libraryPublicationReceiptPathFor(libraryId, idempotencyKey)
        : undefined;
      if (receiptPath && await pathExists(receiptPath)) {
        const receipt = parseLibraryPublicationReceipt(
          JSON.parse(await readFile(receiptPath, "utf8"))
        );
        if (receipt.fingerprint !== fingerprint) {
          throw idempotencyConflictError(
            `library publication idempotency key was already used with another request: ${idempotencyKey}`
          );
        }
        return receipt.entry;
      }
      const now = nextIsoTimestamp(existing?.updatedAt);
      const entry: LibraryRegistryEntry = {
        libraryId,
        name,
        sourceFileId: exported.fileId,
        sourceName: exported.name,
        teamId,
        componentCount: exported.componentCount,
        tokenCount: exported.tokenCount,
        assetCount: exported.assetCount,
        publishedAt: existing?.publishedAt ?? now,
        updatedAt: now
      };
      const nextEntries = [
        entry,
        ...existingEntries.filter((candidate) => candidate.libraryId !== libraryId)
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const existingEvents = await this.readLibraryRegistryEvents();
      const nextEvent = this.createLibraryRegistryEvent(entry, exported, existingEvents);
      const nextEvents = [...existingEvents, nextEvent];
      const archivePath = this.libraryArchivePathFor(libraryId);
      const registryPath = this.libraryRegistryPath();
      const eventsPath = this.libraryRegistryEventsPath();
      const original = await captureStoragePathSnapshots([
        archivePath,
        registryPath,
        eventsPath,
        ...(receiptPath ? [receiptPath] : [])
      ]);
      const intended: StoragePathSnapshot[] = [
        { filePath: archivePath, data: exported.archive },
        {
          filePath: registryPath,
          data: Buffer.from(
            `${JSON.stringify({ schemaVersion: 1, libraries: nextEntries }, null, 2)}\n`,
            "utf8"
          )
        },
        {
          filePath: eventsPath,
          data: Buffer.from(
            `${JSON.stringify({ schemaVersion: 1, events: nextEvents }, null, 2)}\n`,
            "utf8"
          )
        },
        ...(receiptPath && idempotencyKey
          ? [{
              filePath: receiptPath,
              data: Buffer.from(
                `${JSON.stringify({
                  schemaVersion: 1,
                  idempotencyKey,
                  fingerprint,
                  entry
                } satisfies LibraryPublicationReceipt, null, 2)}\n`,
                "utf8"
              )
            }]
          : [])
      ];
      const recoveryId = libraryId;

      await this.persistLibraryUpdateRecoveryJournal(
        recoveryId,
        original,
        intended,
        "library-registry-publication"
      );
      try {
        await mkdir(this.librariesDir, { recursive: true });
        await durablyReplaceFile(archivePath, exported.archive);
        await this.writeLibraryRegistryEntries(nextEntries);
        await this.writeLibraryRegistryEvents(nextEvents);
        if (receiptPath && idempotencyKey) {
          await mkdir(path.dirname(receiptPath), { recursive: true });
          await durablyReplaceFile(
            receiptPath,
            Buffer.from(
              `${JSON.stringify({
                schemaVersion: 1,
                idempotencyKey,
                fingerprint,
                entry
              } satisfies LibraryPublicationReceipt, null, 2)}\n`,
              "utf8"
            )
          );
        }
        await this.removeLibraryUpdateRecoveryJournal(
          recoveryId,
          "library-registry-publication"
        );
        return entry;
      } catch (error) {
        try {
          await restoreStoragePathSnapshots(original);
          await this.removeLibraryUpdateRecoveryJournal(
            recoveryId,
            "library-registry-publication"
          );
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "library registry publication failed and rollback failed"
          );
        }
        throw error;
      }
    });
  }

  async listLibraryRegistry(): Promise<LibraryRegistryEntry[]>;
  async listLibraryRegistry(fileId: string): Promise<LibraryRegistryEntry[]>;
  async listLibraryRegistry(fileId?: string): Promise<LibraryRegistryEntry[]> {
    const entries = await this.readLibraryRegistryEntries();
    if (!fileId) {
      return entries;
    }
    return this.filterLibraryRegistryEntriesForFile(fileId, entries);
  }

  async listLibraryRegistryEvents(
    options: ListLibraryRegistryEventsOptions = {}
  ): Promise<LibraryRegistryEvent[]> {
    const after = Math.max(0, Math.floor(Number(options.after) || 0));
    const events = (await this.readLibraryRegistryEvents()).filter((event) => event.sequence > after);
    const visibleEvents = options.fileId
      ? await this.filterLibraryRegistryEventsForFile(options.fileId, events)
      : events;
    const limit = Math.max(0, Math.floor(Number(options.limit) || 0));
    return limit > 0 ? visibleEvents.slice(-limit) : visibleEvents;
  }

  async listLibraryRegistrySubscriptions(fileId?: string): Promise<LibraryRegistrySubscription[]> {
    const subscriptions = await this.readLibraryRegistrySubscriptions();
    if (!fileId) {
      return subscriptions;
    }
    const accessibleLibraries = new Set((await this.listLibraryRegistry(fileId)).map((entry) => entry.libraryId));
    return subscriptions.filter(
      (subscription) => subscription.fileId === fileId && accessibleLibraries.has(subscription.libraryId)
    );
  }

  async listLibraryRegistryUpdates(fileId?: string): Promise<LibraryRegistryUpdateNotification[]> {
    const [subscriptions, registry] = await Promise.all([
      this.listLibraryRegistrySubscriptions(fileId),
      this.readLibraryRegistryEntries()
    ]);
    const registryById = new Map(registry.map((entry) => [entry.libraryId, entry]));
    return subscriptions.flatMap((subscription) => {
      const entry = registryById.get(subscription.libraryId);
      if (!entry || entry.updatedAt <= subscription.importedRegistryUpdatedAt) {
        return [];
      }
      return [
        {
          fileId: subscription.fileId,
          libraryId: entry.libraryId,
          libraryName: entry.name,
          sourceFileId: entry.sourceFileId,
          sourceName: entry.sourceName,
          componentCount: entry.componentCount,
          tokenCount: entry.tokenCount,
          assetCount: entry.assetCount,
          importedRegistryUpdatedAt: subscription.importedRegistryUpdatedAt,
          registryUpdatedAt: entry.updatedAt
        }
      ];
    });
  }

  async listLibraryRegistryTokenSubscriptions(fileId?: string): Promise<LibraryRegistryTokenSubscription[]> {
    const subscriptions = await this.readLibraryRegistryTokenSubscriptions();
    if (!fileId) {
      return subscriptions;
    }
    const accessibleLibraries = new Set((await this.listLibraryRegistry(fileId)).map((entry) => entry.libraryId));
    return subscriptions.filter(
      (subscription) => subscription.fileId === fileId && accessibleLibraries.has(subscription.libraryId)
    );
  }

  async listLibraryRegistryTokenUpdates(fileId?: string): Promise<LibraryRegistryTokenUpdateNotification[]> {
    const [subscriptions, registry] = await Promise.all([
      this.listLibraryRegistryTokenSubscriptions(fileId),
      this.readLibraryRegistryEntries()
    ]);
    const registryById = new Map(registry.map((entry) => [entry.libraryId, entry]));
    const notifications = await Promise.all(
      subscriptions.map(async (subscription) => {
        const entry = registryById.get(subscription.libraryId);
        if (!entry || entry.updatedAt <= subscription.importedRegistryUpdatedAt) {
          return null;
        }
        const { archive } = await this.readLibraryRegistryArchive(entry.libraryId);
        const library = readLibraryArchivePayload(readZipArchive(archive));
        return {
          fileId: subscription.fileId,
          libraryId: entry.libraryId,
          libraryName: entry.name,
          sourceFileId: entry.sourceFileId,
          sourceName: entry.sourceName,
          tokenCount: library.library.tokens.length,
          tokenSetCount: library.library.token_sets.length,
          tokenThemeCount: library.library.token_themes.length,
          importedRegistryUpdatedAt: subscription.importedRegistryUpdatedAt,
          registryUpdatedAt: entry.updatedAt
        };
      })
    );
    return notifications.filter((notification): notification is LibraryRegistryTokenUpdateNotification => Boolean(notification));
  }

  async reviewLibraryRegistryItem(
    fileId: string,
    libraryId: string
  ): Promise<ReviewedLibraryRegistryItem> {
    const { entry, archive } = await this.readAccessibleLibraryRegistryArchive(fileId, libraryId);
    const review = await this.reviewLibraryArchive(fileId, archive);
    return {
      ...review,
      libraryId: entry.libraryId,
      libraryName: entry.name
    };
  }

  async importLibraryRegistryItem(
    fileId: string,
    libraryId: string,
    options: ImportLibraryArchiveOptions = {}
  ): Promise<ImportedLibraryRegistryItem> {
    const { entry, archive } = await this.readAccessibleLibraryRegistryArchive(fileId, libraryId);
    const imported = await this.importLibraryArchive(fileId, archive, options);
    const registryImport = {
      ...imported,
      libraryId: entry.libraryId,
      libraryName: entry.name
    };
    await this.upsertLibraryRegistrySubscription(fileId, entry, registryImport, options.idPrefix);
    return registryImport;
  }

  async reviewLibraryRegistryTokens(
    fileId: string,
    libraryId: string
  ): Promise<ReviewedLibraryRegistryTokens> {
    const target = await this.readFile(fileId);
    const { entry, archive } = await this.readAccessibleLibraryRegistryArchive(fileId, libraryId);
    const library = readLibraryArchivePayload(readZipArchive(archive));
    return {
      libraryId: entry.libraryId,
      libraryName: entry.name,
      originalFileId: library.manifest.fileId,
      originalName: library.manifest.name,
      tokenCount: library.library.tokens.length,
      tokenSetCount: library.library.token_sets.length,
      tokenThemeCount: library.library.token_themes.length,
      replacesTokenCount: (target.tokens ?? []).length,
      replacesTokenSetCount: (target.token_sets ?? []).length,
      replacesTokenThemeCount: (target.token_themes ?? []).length,
      tokens: structuredClone(library.library.tokens),
      tokenSets: structuredClone(library.library.token_sets),
      tokenThemes: structuredClone(library.library.token_themes)
    };
  }

  async importLibraryRegistryTokens(
    fileId: string,
    libraryId: string
  ): Promise<ImportedLibraryRegistryTokens> {
    const { entry, archive } = await this.readAccessibleLibraryRegistryArchive(fileId, libraryId);
    const imported = await this.replaceFileTokensFromLibraryRegistryArchive(fileId, entry, archive);
    await this.upsertLibraryRegistryTokenSubscription(fileId, entry, imported);
    return imported;
  }

  async updateLibraryRegistryTokens(
    fileId: string,
    libraryId: string
  ): Promise<ImportedLibraryRegistryTokens> {
    const normalizedLibraryId = normalizeLibraryRegistryId(libraryId);
    const subscription = (await this.listLibraryRegistryTokenSubscriptions(fileId)).find(
      (candidate) => candidate.libraryId === normalizedLibraryId
    );
    if (!subscription) {
      throw notFoundError(`library registry token subscription not found: ${normalizedLibraryId}`);
    }
    const { entry, archive } = await this.readAccessibleLibraryRegistryArchive(fileId, normalizedLibraryId);
    const imported = await this.replaceFileTokensFromLibraryRegistryArchive(fileId, entry, archive);
    await this.upsertLibraryRegistryTokenSubscription(fileId, entry, imported);
    return imported;
  }

  private async replaceFileTokensFromLibraryRegistryArchive(
    fileId: string,
    entry: LibraryRegistryEntry,
    archive: Buffer
  ): Promise<ImportedLibraryRegistryTokens> {
    return this.mutateFile(fileId, async (target) => {
    const library = readLibraryArchivePayload(readZipArchive(archive));
    const replacedTokenCount = (target.tokens ?? []).length;
    const replacedTokenSetCount = (target.token_sets ?? []).length;
    const replacedTokenThemeCount = (target.token_themes ?? []).length;

    target.tokens = structuredClone(library.library.tokens);
    target.token_sets = structuredClone(library.library.token_sets);
    target.token_themes = structuredClone(library.library.token_themes);

      return {
      fileId,
      libraryId: entry.libraryId,
      libraryName: entry.name,
      originalFileId: library.manifest.fileId,
      originalName: library.manifest.name,
      tokenCount: library.library.tokens.length,
      tokenSetCount: library.library.token_sets.length,
      tokenThemeCount: library.library.token_themes.length,
      replacedTokenCount,
      replacedTokenSetCount,
      replacedTokenThemeCount
    };
    }, false);
  }

  async reviewLibraryRegistryItemUpdate(
    fileId: string,
    libraryId: string
  ): Promise<LibraryRegistryItemUpdatePreview> {
    const normalizedLibraryId = normalizeLibraryRegistryId(libraryId);
    const subscription = (await this.listLibraryRegistrySubscriptions(fileId)).find(
      (candidate) => candidate.libraryId === normalizedLibraryId
    );
    if (!subscription) {
      throw notFoundError(`library registry subscription not found: ${normalizedLibraryId}`);
    }
    const { archive } = await this.readAccessibleLibraryRegistryArchive(
      fileId,
      normalizedLibraryId
    );
    const target = await this.readFile(fileId);
    const library = readLibraryArchivePayload(readZipArchive(archive));
    return reviewLibraryRegistryComponentUpdate(
      subscription,
      target,
      library.library.components
    );
  }

  async updateLibraryRegistryItem(
    fileId: string,
    libraryId: string
  ): Promise<ImportedLibraryRegistryItem> {
    return withStoragePathMutationLock(
      this.librarySubscriptionsPath(),
      () => this.withFileMutationLock(fileId, () =>
        this.updateLibraryRegistryItemLocked(fileId, libraryId)
      )
    );
  }

  private async updateLibraryRegistryItemLocked(
    fileId: string,
    libraryId: string
  ): Promise<ImportedLibraryRegistryItem> {
    const normalizedLibraryId = normalizeLibraryRegistryId(libraryId);
    const subscription = (await this.listLibraryRegistrySubscriptions(fileId)).find(
      (candidate) => candidate.libraryId === normalizedLibraryId
    );
    if (!subscription) {
      throw notFoundError(`library registry subscription not found: ${normalizedLibraryId}`);
    }
    const { entry, archive } = await this.readAccessibleLibraryRegistryArchive(
      fileId,
      normalizedLibraryId
    );
    const target = await this.readFile(fileId);
    const library = readLibraryArchivePayload(readZipArchive(archive));
    const preview = reviewLibraryRegistryComponentUpdate(
      subscription,
      target,
      library.library.components
    );
    if (!preview.canUpdate) {
      if (preview.conflictedComponents.length > 0) {
        throw inputValidationError(
          `library component override target is missing: ${preview.conflictedComponents
            .map((component) => component.sourceComponentId)
            .join(", ")}`
        );
      }
      throw inputValidationError(
        `library component deletion is in use: ${preview.deletedComponents
          .filter((component) => component.affectedInstanceIds.length > 0)
          .map((component) => component.sourceComponentId)
          .join(", ")}`
      );
    }

    const deletedTargetComponentIds = new Set(
      preview.deletedComponents.map((component) => component.targetComponentId)
    );
    const tokenIdMap = {
      ...createLibraryTokenIdMap(
        target,
        library.library.tokens.filter((token) => !subscription.tokenIdMap[token.id]),
        subscription.idPrefix
      ),
      ...subscription.tokenIdMap
    };
    const componentIdMap = {
      ...createLibraryComponentIdMap(
        target,
        library.library.components.filter((component) => !subscription.componentIdMap[component.id]),
        subscription.idPrefix
      ),
      ...subscription.componentIdMap
    };
    const updatedTokens = new Map(
      library.library.tokens.map((token) => {
        const nextTokenId = tokenIdMap[token.id];
        if (!nextTokenId) {
          throw new Error(`library token missing from id map: ${token.id}`);
        }
        return [nextTokenId, { ...structuredClone(token), id: nextTokenId }];
      })
    );
    const nextTokens = [...(target.tokens ?? [])];
    for (const [tokenId, token] of updatedTokens) {
      const index = nextTokens.findIndex((candidate) => candidate.id === tokenId);
      if (index === -1) {
        nextTokens.push(token);
      } else {
        nextTokens[index] = token;
      }
    }

    const updatedComponents = library.library.components.map((component) => {
      const nextComponentId = componentIdMap[component.id];
      if (!nextComponentId) {
        throw new Error(`library component missing from id map: ${component.id}`);
      }
      return remapLibraryComponent(component, nextComponentId, componentIdMap, tokenIdMap);
    });
    const updatedComponentIds = new Set(updatedComponents.map((component) => component.id));
    target.tokens = nextTokens;
    target.components = [
      ...(target.components ?? []).filter(
        (component) =>
          !updatedComponentIds.has(component.id)
          && !deletedTargetComponentIds.has(component.id)
      ),
      ...updatedComponents
    ];

    const rollbackSnapshots = await captureStoragePathSnapshots([
      ...library.assets.flatMap((asset) => [
        this.assetPathFor(asset.metadata.assetId),
        this.assetMetadataPathFor(asset.metadata.assetId)
      ]),
      this.librarySubscriptionsPath(),
      this.filePathFor(fileId)
    ]);
    const intendedSnapshots: StoragePathSnapshot[] = library.assets.flatMap((asset) => {
      const metadata = parseStoredAsset(asset.metadata);
      return [
        {
          filePath: this.assetPathFor(metadata.assetId),
          data: Buffer.from(asset.data)
        },
        {
          filePath: this.assetMetadataPathFor(metadata.assetId),
          data: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8")
        }
      ];
    });
    intendedSnapshots.push({
      filePath: this.filePathFor(fileId),
      data: Buffer.from(`${JSON.stringify(target, null, 2)}\n`, "utf8")
    });
    await this.persistLibraryUpdateRecoveryJournal(
      fileId,
      rollbackSnapshots,
      intendedSnapshots
    );

    const rollbackGuards: StoragePathSnapshot[] = [];
    try {
      for (const asset of library.assets) {
        await this.writeAssetDurably(asset.metadata, asset.data);
      }

      await this.writeFileDurablyWithoutMutationLock(fileId, target);
      rollbackGuards.push({
        filePath: this.filePathFor(fileId),
        data: Buffer.from(`${JSON.stringify(target, null, 2)}\n`, "utf8")
      });

      const imported: ImportedLibraryRegistryItem = {
        fileId,
        originalFileId: library.manifest.fileId,
        originalName: library.manifest.name,
        componentCount: updatedComponents.length,
        tokenCount: library.library.tokens.length,
        assetCount: library.assetIds.length,
        componentIdMap,
        tokenIdMap,
        libraryId: entry.libraryId,
        libraryName: entry.name
      };
      await this.upsertLibraryRegistrySubscription(
        fileId,
        entry,
        imported,
        subscription.idPrefix,
        (snapshot) => rollbackGuards.push(snapshot),
        async (snapshot) => {
          intendedSnapshots.push(snapshot);
          await this.persistLibraryUpdateRecoveryJournal(
            fileId,
            rollbackSnapshots,
            intendedSnapshots
          );
        }
      );
      await this.removeLibraryUpdateRecoveryJournal(fileId);
      return imported;
    } catch (error) {
      try {
        await restoreStoragePathSnapshots(rollbackSnapshots, rollbackGuards);
        await this.removeLibraryUpdateRecoveryJournal(fileId);
      } catch (rollbackError) {
        if (rollbackError instanceof StorageRollbackConflictError) {
          await this.removeLibraryUpdateRecoveryJournal(fileId);
        }
        throw new AggregateError(
          [error, rollbackError],
          rollbackError instanceof StorageRollbackConflictError
            ? "library registry update rollback conflicted with concurrent writes"
            : "library registry update failed and rollback failed"
        );
      }
      throw error;
    }
  }

  async listFileVersions(fileId: string): Promise<StoredFileVersionSummary[]> {
    await this.adoptPriorDefaultStoreIfNeeded();
    let entries: string[];
    try {
      entries = await readdir(this.fileHistoryDirFor(fileId));
    } catch {
      return [];
    }

    const versions = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const raw = await readFile(path.join(this.fileHistoryDirFor(fileId), entry), "utf8");
          return summarizeStoredFileVersion(parseStoredFileVersion(JSON.parse(raw), fileId));
        })
    );

    return versions.sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.versionId.localeCompare(a.versionId)
    );
  }

  async saveFileVersion(
    fileId: string,
    input: SaveFileVersionInput = {}
  ): Promise<StoredFileVersionSummary> {
    return this.withFileMutationLock(fileId, async () => {
      const document = await this.readFile(fileId);
      return this.writeFileVersion(fileId, document, input);
    });
  }

  async readFileVersion(fileId: string, versionId: string): Promise<StoredFileVersion> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const raw = await readFile(this.fileVersionPathFor(fileId, versionId), "utf8");
    return parseStoredFileVersion(JSON.parse(raw), fileId);
  }

  async setFileVersionPinned(
    fileId: string,
    versionId: string,
    pinned: boolean
  ): Promise<StoredFileVersionSummary> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const version = await this.readFileVersion(fileId, versionId);
    const updated: StoredFileVersion = { ...version, pinned };
    await writeFile(this.fileVersionPathFor(fileId, versionId), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    return summarizeStoredFileVersion(updated);
  }

  async deleteFileVersion(fileId: string, versionId: string): Promise<DeleteFileVersionResult> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const version = await this.readFileVersion(fileId, versionId);
    await unlink(this.fileVersionPathFor(fileId, versionId));
    return { ...summarizeStoredFileVersion(version), deleted: true };
  }

  async pruneFileVersions(
    fileId: string,
    options: { keepUnpinned: number }
  ): Promise<PruneFileVersionsResult> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const keepUnpinned = Math.max(0, Math.floor(Number(options.keepUnpinned) || 0));
    const versions = await this.listFileVersions(fileId);
    const unpinnedVersions = versions.filter((version) => !version.pinned);
    const deletedVersions = await Promise.all(
      unpinnedVersions.slice(keepUnpinned).map((version) => this.deleteFileVersion(fileId, version.versionId))
    );
    const deletedIds = new Set(deletedVersions.map((version) => version.versionId));
    return {
      fileId,
      keepUnpinned,
      deletedVersions,
      keptVersions: versions.filter((version) => !deletedIds.has(version.versionId))
    };
  }

  async restoreFileVersion(fileId: string, versionId: string): Promise<RestoreFileVersionResult> {
    const restoredVersion = await this.readFileVersion(fileId, versionId);
    return this.withFileMutationLock(fileId, async () => {
      const currentDocument = await this.readFile(fileId);
      const recoveryVersion = await this.writeFileVersion(fileId, currentDocument, {
        message: "복원 전 자동 저장",
        source: "restore"
      });
      const restoredDocument = { ...structuredClone(restoredVersion.document), id: fileId };
      await this.writeFileWithoutMutationLock(fileId, restoredDocument);
      return {
        file: restoredDocument,
        restoredVersion: summarizeStoredFileVersion(restoredVersion),
        recoveryVersion
      };
    });
  }

  async listCommentThreads(
    fileId: string,
    options: ListCommentThreadsOptions = {}
  ): Promise<StoredCommentThread[]> {
    await this.readFile(fileId);
    const store = await this.readCommentThreadFile(fileId);
    return store.threads
      .filter((thread) => options.includeResolved || thread.resolvedAt === null)
      .map((thread) => withViewerUnread(thread, options.viewerId));
  }

  async createCommentThread(
    fileId: string,
    input: CreateCommentThreadInput
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(input.nodeId);
    const document = await this.readFile(fileId);
    const node = findNodeById(document, input.nodeId);
    if (!node) {
      throw new Error(`node not found: ${input.nodeId}`);
    }

    const body = normalizeCommentBody(input.body);
    const authorName = normalizeName(input.authorName, "사용자");
    const authorId = normalizeName(input.authorId, authorName);
    return this.withCommentMutationLock(fileId, async () => {
      const now = createMonotonicCommentTimestamp();
      const thread: StoredCommentThread = {
        schemaVersion: 1,
        threadId: createStorageId("comment"),
        fileId,
        nodeId: node.id,
        nodeName: node.name,
        body,
        authorId,
        authorName,
        createdAt: now,
        modifiedAt: now,
        resolvedAt: null,
        mentions: extractCommentMentions(body),
        mentionTargets: normalizeCommentMentionTargetList(input.mentionTargets),
        readBy: [authorId],
        replies: []
      };
      const store = await this.readCommentThreadFile(fileId);
      await this.writeCommentThreadFile({
        ...store,
        threads: [thread, ...store.threads],
        activity: prependCommentActivity(store.activity, {
          type: "created",
          fileId,
          threadId: thread.threadId,
          nodeId: thread.nodeId,
          nodeName: thread.nodeName,
          actorName: thread.authorName,
          body: thread.body,
          mentions: thread.mentions,
          mentionTargets: thread.mentionTargets,
          createdAt: thread.createdAt
        }),
        events: appendCommentLiveEvent(store.events, {
          type: "created",
          fileId,
          threadId: thread.threadId,
          createdAt: thread.createdAt
        })
      });
      return thread;
    });
  }

  async updateCommentThread(
    fileId: string,
    threadId: string,
    input: UpdateCommentThreadInput
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const body = normalizeCommentBody(input.body);
    const actorId = normalizeCommentActorId(input.actorId);
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      assertCommentOwner(thread.authorId, actorId);
      assertCommentVersion(thread.modifiedAt, input.expectedModifiedAt);

      const modifiedAt = createMonotonicCommentTimestamp();
      const mentions = extractCommentMentions(body);
      const mentionTargets = normalizeCommentMentionTargetList(input.mentionTargets);
      const updatedThread: StoredCommentThread = {
        ...thread,
        body,
        modifiedAt,
        mentions,
        mentionTargets,
        readBy: [actorId]
      };
      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.map((candidate) =>
          candidate.threadId === threadId ? updatedThread : candidate
        ),
        activity: store.activity.map((event) =>
          event.threadId === threadId && !event.replyId
            ? { ...event, body, mentions, mentionTargets }
            : event
        ),
        events: appendCommentLiveEvent(store.events, {
          type: "edited",
          fileId,
          threadId,
          createdAt: modifiedAt
        })
      });
      return updatedThread;
    });
  }

  async deleteCommentThread(
    fileId: string,
    threadId: string,
    input: DeleteCommentThreadInput
  ): Promise<DeleteCommentThreadResult> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const actorId = normalizeCommentActorId(input.actorId);
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      assertCommentOwner(thread.authorId, actorId);
      assertCommentVersion(thread.modifiedAt, input.expectedModifiedAt);
      const deletedAt = createMonotonicCommentTimestamp();

      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.filter((candidate) => candidate.threadId !== threadId),
        activity: store.activity.filter((event) => event.threadId !== threadId),
        events: appendCommentLiveEvent(store.events, {
          type: "deleted",
          fileId,
          threadId,
          createdAt: deletedAt
        })
      });
      return { threadId, deleted: true };
    });
  }

  async addCommentReply(
    fileId: string,
    threadId: string,
    input: CreateCommentReplyInput
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const body = normalizeCommentBody(input.body);
    const authorName = normalizeName(input.authorName, "사용자");
    const authorId = normalizeName(input.authorId, authorName);
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      const createdAt = createMonotonicCommentTimestamp();
      const reply: StoredCommentReply = {
        schemaVersion: 1,
        replyId: createStorageId("reply"),
        body,
        authorId,
        authorName,
        createdAt,
        modifiedAt: createdAt,
        mentions: extractCommentMentions(body),
        mentionTargets: normalizeCommentMentionTargetList(input.mentionTargets)
      };
      const repliedThread: StoredCommentThread = {
        ...thread,
        modifiedAt: createdAt,
        readBy: [authorId],
        replies: [...thread.replies, reply]
      };
      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.map((candidate) =>
          candidate.threadId === threadId ? repliedThread : candidate
        ),
        activity: prependCommentActivity(store.activity, {
          type: "replied",
          fileId,
          threadId,
          replyId: reply.replyId,
          nodeId: thread.nodeId,
          nodeName: thread.nodeName,
          actorName: reply.authorName,
          body: reply.body,
          mentions: reply.mentions,
          mentionTargets: reply.mentionTargets,
          createdAt: reply.createdAt
        }),
        events: appendCommentLiveEvent(store.events, {
          type: "replied",
          fileId,
          threadId,
          replyId: reply.replyId,
          createdAt: reply.createdAt
        })
      });
      return repliedThread;
    });
  }

  async updateCommentReply(
    fileId: string,
    threadId: string,
    replyId: string,
    input: UpdateCommentReplyInput
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    assertSafeStorageId(replyId);
    await this.readFile(fileId);
    const body = normalizeCommentBody(input.body);
    const actorId = normalizeCommentActorId(input.actorId);
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      const reply = requireCommentReply(thread, replyId);
      assertCommentOwner(reply.authorId, actorId);
      assertCommentVersion(reply.modifiedAt, input.expectedModifiedAt);

      const modifiedAt = createMonotonicCommentTimestamp();
      const mentions = extractCommentMentions(body);
      const mentionTargets = normalizeCommentMentionTargetList(input.mentionTargets);
      const updatedReply: StoredCommentReply = {
        ...reply,
        body,
        modifiedAt,
        mentions,
        mentionTargets
      };
      const updatedThread: StoredCommentThread = {
        ...thread,
        modifiedAt,
        readBy: [actorId],
        replies: thread.replies.map((candidate) =>
          candidate.replyId === replyId ? updatedReply : candidate
        )
      };
      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.map((candidate) =>
          candidate.threadId === threadId ? updatedThread : candidate
        ),
        activity: store.activity.map((event) =>
          event.replyId === replyId
            ? { ...event, body, mentions, mentionTargets }
            : event
        ),
        events: appendCommentLiveEvent(store.events, {
          type: "edited",
          fileId,
          threadId,
          replyId,
          createdAt: modifiedAt
        })
      });
      return updatedThread;
    });
  }

  async deleteCommentReply(
    fileId: string,
    threadId: string,
    replyId: string,
    input: DeleteCommentReplyInput
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    assertSafeStorageId(replyId);
    await this.readFile(fileId);
    const actorId = normalizeCommentActorId(input.actorId);
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      const reply = requireCommentReply(thread, replyId);
      assertCommentOwner(reply.authorId, actorId);
      assertCommentVersion(reply.modifiedAt, input.expectedModifiedAt);

      const deletedAt = createMonotonicCommentTimestamp();
      const updatedThread: StoredCommentThread = {
        ...thread,
        modifiedAt: deletedAt,
        readBy: [actorId],
        replies: thread.replies.filter((candidate) => candidate.replyId !== replyId)
      };
      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.map((candidate) =>
          candidate.threadId === threadId ? updatedThread : candidate
        ),
        activity: store.activity.filter((event) => event.replyId !== replyId),
        events: appendCommentLiveEvent(store.events, {
          type: "deleted",
          fileId,
          threadId,
          replyId,
          createdAt: deletedAt
        })
      });
      return updatedThread;
    });
  }

  async markCommentThreadRead(
    fileId: string,
    threadId: string,
    input: MarkCommentThreadReadInput = {}
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const viewerId = normalizeName(input.viewerId, "사용자");
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      const readThread: StoredCommentThread = {
        ...thread,
        readBy: uniqueNames([...thread.readBy, viewerId])
      };
      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.map((candidate) =>
          candidate.threadId === threadId ? readThread : candidate
        ),
        events: appendCommentLiveEvent(store.events, {
          type: "read",
          fileId,
          threadId,
          viewerId,
          createdAt: createMonotonicCommentTimestamp()
        })
      });
      return withViewerUnread(readThread, viewerId);
    });
  }

  async markFileCommentsRead(
    fileId: string,
    input: MarkFileCommentsReadInput = {}
  ): Promise<StoredCommentThread[]> {
    await this.readFile(fileId);
    const viewerId = normalizeName(input.viewerId, "사용자");
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const threads = store.threads.map((thread) =>
        thread.resolvedAt === null
          ? {
              ...thread,
              readBy: uniqueNames([...thread.readBy, viewerId])
            }
          : thread
      );
      await this.writeCommentThreadFile({
        ...store,
        threads,
        events: appendCommentLiveEvent(store.events, {
          type: "read",
          fileId,
          viewerId,
          createdAt: createMonotonicCommentTimestamp()
        })
      });
      return threads.map((thread) => withViewerUnread(thread, viewerId));
    });
  }

  async resolveCommentThread(fileId: string, threadId: string): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    return this.withCommentMutationLock(fileId, async () => {
      const store = await this.readCommentThreadFile(fileId);
      const thread = requireCommentThread(store, threadId);
      const resolvedAt = thread.resolvedAt ?? createMonotonicCommentTimestamp();
      const resolvedThread: StoredCommentThread = {
        ...thread,
        modifiedAt: resolvedAt,
        resolvedAt
      };
      await this.writeCommentThreadFile({
        ...store,
        threads: store.threads.map((candidate) =>
          candidate.threadId === threadId ? resolvedThread : candidate
        ),
        activity: prependCommentActivity(store.activity, {
          type: "resolved",
          fileId,
          threadId,
          nodeId: thread.nodeId,
          nodeName: thread.nodeName,
          actorName: "사용자",
          body: thread.body,
          mentions: thread.mentions,
          mentionTargets: thread.mentionTargets,
          createdAt: resolvedAt
        }),
        events: appendCommentLiveEvent(store.events, {
          type: "resolved",
          fileId,
          threadId,
          createdAt: resolvedAt
        })
      });
      return resolvedThread;
    });
  }

  async exportTokensDtcg(fileId: string): Promise<Record<string, unknown>> {
    const document = await this.readFile(fileId);
    return exportDesignTokensToDtcg(document.tokens ?? [], document.token_sets ?? [], document.token_themes ?? []);
  }

  async importTokensDtcg(
    fileId: string,
    tokensDocument: unknown
  ): Promise<{ file: DesignFile; tokens: DesignToken[]; tokenSets: DesignTokenSet[]; tokenThemes: DesignTokenTheme[] }> {
    return this.mutateFile(fileId, async (document) => {
    const imported = importDesignTokenDocumentFromDtcg(tokensDocument);
    document.tokens = imported.tokens;
    if (imported.tokenSets.length) {
      document.token_sets = imported.tokenSets;
    } else {
      delete document.token_sets;
    }
    if (imported.tokenThemes.length) {
      document.token_themes = imported.tokenThemes;
    } else {
      delete document.token_themes;
    }
      return { file: document, tokens: imported.tokens, tokenSets: imported.tokenSets, tokenThemes: imported.tokenThemes };
    });
  }

  async updateNodeGeometry(fileId: string, nodeId: string, patch: GeometryPatch): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    const previousSize = { ...node.size };
    pinDirectGeometryResizeLayoutItemAxes(document, nodeId, patch);
    node.transform = {
      ...node.transform,
      x: patch.x ?? node.transform.x,
      y: patch.y ?? node.transform.y
    };
    node.size = {
      width: Math.max(1, patch.width ?? node.size.width),
      height: Math.max(1, patch.height ?? node.size.height)
    };
    applyConstraintsAfterParentResize(node, previousSize);
    relayoutDesignFile(document);
    syncComponentInstanceGeometryOverrides(document, nodeId, patch);

      return node;
    });
  }

  async setNodeFill(fileId: string, nodeId: string, fill: string): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    const fills = node.style.fills
      ? [{
          id: node.style.fills[0]?.id ?? "fill-1",
          color: fill,
          paint: { type: "solid" as const, color: fill },
          opacity: 1,
          visible: true,
          blend_mode: "normal" as const
        }]
      : undefined;
    node.style = { ...node.style, fill, ...(fills ? { fills } : {}), fill_token: null, fill_style: null };
    syncComponentInstanceStyleOverrides(
      document,
      nodeId,
      { fill, ...(fills ? { fills } : {}) },
      fills ? ["fill", "fills"] : ["fill"]
    );
    relayoutDesignFile(document);
      return node;
    });
  }

  async updateText(fileId: string, nodeId: string, value: string): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    if (node.content.type !== "text") {
      throw new Error(`node is not text: ${nodeId}`);
    }

    node.content = { ...node.content, value };
    syncComponentInstanceTextOverride(document, nodeId, value);
    relayoutDesignFile(document);
      return node;
    });
  }

  async replaceImageAsset(
    fileId: string,
    nodeId: string,
    input: { assetId: string; naturalWidth?: number; naturalHeight?: number }
  ): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    if (node.content.type !== "image") {
      throw new Error(`node is not image: ${nodeId}`);
    }

    const content: DesignNode["content"] = {
      type: "image",
      asset_id: input.assetId,
      fit_mode: node.content.fit_mode ?? "fill"
    };
    if (input.naturalWidth) {
      content.natural_width = Math.max(1, input.naturalWidth);
    }
    if (input.naturalHeight) {
      content.natural_height = Math.max(1, input.naturalHeight);
    }

    node.content = content;
    relayoutDesignFile(document);
      return node;
    });
  }

  async setImageFitMode(
    fileId: string,
    nodeId: string,
    fitMode: ImageFitMode
  ): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    if (node.content.type !== "image") {
      throw new Error(`node is not image: ${nodeId}`);
    }

    node.content = { ...node.content, fit_mode: fitMode };
    relayoutDesignFile(document);
      return node;
    });
  }

  async createNode(fileId: string, parentId: string, node: DesignNode): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const parent = findParentChildren(document, parentId);
    if (!parent) {
      throw new Error(`parent not found: ${parentId}`);
    }

    parent.children.push(node);
    relayoutDesignFile(document);
      return node;
    });
  }

  async createAsset(input: CreateAssetInput): Promise<StoredAsset> {
    const mimeType = normalizeImageMimeType(input.mimeType);
    const data = Buffer.from(input.dataBase64, "base64");
    if (data.length === 0) {
      throw new Error("asset data is required");
    }
    assertImageBytesMatchMimeType(data, mimeType);

    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.assetsDir, { recursive: true });
    const assetId = createStorageId("asset");
    const asset: StoredAsset = {
      assetId,
      name: normalizeName(input.name, "이미지"),
      mimeType,
      byteLength: data.length,
      url: `/assets/${assetId}`
    };
    await writeFile(this.assetPathFor(assetId), data);
    await writeFile(this.assetMetadataPathFor(assetId), `${JSON.stringify(asset, null, 2)}\n`, "utf8");
    return asset;
  }

  private async writeAsset(asset: StoredAsset, data: Buffer): Promise<StoredAsset> {
    const parsed = parseStoredAsset(asset);
    if (data.length !== parsed.byteLength) {
      throw new Error(`asset byte length mismatch: ${parsed.assetId}`);
    }
    assertImageBytesMatchMimeType(data, parsed.mimeType);
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.assetsDir, { recursive: true });
    await writeFile(this.assetPathFor(parsed.assetId), data);
    await writeFile(this.assetMetadataPathFor(parsed.assetId), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return parsed;
  }

  private async writeAssetDurably(asset: StoredAsset, data: Buffer): Promise<StoredAsset> {
    const parsed = parseStoredAsset(asset);
    if (data.length !== parsed.byteLength) {
      throw new Error(`asset byte length mismatch: ${parsed.assetId}`);
    }
    assertImageBytesMatchMimeType(data, parsed.mimeType);
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.assetsDir, { recursive: true });
    await durablyReplaceFile(this.assetPathFor(parsed.assetId), data);
    await durablyReplaceFile(
      this.assetMetadataPathFor(parsed.assetId),
      Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8")
    );
    return parsed;
  }

  async readAsset(assetId: string): Promise<StoredAssetData> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const raw = await readFile(this.assetMetadataPathFor(assetId), "utf8");
    const asset = parseStoredAsset(JSON.parse(raw));
    const data = await readFile(this.assetPathFor(asset.assetId));
    return { ...asset, data };
  }

  private async isAssetReferenced(assetId: string): Promise<boolean> {
    const files = await this.listFiles();
    for (const file of files) {
      const document = await this.readFile(file.id);
      if (collectImageAssetIds(document).includes(assetId)) {
        return true;
      }
      const versions = await this.listFileVersions(file.id);
      for (const version of versions) {
        const snapshot = await this.readFileVersion(file.id, version.versionId);
        if (collectImageAssetIds(snapshot.document).includes(assetId)) {
          return true;
        }
      }
    }
    return false;
  }

  async deleteAssetIfUnreferenced(assetId: string): Promise<DeleteAssetResult> {
    assertSafeStorageId(assetId);
    await this.adoptPriorDefaultStoreIfNeeded();
    return withAssetReferenceMutationLock(
      this.assetReferenceMutationPath(),
      () => withStoragePathMutationLock(this.assetMetadataPathFor(assetId), async () => {
        const assetPath = this.assetPathFor(assetId);
        const metadataPath = this.assetMetadataPathFor(assetId);
        if (!(await pathExists(assetPath)) && !(await pathExists(metadataPath))) {
          return { assetId, deleted: false, reason: "missing" };
        }
        if (await this.isAssetReferenced(assetId)) {
          return { assetId, deleted: false, reason: "referenced" };
        }

        await rm(assetPath, { force: true });
        await rm(metadataPath, { force: true });
        await syncDirectory(this.assetsDir);
        return { assetId, deleted: true, reason: "unreferenced" };
      })
    );
  }

  async listComponents(fileId: string): Promise<ComponentDefinition[]> {
    const document = await this.readFile(fileId);
    return document.components ?? [];
  }

  async listCodeComponentMappings(fileId: string): Promise<CodeComponentMapping[]> {
    const document = await this.readFile(fileId);
    return document.code_mappings ?? [];
  }

  async setCodeComponentMappings(
    fileId: string,
    mappings: CodeComponentMapping[]
  ): Promise<CodeComponentMapping[]> {
    return this.mutateFile(fileId, async (document) => {
    const componentIds = new Set((document.components ?? []).map((component) => component.id));
    const parsed = mappings.map((mapping) => parseCodeComponentMapping(mapping));

    for (const mapping of parsed) {
      if (!componentIds.has(mapping.component_id)) {
        throw inputValidationError(`code mapping component not found: ${mapping.component_id}`);
      }
    }

    document.code_mappings = parsed;
      return parsed;
    });
  }

  async createComponent(
    fileId: string,
    nodeId: string,
    input: { componentId: string; name: string }
  ): Promise<ComponentDefinition> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    node.kind = "component";
    node.component_instance = null;
    const component: ComponentDefinition = {
      id: input.componentId,
      name: input.name,
      source_node: structuredClone(node),
      variants: [{ id: "default", name: "Default", properties: [] }]
    };
    document.components = document.components ?? [];
    document.components.push(component);
    relayoutDesignFile(document);
      return component;
    });
  }

  async createComponentInstance(
    fileId: string,
    input: { parentId: string; definitionId: string; instanceId: string; x: number; y: number }
  ): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const parent = findParentChildren(document, input.parentId);
    if (!parent) {
      throw new Error(`parent not found: ${input.parentId}`);
    }

    const definition = (document.components ?? []).find((component) => component.id === input.definitionId);
    if (!definition) {
      throw new Error(`component not found: ${input.definitionId}`);
    }

    const variantId = definition.variants[0]?.id ?? null;
    const sourceNode = componentSourceNodeForVariant(definition, variantId);
    const node = materializeComponentInstanceNode(definition, variantId, input.instanceId, {
      name: `${definition.name} 인스턴스`,
      transform: { ...sourceNode.transform, x: input.x, y: input.y },
      componentInstance: {
        definition_id: input.definitionId,
        variant_id: variantId,
        overrides: [],
        detached: false
      }
    });
    parent.children.push(node);
    relayoutDesignFile(document);
      return node;
    });
  }

  async setComponentVariants(
    fileId: string,
    componentId: string,
    variants: Array<{
      id: string;
      name: string;
      properties: Array<{ name: string; value: string; type?: ComponentPropertyType }>;
      source_node?: DesignNode | null;
    }>
  ): Promise<ComponentDefinition> {
    return this.mutateFile(fileId, async (document) => {
    const component = (document.components ?? []).find((candidate) => candidate.id === componentId);
    if (!component) {
      throw new Error(`component not found: ${componentId}`);
    }

    const normalizedVariants = variants.map(normalizeComponentVariant);
    if (normalizedVariants.length === 0) {
      throw new Error("component variants must not be empty");
    }

    const previousArea = structuredClone(component.variant_area ?? null);
    component.variants = normalizedVariants;
    if (normalizedVariants.length > 1 && !component.variant_area) {
      component.variant_area = defaultComponentVariantArea();
    }
    reflowComponentVariantArea(document, component, previousArea);
    const validVariantIds = new Set(normalizedVariants.map((variant) => variant.id));
    const fallbackVariantId = normalizedVariants[0]?.id ?? null;
    forEachNode(document, (node) => {
      if (node.component_instance?.definition_id !== componentId) {
        return;
      }
      if (!node.component_instance.variant_id || !validVariantIds.has(node.component_instance.variant_id)) {
        const nextNode = materializeComponentInstanceNode(component, fallbackVariantId, node.id, {
          name: node.name,
          transform: structuredClone(node.transform),
          componentInstance: {
            ...node.component_instance,
            variant_id: fallbackVariantId,
            overrides: structuredClone(node.component_instance.overrides ?? [])
          },
          locked: node.locked,
          visible: node.visible,
          layoutItem: node.layout_item,
          constraints: node.constraints,
          exportPresets: node.export_presets
        });
        replaceNodeById(document, node.id, nextNode);
      }
    });
      return component;
    });
  }

  async setComponentVariantArea(
    fileId: string,
    componentId: string,
    area: ComponentVariantArea | null
  ): Promise<ComponentDefinition> {
    return this.mutateFile(fileId, async (document) => {
    const component = (document.components ?? []).find((candidate) => candidate.id === componentId);
    if (!component) {
      throw new Error(`component not found: ${componentId}`);
    }

    const previousArea = structuredClone(component.variant_area ?? null);
    component.variant_area = normalizeComponentVariantArea(area);
    reflowComponentVariantArea(document, component, previousArea);
      return component;
    });
  }

  async setComponentInstanceVariant(fileId: string, nodeId: string, variantId: string): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }
    if (!node.component_instance) {
      throw new Error(`node is not component instance: ${nodeId}`);
    }

    const component = (document.components ?? []).find(
      (candidate) => candidate.id === node.component_instance?.definition_id
    );
    if (!component) {
      throw new Error(`component not found: ${node.component_instance.definition_id}`);
    }
    if (!component.variants.some((variant) => variant.id === variantId)) {
      throw new Error(`component variant not found: ${variantId}`);
    }

    const nextNode = materializeComponentInstanceNode(component, variantId, nodeId, {
      name: node.name,
      transform: structuredClone(node.transform),
      componentInstance: {
        ...node.component_instance,
        variant_id: variantId,
        overrides: structuredClone(node.component_instance.overrides ?? [])
      },
      locked: node.locked,
      visible: node.visible,
      layoutItem: node.layout_item,
      constraints: node.constraints,
      exportPresets: node.export_presets
    });
    replaceNodeById(document, nodeId, nextNode);
      return nextNode;
    });
  }

  async detachInstance(fileId: string, nodeId: string): Promise<DesignNode> {
    return this.mutateFile(fileId, async (document) => {
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }
    if (!node.component_instance) {
      throw new Error(`node is not component instance: ${nodeId}`);
    }

    node.kind = "frame";
    node.component_instance = null;
    relayoutDesignFile(document);
      return node;
    });
  }

  async inspectCanvas(fileId: string): Promise<CanvasInspection> {
    return inspectDesignFile(await this.readFile(fileId));
  }

  async findNodes(fileId: string, query: AgentFindQuery): Promise<AgentNodeSummary[]> {
    return findAgentNodes(await this.readFile(fileId), query);
  }

  async validateDocument(fileId: string): Promise<DocumentValidation> {
    return validateDesignFile(await this.readFile(fileId));
  }

  async getChangeSummary(fileId: string, before: DesignFile, after: DesignFile): Promise<ChangeSummary> {
    void fileId;
    return summarizeChanges(before, after);
  }

  async applyAgentCommands(fileId: string, input: AgentBatchInput): Promise<AgentBatchResult> {
    const persisted = !(input.dryRun ?? false);
    if (!persisted) {
      const before = await this.readFile(fileId);
      const { document: preview, changedNodeIds } = applyAgentCommandsToDocument(
        before,
        input.commands
      );
      return createAgentBatchResult(fileId, before, preview, input, false, changedNodeIds);
    }

    return this.withFileMutationLock(fileId, async () => {
      const before = await this.readFile(fileId);
      if (input.collaboration) {
        const collaborativeResult = await applyAgentCommandsToCollaboration({
          target: input.collaboration,
          fallbackDocument: before,
          commands: input.commands
        });
        const result = createAgentBatchResult(
          fileId,
          collaborativeResult.before,
          collaborativeResult.preview,
          input,
          true,
          collaborativeResult.changedNodeIds
        );
        await this.writeFileWithoutMutationLock(fileId, collaborativeResult.preview);
        await this.recordFileEditForAutoVersion(fileId, collaborativeResult.preview);
        return result;
      }

      const { document: preview, changedNodeIds } = applyAgentCommandsToDocument(
        before,
        input.commands
      );
      const result = createAgentBatchResult(fileId, before, preview, input, true, changedNodeIds);
      await this.writeFileWithoutMutationLock(fileId, preview);
      await this.recordFileEditForAutoVersion(fileId, preview);
      return result;
    });
  }

  async exportCode(fileId: string, options: CodeExportOptions = {}): Promise<CodeExportResult> {
    return exportDesignToCode(await this.readFile(fileId), options);
  }

  private async writeProject(project: ProjectManifest): Promise<ProjectManifest> {
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.projectsDir, { recursive: true });
    const parsed = parseProjectManifest(project);
    await writeFile(this.projectPathFor(parsed.projectId), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return parsed;
  }

  private async writeFileVersion(
    fileId: string,
    document: DesignFile,
    input: SaveFileVersionInput = {}
  ): Promise<StoredFileVersionSummary> {
    assertSafeStorageId(fileId);
    const versionId = createStorageId("version");
    const createdAt = new Date().toISOString();
    const version: StoredFileVersion = {
      schemaVersion: 1,
      versionId,
      fileId,
      name: document.name,
      message: normalizeName(input.message, "저장된 버전"),
      source: input.source ?? "manual",
      pinned: false,
      createdAt,
      nodeCount: countDocumentNodes(document),
      document: structuredClone(document)
    };
    await mkdir(this.fileHistoryDirFor(fileId), { recursive: true });
    await writeFile(
      this.fileVersionPathFor(fileId, versionId),
      `${JSON.stringify(version, null, 2)}\n`,
      "utf8"
    );
    return summarizeStoredFileVersion(version);
  }

  private async readAutoFileVersionState(fileId: string): Promise<AutoFileVersionState> {
    assertSafeStorageId(fileId);
    let raw: string;
    try {
      raw = await readFile(this.fileHistoryStatePathFor(fileId), "utf8");
    } catch {
      return {
        schemaVersion: 1,
        fileId,
        editCount: 0,
        updatedAt: new Date(0).toISOString()
      };
    }

    return parseAutoFileVersionState(JSON.parse(raw), fileId);
  }

  private async writeAutoFileVersionState(state: AutoFileVersionState): Promise<void> {
    await mkdir(this.historyStateDir, { recursive: true });
    await writeFile(
      this.fileHistoryStatePathFor(state.fileId),
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8"
    );
  }

  private async recordFileEditForAutoVersion(
    fileId: string,
    document: DesignFile
  ): Promise<StoredFileVersionSummary | null> {
    const state = await this.readAutoFileVersionState(fileId);
    const updatedAt = new Date().toISOString();
    const editCount = state.editCount + 1;

    if (editCount < AUTO_FILE_VERSION_EDIT_INTERVAL) {
      await this.writeAutoFileVersionState({
        ...state,
        editCount,
        updatedAt
      });
      return null;
    }

    const version = await this.writeFileVersion(fileId, document, {
      message: "자동 저장",
      source: "auto"
    });
    await this.writeAutoFileVersionState({
      schemaVersion: 1,
      fileId,
      editCount: 0,
      lastAutoVersionId: version.versionId,
      updatedAt
    });
    return version;
  }

  private async readCommentThreadFile(fileId: string): Promise<StoredCommentThreadFile> {
    await this.adoptPriorDefaultStoreIfNeeded();
    let raw: string;
    try {
      raw = await readFile(this.commentThreadsPathFor(fileId), "utf8");
    } catch {
      return { schemaVersion: 1, fileId, threads: [], activity: [], events: [] };
    }

    return parseStoredCommentThreadFile(JSON.parse(raw), fileId);
  }

  private async writeCommentThreadFile(store: StoredCommentThreadFile): Promise<void> {
    await mkdir(this.commentsDir, { recursive: true });
    await durablyReplaceFile(
      this.commentThreadsPathFor(store.fileId),
      Buffer.from(`${JSON.stringify(store, null, 2)}\n`, "utf8")
    );
  }

  private async readLibraryRegistryEntries(): Promise<LibraryRegistryEntry[]> {
    try {
      const raw = await readFile(this.libraryRegistryPath(), "utf8");
      const parsed = JSON.parse(raw) as { libraries?: unknown[] };
      return Array.isArray(parsed.libraries) ? parsed.libraries.map(parseLibraryRegistryEntry) : [];
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeLibraryRegistryEntries(libraries: LibraryRegistryEntry[]): Promise<void> {
    await mkdir(this.librariesDir, { recursive: true });
    await durablyReplaceFile(
      this.libraryRegistryPath(),
      Buffer.from(`${JSON.stringify({ schemaVersion: 1, libraries }, null, 2)}\n`, "utf8")
    );
  }

  private async readLibraryRegistryEvents(): Promise<LibraryRegistryEvent[]> {
    try {
      const raw = await readFile(this.libraryRegistryEventsPath(), "utf8");
      const parsed = JSON.parse(raw) as { events?: unknown[] };
      return Array.isArray(parsed.events)
        ? parsed.events.map(parseLibraryRegistryEvent).sort((a, b) => a.sequence - b.sequence)
        : [];
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeLibraryRegistryEvents(events: LibraryRegistryEvent[]): Promise<void> {
    await mkdir(this.librariesDir, { recursive: true });
    await durablyReplaceFile(
      this.libraryRegistryEventsPath(),
      Buffer.from(`${JSON.stringify({ schemaVersion: 1, events }, null, 2)}\n`, "utf8")
    );
  }

  private async readLibraryRegistrySubscriptions(): Promise<LibraryRegistrySubscription[]> {
    try {
      const raw = await readFile(this.librarySubscriptionsPath(), "utf8");
      const parsed = JSON.parse(raw) as { subscriptions?: unknown[] };
      return Array.isArray(parsed.subscriptions)
        ? parsed.subscriptions.map(parseLibraryRegistrySubscription)
        : [];
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeLibraryRegistrySubscriptions(
    subscriptions: LibraryRegistrySubscription[],
    onCommitted?: (snapshot: StoragePathSnapshot) => void,
    onPrepared?: (snapshot: StoragePathSnapshot) => Promise<void>
  ): Promise<void> {
    await mkdir(this.librariesDir, { recursive: true });
    const snapshot = {
      filePath: this.librarySubscriptionsPath(),
      data: Buffer.from(
        `${JSON.stringify({ schemaVersion: 1, subscriptions }, null, 2)}\n`,
        "utf8"
      )
    };
    await onPrepared?.(snapshot);
    await durablyReplaceFile(snapshot.filePath, snapshot.data);
    onCommitted?.(snapshot);
  }

  private async readLibraryRegistryTokenSubscriptions(): Promise<LibraryRegistryTokenSubscription[]> {
    try {
      const raw = await readFile(this.libraryTokenSubscriptionsPath(), "utf8");
      const parsed = JSON.parse(raw) as { subscriptions?: unknown[] };
      return Array.isArray(parsed.subscriptions)
        ? parsed.subscriptions.map(parseLibraryRegistryTokenSubscription)
        : [];
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeLibraryRegistryTokenSubscriptions(subscriptions: LibraryRegistryTokenSubscription[]): Promise<void> {
    await mkdir(this.librariesDir, { recursive: true });
    await writeFile(
      this.libraryTokenSubscriptionsPath(),
      `${JSON.stringify({ schemaVersion: 1, subscriptions }, null, 2)}\n`,
      "utf8"
    );
  }

  private async upsertLibraryRegistrySubscription(
    fileId: string,
    entry: LibraryRegistryEntry,
    imported: ImportedLibraryRegistryItem,
    idPrefix: string | undefined,
    onCommitted?: (snapshot: StoragePathSnapshot) => void,
    onPrepared?: (snapshot: StoragePathSnapshot) => Promise<void>
  ): Promise<void> {
    assertSafeStorageId(fileId);
    const subscriptions = await this.readLibraryRegistrySubscriptions();
    const subscription: LibraryRegistrySubscription = {
      fileId,
      libraryId: entry.libraryId,
      libraryName: entry.name,
      sourceFileId: entry.sourceFileId,
      sourceName: entry.sourceName,
      idPrefix,
      componentCount: imported.componentCount,
      tokenCount: imported.tokenCount,
      assetCount: imported.assetCount,
      componentIdMap: imported.componentIdMap,
      tokenIdMap: imported.tokenIdMap,
      importedAt: new Date().toISOString(),
      importedRegistryUpdatedAt: entry.updatedAt
    };
    const nextSubscriptions = [
      subscription,
      ...subscriptions.filter(
        (candidate) => candidate.fileId !== fileId || candidate.libraryId !== entry.libraryId
      )
    ].sort(
      (a, b) =>
        a.fileId.localeCompare(b.fileId) ||
        a.libraryName.localeCompare(b.libraryName) ||
        a.libraryId.localeCompare(b.libraryId)
    );
    await this.writeLibraryRegistrySubscriptions(nextSubscriptions, onCommitted, onPrepared);
  }

  private async upsertLibraryRegistryTokenSubscription(
    fileId: string,
    entry: LibraryRegistryEntry,
    imported: ImportedLibraryRegistryTokens
  ): Promise<void> {
    assertSafeStorageId(fileId);
    const subscriptions = await this.readLibraryRegistryTokenSubscriptions();
    const subscription: LibraryRegistryTokenSubscription = {
      fileId,
      libraryId: entry.libraryId,
      libraryName: entry.name,
      sourceFileId: entry.sourceFileId,
      sourceName: entry.sourceName,
      tokenCount: imported.tokenCount,
      tokenSetCount: imported.tokenSetCount,
      tokenThemeCount: imported.tokenThemeCount,
      importedAt: new Date().toISOString(),
      importedRegistryUpdatedAt: entry.updatedAt
    };
    const nextSubscriptions = [
      subscription,
      ...subscriptions.filter(
        (candidate) => candidate.fileId !== fileId || candidate.libraryId !== entry.libraryId
      )
    ].sort(
      (a, b) =>
        a.fileId.localeCompare(b.fileId) ||
        a.libraryName.localeCompare(b.libraryName) ||
        a.libraryId.localeCompare(b.libraryId)
    );
    await this.writeLibraryRegistryTokenSubscriptions(nextSubscriptions);
  }

  private createLibraryRegistryEvent(
    entry: LibraryRegistryEntry,
    exported: ExportedLibraryArchive,
    events: LibraryRegistryEvent[]
  ): LibraryRegistryEvent {
    const sequence = Math.max(0, ...events.map((event) => event.sequence)) + 1;
    return {
      schemaVersion: 1,
      eventId: `library-registry-${sequence}`,
      sequence,
      type: "published",
      libraryId: entry.libraryId,
      libraryName: entry.name,
      sourceFileId: entry.sourceFileId,
      sourceName: entry.sourceName,
      ...(entry.teamId ? { teamId: entry.teamId } : {}),
      componentCount: entry.componentCount,
      tokenCount: entry.tokenCount,
      tokenSetCount: exported.tokenSetCount,
      tokenThemeCount: exported.tokenThemeCount,
      assetCount: entry.assetCount,
      registryUpdatedAt: entry.updatedAt,
      createdAt: entry.updatedAt
    };
  }

  private async findTeamIdsForFile(fileId: string): Promise<Set<string>> {
    assertSafeStorageId(fileId);
    const projects = await this.listProjects();
    return new Set(
      projects
        .filter((project) => project.documents.some((document) => document.documentId === fileId))
        .flatMap((project) => project.sharing.mode === "team" ? [project.sharing.teamId] : [])
    );
  }

  async getTeamIdForFile(fileId: string): Promise<string | undefined> {
    return this.findTeamIdForFile(fileId);
  }

  private async findTeamIdForFile(fileId: string): Promise<string | undefined> {
    return Array.from(await this.findTeamIdsForFile(fileId)).sort()[0];
  }

  private async filterLibraryRegistryEntriesForFile(
    fileId: string,
    entries: LibraryRegistryEntry[]
  ): Promise<LibraryRegistryEntry[]> {
    const teamIds = await this.findTeamIdsForFile(fileId);
    return entries.filter((entry) => !entry.teamId || teamIds.has(entry.teamId));
  }

  private async filterLibraryRegistryEventsForFile(
    fileId: string,
    events: LibraryRegistryEvent[]
  ): Promise<LibraryRegistryEvent[]> {
    const teamIds = await this.findTeamIdsForFile(fileId);
    return events.filter((event) => !event.teamId || teamIds.has(event.teamId));
  }

  private async assertLibraryRegistryEntryAccessible(fileId: string, entry: LibraryRegistryEntry): Promise<void> {
    if (!entry.teamId) {
      return;
    }
    const teamIds = await this.findTeamIdsForFile(fileId);
    if (!teamIds.has(entry.teamId)) {
      throw forbiddenError(`library registry item not authorized for file: ${entry.libraryId}`);
    }
  }

  private async readAccessibleLibraryRegistryArchive(
    fileId: string,
    libraryId: string
  ): Promise<{ entry: LibraryRegistryEntry; archive: Buffer }> {
    const result = await this.readLibraryRegistryArchive(libraryId);
    await this.assertLibraryRegistryEntryAccessible(fileId, result.entry);
    return result;
  }

  private async readLibraryRegistryArchive(libraryId: string): Promise<{ entry: LibraryRegistryEntry; archive: Buffer }> {
    const normalizedLibraryId = normalizeLibraryRegistryId(libraryId);
    const entry = (await this.readLibraryRegistryEntries()).find(
      (candidate) => candidate.libraryId === normalizedLibraryId
    );
    if (!entry) {
      throw notFoundError(`library registry item not found: ${normalizedLibraryId}`);
    }
    return {
      entry,
      archive: await readFile(this.libraryArchivePathFor(entry.libraryId))
    };
  }
}

function assertSafeStorageId(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`safe id is required: ${value}`);
  }
}

function normalizeLibraryRegistryId(value: string | undefined) {
  const libraryId = value?.trim() || "library";
  assertSafeStorageId(libraryId);
  return libraryId;
}

function normalizeLibraryPublicationIdempotencyKey(value: string | undefined) {
  const idempotencyKey = value?.trim();
  if (!idempotencyKey) {
    return undefined;
  }
  if (idempotencyKey.length > 128) {
    throw inputValidationError("library publication idempotency key must be 128 characters or fewer");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) {
    throw inputValidationError(
      "library publication idempotency key may contain only letters, numbers, underscores, and hyphens"
    );
  }
  return idempotencyKey;
}

function nextIsoTimestamp(previousTimestamp: string | undefined) {
  const now = new Date();
  if (!previousTimestamp) {
    return now.toISOString();
  }
  const previousMs = Date.parse(previousTimestamp);
  if (!Number.isFinite(previousMs) || now.getTime() > previousMs) {
    return now.toISOString();
  }
  return new Date(previousMs + 1).toISOString();
}

function notFoundError(message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = "ENOENT";
  return error;
}

function forbiddenError(message: string) {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "EACCES";
  error.statusCode = 403;
  return error;
}

function idempotencyConflictError(message: string) {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "EIDEMPOTENCY";
  error.statusCode = 409;
  return error;
}

function createStorageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

let lastCommentTimestampMs = 0;

function createMonotonicCommentTimestamp() {
  const now = Date.now();
  const next = now <= lastCommentTimestampMs ? lastCommentTimestampMs + 1 : now;
  lastCommentTimestampMs = next;
  return new Date(next).toISOString();
}

function normalizeListLimit(value: number | undefined, fallback: number) {
  const limit = Math.floor(Number(value) || fallback);
  return Math.min(Math.max(limit, 1), fallback);
}

function normalizeName(value: string | undefined, fallback: string) {
  const normalized = value?.trim() || fallback;
  if (!normalized.trim()) {
    throw new Error("name is required");
  }
  return normalized;
}

function normalizeCommentActorId(value: unknown) {
  const actorId = typeof value === "string" ? value.trim() : "";
  if (!actorId) {
    throw inputValidationError("comment actor id is required");
  }
  return actorId;
}

function requireCommentThread(
  store: StoredCommentThreadFile,
  threadId: string
): StoredCommentThread {
  const thread = store.threads.find((candidate) => candidate.threadId === threadId);
  if (!thread) {
    throw Object.assign(new Error(`comment thread not found: ${threadId}`), {
      code: "ENOENT",
      statusCode: 404
    });
  }
  return thread;
}

function requireCommentReply(
  thread: StoredCommentThread,
  replyId: string
): StoredCommentReply {
  const reply = thread.replies.find((candidate) => candidate.replyId === replyId);
  if (!reply) {
    throw Object.assign(new Error(`comment reply not found: ${replyId}`), {
      code: "ENOENT",
      statusCode: 404
    });
  }
  return reply;
}

function assertCommentOwner(authorId: string, actorId: string) {
  if (authorId !== actorId) {
    throw forbiddenError("only the comment author can modify this comment");
  }
}

function assertCommentVersion(modifiedAt: string, expectedModifiedAt: unknown) {
  const expected = typeof expectedModifiedAt === "string" ? expectedModifiedAt.trim() : "";
  if (!expected) {
    throw inputValidationError("expected comment modifiedAt is required");
  }
  if (modifiedAt !== expected) {
    throw Object.assign(new Error("comment was modified by another writer"), {
      code: "ECONFLICT",
      statusCode: 409
    });
  }
}

function normalizeCommentBody(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw inputValidationError("comment body is required");
  }
  return normalized;
}

function extractCommentMentions(body: string) {
  const mentions: string[] = [];
  const mentionPattern = /@([\p{L}\p{N}_-]+)/gu;
  for (const match of body.matchAll(mentionPattern)) {
    mentions.push(match[1]);
  }
  return uniqueNames(mentions);
}

function uniqueNames(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeCommentMentionList(value: unknown, body: string) {
  if (!Array.isArray(value)) {
    return extractCommentMentions(body);
  }
  return uniqueNames(value.filter((item): item is string => typeof item === "string"));
}

function normalizeCommentMentionTargetList(value: unknown): StoredCommentMentionTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map(normalizeCommentMentionTarget)
    .filter((target) => {
      if (seen.has(target.userId)) {
        return false;
      }
      seen.add(target.userId);
      return true;
    });
}

function normalizeCommentMentionTarget(value: unknown): StoredCommentMentionTarget {
  if (!value || typeof value !== "object") {
    throw inputValidationError("comment mention target is required");
  }

  const candidate = value as Partial<StoredCommentMentionTarget>;
  const userId = normalizeName(candidate.userId, "");
  const displayName = normalizeName(candidate.displayName, userId);
  if (!isCommentMentionTargetRole(candidate.role)) {
    throw inputValidationError("comment mention target role is invalid");
  }

  return {
    userId,
    displayName,
    role: candidate.role
  };
}

function isCommentMentionTargetRole(value: unknown): value is CommentMentionTargetRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

function normalizeCommentReaderList(value: unknown, authorName: string) {
  if (!Array.isArray(value)) {
    return [authorName];
  }
  return uniqueNames(value.filter((item): item is string => typeof item === "string"));
}

function withViewerUnread(thread: StoredCommentThread, viewerId?: string): StoredCommentThread {
  if (!viewerId?.trim()) {
    const { unread: _unread, ...withoutUnread } = thread;
    return withoutUnread;
  }
  const normalizedViewerId = normalizeName(viewerId, "사용자");
  return {
    ...thread,
    unread: !thread.readBy.includes(normalizedViewerId)
  };
}

function unreadCommentThreads(threads: StoredCommentThread[], viewerId: string) {
  return threads.filter((thread) => thread.resolvedAt === null && !thread.readBy.includes(viewerId));
}

function countUnreadCommentThreads(threads: StoredCommentThread[], viewerId: string) {
  return unreadCommentThreads(threads, viewerId).length;
}

function isCommentThreadMentionedForViewer(thread: StoredCommentThread, viewerId: string) {
  return thread.mentionTargets.some(
    (target) => target.userId === viewerId || target.displayName === viewerId
  );
}

function latestCommentThreadCreatedAt(threads: StoredCommentThread[]) {
  return threads.reduce(
    (latest, thread) => (thread.createdAt.localeCompare(latest) > 0 ? thread.createdAt : latest),
    new Date(0).toISOString()
  );
}

function compareCommentNotificationRecency(
  a: { latestUnreadAt: string; name: string },
  b: { latestUnreadAt: string; name: string }
) {
  const byRecency = b.latestUnreadAt.localeCompare(a.latestUnreadAt);
  return byRecency === 0 ? a.name.localeCompare(b.name) : byRecency;
}

function prependCommentActivity(
  current: StoredCommentActivityEvent[],
  input: Omit<StoredCommentActivityEvent, "schemaVersion" | "eventId">
): StoredCommentActivityEvent[] {
  const event: StoredCommentActivityEvent = {
    schemaVersion: 1,
    eventId: createStorageId("activity"),
    ...input
  };
  return [
    event,
    ...current
  ].slice(0, COMMENT_ACTIVITY_RETENTION_LIMIT);
}

function appendCommentLiveEvent(
  current: StoredCommentLiveEvent[],
  input: Omit<StoredCommentLiveEvent, "schemaVersion" | "eventId" | "sequence">
): StoredCommentLiveEvent[] {
  const sequence = Math.max(0, ...current.map((event) => event.sequence)) + 1;
  const event: StoredCommentLiveEvent = {
    schemaVersion: 1,
    eventId: createStorageId("comment-event"),
    sequence,
    ...input
  };
  return [
    ...current,
    event
  ].slice(-COMMENT_LIVE_EVENT_RETENTION_LIMIT);
}

function priorStorageDirectoryName() {
  return [".canvas", "mcp", "editor"].join("-");
}

function legacyEnglishProductName() {
  return ["Canvas", "MCP", "Editor"].join(" ");
}

function legacyKoreanProductName() {
  return ["캔버스", "MCP", "에디터"].join(" ");
}

function normalizeImageMimeType(value: string) {
  const mimeType = value.trim().toLowerCase();
  if (
    mimeType !== "image/png" &&
    mimeType !== "image/jpeg" &&
    mimeType !== "image/webp" &&
    mimeType !== "image/svg+xml" &&
    mimeType !== "image/gif"
  ) {
    throw new Error(`unsupported image mime type: ${value}`);
  }

  return mimeType;
}

function assertImageBytesMatchMimeType(data: Buffer, mimeType: string) {
  if (mimeType === "image/png" && data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return;
  }

  if (mimeType === "image/jpeg" && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return;
  }

  const header = data.subarray(0, 12).toString("ascii");
  if (mimeType === "image/gif" && (header.startsWith("GIF87a") || header.startsWith("GIF89a"))) {
    return;
  }

  if (mimeType === "image/webp" && header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
    return;
  }

  const textHeader = data.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (mimeType === "image/svg+xml" && (textHeader.startsWith("<svg") || (textHeader.startsWith("<?xml") && textHeader.includes("<svg")))) {
    return;
  }

  throw inputValidationError(`asset data does not match ${mimeType}`);
}

function inputValidationError(message: string) {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = INPUT_VALIDATION_ERROR_CODE;
  error.statusCode = 400;
  return error;
}

function mergeConcurrentDocumentSnapshots(
  base: DesignFile,
  local: DesignFile,
  current: DesignFile
): DesignFile {
  try {
    return mergeRendererDocumentSnapshots(base, local, current);
  } catch (error) {
    if (error instanceof DocumentSnapshotConflictError) {
      throw inputValidationError(error.message);
    }
    throw error;
  }
}

function parseCodeComponentMapping(input: unknown): CodeComponentMapping {
  if (!input || typeof input !== "object") {
    throw inputValidationError("code component mapping is required");
  }

  const candidate = input as Partial<CodeComponentMapping>;
  const id = normalizeRequiredCodeString(candidate.id, "mapping id");
  const componentId = normalizeRequiredCodeString(candidate.component_id, "mapping component id");
  assertSafeStorageId(id);
  assertSafeStorageId(componentId);

  const importMode = candidate.import_mode;
  if (importMode !== "named" && importMode !== "default") {
    throw inputValidationError("code mapping import mode is invalid");
  }

  return {
    id,
    component_id: componentId,
    ...normalizeOptionalCodeString(candidate.package_name, "package_name"),
    import_path: normalizeRequiredCodeString(candidate.import_path, "mapping import path"),
    export_name: normalizeRequiredCodeString(candidate.export_name, "mapping export name"),
    import_mode: importMode,
    props: normalizeCodeComponentMappingProps(candidate.props),
    variant_props: normalizeCodeComponentMappingVariantProps(candidate.variant_props),
    ...normalizeOptionalCodeString(candidate.docs_url, "docs_url")
  };
}

function normalizeCodeComponentMappingProps(input: unknown): CodeComponentMappingProp[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((value) => {
    if (!value || typeof value !== "object") {
      throw inputValidationError("code mapping prop is required");
    }
    const candidate = value as Partial<CodeComponentMappingProp>;
    const name = normalizeRequiredCodeString(candidate.name, "mapping prop name");
    const sourceNodeId = normalizeRequiredCodeString(candidate.source_node_id, "mapping prop source node");
    assertSafeStorageId(sourceNodeId);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw inputValidationError(`code mapping prop name is invalid: ${name}`);
    }
    if (candidate.type !== "string") {
      throw inputValidationError("code mapping prop type is invalid");
    }
    if (candidate.source_field !== "text") {
      throw inputValidationError("code mapping prop source field is invalid");
    }

    return {
      name,
      type: "string",
      source_node_id: sourceNodeId,
      source_field: "text",
      default_value: normalizeRequiredCodeString(candidate.default_value, "mapping prop default value")
    };
  });
}

function normalizeCodeComponentMappingVariantProps(input: unknown): CodeComponentMappingVariantProp[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((value) => {
    if (!value || typeof value !== "object") {
      throw inputValidationError("code mapping variant prop is required");
    }
    const candidate = value as Partial<CodeComponentMappingVariantProp>;
    const name = normalizeRequiredCodeString(candidate.name, "mapping variant prop name");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw inputValidationError(`code mapping variant prop name is invalid: ${name}`);
    }
    if (candidate.type !== "string") {
      throw inputValidationError("code mapping variant prop type is invalid");
    }

    return {
      name,
      type: "string",
      variant_property: normalizeRequiredCodeString(candidate.variant_property, "mapping variant property"),
      default_value: normalizeRequiredCodeString(candidate.default_value, "mapping variant default value")
    };
  });
}

function normalizeRequiredCodeString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw inputValidationError(`${label} is required`);
  }
  return normalized;
}

function normalizeOptionalCodeString(
  value: unknown,
  key: "package_name" | "docs_url"
): Partial<Pick<CodeComponentMapping, "package_name" | "docs_url">> {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? { [key]: normalized } : {};
}

function parseStoredAsset(input: unknown): StoredAsset {
  if (!input || typeof input !== "object") {
    throw new Error("invalid asset metadata");
  }

  const candidate = input as StoredAsset;
  assertSafeStorageId(candidate.assetId);
  return {
    assetId: candidate.assetId,
    name: normalizeName(candidate.name, "이미지"),
    mimeType: normalizeImageMimeType(candidate.mimeType),
    byteLength: Math.max(0, Math.round(Number(candidate.byteLength) || 0)),
    url: `/assets/${candidate.assetId}`
  };
}

function parseFileArchiveManifest(input: unknown): FileArchiveManifest {
  if (!input || typeof input !== "object") {
    throw new Error("invalid file archive manifest");
  }
  const candidate = input as FileArchiveManifest;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported file archive schema: ${String(candidate.schemaVersion)}`);
  }
  if (candidate.format !== "layo.file.archive") {
    throw new Error(`unsupported file archive format: ${String(candidate.format)}`);
  }
  assertSafeStorageId(candidate.fileId);
  return {
    schemaVersion: 1,
    format: "layo.file.archive",
    exportedAt: normalizeName(candidate.exportedAt, new Date(0).toISOString()),
    fileId: candidate.fileId,
    name: normalizeName(candidate.name, candidate.fileId),
    assetCount: Math.max(0, Math.round(Number(candidate.assetCount) || 0))
  };
}

function parseProjectArchiveManifest(input: unknown): ProjectArchiveManifest {
  if (!input || typeof input !== "object") {
    throw new Error("invalid project archive manifest");
  }
  const candidate = input as ProjectArchiveManifest;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported project archive schema: ${String(candidate.schemaVersion)}`);
  }
  if (candidate.format !== "layo.project.archive") {
    throw new Error(`unsupported project archive format: ${String(candidate.format)}`);
  }
  assertSafeStorageId(candidate.projectId);
  assertSafeStorageId(candidate.currentDocumentId);
  return {
    schemaVersion: 1,
    format: "layo.project.archive",
    exportedAt: normalizeName(candidate.exportedAt, new Date(0).toISOString()),
    projectId: candidate.projectId,
    name: normalizeName(candidate.name, candidate.projectId),
    currentDocumentId: candidate.currentDocumentId,
    documentCount: Math.max(0, Math.round(Number(candidate.documentCount) || 0)),
    assetCount: Math.max(0, Math.round(Number(candidate.assetCount) || 0))
  };
}

function parseLibraryArchiveManifest(input: unknown): LibraryArchiveManifest {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library archive manifest");
  }
  const candidate = input as LibraryArchiveManifest;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported library archive schema: ${String(candidate.schemaVersion)}`);
  }
  if (candidate.format !== "layo.library.archive") {
    throw new Error(`unsupported library archive format: ${String(candidate.format)}`);
  }
  assertSafeStorageId(candidate.fileId);
  return {
    schemaVersion: 1,
    format: "layo.library.archive",
    exportedAt: normalizeName(candidate.exportedAt, new Date(0).toISOString()),
    fileId: candidate.fileId,
    name: normalizeName(candidate.name, candidate.fileId),
    componentCount: Math.max(0, Math.round(Number(candidate.componentCount) || 0)),
    tokenCount: Math.max(0, Math.round(Number(candidate.tokenCount) || 0)),
    tokenSetCount: Math.max(0, Math.round(Number(candidate.tokenSetCount) || 0)),
    tokenThemeCount: Math.max(0, Math.round(Number(candidate.tokenThemeCount) || 0)),
    assetCount: Math.max(0, Math.round(Number(candidate.assetCount) || 0))
  };
}

function parseDesignFileArchiveDocument(input: unknown): DesignFile {
  if (!input || typeof input !== "object") {
    throw new Error("invalid file archive document");
  }
  const candidate = input as DesignFile;
  assertSafeStorageId(candidate.id);
  if (!Array.isArray(candidate.pages)) {
    throw new Error("file archive document pages are required");
  }
  return {
    ...candidate,
    name: normalizeName(candidate.name, candidate.id),
    pages: candidate.pages
  };
}

function parseLibraryPublicationReceipt(input: unknown): LibraryPublicationReceipt {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library publication receipt");
  }
  const candidate = input as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.idempotencyKey !== "string" ||
    typeof candidate.fingerprint !== "string"
  ) {
    throw new Error("invalid library publication receipt");
  }
  assertSafeStorageId(candidate.idempotencyKey);
  return {
    schemaVersion: 1,
    idempotencyKey: candidate.idempotencyKey,
    fingerprint: candidate.fingerprint,
    entry: parseLibraryRegistryEntry(candidate.entry)
  };
}

function parseLibraryRegistryEntry(input: unknown): LibraryRegistryEntry {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library registry entry");
  }
  const candidate = input as Partial<LibraryRegistryEntry>;
  const libraryId = normalizeLibraryRegistryId(candidate.libraryId);
  const sourceFileId = normalizeName(candidate.sourceFileId, libraryId);
  assertSafeStorageId(sourceFileId);
  return {
    libraryId,
    name: normalizeName(candidate.name, libraryId),
    sourceFileId,
    sourceName: normalizeName(candidate.sourceName, sourceFileId),
    ...(typeof candidate.teamId === "string" && candidate.teamId.trim()
      ? { teamId: candidate.teamId.trim() }
      : {}),
    componentCount: Math.max(0, Math.round(Number(candidate.componentCount) || 0)),
    tokenCount: Math.max(0, Math.round(Number(candidate.tokenCount) || 0)),
    assetCount: Math.max(0, Math.round(Number(candidate.assetCount) || 0)),
    publishedAt: normalizeName(candidate.publishedAt, new Date(0).toISOString()),
    updatedAt: normalizeName(candidate.updatedAt, candidate.publishedAt ?? new Date(0).toISOString())
  };
}

function parseLibraryRegistryEvent(input: unknown): LibraryRegistryEvent {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library registry event");
  }
  const candidate = input as Partial<LibraryRegistryEvent>;
  const libraryId = normalizeLibraryRegistryId(candidate.libraryId);
  const sourceFileId = normalizeName(candidate.sourceFileId, libraryId);
  assertSafeStorageId(sourceFileId);
  const sequence = Math.max(0, Math.round(Number(candidate.sequence) || 0));
  const registryUpdatedAt = normalizeName(candidate.registryUpdatedAt, new Date(0).toISOString());
  return {
    schemaVersion: 1,
    eventId: normalizeName(candidate.eventId, `library-registry-${sequence}`),
    sequence,
    type: "published",
    libraryId,
    libraryName: normalizeName(candidate.libraryName, libraryId),
    sourceFileId,
    sourceName: normalizeName(candidate.sourceName, sourceFileId),
    ...(typeof candidate.teamId === "string" && candidate.teamId.trim()
      ? { teamId: candidate.teamId.trim() }
      : {}),
    componentCount: Math.max(0, Math.round(Number(candidate.componentCount) || 0)),
    tokenCount: Math.max(0, Math.round(Number(candidate.tokenCount) || 0)),
    tokenSetCount: Math.max(0, Math.round(Number(candidate.tokenSetCount) || 0)),
    tokenThemeCount: Math.max(0, Math.round(Number(candidate.tokenThemeCount) || 0)),
    assetCount: Math.max(0, Math.round(Number(candidate.assetCount) || 0)),
    registryUpdatedAt,
    createdAt: normalizeName(candidate.createdAt, registryUpdatedAt)
  };
}

function parseLibraryRegistrySubscription(input: unknown): LibraryRegistrySubscription {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library registry subscription");
  }
  const candidate = input as Partial<LibraryRegistrySubscription>;
  const fileId = normalizeName(candidate.fileId, "");
  assertSafeStorageId(fileId);
  const libraryId = normalizeLibraryRegistryId(candidate.libraryId);
  const sourceFileId = normalizeName(candidate.sourceFileId, libraryId);
  assertSafeStorageId(sourceFileId);
  const idPrefix = typeof candidate.idPrefix === "string" && candidate.idPrefix.trim()
    ? candidate.idPrefix.trim()
    : undefined;
  if (idPrefix) {
    assertSafeStorageId(idPrefix);
  }
  return {
    fileId,
    libraryId,
    libraryName: normalizeName(candidate.libraryName, libraryId),
    sourceFileId,
    sourceName: normalizeName(candidate.sourceName, sourceFileId),
    idPrefix,
    componentCount: Math.max(0, Math.round(Number(candidate.componentCount) || 0)),
    tokenCount: Math.max(0, Math.round(Number(candidate.tokenCount) || 0)),
    assetCount: Math.max(0, Math.round(Number(candidate.assetCount) || 0)),
    componentIdMap: parseSafeIdMap(candidate.componentIdMap, "library component id map"),
    tokenIdMap: parseSafeIdMap(candidate.tokenIdMap, "library token id map"),
    importedAt: normalizeName(candidate.importedAt, new Date(0).toISOString()),
    importedRegistryUpdatedAt: normalizeName(
      candidate.importedRegistryUpdatedAt,
      candidate.importedAt ?? new Date(0).toISOString()
    )
  };
}

function parseLibraryRegistryTokenSubscription(input: unknown): LibraryRegistryTokenSubscription {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library registry token subscription");
  }
  const candidate = input as Partial<LibraryRegistryTokenSubscription>;
  const fileId = normalizeName(candidate.fileId, "");
  assertSafeStorageId(fileId);
  const libraryId = normalizeLibraryRegistryId(candidate.libraryId);
  const sourceFileId = normalizeName(candidate.sourceFileId, libraryId);
  assertSafeStorageId(sourceFileId);
  return {
    fileId,
    libraryId,
    libraryName: normalizeName(candidate.libraryName, libraryId),
    sourceFileId,
    sourceName: normalizeName(candidate.sourceName, sourceFileId),
    tokenCount: Math.max(0, Math.round(Number(candidate.tokenCount) || 0)),
    tokenSetCount: Math.max(0, Math.round(Number(candidate.tokenSetCount) || 0)),
    tokenThemeCount: Math.max(0, Math.round(Number(candidate.tokenThemeCount) || 0)),
    importedAt: normalizeName(candidate.importedAt, new Date(0).toISOString()),
    importedRegistryUpdatedAt: normalizeName(
      candidate.importedRegistryUpdatedAt,
      candidate.importedAt ?? new Date(0).toISOString()
    )
  };
}

function parseSafeIdMap(input: unknown, label: string): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [sourceId, targetId] of Object.entries(input as Record<string, unknown>)) {
    assertSafeStorageId(sourceId);
    if (typeof targetId !== "string") {
      throw new Error(`invalid ${label}`);
    }
    assertSafeStorageId(targetId);
    output[sourceId] = targetId;
  }
  return output;
}

function parseLibraryArchivePayloadFile(input: unknown): LibraryArchivePayloadFile {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library archive payload");
  }
  const candidate = input as LibraryArchivePayloadFile;
  assertSafeStorageId(candidate.fileId);
  if (!Array.isArray(candidate.tokens)) {
    throw new Error("library archive tokens are required");
  }
  if (!Array.isArray(candidate.components)) {
    throw new Error("library archive components are required");
  }
  return {
    fileId: candidate.fileId,
    name: normalizeName(candidate.name, candidate.fileId),
    tokens: candidate.tokens.map(parseLibraryArchiveToken),
    token_sets: Array.isArray(candidate.token_sets)
      ? candidate.token_sets.map(parseLibraryArchiveTokenSet)
      : [],
    token_themes: Array.isArray(candidate.token_themes)
      ? candidate.token_themes.map(parseLibraryArchiveTokenTheme)
      : [],
    components: candidate.components.map(parseLibraryArchiveComponent)
  };
}

function parseLibraryArchiveToken(input: unknown): DesignToken {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library archive token");
  }
  const candidate = input as DesignToken;
  assertSafeStorageId(candidate.id);
  if (candidate.type !== "color" && candidate.type !== "spacing") {
    throw new Error(`unsupported library archive token type: ${String(candidate.type)}`);
  }
  return {
    id: candidate.id,
    name: normalizeName(candidate.name, candidate.id),
    type: candidate.type,
    value: normalizeName(candidate.value, "")
  };
}

function parseLibraryArchiveTokenSet(input: unknown): DesignTokenSet {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library archive token set");
  }
  const candidate = input as DesignTokenSet;
  assertSafeStorageId(candidate.id);
  return {
    id: candidate.id,
    name: normalizeName(candidate.name, candidate.id),
    enabled: Boolean(candidate.enabled)
  };
}

function parseLibraryArchiveTokenTheme(input: unknown): DesignTokenTheme {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library archive token theme");
  }
  const candidate = input as DesignTokenTheme;
  assertSafeStorageId(candidate.id);
  return {
    id: candidate.id,
    name: normalizeName(candidate.name, candidate.id),
    group: typeof candidate.group === "string" ? candidate.group : null,
    enabled: Boolean(candidate.enabled),
    token_set_ids: Array.isArray(candidate.token_set_ids)
      ? candidate.token_set_ids.filter((tokenSetId): tokenSetId is string => typeof tokenSetId === "string")
      : []
  };
}

function parseLibraryArchiveComponent(input: unknown): ComponentDefinition {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library archive component");
  }
  const candidate = input as ComponentDefinition;
  assertSafeStorageId(candidate.id);
  if (!candidate.source_node || typeof candidate.source_node !== "object") {
    throw new Error("library archive component source node is required");
  }
  return {
    id: candidate.id,
    name: normalizeName(candidate.name, candidate.id),
    source_node: candidate.source_node,
    variant_area: normalizeComponentVariantArea(candidate.variant_area),
    variants: Array.isArray(candidate.variants) ? candidate.variants : []
  };
}

interface ProjectArchivePayload {
  manifest: ProjectArchiveManifest;
  project: ProjectManifest;
  documents: DesignFile[];
  documentsById: Map<string, DesignFile>;
  assetIds: string[];
  assets: Array<{ metadata: StoredAsset; data: Buffer }>;
}

interface LibraryArchivePayloadFile {
  fileId: string;
  name: string;
  tokens: DesignToken[];
  token_sets: DesignTokenSet[];
  token_themes: DesignTokenTheme[];
  components: ComponentDefinition[];
}

interface LibraryArchivePayload {
  manifest: LibraryArchiveManifest;
  library: LibraryArchivePayloadFile;
  assetIds: string[];
  assets: Array<{ metadata: StoredAsset; data: Buffer }>;
}

function readProjectArchivePayload(entries: Map<string, Buffer>): ProjectArchivePayload {
  const manifest = parseProjectArchiveManifest(readJsonArchiveEntry(entries, "manifest.json"));
  const project = parseProjectManifest(readJsonArchiveEntry(entries, "project.json"));
  if (project.projectId !== manifest.projectId) {
    throw new Error(`project archive manifest mismatch: ${project.projectId}`);
  }
  if (project.currentDocumentId !== manifest.currentDocumentId) {
    throw new Error(`project archive current document mismatch: ${project.currentDocumentId}`);
  }
  if (project.documents.length !== manifest.documentCount) {
    throw new Error("project archive document count mismatch");
  }

  const seenDocumentIds = new Set<string>();
  const documents = project.documents.map((summary) => {
    if (seenDocumentIds.has(summary.documentId)) {
      throw new Error(`project archive duplicate document: ${summary.documentId}`);
    }
    seenDocumentIds.add(summary.documentId);
    const document = parseDesignFileArchiveDocument(readJsonArchiveEntry(entries, `documents/${summary.documentId}.json`));
    if (document.id !== summary.documentId) {
      throw new Error(`project archive document mismatch: ${document.id}`);
    }
    return document;
  });

  const assetIds = collectProjectImageAssetIds(documents);
  if (assetIds.length !== manifest.assetCount) {
    throw new Error("project archive asset count mismatch");
  }
  const assets = readFileArchiveAssets(entries, assetIds);
  return {
    manifest,
    project,
    documents,
    documentsById: new Map(documents.map((document) => [document.id, document])),
    assetIds,
    assets
  };
}

function readLibraryArchivePayload(entries: Map<string, Buffer>): LibraryArchivePayload {
  const manifest = parseLibraryArchiveManifest(readJsonArchiveEntry(entries, "manifest.json"));
  const library = parseLibraryArchivePayloadFile(readJsonArchiveEntry(entries, "library.json"));
  if (library.fileId !== manifest.fileId) {
    throw new Error(`library archive manifest mismatch: ${library.fileId}`);
  }
  if (library.components.length !== manifest.componentCount) {
    throw new Error("library archive component count mismatch");
  }
  if (library.tokens.length !== manifest.tokenCount) {
    throw new Error("library archive token count mismatch");
  }
  if (manifest.tokenSetCount !== undefined && library.token_sets.length !== manifest.tokenSetCount) {
    throw new Error("library archive token set count mismatch");
  }
  if (manifest.tokenThemeCount !== undefined && library.token_themes.length !== manifest.tokenThemeCount) {
    throw new Error("library archive token theme count mismatch");
  }

  const assetIds = collectComponentImageAssetIds(library.components);
  if (assetIds.length !== manifest.assetCount) {
    throw new Error("library archive asset count mismatch");
  }

  return {
    manifest,
    library,
    assetIds,
    assets: readFileArchiveAssets(entries, assetIds)
  };
}

function readJsonArchiveEntry(entries: Map<string, Buffer>, entryPath: string): unknown {
  const entry = entries.get(entryPath);
  if (!entry) {
    throw new Error(`missing file archive entry: ${entryPath}`);
  }
  return JSON.parse(entry.toString("utf8"));
}

function readFileArchiveAssets(
  entries: Map<string, Buffer>,
  assetIds: string[]
): Array<{ metadata: StoredAsset; data: Buffer }> {
  return assetIds.map((assetId) => {
    const metadataPath = `assets/${assetId}.json`;
    const dataPath = `assets/${assetId}.bin`;
    const metadata = parseStoredAsset(readJsonArchiveEntry(entries, metadataPath));
    if (metadata.assetId !== assetId) {
      throw new Error(`file archive asset mismatch: ${metadata.assetId}`);
    }
    const data = entries.get(dataPath);
    if (!data) {
      throw new Error(`missing file archive entry: ${dataPath}`);
    }
    if (data.length !== metadata.byteLength) {
      throw new Error(`file archive asset byte length mismatch: ${assetId}`);
    }
    assertImageBytesMatchMimeType(data, metadata.mimeType);
    return { metadata, data };
  });
}

function jsonArchiveEntry(pathName: string, value: unknown): ZipArchiveEntry {
  return {
    path: pathName,
    data: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
  };
}

function collectProjectImageAssetIds(documents: DesignFile[]): string[] {
  return [...new Set(documents.flatMap((document) => collectImageAssetIds(document)))].sort();
}

interface SerializedRecoverySnapshot {
  relativePath: string;
  data: string | null;
}

interface LibraryUpdateRecoveryJournal {
  schemaVersion: 1;
  kind: "library-registry-update" | "library-registry-publication";
  fileId: string;
  original: SerializedRecoverySnapshot[];
  intended: SerializedRecoverySnapshot[];
}

function serializeRecoverySnapshot(
  rootDir: string,
  snapshot: StoragePathSnapshot
): SerializedRecoverySnapshot {
  const relativePath = path.relative(rootDir, snapshot.filePath);
  resolveRecoverySnapshotPath(rootDir, relativePath);
  return {
    relativePath,
    data: snapshot.data?.toString("base64") ?? null
  };
}

function deserializeRecoverySnapshot(
  rootDir: string,
  snapshot: SerializedRecoverySnapshot
): StoragePathSnapshot {
  return {
    filePath: resolveRecoverySnapshotPath(rootDir, snapshot.relativePath),
    data: snapshot.data === null ? null : Buffer.from(snapshot.data, "base64")
  };
}

function resolveRecoverySnapshotPath(rootDir: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("invalid recovery snapshot path");
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, resolved);
  if (
    relativeToRoot === ".."
    || relativeToRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToRoot)
  ) {
    throw new Error(`recovery snapshot path escapes storage root: ${relativePath}`);
  }
  return resolved;
}

function parseLibraryUpdateRecoveryJournal(value: unknown): LibraryUpdateRecoveryJournal {
  if (!value || typeof value !== "object") {
    throw new Error("invalid library update recovery journal");
  }
  const candidate = value as Partial<LibraryUpdateRecoveryJournal>;
  if (
    candidate.schemaVersion !== 1
    || (candidate.kind !== "library-registry-update"
      && candidate.kind !== "library-registry-publication")
    || typeof candidate.fileId !== "string"
    || !Array.isArray(candidate.original)
    || !Array.isArray(candidate.intended)
  ) {
    throw new Error("invalid library update recovery journal");
  }
  assertSafeStorageId(candidate.fileId);
  return {
    schemaVersion: 1,
    kind: candidate.kind,
    fileId: candidate.fileId,
    original: candidate.original.map(parseSerializedRecoverySnapshot),
    intended: candidate.intended.map(parseSerializedRecoverySnapshot)
  };
}

function parseSerializedRecoverySnapshot(value: unknown): SerializedRecoverySnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("invalid recovery snapshot");
  }
  const candidate = value as Partial<SerializedRecoverySnapshot>;
  if (
    typeof candidate.relativePath !== "string"
    || (candidate.data !== null && typeof candidate.data !== "string")
  ) {
    throw new Error("invalid recovery snapshot");
  }
  return {
    relativePath: candidate.relativePath,
    data: candidate.data
  };
}

function storageSnapshotDataEquals(left: Buffer | null, right: Buffer | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.equals(right);
}

async function durablyReplaceFile(filePath: string, data: Buffer): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, filePath);
    await syncDirectory(path.dirname(filePath));
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(directoryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

interface StoragePathSnapshot {
  filePath: string;
  data: Buffer | null;
}

class StorageRollbackConflictError extends Error {}

async function captureStoragePathSnapshots(
  filePaths: string[]
): Promise<StoragePathSnapshot[]> {
  const snapshots: StoragePathSnapshot[] = [];
  for (const filePath of [...new Set(filePaths)]) {
    try {
      snapshots.push({ filePath, data: await readFile(filePath) });
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
      snapshots.push({ filePath, data: null });
    }
  }
  return snapshots;
}

async function restoreStoragePathSnapshots(
  snapshots: StoragePathSnapshot[],
  guards: StoragePathSnapshot[] = []
): Promise<void> {
  const currentGuards = await captureStoragePathSnapshots(
    guards.map((guard) => guard.filePath)
  );
  for (const guard of guards) {
    const current = currentGuards.find(
      (candidate) => candidate.filePath === guard.filePath
    );
    const matches = current?.data === null
      ? guard.data === null
      : guard.data !== null && current?.data.equals(guard.data);
    if (!matches) {
      throw new StorageRollbackConflictError(
        `storage path changed after library update write: ${guard.filePath}`
      );
    }
  }

  for (const snapshot of snapshots) {
    if (snapshot.data === null) {
      await rm(snapshot.filePath, { force: true });
      const parentPath = path.dirname(snapshot.filePath);
      if (await pathExists(parentPath)) {
        await syncDirectory(parentPath);
      }
      continue;
    }
    await mkdir(path.dirname(snapshot.filePath), { recursive: true });
    await durablyReplaceFile(snapshot.filePath, snapshot.data);
  }
}

function reviewLibraryRegistryComponentUpdate(
  subscription: LibraryRegistrySubscription,
  target: DesignFile,
  components: ComponentDefinition[]
): LibraryRegistryItemUpdatePreview {
  const sourceComponents = new Map(
    components.map((component) => [component.id, component])
  );
  const deletedComponents = Object.entries(subscription.componentIdMap)
    .filter(([sourceComponentId]) => !sourceComponents.has(sourceComponentId))
    .map(([sourceComponentId, targetComponentId]) => ({
      sourceComponentId,
      targetComponentId,
      affectedInstanceIds: componentAffectedInstanceIds(target, targetComponentId)
    }));
  const conflictedComponents = Object.entries(subscription.componentIdMap)
    .flatMap(([sourceComponentId, targetComponentId]) => {
      const sourceComponent = sourceComponents.get(sourceComponentId);
      if (!sourceComponent) {
        return [];
      }
      const conflicts = componentOverrideTargetConflicts(
        target,
        targetComponentId,
        componentSourceNodeIds(sourceComponent)
      );
      return conflicts.affectedInstanceIds.length > 0
        ? [{
            sourceComponentId,
            targetComponentId,
            ...conflicts
          }]
        : [];
    });
  const blockedBy = [];
  if (deletedComponents.some((component) => component.affectedInstanceIds.length > 0)) {
    blockedBy.push("library_component_deletion_in_use");
  }
  if (conflictedComponents.length > 0) {
    blockedBy.push("library_component_override_target_missing");
  }

  return {
    canUpdate: blockedBy.length === 0,
    blockedBy,
    deletedComponents,
    conflictedComponents
  };
}

function componentSourceNodeIds(component: ComponentDefinition): Set<string> {
  const nodeIds = new Set<string>();
  const visit = (node: DesignNode): void => {
    nodeIds.add(node.id);
    node.children.forEach(visit);
  };
  visit(component.source_node);
  component.variants.forEach((variant) => {
    if (variant.source_node) {
      visit(variant.source_node);
    }
  });
  return nodeIds;
}

function componentOverrideTargetConflicts(
  document: DesignFile,
  componentId: string,
  sourceNodeIds: Set<string>
): { affectedInstanceIds: string[]; missingOverrideNodeIds: string[] } {
  const affectedInstanceIds = new Set<string>();
  const missingOverrideNodeIds = new Set<string>();
  const visit = (node: DesignNode): void => {
    if (node.component_instance?.definition_id === componentId) {
      const missingNodeIds = node.component_instance.overrides
        .map((override) => override.node_id)
        .filter((nodeId) => !sourceNodeIds.has(nodeId));
      if (missingNodeIds.length > 0) {
        affectedInstanceIds.add(node.id);
        missingNodeIds.forEach((nodeId) => missingOverrideNodeIds.add(nodeId));
      }
    }
    node.children.forEach(visit);
  };
  document.pages.forEach((page) => page.children.forEach(visit));
  return {
    affectedInstanceIds: [...affectedInstanceIds],
    missingOverrideNodeIds: [...missingOverrideNodeIds]
  };
}

function componentAffectedInstanceIds(
  document: DesignFile,
  componentId: string
): string[] {
  const affected = new Set<string>();
  const visit = (node: DesignNode): void => {
    const instance = node.component_instance;
    if (
      instance?.definition_id === componentId
      || instance?.overrides.some(
        (override) => override.field === "component_swap" && override.value === componentId
      )
    ) {
      affected.add(node.id);
    }
    node.children.forEach(visit);
  };
  document.pages.forEach((page) => page.children.forEach(visit));
  return [...affected];
}

function collectImageAssetIds(document: DesignFile): string[] {
  const assetIds = new Set<string>();
  for (const root of document.pages.flatMap((page) => page.children)) {
    collectImageAssetIdsFromNode(root, assetIds);
  }
  for (const component of document.components ?? []) {
    collectImageAssetIdsFromNode(component.source_node, assetIds);
    for (const variant of component.variants) {
      if (variant.source_node) {
        collectImageAssetIdsFromNode(variant.source_node, assetIds);
      }
    }
  }
  return [...assetIds].sort();
}

function collectComponentImageAssetIds(components: ComponentDefinition[]): string[] {
  const assetIds = new Set<string>();
  for (const component of components) {
    collectImageAssetIdsFromNode(component.source_node, assetIds);
    for (const variant of component.variants) {
      if (variant.source_node) {
        collectImageAssetIdsFromNode(variant.source_node, assetIds);
      }
    }
  }
  return [...assetIds].sort();
}

function collectImageAssetIdsFromNode(node: DesignNode, assetIds: Set<string>) {
  if (node.content.type === "image") {
    assertSafeStorageId(node.content.asset_id);
    assetIds.add(node.content.asset_id);
  }
  for (const fill of node.style.fills ?? []) {
    if (fill.paint?.type === "image") {
      assertSafeStorageId(fill.paint.asset_id);
      assetIds.add(fill.paint.asset_id);
    }
  }
  for (const stroke of node.style.strokes ?? []) {
    if (stroke.paint?.type === "image") {
      assertSafeStorageId(stroke.paint.asset_id);
      assetIds.add(stroke.paint.asset_id);
    }
  }
  for (const child of node.children) {
    collectImageAssetIdsFromNode(child, assetIds);
  }
}

function hasConflictingToken(target: DesignFile, token: DesignToken) {
  const existing = (target.tokens ?? []).find((candidate) => candidate.id === token.id);
  return Boolean(existing && (existing.type !== token.type || existing.value !== token.value));
}

function normalizeLibraryIdPrefix(value: string | undefined) {
  const prefix = value?.trim() || "library";
  assertSafeStorageId(prefix);
  return prefix;
}

function createLibraryTokenIdMap(
  target: DesignFile,
  tokens: DesignToken[],
  idPrefix: string | undefined
): Record<string, string> {
  const targetTokens = target.tokens ?? [];
  const usedIds = new Set(targetTokens.map((token) => token.id));
  const tokenIdMap: Record<string, string> = {};
  const conflictPrefix = idPrefix ?? "library";

  for (const token of tokens) {
    assertSafeStorageId(token.id);
    const existing = targetTokens.find((candidate) => candidate.id === token.id);
    if (existing && existing.type === token.type && existing.value === token.value) {
      tokenIdMap[token.id] = token.id;
      continue;
    }
    if (existing || usedIds.has(token.id)) {
      tokenIdMap[token.id] = createAvailableLibraryId(conflictPrefix, token.id, usedIds);
      continue;
    }
    usedIds.add(token.id);
    tokenIdMap[token.id] = token.id;
  }

  return tokenIdMap;
}

function createLibraryComponentIdMap(
  target: DesignFile,
  components: ComponentDefinition[],
  idPrefix: string | undefined
): Record<string, string> {
  const usedIds = new Set((target.components ?? []).map((component) => component.id));
  const componentIdMap: Record<string, string> = {};
  const conflictPrefix = idPrefix ?? "library";

  for (const component of components) {
    assertSafeStorageId(component.id);
    const shouldPrefix = Boolean(idPrefix) || usedIds.has(component.id);
    const nextId = shouldPrefix
      ? createAvailableLibraryId(conflictPrefix, component.id, usedIds)
      : component.id;
    if (!shouldPrefix) {
      usedIds.add(nextId);
    }
    componentIdMap[component.id] = nextId;
  }

  return componentIdMap;
}

function createAvailableLibraryId(prefix: string, originalId: string, usedIds: Set<string>) {
  let candidate = `${prefix}-${originalId}`;
  assertSafeStorageId(candidate);
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${prefix}-${originalId}-${suffix}`;
    assertSafeStorageId(candidate);
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function remapLibraryComponent(
  component: ComponentDefinition,
  nextComponentId: string,
  componentIdMap: Record<string, string>,
  tokenIdMap: Record<string, string>
): ComponentDefinition {
  return {
    ...structuredClone(component),
    id: nextComponentId,
    source_node: remapLibraryNode(component.source_node, componentIdMap, tokenIdMap)
  };
}

function remapLibraryNode(
  node: DesignNode,
  componentIdMap: Record<string, string>,
  tokenIdMap: Record<string, string>
): DesignNode {
  const nextNode = structuredClone(node);
  if (nextNode.style.fill_token && tokenIdMap[nextNode.style.fill_token]) {
    nextNode.style.fill_token = tokenIdMap[nextNode.style.fill_token];
  }
  if (nextNode.layout?.spacing_tokens) {
    nextNode.layout = {
      ...nextNode.layout,
      spacing_tokens: remapLayoutSpacingTokens(nextNode.layout.spacing_tokens, tokenIdMap)
    };
  }
  if (nextNode.component_instance?.definition_id && componentIdMap[nextNode.component_instance.definition_id]) {
    nextNode.component_instance = {
      ...nextNode.component_instance,
      definition_id: componentIdMap[nextNode.component_instance.definition_id]
    };
  }
  nextNode.children = nextNode.children.map((child) => remapLibraryNode(child, componentIdMap, tokenIdMap));
  return nextNode;
}

function remapLayoutSpacingTokens(
  spacingTokens: LayoutSpacingTokens,
  tokenIdMap: Record<string, string>
): LayoutSpacingTokens {
  const nextSpacingTokens: LayoutSpacingTokens = { ...spacingTokens };
  for (const key of Object.keys(nextSpacingTokens) as Array<keyof LayoutSpacingTokens>) {
    const tokenId = nextSpacingTokens[key];
    if (tokenId && tokenIdMap[tokenId]) {
      nextSpacingTokens[key] = tokenIdMap[tokenId];
    }
  }
  return nextSpacingTokens;
}

function countNodeTree(node: DesignNode) {
  return countNodes([node]);
}

function parseStoredFileVersion(input: unknown, expectedFileId: string): StoredFileVersion {
  if (!input || typeof input !== "object") {
    throw new Error("invalid file version");
  }

  const candidate = input as StoredFileVersion;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported file version schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.versionId);
  assertSafeStorageId(candidate.fileId);
  if (candidate.fileId !== expectedFileId) {
    throw new Error(`file version mismatch: ${candidate.fileId}`);
  }
  if (candidate.source !== "manual" && candidate.source !== "restore" && candidate.source !== "auto") {
    throw new Error(`unsupported file version source: ${String(candidate.source)}`);
  }
  if (!candidate.document || candidate.document.id !== expectedFileId) {
    throw new Error("file version document mismatch");
  }

  return {
    schemaVersion: 1,
    versionId: candidate.versionId,
    fileId: candidate.fileId,
    name: normalizeName(candidate.name, candidate.document.name),
    message: normalizeName(candidate.message, "저장된 버전"),
    source: candidate.source,
    pinned: Boolean(candidate.pinned),
    createdAt: normalizeName(candidate.createdAt, new Date(0).toISOString()),
    nodeCount: Math.max(0, Math.round(Number(candidate.nodeCount) || countDocumentNodes(candidate.document))),
    document: candidate.document
  };
}

function parseStoredCommentThreadFile(input: unknown, expectedFileId: string): StoredCommentThreadFile {
  if (!input || typeof input !== "object") {
    throw new Error("invalid comment thread file");
  }

  const candidate = input as StoredCommentThreadFile;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported comment thread file schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.fileId);
  if (candidate.fileId !== expectedFileId) {
    throw new Error(`comment thread file mismatch: ${candidate.fileId}`);
  }
  if (!Array.isArray(candidate.threads)) {
    throw new Error("comment threads are required");
  }

  return {
    schemaVersion: 1,
    fileId: candidate.fileId,
    threads: candidate.threads.map((thread) => parseStoredCommentThread(thread, expectedFileId)),
    activity: Array.isArray(candidate.activity)
      ? candidate.activity.map((event) => parseStoredCommentActivityEvent(event, expectedFileId))
      : [],
    events: Array.isArray(candidate.events)
      ? candidate.events
          .map((event) => parseStoredCommentLiveEvent(event, expectedFileId))
          .sort((a, b) => a.sequence - b.sequence)
      : []
  };
}

function parseStoredCommentThread(input: unknown, expectedFileId: string): StoredCommentThread {
  if (!input || typeof input !== "object") {
    throw new Error("invalid comment thread");
  }

  const candidate = input as StoredCommentThread;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported comment thread schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.threadId);
  assertSafeStorageId(candidate.fileId);
  assertSafeStorageId(candidate.nodeId);
  if (candidate.fileId !== expectedFileId) {
    throw new Error(`comment thread mismatch: ${candidate.fileId}`);
  }

  const body = normalizeCommentBody(candidate.body);
  const authorName = normalizeName(candidate.authorName, "사용자");
  const authorId = normalizeName(candidate.authorId, authorName);
  const createdAt = normalizeName(candidate.createdAt, new Date(0).toISOString());

  return {
    schemaVersion: 1,
    threadId: candidate.threadId,
    fileId: candidate.fileId,
    nodeId: candidate.nodeId,
    nodeName: normalizeName(candidate.nodeName, candidate.nodeId),
    body,
    authorId,
    authorName,
    createdAt,
    modifiedAt: normalizeName(candidate.modifiedAt, createdAt),
    resolvedAt: candidate.resolvedAt ? normalizeName(candidate.resolvedAt, "") : null,
    mentions: normalizeCommentMentionList(candidate.mentions, body),
    mentionTargets: normalizeCommentMentionTargetList(candidate.mentionTargets),
    readBy: normalizeCommentReaderList(candidate.readBy, authorId),
    replies: Array.isArray(candidate.replies)
      ? candidate.replies.map((reply) => parseStoredCommentReply(reply))
      : []
  };
}

function parseStoredCommentReply(input: unknown): StoredCommentReply {
  if (!input || typeof input !== "object") {
    throw new Error("invalid comment reply");
  }

  const candidate = input as StoredCommentReply;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported comment reply schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.replyId);

  const body = normalizeCommentBody(candidate.body);
  const authorName = normalizeName(candidate.authorName, "사용자");
  const authorId = normalizeName(candidate.authorId, authorName);
  const createdAt = normalizeName(candidate.createdAt, new Date(0).toISOString());

  return {
    schemaVersion: 1,
    replyId: candidate.replyId,
    body,
    authorId,
    authorName,
    createdAt,
    modifiedAt: normalizeName(candidate.modifiedAt, createdAt),
    mentions: normalizeCommentMentionList(candidate.mentions, body),
    mentionTargets: normalizeCommentMentionTargetList(candidate.mentionTargets)
  };
}

function parseStoredCommentActivityEvent(
  input: unknown,
  expectedFileId: string
): StoredCommentActivityEvent {
  if (!input || typeof input !== "object") {
    throw new Error("invalid comment activity event");
  }

  const candidate = input as StoredCommentActivityEvent;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported comment activity event schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.eventId);
  assertSafeStorageId(candidate.fileId);
  assertSafeStorageId(candidate.threadId);
  assertSafeStorageId(candidate.nodeId);
  if (candidate.replyId) {
    assertSafeStorageId(candidate.replyId);
  }
  if (candidate.fileId !== expectedFileId) {
    throw new Error(`comment activity file mismatch: ${candidate.fileId}`);
  }
  if (!["created", "replied", "resolved"].includes(candidate.type)) {
    throw new Error(`unsupported comment activity type: ${String(candidate.type)}`);
  }

  const body = normalizeCommentBody(candidate.body);
  return {
    schemaVersion: 1,
    eventId: candidate.eventId,
    type: candidate.type,
    fileId: candidate.fileId,
    threadId: candidate.threadId,
    ...(candidate.replyId ? { replyId: candidate.replyId } : {}),
    nodeId: candidate.nodeId,
    nodeName: normalizeName(candidate.nodeName, candidate.nodeId),
    actorName: normalizeName(candidate.actorName, "사용자"),
    body,
    mentions: normalizeCommentMentionList(candidate.mentions, body),
    mentionTargets: normalizeCommentMentionTargetList(candidate.mentionTargets),
    createdAt: normalizeName(candidate.createdAt, new Date(0).toISOString())
  };
}

function parseStoredCommentLiveEvent(
  input: unknown,
  expectedFileId: string
): StoredCommentLiveEvent {
  if (!input || typeof input !== "object") {
    throw new Error("invalid comment live event");
  }

  const candidate = input as StoredCommentLiveEvent;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported comment live event schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.eventId);
  assertSafeStorageId(candidate.fileId);
  if (candidate.threadId) {
    assertSafeStorageId(candidate.threadId);
  }
  if (candidate.replyId) {
    assertSafeStorageId(candidate.replyId);
  }
  if (candidate.fileId !== expectedFileId) {
    throw new Error(`comment live event file mismatch: ${candidate.fileId}`);
  }
  if (!["created", "replied", "resolved", "read", "edited", "deleted"].includes(candidate.type)) {
    throw new Error(`unsupported comment live event type: ${String(candidate.type)}`);
  }

  return {
    schemaVersion: 1,
    eventId: candidate.eventId,
    sequence: Math.max(0, Math.round(Number(candidate.sequence) || 0)),
    type: candidate.type,
    fileId: candidate.fileId,
    ...(candidate.threadId ? { threadId: candidate.threadId } : {}),
    ...(candidate.replyId ? { replyId: candidate.replyId } : {}),
    ...(candidate.viewerId ? { viewerId: normalizeName(candidate.viewerId, "사용자") } : {}),
    createdAt: normalizeName(candidate.createdAt, new Date(0).toISOString())
  };
}

function summarizeStoredFileVersion(version: StoredFileVersion): StoredFileVersionSummary {
  return {
    schemaVersion: version.schemaVersion,
    versionId: version.versionId,
    fileId: version.fileId,
    name: version.name,
    message: version.message,
    source: version.source,
    pinned: version.pinned,
    createdAt: version.createdAt,
    nodeCount: version.nodeCount
  };
}

function parseAutoFileVersionState(input: unknown, expectedFileId: string): AutoFileVersionState {
  if (!input || typeof input !== "object") {
    throw new Error("invalid auto file version state");
  }

  const candidate = input as AutoFileVersionState;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported auto file version state schema: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.fileId);
  if (candidate.fileId !== expectedFileId) {
    throw new Error(`auto file version state mismatch: ${candidate.fileId}`);
  }
  if (candidate.lastAutoVersionId !== undefined) {
    assertSafeStorageId(candidate.lastAutoVersionId);
  }

  return {
    schemaVersion: 1,
    fileId: candidate.fileId,
    editCount: Math.max(0, Math.round(Number(candidate.editCount) || 0)),
    lastAutoVersionId: candidate.lastAutoVersionId,
    updatedAt: normalizeName(candidate.updatedAt, new Date(0).toISOString())
  };
}

function countDocumentNodes(document: DesignFile) {
  return document.pages.reduce((total, page) => total + countNodes(page.children), 0);
}

function countNodes(nodes: DesignNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

function forEachNode(document: DesignFile, callback: (node: DesignNode) => void): void {
  const visit = (node: DesignNode) => {
    callback(node);
    for (const child of node.children) {
      visit(child);
    }
  };

  for (const page of document.pages) {
    for (const child of page.children) {
      visit(child);
    }
  }
}

function normalizeComponentVariant(input: {
  id: string;
  name: string;
  properties: Array<{ name: string; value: string; type?: ComponentPropertyType }>;
  source_node?: DesignNode | null;
}): { id: string; name: string; properties: ComponentProperty[]; source_node?: DesignNode | null } {
  const id = input.id.trim();
  if (!id) {
    throw new Error("component variant id is required");
  }
  const name = input.name.trim() || id;
  const variant: { id: string; name: string; properties: ComponentProperty[]; source_node?: DesignNode | null } = {
    id,
    name,
    properties: Array.isArray(input.properties)
      ? input.properties.map((property) => ({
          name: property.name.trim(),
          value: property.value.trim(),
          type: property.type === "boolean" ? "boolean" : "select"
        }))
      : []
  };
  if (input.source_node !== undefined) {
    variant.source_node = input.source_node ? structuredClone(input.source_node) : null;
  }
  return variant;
}

function defaultComponentVariantArea(): ComponentVariantArea {
  return {
    layout: "horizontal",
    gap: 32,
    padding: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function normalizeComponentVariantArea(area: ComponentVariantArea | null | undefined): ComponentVariantArea | null {
  if (!area) {
    return null;
  }

  return {
    layout: area.layout === "vertical" ? "vertical" : "horizontal",
    gap: Math.max(0, Number.isFinite(area.gap) ? area.gap : 0),
    padding: {
      top: Math.max(0, Number.isFinite(area.padding?.top) ? area.padding.top : 0),
      right: Math.max(0, Number.isFinite(area.padding?.right) ? area.padding.right : 0),
      bottom: Math.max(0, Number.isFinite(area.padding?.bottom) ? area.padding.bottom : 0),
      left: Math.max(0, Number.isFinite(area.padding?.left) ? area.padding.left : 0)
    }
  };
}

function reflowComponentVariantArea(
  document: DesignFile,
  component: ComponentDefinition,
  previousArea: ComponentVariantArea | null | undefined
): void {
  const area = component.variant_area;
  if (!area) {
    return;
  }

  const sources = component.variants
    .map((variant, index) => variant.source_node ?? (index === 0 ? component.source_node : null))
    .filter((source): source is DesignNode => Boolean(source));
  if (!sources.length) {
    return;
  }

  const originX = component.source_node.transform.x - (previousArea?.padding.left ?? 0);
  const originY = component.source_node.transform.y - (previousArea?.padding.top ?? 0);
  let cursorX = originX + area.padding.left;
  let cursorY = originY + area.padding.top;

  for (const source of sources) {
    source.transform = { ...source.transform, x: cursorX, y: cursorY };
    const canvasNode = findNodeById(document, source.id);
    if (canvasNode) {
      canvasNode.transform = { ...canvasNode.transform, x: cursorX, y: cursorY };
    }

    if (area.layout === "vertical") {
      cursorY += source.size.height + area.gap;
    } else {
      cursorX += source.size.width + area.gap;
    }
  }

  component.source_node = structuredClone(sources[0]);
}

async function readProjectIfPresent(projectPath: string): Promise<ProjectManifest | null> {
  let raw: string;
  try {
    raw = await readFile(projectPath, "utf8");
  } catch {
    return null;
  }

  try {
    return parseProjectManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isLegacySampleProject(project: ProjectManifest) {
  return (
    project.projectId === LEGACY_SAMPLE_PROJECT_ID &&
    project.currentDocumentId === sampleDocument.id &&
    project.documents.length === 1 &&
    project.documents[0]?.documentId === sampleDocument.id
  );
}

function createInitialDesignFile(documentId: string, name: string): DesignFile {
  return {
    ...(JSON.parse(JSON.stringify(sampleDocument)) as DesignFile),
    id: documentId,
    name
  };
}

function parseProjectManifest(input: unknown): ProjectManifest {
  if (!input || typeof input !== "object") {
    throw new Error("invalid project manifest");
  }

  const candidate = input as ProjectManifest;
  if (candidate.schemaVersion !== 1) {
    throw new Error(`unsupported project manifest schema version: ${String(candidate.schemaVersion)}`);
  }
  assertSafeStorageId(candidate.projectId);
  assertSafeStorageId(candidate.currentDocumentId);
  if (!candidate.name?.trim()) {
    throw new Error("project name is required");
  }
  if (!Array.isArray(candidate.documents) || candidate.documents.length === 0) {
    throw new Error("project documents are required");
  }
  for (const document of candidate.documents) {
    assertSafeStorageId(document.documentId);
    if (!document.name?.trim()) {
      throw new Error("project document name is required");
    }
  }
  if (!candidate.documents.some((document) => document.documentId === candidate.currentDocumentId)) {
    throw new Error(`project current document not found: ${candidate.currentDocumentId}`);
  }
  if (candidate.sharing.mode === "team" && !candidate.sharing.teamId?.trim()) {
    throw new Error("team id is required for project sharing");
  }

  return candidate;
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

function replaceNodeById(document: DesignFile, nodeId: string, replacement: DesignNode): boolean {
  for (const page of document.pages) {
    const index = page.children.findIndex((node) => node.id === nodeId);
    if (index !== -1) {
      page.children[index] = replacement;
      return true;
    }

    for (const node of page.children) {
      if (replaceInNode(node, nodeId, replacement)) {
        return true;
      }
    }
  }

  return false;
}

function replaceInNode(node: DesignNode, nodeId: string, replacement: DesignNode): boolean {
  const index = node.children.findIndex((child) => child.id === nodeId);
  if (index !== -1) {
    node.children[index] = replacement;
    return true;
  }

  for (const child of node.children) {
    if (replaceInNode(child, nodeId, replacement)) {
      return true;
    }
  }

  return false;
}

function syncComponentInstanceTextOverride(document: DesignFile, nodeId: string, value: string): void {
  const owner = findComponentInstanceOwner(document, nodeId);
  if (!owner || !owner.instance.component_instance) {
    return;
  }

  const sourceValue = findComponentSourceTextValue(document, owner.instance, owner.sourceNodeId);
  if (sourceValue === null) {
    return;
  }

  const existingOverrides = owner.instance.component_instance.overrides ?? [];
  const nextOverrides = existingOverrides.filter(
    (override) => !(override.node_id === owner.sourceNodeId && override.field === "text")
  );
  if (value !== sourceValue) {
    nextOverrides.push({ node_id: owner.sourceNodeId, field: "text", value });
  }

  owner.instance.component_instance = {
    ...owner.instance.component_instance,
    overrides: nextOverrides
  };
}

function syncComponentInstanceStyleOverride(
  document: DesignFile,
  nodeId: string,
  field: ComponentInstanceStyleOverrideField,
  value: DesignNode["style"][ComponentInstanceStyleOverrideField]
): void {
  syncComponentInstanceStyleOverrides(document, nodeId, { [field]: value } as Partial<DesignNode["style"]>, [field]);
}

function syncComponentInstanceStyleOverrides(
  document: DesignFile,
  nodeId: string,
  style: Partial<DesignNode["style"]>,
  fields: ComponentInstanceStyleOverrideField[] = componentInstanceStyleOverrideFields
): void {
  const owner = findComponentInstanceOwner(document, nodeId);
  if (!owner?.instance.component_instance) {
    return;
  }

  const existingOverrides = owner.instance.component_instance.overrides ?? [];
  const fieldsToSync = fields.filter((field) => Object.prototype.hasOwnProperty.call(style, field));
  if (fieldsToSync.length === 0) {
    return;
  }

  const nextOverrides = existingOverrides.filter(
    (override) =>
      !(
        override.node_id === owner.sourceNodeId &&
        fieldsToSync.includes(override.field as ComponentInstanceStyleOverrideField)
      )
  );
  for (const field of fieldsToSync) {
    const sourceValue = findComponentSourceStyleValue(document, owner.instance, owner.sourceNodeId, field);
    if (sourceValue === undefined) {
      continue;
    }
    const value = style[field];
    if (serializeComponentOverrideValue(value) !== serializeComponentOverrideValue(sourceValue)) {
      nextOverrides.push({
        node_id: owner.sourceNodeId,
        field,
        value: serializeComponentOverrideValue(value)
      });
    }
  }

  owner.instance.component_instance = {
    ...owner.instance.component_instance,
    overrides: nextOverrides
  };
}

function syncComponentInstanceGeometryOverrides(document: DesignFile, nodeId: string, patch: GeometryPatch): void {
  const owner = findComponentInstanceOwner(document, nodeId);
  if (!owner?.instance.component_instance) {
    return;
  }

  const node = findNodeById(document, nodeId);
  if (!node) {
    return;
  }

  const fieldsToSync = componentInstanceGeometryOverrideFields.filter((field) =>
    Object.prototype.hasOwnProperty.call(patch, field)
  );
  if (owner.instance.id === nodeId) {
    const placementFields = new Set<ComponentInstanceGeometryOverrideField>(["x", "y"]);
    const sizeFieldsOnly = fieldsToSync.filter((field) => !placementFields.has(field));
    fieldsToSync.splice(0, fieldsToSync.length, ...sizeFieldsOnly);
  }
  if (fieldsToSync.length === 0) {
    return;
  }

  const existingOverrides = owner.instance.component_instance.overrides ?? [];
  const nextOverrides = existingOverrides.filter(
    (override) =>
      !(
        override.node_id === owner.sourceNodeId &&
        fieldsToSync.includes(override.field as ComponentInstanceGeometryOverrideField)
      )
  );
  for (const field of fieldsToSync) {
    const sourceValue = findComponentSourceGeometryValue(document, owner.instance, owner.sourceNodeId, field);
    if (sourceValue === undefined) {
      continue;
    }
    const value = geometryOverrideValue(node, field);
    if (serializeComponentOverrideValue(value) !== serializeComponentOverrideValue(sourceValue)) {
      nextOverrides.push({
        node_id: owner.sourceNodeId,
        field,
        value: serializeComponentOverrideValue(value)
      });
    }
  }

  owner.instance.component_instance = {
    ...owner.instance.component_instance,
    overrides: nextOverrides
  };
}

function serializeComponentOverrideValue(value: unknown): string {
  if (value === null) {
    return nullComponentOverrideValue;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function deserializeComponentOverrideValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function findComponentInstanceOwner(
  document: DesignFile,
  nodeId: string
): { instance: DesignNode; sourceNodeId: string } | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = findComponentInstanceOwnerInNode(document, node, nodeId, null);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findComponentInstanceOwnerInNode(
  document: DesignFile,
  node: DesignNode,
  nodeId: string,
  currentInstance: DesignNode | null
): { instance: DesignNode; sourceNodeId: string } | null {
  const nextInstance = node.component_instance ? node : currentInstance;
  if (node.id === nodeId) {
    if (node.component_instance) {
      const sourceNodeId = findComponentSourceRootNodeId(document, node);
      return sourceNodeId ? { instance: node, sourceNodeId } : null;
    }
    if (!nextInstance || nextInstance.id === nodeId) {
      return null;
    }
    const sourceNodeId = sourceNodeIdFromInstanceNodeId(nextInstance.id, nodeId);
    return sourceNodeId ? { instance: nextInstance, sourceNodeId } : null;
  }

  for (const child of node.children) {
    const found = findComponentInstanceOwnerInNode(document, child, nodeId, nextInstance);
    if (found) {
      return found;
    }
  }

  return null;
}

function sourceNodeIdFromInstanceNodeId(instanceId: string, nodeId: string): string | null {
  const prefix = `${instanceId}__`;
  if (!nodeId.startsWith(prefix)) {
    return null;
  }
  const sourceNodeId = nodeId.slice(prefix.length);
  return sourceNodeId ? sourceNodeId : null;
}

function findComponentSourceRootNodeId(document: DesignFile, instance: DesignNode): string | null {
  return componentSourceNodeForInstance(document, instance)?.id ?? null;
}

function findComponentSourceTextValue(
  document: DesignFile,
  instance: DesignNode,
  sourceNodeId: string
): string | null {
  const sourceNode = componentSourceNodeForInstance(document, instance);
  if (!sourceNode) {
    return null;
  }
  const textNode = findInNode(sourceNode, sourceNodeId);
  return textNode?.content.type === "text" ? textNode.content.value : null;
}

function findComponentSourceStyleValue(
  document: DesignFile,
  instance: DesignNode,
  sourceNodeId: string,
  field: ComponentInstanceStyleOverrideField
): DesignNode["style"][ComponentInstanceStyleOverrideField] | undefined {
  const sourceNode = componentSourceNodeForInstance(document, instance);
  if (!sourceNode) {
    return undefined;
  }
  const node = findInNode(sourceNode, sourceNodeId);
  if (!node) {
    return undefined;
  }
  if (field === "effect_shadow") {
    return node.style.effect_shadow ?? null;
  }
  return node.style[field];
}

function findComponentSourceGeometryValue(
  document: DesignFile,
  instance: DesignNode,
  sourceNodeId: string,
  field: ComponentInstanceGeometryOverrideField
): number | undefined {
  const sourceNode = componentSourceNodeForInstance(document, instance);
  if (!sourceNode) {
    return undefined;
  }
  const node = findInNode(sourceNode, sourceNodeId);
  return node ? geometryOverrideValue(node, field) : undefined;
}

function geometryOverrideValue(node: DesignNode, field: ComponentInstanceGeometryOverrideField): number {
  if (field === "x" || field === "y") {
    return node.transform[field];
  }
  return node.size[field];
}

function componentSourceNodeForVariant(
  definition: ComponentDefinition,
  variantId: string | null | undefined
): DesignNode {
  const variant = variantId ? definition.variants.find((candidate) => candidate.id === variantId) : null;
  return variant?.source_node ?? definition.source_node;
}

function componentSourceNodeForInstance(document: DesignFile, instance: DesignNode): DesignNode | null {
  const definitionId = instance.component_instance?.definition_id;
  const definition = (document.components ?? []).find((component) => component.id === definitionId);
  return definition ? componentSourceNodeForVariant(definition, instance.component_instance?.variant_id ?? null) : null;
}

function materializeComponentInstanceNode(
  definition: ComponentDefinition,
  variantId: string | null | undefined,
  instanceId: string,
  options: {
    name: string;
    transform: DesignNode["transform"];
    componentInstance: DesignNode["component_instance"];
    locked?: boolean;
    visible?: boolean;
    layoutItem?: DesignNode["layout_item"];
    constraints?: DesignNode["constraints"];
    exportPresets?: DesignNode["export_presets"];
  }
): DesignNode {
  const sourceNode = componentSourceNodeForVariant(definition, variantId);
  const node = structuredClone(sourceNode);
  renameInstanceTree(node, instanceId);
  node.id = instanceId;
  node.kind = "component_instance";
  node.name = options.name;
  node.transform = structuredClone(options.transform);
  node.component_instance = options.componentInstance
    ? {
        ...options.componentInstance,
        variant_id: variantId ?? null,
        overrides: structuredClone(options.componentInstance.overrides ?? [])
      }
    : null;
  if (options.locked !== undefined) {
    node.locked = options.locked;
  }
  if (options.visible !== undefined) {
    node.visible = options.visible;
  }
  if (options.layoutItem !== undefined) {
    node.layout_item = structuredClone(options.layoutItem);
  }
  if (options.constraints !== undefined) {
    node.constraints = structuredClone(options.constraints);
  }
  if (options.exportPresets !== undefined) {
    node.export_presets = structuredClone(options.exportPresets);
  }
  applyComponentInstanceOverrides(node, sourceNode.id);
  return node;
}

function applyComponentInstanceOverrides(instance: DesignNode, sourceRootNodeId: string): void {
  const overrides = instance.component_instance?.overrides ?? [];
  for (const override of overrides) {
    const targetNodeId = override.node_id === sourceRootNodeId ? instance.id : `${instance.id}__${override.node_id}`;
    const target = findInNode(instance, targetNodeId);
    if (!target) {
      continue;
    }
    if (override.field === "text" && target.content.type === "text") {
      target.content = { ...target.content, value: override.value };
    } else if (override.field === "fill") {
      target.style = { ...target.style, fill: override.value, fill_token: null, fill_style: null };
    } else if (override.field === "fills") {
      const fills = deserializeComponentOverrideValue(override.value);
      if (Array.isArray(fills)) {
        target.style = { ...target.style, fills: fills as NodeFill[] };
      }
    } else if (override.field === "strokes") {
      const strokes = deserializeComponentOverrideValue(override.value);
      if (Array.isArray(strokes)) {
        target.style = { ...target.style, strokes: strokes as NodeStroke[] };
      }
    } else if (override.field === "stroke") {
      target.style = {
        ...target.style,
        stroke: override.value === nullComponentOverrideValue ? null : override.value
      };
    } else if (override.field === "stroke_width" || override.field === "opacity") {
      const value = Number(override.value);
      if (Number.isFinite(value)) {
        target.style = { ...target.style, [override.field]: value };
      }
    } else if (override.field === "effect_shadow") {
      target.style = {
        ...target.style,
        effect_shadow: override.value === nullComponentOverrideValue ? null : override.value
      };
    } else if (override.field === "x" || override.field === "y") {
      const value = Number(override.value);
      if (Number.isFinite(value)) {
        target.transform = { ...target.transform, [override.field]: value };
      }
    } else if (override.field === "width" || override.field === "height") {
      const value = Number(override.value);
      if (Number.isFinite(value)) {
        target.size = { ...target.size, [override.field]: Math.max(1, value) };
      }
    }
  }
}

function pinDirectGeometryResizeLayoutItemAxes(
  document: DesignFile,
  nodeId: string,
  patch: GeometryPatch
): void {
  if (patch.width === undefined && patch.height === undefined) {
    return;
  }

  const selected = findNodeWithParent(document, nodeId);
  const parent = selected ? findNodeById(document, selected.parentId) : null;
  if (
    !selected ||
    !parent?.layout ||
    (parent.layout.mode !== "auto" && parent.layout.mode !== "grid") ||
    layoutItemPositionForStorage(selected.node.layout_item) !== "static"
  ) {
    return;
  }

  const layoutItem = normalizeNodeLayoutItem(
    selected.node.layout_item ?? { margin: { top: 0, right: 0, bottom: 0, left: 0 } }
  );
  let changed = false;
  if (patch.width !== undefined && layoutItem.width_sizing === "fill") {
    delete layoutItem.width_sizing;
    changed = true;
  }
  if (patch.height !== undefined && layoutItem.height_sizing === "fill") {
    delete layoutItem.height_sizing;
    changed = true;
  }

  if (changed) {
    restoreNodeLayoutItemForGeometry(selected.node, layoutItem);
  }
}

function restoreNodeLayoutItemForGeometry(node: DesignNode, layoutItem: NodeLayoutItem): void {
  const normalized = normalizeNodeLayoutItem(layoutItem);
  if (hasLayoutItemMetadata(normalized)) {
    node.layout_item = normalized;
  } else {
    delete node.layout_item;
  }
}

function hasLayoutItemMetadata(layoutItem: NodeLayoutItem): boolean {
  return Boolean(
    layoutItem.position ||
      layoutItem.width_sizing ||
      layoutItem.height_sizing ||
      layoutItem.justify_self ||
      layoutItem.align_self ||
      layoutItem.min_width !== undefined ||
      layoutItem.max_width !== undefined ||
      layoutItem.min_height !== undefined ||
      layoutItem.max_height !== undefined ||
      layoutItem.grid_area ||
      layoutItem.grid_column !== undefined ||
      layoutItem.grid_row !== undefined ||
      layoutItem.grid_column_span !== undefined ||
      layoutItem.grid_row_span !== undefined ||
      layoutItem.margin.top !== 0 ||
      layoutItem.margin.right !== 0 ||
      layoutItem.margin.bottom !== 0 ||
      layoutItem.margin.left !== 0
  );
}

function layoutItemPositionForStorage(layoutItem: NodeLayoutItem | null | undefined): "static" | "absolute" {
  return layoutItem?.position === "absolute" ? "absolute" : "static";
}

function findNodeWithParent(
  document: DesignFile,
  nodeId: string
): { parentId: string; node: DesignNode } | null {
  for (const page of document.pages) {
    const topLevelNode = page.children.find((node) => node.id === nodeId);
    if (topLevelNode) {
      return { parentId: page.id, node: topLevelNode };
    }

    for (const node of page.children) {
      const found = findNodeParentInTree(node, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findNodeParentInTree(parent: DesignNode, nodeId: string): { parentId: string; node: DesignNode } | null {
  const child = parent.children.find((candidate) => candidate.id === nodeId);
  if (child) {
    return { parentId: parent.id, node: child };
  }

  for (const candidate of parent.children) {
    const found = findNodeParentInTree(candidate, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

function localizeLegacySampleLabels(document: DesignFile): boolean {
  let changed = false;
  if (document.name === "Sample File") {
    document.name = "샘플 파일";
    changed = true;
  }

  for (const page of document.pages) {
    if (page.name === "Page 1") {
      page.name = "페이지 1";
      changed = true;
    }
    for (const node of page.children) {
      changed = localizeLegacySampleNode(node) || changed;
    }
  }

  return changed;
}

function localizeLegacySampleNode(node: DesignNode): boolean {
  let changed = false;
  if (node.name === "Landing Frame") {
    node.name = "랜딩 프레임";
    changed = true;
  }
  if (node.name === "Headline") {
    node.name = "헤드라인";
    changed = true;
  }
  if (node.content.type === "text" && node.content.value === legacyEnglishProductName()) {
    node.content.value = "Layo";
    changed = true;
  }
  if (node.content.type === "text" && node.content.value === legacyKoreanProductName()) {
    node.content.value = "Layo";
    changed = true;
  }

  for (const child of node.children) {
    changed = localizeLegacySampleNode(child) || changed;
  }

  return changed;
}

function findParentChildren(document: DesignFile, parentId: string): { children: DesignNode[] } | null {
  const page = document.pages.find((candidate) => candidate.id === parentId);
  if (page) {
    return page;
  }

  const node = findNodeById(document, parentId);
  return node ? { children: node.children } : null;
}

function renameInstanceTree(node: DesignNode, instanceId: string) {
  for (const child of node.children) {
    child.id = `${instanceId}__${child.id}`;
    renameInstanceTree(child, instanceId);
  }
}
