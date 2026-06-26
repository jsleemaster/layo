import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
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
  importDesignTokensFromDtcg
} from "./design-token-io.js";
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
export const INPUT_VALIDATION_ERROR_CODE = "CANVAS_INPUT_VALIDATION";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  align_items: "start" | "center" | "end" | "stretch" | "baseline";
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
  width_sizing?: "fixed" | "fill";
  height_sizing?: "fixed" | "fill";
  justify_self?: "start" | "center" | "end" | "stretch";
  align_self?: "start" | "center" | "end" | "stretch";
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

export type ImageFitMode = "fill" | "fit";

export interface DesignNode {
  id: string;
  kind: "frame" | "group" | "rectangle" | "text" | "image" | "component" | "component_instance";
  name: string;
  component_instance?: ComponentInstance | null;
  layout?: NodeLayout | null;
  layout_item?: NodeLayoutItem | null;
  constraints?: NodeConstraints | null;
  locked?: boolean;
  visible?: boolean;
  transform: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    fill_token?: string | null;
    stroke: string | null;
    stroke_width: number;
    opacity: number;
  };
  content:
    | { type: "empty" }
    | { type: "text"; value: string; font_size: number; font_family: string }
    | {
        type: "image";
        asset_id: string;
        natural_width?: number;
        natural_height?: number;
        fit_mode?: ImageFitMode;
      };
  children: DesignNode[];
}

export interface ComponentDefinition {
  id: string;
  name: string;
  source_node: DesignNode;
  variants: Array<{ id: string; name: string; properties: Array<{ name: string; value: string }> }>;
}

export interface ComponentInstance {
  definition_id: string;
  overrides: Array<{ node_id: string; field: string; value: string }>;
  detached: boolean;
}

export interface DesignToken {
  id: string;
  name: string;
  type: "color" | "spacing";
  value: string;
}

export interface DesignFile {
  id: string;
  name: string;
  version?: number;
  tokens?: DesignToken[];
  components?: ComponentDefinition[];
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

export interface StoredCommentThread {
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
  readBy: string[];
  unread?: boolean;
  replies: StoredCommentReply[];
}

export interface StoredCommentReply {
  schemaVersion: 1;
  replyId: string;
  body: string;
  authorName: string;
  createdAt: string;
  mentions: string[];
}

export type CommentActivityType = "created" | "replied" | "resolved";

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
  createdAt: string;
}

export interface CreateCommentThreadInput {
  nodeId: string;
  body: string;
  authorName?: string;
}

export interface CreateCommentReplyInput {
  body: string;
  authorName?: string;
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
}

export interface CommentNotificationProjectSummary {
  projectId: string;
  name: string;
  unreadCount: number;
  files: CommentNotificationFileSummary[];
}

export interface CommentNotificationSummary {
  viewerId: string;
  totalUnread: number;
  projects: CommentNotificationProjectSummary[];
}

interface StoredCommentThreadFile {
  schemaVersion: 1;
  fileId: string;
  threads: StoredCommentThread[];
  activity: StoredCommentActivityEvent[];
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

export class FileStorage {
  private readonly priorRootDir: string | null;

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

  private async adoptPriorDefaultStoreIfNeeded() {
    if (!this.priorRootDir || (await pathExists(this.rootDir)) || !(await pathExists(this.priorRootDir))) {
      return;
    }

    await rename(this.priorRootDir, this.rootDir);
  }

  async prepareFiles() {
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.filesDir, { recursive: true });
    await this.removeUnreferencedLegacySampleDocument();
  }

  async prepareProjects() {
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.filesDir, { recursive: true });
    await mkdir(this.projectsDir, { recursive: true });
    await this.removeLegacySampleProject();
    await this.removeUnreferencedLegacySampleDocument();
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
    const projectSummaries: CommentNotificationProjectSummary[] = [];

    for (const project of projects) {
      const files: CommentNotificationFileSummary[] = [];
      for (const document of project.documents) {
        const store = await this.readCommentThreadFile(document.documentId);
        const unreadCount = countUnreadCommentThreads(store.threads, viewerId);
        if (unreadCount > 0) {
          files.push({
            fileId: document.documentId,
            name: document.name,
            unreadCount
          });
        }
      }

      const unreadCount = files.reduce((total, file) => total + file.unreadCount, 0);
      if (unreadCount > 0) {
        projectSummaries.push({
          projectId: project.projectId,
          name: project.name,
          unreadCount,
          files
        });
      }
    }

    return {
      viewerId,
      totalUnread: projectSummaries.reduce((total, project) => total + project.unreadCount, 0),
      projects: projectSummaries
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
    await this.adoptPriorDefaultStoreIfNeeded();
    await mkdir(this.filesDir, { recursive: true });
    await writeFile(this.filePathFor(fileId), `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
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
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.versionId.localeCompare(a.versionId)
    );
  }

  async saveFileVersion(
    fileId: string,
    input: SaveFileVersionInput = {}
  ): Promise<StoredFileVersionSummary> {
    const document = await this.readFile(fileId);
    return this.writeFileVersion(fileId, document, input);
  }

  async readFileVersion(fileId: string, versionId: string): Promise<StoredFileVersion> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const raw = await readFile(this.fileVersionPathFor(fileId, versionId), "utf8");
    return parseStoredFileVersion(JSON.parse(raw), fileId);
  }

  async restoreFileVersion(fileId: string, versionId: string): Promise<RestoreFileVersionResult> {
    const restoredVersion = await this.readFileVersion(fileId, versionId);
    const currentDocument = await this.readFile(fileId);
    const recoveryVersion = await this.writeFileVersion(fileId, currentDocument, {
      message: "복원 전 자동 저장",
      source: "restore"
    });
    const restoredDocument = { ...structuredClone(restoredVersion.document), id: fileId };
    await this.writeFile(fileId, restoredDocument);
    return {
      file: restoredDocument,
      restoredVersion: summarizeStoredFileVersion(restoredVersion),
      recoveryVersion
    };
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

    const now = new Date().toISOString();
    const body = normalizeCommentBody(input.body);
    const authorName = normalizeName(input.authorName, "사용자");
    const thread: StoredCommentThread = {
      schemaVersion: 1,
      threadId: createStorageId("comment"),
      fileId,
      nodeId: node.id,
      nodeName: node.name,
      body,
      authorName,
      createdAt: now,
      resolvedAt: null,
      mentions: extractCommentMentions(body),
      readBy: [authorName],
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
        createdAt: thread.createdAt
      })
    });
    return thread;
  }

  async addCommentReply(
    fileId: string,
    threadId: string,
    input: CreateCommentReplyInput
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const store = await this.readCommentThreadFile(fileId);
    const thread = store.threads.find((candidate) => candidate.threadId === threadId);
    if (!thread) {
      throw new Error(`comment thread not found: ${threadId}`);
    }

    const body = normalizeCommentBody(input.body);
    const authorName = normalizeName(input.authorName, "사용자");
    const reply: StoredCommentReply = {
      schemaVersion: 1,
      replyId: createStorageId("reply"),
      body,
      authorName,
      createdAt: new Date().toISOString(),
      mentions: extractCommentMentions(body)
    };
    const repliedThread: StoredCommentThread = {
      ...thread,
      readBy: [authorName],
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
        createdAt: reply.createdAt
      })
    });
    return repliedThread;
  }

  async markCommentThreadRead(
    fileId: string,
    threadId: string,
    input: MarkCommentThreadReadInput = {}
  ): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const viewerId = normalizeName(input.viewerId, "사용자");
    const store = await this.readCommentThreadFile(fileId);
    const thread = store.threads.find((candidate) => candidate.threadId === threadId);
    if (!thread) {
      throw new Error(`comment thread not found: ${threadId}`);
    }

    const readThread: StoredCommentThread = {
      ...thread,
      readBy: uniqueNames([...thread.readBy, viewerId])
    };
    await this.writeCommentThreadFile({
      ...store,
      threads: store.threads.map((candidate) =>
        candidate.threadId === threadId ? readThread : candidate
      )
    });
    return withViewerUnread(readThread, viewerId);
  }

  async markFileCommentsRead(
    fileId: string,
    input: MarkFileCommentsReadInput = {}
  ): Promise<StoredCommentThread[]> {
    await this.readFile(fileId);
    const viewerId = normalizeName(input.viewerId, "사용자");
    const store = await this.readCommentThreadFile(fileId);
    const threads = store.threads.map((thread) =>
      thread.resolvedAt === null
        ? {
            ...thread,
            readBy: uniqueNames([...thread.readBy, viewerId])
          }
        : thread
    );
    await this.writeCommentThreadFile({ ...store, threads });
    return threads.map((thread) => withViewerUnread(thread, viewerId));
  }

  async resolveCommentThread(fileId: string, threadId: string): Promise<StoredCommentThread> {
    assertSafeStorageId(threadId);
    await this.readFile(fileId);
    const store = await this.readCommentThreadFile(fileId);
    const thread = store.threads.find((candidate) => candidate.threadId === threadId);
    if (!thread) {
      throw new Error(`comment thread not found: ${threadId}`);
    }

    const resolvedAt = thread.resolvedAt ?? new Date().toISOString();
    const resolvedThread: StoredCommentThread = {
      ...thread,
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
        createdAt: resolvedAt
      })
    });
    return resolvedThread;
  }

  async exportTokensDtcg(fileId: string): Promise<Record<string, unknown>> {
    const document = await this.readFile(fileId);
    return exportDesignTokensToDtcg(document.tokens ?? []);
  }

  async importTokensDtcg(
    fileId: string,
    tokensDocument: unknown
  ): Promise<{ file: DesignFile; tokens: DesignToken[] }> {
    const document = await this.readFile(fileId);
    const tokens = importDesignTokensFromDtcg(tokensDocument);
    document.tokens = tokens;
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return { file: document, tokens };
  }

  async updateNodeGeometry(fileId: string, nodeId: string, patch: GeometryPatch): Promise<DesignNode> {
    const document = await this.readFile(fileId);
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

    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
  }

  async setNodeFill(fileId: string, nodeId: string, fill: string): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    node.style = { ...node.style, fill, fill_token: null };
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
  }

  async updateText(fileId: string, nodeId: string, value: string): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    if (node.content.type !== "text") {
      throw new Error(`node is not text: ${nodeId}`);
    }

    node.content = { ...node.content, value };
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
  }

  async replaceImageAsset(
    fileId: string,
    nodeId: string,
    input: { assetId: string; naturalWidth?: number; naturalHeight?: number }
  ): Promise<DesignNode> {
    const document = await this.readFile(fileId);
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
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
  }

  async setImageFitMode(
    fileId: string,
    nodeId: string,
    fitMode: ImageFitMode
  ): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    if (node.content.type !== "image") {
      throw new Error(`node is not image: ${nodeId}`);
    }

    node.content = { ...node.content, fit_mode: fitMode };
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
  }

  async createNode(fileId: string, parentId: string, node: DesignNode): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const parent = findParentChildren(document, parentId);
    if (!parent) {
      throw new Error(`parent not found: ${parentId}`);
    }

    parent.children.push(node);
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
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

  async readAsset(assetId: string): Promise<StoredAssetData> {
    await this.adoptPriorDefaultStoreIfNeeded();
    const raw = await readFile(this.assetMetadataPathFor(assetId), "utf8");
    const asset = parseStoredAsset(JSON.parse(raw));
    const data = await readFile(this.assetPathFor(asset.assetId));
    return { ...asset, data };
  }

  async listComponents(fileId: string): Promise<ComponentDefinition[]> {
    const document = await this.readFile(fileId);
    return document.components ?? [];
  }

  async createComponent(
    fileId: string,
    nodeId: string,
    input: { componentId: string; name: string }
  ): Promise<ComponentDefinition> {
    const document = await this.readFile(fileId);
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
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return component;
  }

  async createComponentInstance(
    fileId: string,
    input: { parentId: string; definitionId: string; instanceId: string; x: number; y: number }
  ): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const parent = findParentChildren(document, input.parentId);
    if (!parent) {
      throw new Error(`parent not found: ${input.parentId}`);
    }

    const definition = (document.components ?? []).find((component) => component.id === input.definitionId);
    if (!definition) {
      throw new Error(`component not found: ${input.definitionId}`);
    }

    const node = structuredClone(definition.source_node);
    renameInstanceTree(node, input.instanceId);
    node.id = input.instanceId;
    node.name = `${definition.name} 인스턴스`;
    node.kind = "component_instance";
    node.transform = { ...node.transform, x: input.x, y: input.y };
    node.component_instance = {
      definition_id: input.definitionId,
      overrides: [],
      detached: false
    };
    parent.children.push(node);
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
  }

  async detachInstance(fileId: string, nodeId: string): Promise<DesignNode> {
    const document = await this.readFile(fileId);
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
    await this.writeFile(fileId, document);
    await this.recordFileEditForAutoVersion(fileId, document);
    return node;
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
    const before = await this.readFile(fileId);
    const persisted = !(input.dryRun ?? false);

    if (persisted && input.collaboration) {
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
      await this.writeFile(fileId, collaborativeResult.preview);
      await this.recordFileEditForAutoVersion(fileId, collaborativeResult.preview);
      return result;
    }

    const { document: preview, changedNodeIds } = applyAgentCommandsToDocument(
      before,
      input.commands
    );
    const result = createAgentBatchResult(fileId, before, preview, input, persisted, changedNodeIds);

    if (persisted) {
      await this.writeFile(fileId, preview);
      await this.recordFileEditForAutoVersion(fileId, preview);
    }

    return result;
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
      return { schemaVersion: 1, fileId, threads: [], activity: [] };
    }

    return parseStoredCommentThreadFile(JSON.parse(raw), fileId);
  }

  private async writeCommentThreadFile(store: StoredCommentThreadFile): Promise<void> {
    await mkdir(this.commentsDir, { recursive: true });
    await writeFile(
      this.commentThreadsPathFor(store.fileId),
      `${JSON.stringify(store, null, 2)}\n`,
      "utf8"
    );
  }
}

function assertSafeStorageId(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`safe id is required: ${value}`);
  }
}

function createStorageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function countUnreadCommentThreads(threads: StoredCommentThread[], viewerId: string) {
  return threads.filter((thread) => thread.resolvedAt === null && !thread.readBy.includes(viewerId)).length;
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

  throw inputValidationError(`asset data does not match ${mimeType}`);
}

function inputValidationError(message: string) {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = INPUT_VALIDATION_ERROR_CODE;
  error.statusCode = 400;
  return error;
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

  return {
    schemaVersion: 1,
    threadId: candidate.threadId,
    fileId: candidate.fileId,
    nodeId: candidate.nodeId,
    nodeName: normalizeName(candidate.nodeName, candidate.nodeId),
    body,
    authorName,
    createdAt: normalizeName(candidate.createdAt, new Date(0).toISOString()),
    resolvedAt: candidate.resolvedAt ? normalizeName(candidate.resolvedAt, "") : null,
    mentions: normalizeCommentMentionList(candidate.mentions, body),
    readBy: normalizeCommentReaderList(candidate.readBy, authorName),
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

  return {
    schemaVersion: 1,
    replyId: candidate.replyId,
    body,
    authorName: normalizeName(candidate.authorName, "사용자"),
    createdAt: normalizeName(candidate.createdAt, new Date(0).toISOString()),
    mentions: normalizeCommentMentionList(candidate.mentions, body)
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
