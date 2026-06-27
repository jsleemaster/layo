import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent
} from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import {
  flattenRendererNodes,
  type DesignToken,
  type GridArea,
  type GridTrack,
  type ImageFitMode,
  type NodeConstraints,
  type NodeExportPreset,
  type NodeLayout,
  type NodeLayoutItem,
  type RendererDocument,
  type RendererNode
} from "@layo/renderer";
import {
  createSharedKeyEncryptionConfig,
  createTeamManifest,
  type CollaborationPresence,
  type TeamManifest
} from "@layo/collaboration";
import { apiUrl } from "./api-base";
import {
  addCommentReply,
  createCommentThread,
  deleteFileVersion,
  exportCode,
  exportFileArchive,
  exportLibraryArchive,
  exportDesignTokensDtcg,
  importFileArchive,
  importLibraryArchive,
  importDesignTokensDtcg,
  listCommentActivity,
  listCommentNotifications,
  listCommentThreads,
  listFileVersions,
  markCommentThreadRead,
  markFileCommentsRead,
  parseDocumentPayload,
  readFileVersion,
  restoreFileVersion,
  resolveCommentThread,
  pruneFileVersions,
  reviewFileArchive,
  reviewLibraryArchive,
  saveFileVersion,
  setFileVersionPinned,
  subscribeToCommentEvents,
  summarizeDocumentChanges,
  type CommentActivityFeed,
  type CommentMentionTarget,
  type CommentNotificationSummary,
  type CommentThread,
  type CodeExportPayload,
  type CodeStructureNode,
  type FileArchiveReview,
  type FileVersionChangeSummary,
  type FileVersionSummary,
  type LibraryArchiveReview
} from "./document-api";
import { editorKonvaTokens } from "./design-tokens";
import { imageAssetIdsForNode, pdfForNode, svgForNode, type NodeArtifactAsset } from "./node-artifacts";
import { uploadImageAsset, type UploadedAsset } from "./asset-api";
import {
  createCollabDocumentSession,
  type CollabDocumentSession
} from "./collaboration/collab-session";
import {
  createTeamManifestDownload,
  createIndexedDbTeamStore,
  exportTeamManifest,
  fetchTeamManifestFromUrl,
  importTeamManifest,
  readTeamManifestFile
} from "./collaboration/team-store";
import {
  buildExportPresetReviewItems,
  buildPageExportPresetReviewItems,
  exportPresetExtension,
  type ExportPresetReviewItem
} from "./export-presets";
import { createZipBlob, type ZipBlobEntry } from "./zip-archive";
import {
  createProject as createSavedProject,
  deleteProject,
  duplicateProject,
  exportProjectArchive,
  fetchProjects,
  importProjectArchive,
  reviewProjectArchive,
  setProjectSharing,
  updateProject,
  type ProjectArchiveReview,
  type ProjectManifest
} from "./project-api";
import { getVisibleProjects, promoteRecentProject } from "./project-list";
import { createIndexedDbProjectStore } from "./project-store";
import {
  alignSelectedNodeToParent,
  alignSelectedNodes,
  calculateSnapForMovingBounds,
  copySelectedNode,
  createEditorState,
  createImageNode,
  createRectangleNode,
  createTextNode,
  deleteSelectedNode,
  distributeSelectedNodes,
  duplicateSelectedNode,
  executeEditorCommand,
  findNodeById,
  fitViewportToSelection,
  flipSelectedNodes,
  frameSelectedNodes,
  groupSelectedNodes,
  getNodeDragGeometriesForNodeIds,
  getNodeAbsolutePosition,
  getNodeBounds,
  getSelectionBoundsForNodeIds,
  getTopmostNodeIdAtPoint,
  isNodeLocked,
  isNodeVisible,
  moveSelectedNodesBy,
  nudgeSelectedNode,
  panViewport,
  pasteCopiedNode,
  pasteCopiedNodeAt,
  redo,
  renameSelectedNode,
  reorderSelectedNode,
  resizeSelectedImageToNaturalSize,
  selectAllPageNodes,
  selectNodesInBounds,
  selectNodesWithSameKind,
  setSelection,
  setMultiSelection,
  setSelectedNodeLocked,
  setSelectedNodeStyle,
  setSelectedNodeVisible,
  setViewport,
  toggleSelection,
  ungroupSelectedNode,
  type AlignmentMode,
  type DistributionMode,
  type EditorNodeStyle,
  type EditorNodeClipboard,
  type EditorState,
  type FlipAxis,
  type GeometryPatch,
  type SelectionBounds,
  type SnapGuide,
  undo,
  zoomViewport,
  zoomViewportAtPoint
} from "./editor-state";
import { calculateImageDrawConfig } from "./image-fit";
import {
  documentPointToViewport,
  getRemotePresence,
  getSelectedNodeBounds,
  REMOTE_PRESENCE_STALE_MS,
  shouldPublishCursor,
  type PublishedCursor
} from "./collaboration/remote-overlays";

const LOCAL_COMMENT_VIEWER_ID = "사용자";
const COMMENT_LIVE_REFRESH_INTERVAL_MS = 2_000;

function formatCommentActivityType(type: CommentActivityFeed["events"][number]["type"]) {
  switch (type) {
    case "created":
      return "코멘트";
    case "replied":
      return "답글";
    case "resolved":
      return "해결";
  }
}

function numericInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function optionalNumericInputValue(value: number | undefined) {
  return value === undefined ? "" : numericInputValue(value);
}

type LayoutSpacingTokenKey = keyof NonNullable<NodeLayout["spacing_tokens"]>;
type InspectorTab = "design" | "prototype" | "dev";

function spacingTokenNumber(token: DesignToken): number | null {
  const match = token.value.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  return match ? Number(match[1]) : null;
}

function uniformTokenValue(
  tokens: NonNullable<NodeLayout["spacing_tokens"]> | null | undefined,
  keys: LayoutSpacingTokenKey[]
) {
  const first = tokens?.[keys[0]];
  if (!first || keys.some((key) => tokens?.[key] !== first)) {
    return "";
  }
  return first;
}

function findCodeStructureNode(root: CodeStructureNode | null | undefined, nodeId: string): CodeStructureNode | null {
  if (!root) {
    return null;
  }
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children) {
    const match = findCodeStructureNode(child, nodeId);
    if (match) {
      return match;
    }
  }
  return null;
}

function findCodeStructureForNode(exportPayload: CodeExportPayload | null, nodeId: string): CodeStructureNode | null {
  if (!exportPayload) {
    return null;
  }
  for (const element of exportPayload.elements) {
    const match = findCodeStructureNode(element.structure, nodeId);
    if (match) {
      return match;
    }
  }
  return null;
}

function cssSnippetForCodeNode(css: string, className: string) {
  const lines = css.split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === `.${className} {`);
  if (startIndex === -1) {
    return css;
  }
  const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === "}");
  return lines.slice(startIndex, endIndex === -1 ? startIndex + 12 : endIndex + 1).join("\n");
}

function htmlSnippetForCodeNode(html: string, nodeId: string) {
  const lines = html.split("\n");
  const matchIndex = lines.findIndex((line) => line.includes(`data-node-id="${nodeId}"`));
  if (matchIndex === -1) {
    return html;
  }
  const startIndex = Math.max(0, matchIndex - 1);
  const endIndex = Math.min(lines.length, matchIndex + 4);
  return lines.slice(startIndex, endIndex).join("\n");
}

function gridTrackInputValue(tracks: GridTrack[] | undefined, count: number) {
  return Array.from({ length: count }, (_, index) => gridTrackToken(tracks?.[index])).join(" ");
}

function gridTrackToken(track: GridTrack | undefined) {
  if (track?.type === "px") {
    return `${numericInputValue(track.value ?? 0)}px`;
  }
  if (track?.type === "auto") {
    return "auto";
  }
  return `${numericInputValue(track?.value ?? 1)}fr`;
}

function parseGridTrackInput(value: string): GridTrack[] | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const tracks = tokens.map(parseGridTrackToken);
  return tracks.every((track): track is GridTrack => track !== null) ? tracks : null;
}

function parseGridTrackToken(token: string): GridTrack | null {
  if (token.toLowerCase() === "auto") {
    return { type: "auto" };
  }

  const match = token.match(/^(\d+(?:\.\d+)?)(px|fr)$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2].toLowerCase();
  if (unit === "px") {
    return { type: "px", value: Math.max(0, value) };
  }
  return { type: "fr", value: Math.max(0.0001, value) };
}

function gridAreaInputValue(areas: GridArea[] | undefined) {
  return (areas ?? [])
    .map((area) =>
      `${area.name}:${numericInputValue(area.column)}/${numericInputValue(area.row)}/${numericInputValue(area.column_span)}/${numericInputValue(area.row_span)}`
    )
    .join(", ");
}

function parseGridAreaInput(value: string): GridArea[] | null {
  const tokens = value.split(",").map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const areas = tokens.map(parseGridAreaToken);
  return areas.every((area): area is GridArea => area !== null) ? areas : null;
}

function parseGridAreaToken(token: string): GridArea | null {
  const match = token.match(/^([^:]+):(\d+)\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) {
    return null;
  }

  const [, rawName, rawColumn, rawRow, rawColumnSpan, rawRowSpan] = match;
  const name = rawName.trim();
  const column = Number(rawColumn);
  const row = Number(rawRow);
  const columnSpan = Number(rawColumnSpan);
  const rowSpan = Number(rawRowSpan);
  if (!name || ![column, row, columnSpan, rowSpan].every(Number.isFinite)) {
    return null;
  }

  return {
    name,
    column: Math.max(1, Math.round(column)),
    row: Math.max(1, Math.round(row)),
    column_span: Math.max(1, Math.round(columnSpan)),
    row_span: Math.max(1, Math.round(rowSpan))
  };
}

const OBJECT_CONTEXT_MENU_MARGIN = 8;
const OBJECT_CONTEXT_MENU_ESTIMATED_SIZE = {
  width: 280,
  height: 640
};
const ALIGNMENT_SHORTCUTS: Partial<Record<string, AlignmentMode>> = {
  a: "left",
  h: "center",
  d: "right",
  w: "top",
  v: "middle",
  s: "bottom"
};

function objectContextMenuPosition(left: number, top: number) {
  if (typeof window === "undefined") {
    return { left, top };
  }

  return {
    left: Math.max(
      OBJECT_CONTEXT_MENU_MARGIN,
      Math.min(
        left,
        window.innerWidth - OBJECT_CONTEXT_MENU_ESTIMATED_SIZE.width - OBJECT_CONTEXT_MENU_MARGIN
      )
    ),
    top: Math.max(
      OBJECT_CONTEXT_MENU_MARGIN,
      Math.min(
        top,
        window.innerHeight - OBJECT_CONTEXT_MENU_ESTIMATED_SIZE.height - OBJECT_CONTEXT_MENU_MARGIN
      )
    )
  };
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function exportReviewZipName(scopeLabel: string) {
  const normalized = scopeLabel
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || "layo"}-export-review.zip`;
}

function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("파일을 읽지 못했습니다"));
    });
    reader.readAsDataURL(file);
  });
}

function ContextMenuSection({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="object-context-menu-section"
      data-testid="object-context-menu-section"
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function ContextMenuItem({
  label,
  shortcut,
  disabled,
  onClick
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" aria-label={label} disabled={disabled} onClick={onClick}>
      <span className="object-context-menu-label">{label}</span>
      {shortcut ? (
        <span className="object-context-menu-shortcut" data-testid="context-menu-shortcut" aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

const teamStore = createIndexedDbTeamStore();
const projectStore = createIndexedDbProjectStore();
const LOCAL_USER_COLOR = "var(--editor-color-selection)";
const fileVersionDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short"
});
const DEFAULT_NODE_LAYOUT: NodeLayout = {
  mode: "none",
  direction: "vertical",
  wrap: "nowrap",
  align_items: "start",
  justify_content: "start",
  justify_items: "start",
  align_content: "start",
  gap: 8,
  grid_columns: 2,
  grid_rows: 2,
  padding: { top: 16, right: 16, bottom: 16, left: 16 }
};
const DEFAULT_NODE_LAYOUT_ITEM: NodeLayoutItem = {
  position: "static",
  width_sizing: "fixed",
  height_sizing: "fixed",
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
};

function formatFileVersionCreatedAt(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }
  return fileVersionDateFormatter.format(date);
}

function formatFileVersionSource(source: FileVersionSummary["source"]) {
  switch (source) {
    case "restore":
      return "복원 전 자동 저장";
    case "auto":
      return "자동 저장";
    case "manual":
      return "수동 저장";
  }
}

const DEFAULT_NODE_CONSTRAINTS: NodeConstraints = {
  horizontal: "left",
  vertical: "top"
};

function normalizedAppLayoutItem(layoutItem: RendererNode["layout_item"]): NodeLayoutItem {
  return {
    ...DEFAULT_NODE_LAYOUT_ITEM,
    ...layoutItem,
    margin: {
      ...DEFAULT_NODE_LAYOUT_ITEM.margin,
      ...layoutItem?.margin
    }
  };
}

const KEYBOARD_PAN_STEP = 24;
const KEYBOARD_PAN_STEP_LARGE = 96;
const ZOOM_STEP = 0.25;
const AREA_SELECTION_DRAG_THRESHOLD = 4;
const RULER_MARKS = [0, 160, 320, 480, 640, 800, 960, 1120, 1280];
const ASSET_LIBRARY_KITS = [
  {
    name: "iOS 18 and iPadOS 18",
    count: "156개의 컴포넌트",
    templateCount: "템플릿 24개",
    preview: "ios",
    swatches: ["mcp", "focus", "selection"]
  },
  {
    name: "iOS and iPadOS 26",
    count: "175개의 컴포넌트",
    templateCount: "템플릿 31개",
    preview: "ios",
    swatches: ["mcp", "selection", "ink"]
  },
  {
    name: "Simple Design System",
    count: "184개의 컴포넌트",
    templateCount: "스타일 18개",
    preview: "system",
    swatches: ["ink", "focus", "surface"]
  },
  {
    name: "macOS 26",
    count: "71개의 컴포넌트",
    templateCount: "템플릿 12개",
    preview: "mac",
    swatches: ["panel", "focus", "surface"]
  },
  {
    name: "visionOS 26",
    count: "67개의 컴포넌트",
    templateCount: "공간 템플릿 9개",
    preview: "vision",
    swatches: ["focus", "selection", "surface"]
  },
  {
    name: "Material 3 Design Kit",
    count: "357개의 컴포넌트",
    templateCount: "토큰 42개",
    preview: "material",
    swatches: ["warning", "selection", "surface"]
  }
];
const FRAME_PRESET_CATEGORIES = [
  { name: "스마트폰", size: "390 x 844" },
  { name: "태블릿", size: "768 x 1024" },
  { name: "데스크톱", size: "1440 x 1024" },
  { name: "프레젠테이션", size: "16:9" },
  { name: "스마트워치", size: "198 x 242" },
  { name: "종이", size: "A4" },
  { name: "소셜 미디어", size: "1080 x 1080" },
  { name: "FigJam 커뮤니티", size: "템플릿" },
  { name: "아카이브", size: "이전 규격" }
];
type TeamPanelMode = "local" | "relay" | "manifest";
type LeftPanelMode = "files" | "assets" | "layers" | "team";

interface FileVersionPreviewState {
  version: FileVersionSummary;
  summary: FileVersionChangeSummary;
}

interface FileArchiveReviewState {
  review: FileArchiveReview;
  archiveBase64: string;
  sourceFileName: string;
}

interface LibraryArchiveReviewState {
  review: LibraryArchiveReview;
  archiveBase64: string;
  sourceFileName: string;
}

interface ProjectArchiveReviewState {
  review: ProjectArchiveReview;
  archiveBase64: string;
  sourceFileName: string;
}

interface AreaSelectionSession {
  start: { x: number; y: number };
  current: { x: number; y: number };
  mode: "replace" | "add";
  hasDragged: boolean;
}

interface NodeDragSession {
  nodeId: string;
  selectedNodeIds: string[];
  startPosition: { x: number; y: number };
  startPointer: { x: number; y: number };
  selectionBounds: SelectionBounds;
  hasMoved: boolean;
}

interface NodeDragPreview {
  primaryNodeId: string;
  nodeIds: string[];
  delta: { x: number; y: number };
}

type ResizeHandle =
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left";

const RESIZE_HANDLE_CURSORS: Record<ResizeHandle, "nwse-resize" | "nesw-resize"> = {
  "top-left": "nwse-resize",
  "bottom-right": "nwse-resize",
  "top-right": "nesw-resize",
  "bottom-left": "nesw-resize"
};

interface ResizeSession {
  nodeId: string;
  handle: ResizeHandle;
}

interface GridResizeSession {
  nodeId: string;
  axis: "column" | "row";
  index: number;
}

type GridAreaBoundaryEdge = "left" | "right" | "top" | "bottom";

interface GridAreaBoundarySession {
  parentNodeId: string;
  childNodeId: string;
  edge: GridAreaBoundaryEdge;
}

interface MeasurementLineOverlay {
  left: number;
  top: number;
  width?: number;
  height?: number;
  labelLeft: number;
  labelTop: number;
  text: string;
}

interface MeasurementOverlay {
  target: { left: number; top: number; width: number; height: number };
  size: { left: number; top: number; text: string };
  horizontal: MeasurementLineOverlay | null;
  vertical: MeasurementLineOverlay | null;
}

interface SelectionChromeOverlay {
  bounds: { left: number; top: number; width: number; height: number };
  badge: { left: number; top: number; text: string };
  isMultiSelection: boolean;
  handles: Array<{
    handle: ResizeHandle;
    cursor: "nwse-resize" | "nesw-resize";
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
}

interface InlineTextEditorOverlay {
  nodeId: string;
  value: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

interface FrameSpacingSegment {
  id: string;
  testId: string;
  orientation: "horizontal" | "vertical";
  left: number;
  top: number;
  width?: number;
  height?: number;
  labelLeft: number;
  labelTop: number;
  text: string;
}

interface FrameSpacingOverlay {
  segments: FrameSpacingSegment[];
}

interface GridViewportLine {
  id: string;
  orientation: "vertical" | "horizontal";
  left: number;
  top: number;
  width?: number;
  height?: number;
}

interface GridViewportHandle {
  id: string;
  testId: string;
  axis: "column" | "row";
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  cursor: "col-resize" | "row-resize";
}

interface GridAreaBoundaryHandle {
  id: string;
  testId: string;
  parentNodeId: string;
  childNodeId: string;
  edge: GridAreaBoundaryEdge;
  left: number;
  top: number;
  width: number;
  height: number;
  cursor: "col-resize" | "row-resize";
  title: string;
}

interface GridViewportAddControl {
  id: string;
  testId: string;
  axis: "column" | "row";
  left: number;
  top: number;
  label: string;
  title: string;
}

interface GridViewportRemoveControl {
  id: string;
  testId: string;
  axis: "column" | "row";
  index: number;
  left: number;
  top: number;
  label: string;
  title: string;
}

interface GridViewportHeaderControl {
  id: string;
  testId: string;
  axis: "column" | "row";
  index: number;
  left: number;
  top: number;
  label: string;
  title: string;
}

interface GridViewportCellControl {
  id: string;
  testId: string;
  column: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
  title: string;
}

interface GridViewportOverlay {
  nodeId: string;
  lines: GridViewportLine[];
  handles: GridViewportHandle[];
  areaBoundaryHandles: GridAreaBoundaryHandle[];
  addControls: GridViewportAddControl[];
  removeControls: GridViewportRemoveControl[];
  headerControls: GridViewportHeaderControl[];
  cellControls: GridViewportCellControl[];
}

interface GridPlacement {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

interface ObjectContextMenuState {
  left: number;
  top: number;
  nodeId: string | null;
  documentPoint: { x: number; y: number } | null;
}

interface GridTrackContextMenuState {
  left: number;
  top: number;
  nodeId: string;
  axis: "column" | "row";
  index: number;
}

interface GridCellContextMenuState {
  left: number;
  top: number;
  nodeId: string;
  column: number;
  row: number;
  range: GridCellRange;
  areaName?: string;
}

interface GridCellCoordinate {
  column: number;
  row: number;
}

interface GridCellRange {
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

interface GridCellSelectionState {
  nodeId: string;
  anchor: GridCellCoordinate;
  focus: GridCellCoordinate;
}

interface GridTrackDragState {
  nodeId: string;
  axis: "column" | "row";
  index: number;
  preserveChildren: boolean;
}

type GridTrackContextMenuAction = "insert-before" | "insert-after" | "duplicate" | "delete" | "delete-with-children";

const RESIZE_HANDLES: ResizeHandle[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];
const RESIZE_HIT_HANDLES: ResizeHandle[] = RESIZE_HANDLES;
const MIN_RESIZE_SIZE = 1;
const GRID_RESIZE_HANDLE_SIZE = 10;
const GRID_ADD_CONTROL_SIZE = 22;
const GRID_ADD_CONTROL_OFFSET = 8;
const GRID_HEADER_CONTROL_OFFSET = GRID_ADD_CONTROL_SIZE * 2 + GRID_ADD_CONTROL_OFFSET * 2;
const GRID_AREA_BOUNDARY_HANDLE_SIZE = 14;
const GRID_MIN_TRACK_SIZE = 1;
const IMPORTED_IMAGE_MIN_DIMENSION = 96;
const IMPORTED_IMAGE_MAX_DIMENSION = 480;

function remotePresenceSignature(member: CollaborationPresence) {
  return JSON.stringify({
    selectedNodeId: member.selectedNodeId,
    selectedNodeBounds: member.selectedNodeBounds,
    cursor: member.cursor,
    viewport: member.viewport,
    activeTool: member.activeTool
  });
}

function nodeKindLabel(kind: RendererNode["kind"]): string {
  switch (kind) {
    case "frame":
      return "프레임";
    case "group":
      return "그룹";
    case "rectangle":
      return "사각형";
    case "text":
      return "텍스트";
    case "image":
      return "이미지";
    case "component":
      return "컴포넌트";
    case "component_instance":
      return "컴포넌트 인스턴스";
  }
}

function nodeLayerLabel(node: RendererNode): string {
  const details: string[] = [];
  if (node.kind === "component") {
    details.push("컴포넌트");
  }
  if (node.kind === "group") {
    details.push("그룹");
  }
  if (node.kind === "component_instance") {
    details.push("인스턴스");
  }
  if (isNodeLocked(node)) {
    details.push("잠김");
  }
  if (!isNodeVisible(node)) {
    details.push("숨김");
  }

  return [node.name, ...details].join(" · ");
}

function assetUrlForId(assetId: string) {
  return apiUrl(`/assets/${encodeURIComponent(assetId)}`);
}

function artifactFileNameForAsset(assetId: string, mimeType: string) {
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  return `${assetId}.${extension}`;
}

async function renderImageBlobToPngBase64(blob: Blob): Promise<string> {
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth || image.width);
    canvas.height = Math.max(1, image.naturalHeight || image.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("artifact preview canvas context missing");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error("artifact preview png blob missing"));
        }
      }, "image/png");
    });
    return readFileAsBase64(pngBlob);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function shouldRenderPdfPreviewForImageAsset(mimeType: string) {
  return mimeType === "image/webp" || mimeType === "image/svg+xml";
}

async function loadArtifactAssetsForNode(node: RendererNode): Promise<Record<string, NodeArtifactAsset>> {
  const assetIds = imageAssetIdsForNode(node);
  if (assetIds.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    assetIds.map(async (assetId): Promise<[string, NodeArtifactAsset]> => {
      const response = await fetch(assetUrlForId(assetId));
      if (!response.ok) {
        throw new Error(`asset export fetch failed: ${assetId}`);
      }
      const blob = await response.blob();
      const mimeType = blob.type || response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
      const pdfPreviewPngBase64 = shouldRenderPdfPreviewForImageAsset(mimeType) ? await renderImageBlobToPngBase64(blob) : undefined;
      return [
        assetId,
        {
          assetId,
          mimeType,
          dataBase64: await readFileAsBase64(blob),
          pdfPreviewPngBase64,
          name: artifactFileNameForAsset(assetId, mimeType)
        }
      ];
    })
  );

  return Object.fromEntries(entries);
}

function imageFilesFromList(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

function fitImportedImageSize(size: { width: number; height: number }) {
  const safeWidth = Math.max(1, size.width);
  const safeHeight = Math.max(1, size.height);
  const shrinkScale = Math.min(1, IMPORTED_IMAGE_MAX_DIMENSION / Math.max(safeWidth, safeHeight));
  const shrunk = {
    width: safeWidth * shrinkScale,
    height: safeHeight * shrinkScale
  };
  const growScale =
    Math.max(shrunk.width, shrunk.height) < IMPORTED_IMAGE_MIN_DIMENSION
      ? IMPORTED_IMAGE_MIN_DIMENSION / Math.max(shrunk.width, shrunk.height)
      : 1;

  return {
    width: Math.max(1, Math.round(shrunk.width * growScale)),
    height: Math.max(1, Math.round(shrunk.height * growScale))
  };
}

async function readImageFileSize(file: File): Promise<{ width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // SVG files are browser-decodable through Image even when createImageBitmap rejects them.
    }
  }

  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 크기를 읽지 못했습니다"));
    };
    image.src = url;
  });
}

async function persistCreatedNode(fileId: string, parentId: string, node: RendererNode) {
  const response = await fetch(apiUrl(`/files/${fileId}/nodes`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId, node })
  });

  if (!response.ok) {
    throw new Error(`이미지 노드 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

async function persistImageAssetReplacement(
  fileId: string,
  nodeId: string,
  input: { assetId: string; naturalWidth?: number; naturalHeight?: number }
) {
  const response = await fetch(apiUrl(`/files/${fileId}/nodes/${nodeId}/image`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`이미지 교체 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

async function persistImageFitMode(fileId: string, nodeId: string, fitMode: ImageFitMode) {
  const response = await fetch(apiUrl(`/files/${fileId}/nodes/${nodeId}/image-fit`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fitMode })
  });

  if (!response.ok) {
    throw new Error(`이미지 맞춤 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

async function persistNodeLayout(fileId: string, nodeId: string, layout: NodeLayout) {
  const response = await fetch(apiUrl(`/files/${fileId}/agent/commands`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dryRun: false,
      commands: [{ type: "set_layout", nodeId, layout }]
    })
  });

  if (!response.ok) {
    throw new Error(`레이아웃 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

async function persistNodeExportPresets(fileId: string, nodeId: string, presets: NodeExportPreset[]) {
  const response = await fetch(apiUrl(`/files/${fileId}/agent/commands`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dryRun: false,
      commands: [{ type: "set_export_presets", nodeId, presets }]
    })
  });

  if (!response.ok) {
    throw new Error(`export preset 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

async function persistTextChange(fileId: string, nodeId: string, value: string) {
  const response = await fetch(apiUrl(`/files/${fileId}/agent/commands`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dryRun: false,
      commands: [{ type: "update_text", nodeId, value }]
    })
  });

  if (!response.ok) {
    throw new Error(`텍스트 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

function CanvasImageBody({
  assetId,
  width,
  height,
  opacity,
  fitMode,
  naturalWidth,
  naturalHeight
}: {
  assetId: string;
  width: number;
  height: number;
  opacity: number;
  fitMode: ImageFitMode;
  naturalWidth?: number;
  naturalHeight?: number;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
      }
    };
    nextImage.src = assetUrlForId(assetId);

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const drawConfig = image
    ? calculateImageDrawConfig({
        mode: fitMode,
        nodeWidth: width,
        nodeHeight: height,
        naturalWidth: naturalWidth ?? image.naturalWidth,
        naturalHeight: naturalHeight ?? image.naturalHeight
      })
    : null;

  return (
    <>
      <Rect width={width} height={height} fill={editorKonvaTokens.image.placeholderFill} opacity={opacity} />
      {image && drawConfig ? (
        <KonvaImage
          image={image}
          x={drawConfig.x}
          y={drawConfig.y}
          width={drawConfig.width}
          height={drawConfig.height}
          crop={drawConfig.crop}
          opacity={opacity}
        />
      ) : null}
    </>
  );
}

function collaborationStatusLabel(status: string): string {
  switch (status) {
    case "synced":
      return "동기화됨";
    case "connecting":
      return "연결 중";
    case "error":
      return "오류";
    case "offline":
    default:
      return "오프라인";
  }
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function pointerClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  return { x: event.clientX, y: event.clientY };
}

function documentPointFromStagePointer(
  pointer: { x: number; y: number },
  viewport: EditorState["viewport"]
): { x: number; y: number } {
  return {
    x: (pointer.x - viewport.x) / viewport.scale,
    y: (pointer.y - viewport.y) / viewport.scale
  };
}

function documentPointFromClientPoint(
  point: { x: number; y: number },
  viewport: EditorState["viewport"],
  stageFrame: HTMLDivElement | null
): { x: number; y: number } | null {
  if (!stageFrame) {
    return null;
  }

  const bounds = stageFrame.getBoundingClientRect();
  return documentPointFromStagePointer(
    {
      x: point.x - bounds.left,
      y: point.y - bounds.top
    },
    viewport
  );
}

function documentPointFromKonvaEvent(
  event: KonvaEventObject<MouseEvent | TouchEvent | DragEvent>,
  viewport: EditorState["viewport"],
  stageFrame: HTMLDivElement | null
): { x: number; y: number } | null {
  const stagePointer = event.target.getStage()?.getPointerPosition();
  if (stagePointer) {
    return documentPointFromStagePointer(stagePointer, viewport);
  }

  const clientPoint = pointerClientPoint(event.evt as MouseEvent | TouchEvent);
  if (!clientPoint || !stageFrame) {
    return null;
  }

  const bounds = stageFrame.getBoundingClientRect();
  return documentPointFromStagePointer(
    {
      x: clientPoint.x - bounds.left,
      y: clientPoint.y - bounds.top
    },
    viewport
  );
}

function selectionBoundsFromPoints(
  start: { x: number; y: number },
  current: { x: number; y: number }
): SelectionBounds {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const right = Math.max(start.x, current.x);
  const bottom = Math.max(start.y, current.y);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function translateBounds(bounds: SelectionBounds, delta: { x: number; y: number }): SelectionBounds {
  return {
    ...bounds,
    x: bounds.x + delta.x,
    y: bounds.y + delta.y
  };
}

function viewportBounds(bounds: SelectionBounds, viewport: EditorState["viewport"]) {
  const topLeft = documentPointToViewport({ x: bounds.x, y: bounds.y, space: "document" }, viewport);
  return {
    left: Math.round(topLeft.x),
    top: Math.round(topLeft.y),
    width: Math.round(bounds.width * viewport.scale),
    height: Math.round(bounds.height * viewport.scale)
  };
}

interface CommentBubbleOverlay {
  nodeId: string;
  nodeName: string;
  count: number;
  left: number;
  top: number;
}

function createCommentBubbleOverlays(
  document: RendererDocument,
  threads: CommentThread[],
  viewport: EditorState["viewport"]
): CommentBubbleOverlay[] {
  const countsByNodeId = new Map<string, { count: number; nodeName: string }>();
  for (const thread of threads) {
    if (thread.resolvedAt) {
      continue;
    }
    const current = countsByNodeId.get(thread.nodeId);
    countsByNodeId.set(thread.nodeId, {
      count: (current?.count ?? 0) + 1,
      nodeName: current?.nodeName ?? thread.nodeName
    });
  }

  return Array.from(countsByNodeId.entries()).flatMap(([nodeId, summary]) => {
    const node = findNodeById(document, nodeId);
    const bounds = getNodeBounds(document, nodeId);
    if (!node || !bounds || !isNodeVisible(node)) {
      return [];
    }

    const rect = viewportBounds(bounds, viewport);
    return [
      {
        nodeId,
        nodeName: node.name || summary.nodeName || nodeId,
        count: summary.count,
        left: rect.left + rect.width,
        top: rect.top
      }
    ];
  });
}

function isCommentMentionBoundary(value: string | undefined) {
  return !value || /\s|[.,;:!?()[\]{}'"`]/.test(value);
}

function resolveCommentMentionTargets(
  body: string,
  team: TeamManifest | null | undefined
): CommentMentionTarget[] {
  if (!team) {
    return [];
  }

  const targetsByUserId = new Map<string, { index: number; target: CommentMentionTarget }>();
  for (const member of team.members) {
    const labels = [member.displayName, member.userId].map((label) => label.trim()).filter(Boolean);
    let firstIndex = Number.POSITIVE_INFINITY;
    for (const label of labels) {
      const mention = `@${label}`;
      let searchIndex = body.indexOf(mention);
      while (searchIndex >= 0) {
        const nextCharacter = body[searchIndex + mention.length];
        if (isCommentMentionBoundary(nextCharacter)) {
          firstIndex = Math.min(firstIndex, searchIndex);
          break;
        }
        searchIndex = body.indexOf(mention, searchIndex + mention.length);
      }
    }
    if (Number.isFinite(firstIndex)) {
      targetsByUserId.set(member.userId, {
        index: firstIndex,
        target: {
          userId: member.userId,
          displayName: member.displayName,
          role: member.role
        }
      });
    }
  }

  return Array.from(targetsByUserId.values())
    .sort((first, second) => first.index - second.index || first.target.displayName.localeCompare(second.target.displayName))
    .map((entry) => entry.target);
}

function unresolvedCommentMentions(mentions: string[], mentionTargets: CommentMentionTarget[] | undefined) {
  const resolvedLabels = new Set(
    (mentionTargets ?? []).flatMap((target) => [target.userId.trim(), target.displayName.trim()])
  );
  return mentions.filter((mention) => !resolvedLabels.has(mention.trim()));
}

function CommentMentionChips({
  mentions,
  mentionTargets
}: {
  mentions: string[];
  mentionTargets?: CommentMentionTarget[];
}) {
  const targets = mentionTargets ?? [];
  const legacyMentions = unresolvedCommentMentions(mentions, targets);
  if (targets.length === 0 && legacyMentions.length === 0) {
    return null;
  }

  return (
    <span className="comment-mentions">
      {targets.map((target) => (
        <span className="comment-mention" key={target.userId}>
          팀 멘션 {target.displayName}
        </span>
      ))}
      {legacyMentions.map((mention) => (
        <span className="comment-mention" key={mention}>
          언급 {mention}
        </span>
      ))}
    </span>
  );
}

function rangeGap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  if (firstEnd <= secondStart) {
    return { start: firstEnd, end: secondStart, distance: secondStart - firstEnd };
  }
  if (secondEnd <= firstStart) {
    return { start: secondEnd, end: firstStart, distance: firstStart - secondEnd };
  }

  return null;
}

function midpointOfOverlapOrCenters(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number
) {
  const overlapStart = Math.max(firstStart, secondStart);
  const overlapEnd = Math.min(firstEnd, secondEnd);
  if (overlapStart <= overlapEnd) {
    return (overlapStart + overlapEnd) / 2;
  }

  return (firstStart + firstEnd + secondStart + secondEnd) / 4;
}

function createMeasurementOverlay(
  sourceBounds: SelectionBounds,
  targetBounds: SelectionBounds,
  viewport: EditorState["viewport"]
): MeasurementOverlay {
  const target = viewportBounds(targetBounds, viewport);
  const sizeTop = Math.max(0, target.top - 26);
  const horizontalGap = rangeGap(
    sourceBounds.x,
    sourceBounds.x + sourceBounds.width,
    targetBounds.x,
    targetBounds.x + targetBounds.width
  );
  const verticalGap = rangeGap(
    sourceBounds.y,
    sourceBounds.y + sourceBounds.height,
    targetBounds.y,
    targetBounds.y + targetBounds.height
  );
  const horizontal = horizontalGap
    ? (() => {
        const start = documentPointToViewport(
          {
            x: horizontalGap.start,
            y: midpointOfOverlapOrCenters(
              sourceBounds.y,
              sourceBounds.y + sourceBounds.height,
              targetBounds.y,
              targetBounds.y + targetBounds.height
            ),
            space: "document"
          },
          viewport
        );
        const end = documentPointToViewport(
          {
            x: horizontalGap.end,
            y: midpointOfOverlapOrCenters(
              sourceBounds.y,
              sourceBounds.y + sourceBounds.height,
              targetBounds.y,
              targetBounds.y + targetBounds.height
            ),
            space: "document"
          },
          viewport
        );
        const left = Math.round(Math.min(start.x, end.x));
        const top = Math.round(start.y);
        const width = Math.max(1, Math.round(Math.abs(end.x - start.x)));

        return {
          left,
          top,
          width,
          labelLeft: Math.round(left + width / 2),
          labelTop: top - 18,
          text: String(Math.round(horizontalGap.distance))
        };
      })()
    : null;
  const vertical = verticalGap
    ? (() => {
        const start = documentPointToViewport(
          {
            x: midpointOfOverlapOrCenters(
              sourceBounds.x,
              sourceBounds.x + sourceBounds.width,
              targetBounds.x,
              targetBounds.x + targetBounds.width
            ),
            y: verticalGap.start,
            space: "document"
          },
          viewport
        );
        const end = documentPointToViewport(
          {
            x: midpointOfOverlapOrCenters(
              sourceBounds.x,
              sourceBounds.x + sourceBounds.width,
              targetBounds.x,
              targetBounds.x + targetBounds.width
            ),
            y: verticalGap.end,
            space: "document"
          },
          viewport
        );
        const left = Math.round(start.x);
        const top = Math.round(Math.min(start.y, end.y));
        const height = Math.max(1, Math.round(Math.abs(end.y - start.y)));

        return {
          left,
          top,
          height,
          labelLeft: left + 8,
          labelTop: Math.round(top + height / 2),
          text: String(Math.round(verticalGap.distance))
        };
      })()
    : null;

  return {
    target,
    size: {
      left: target.left,
      top: sizeTop,
      text: `${Math.round(targetBounds.width)} x ${Math.round(targetBounds.height)}`
    },
    horizontal,
    vertical
  };
}

function createSelectionChromeOverlay(
  bounds: SelectionBounds,
  viewport: EditorState["viewport"],
  isMultiSelection = false,
  canResize = !isMultiSelection
): SelectionChromeOverlay {
  const viewportRect = viewportBounds(bounds, viewport);
  const viewportSelectionBounds = {
    x: viewportRect.left,
    y: viewportRect.top,
    width: viewportRect.width,
    height: viewportRect.height
  };
  const centerX = viewportRect.left + viewportRect.width / 2;

  return {
    bounds: viewportRect,
    badge: {
      left: Math.round(centerX),
      top: Math.round(viewportRect.top + viewportRect.height + 20),
      text: `${Math.round(bounds.width)} x ${Math.round(bounds.height)}`
    },
    isMultiSelection,
    handles: !canResize || isMultiSelection
      ? []
      : RESIZE_HANDLES.map((handle) => {
          const size = resizeHandleVisualSize(handle);
          const anchor = resizeHandlePoint(viewportSelectionBounds, handle);
          return {
            handle,
            cursor: resizeCursorForHandle(handle),
            left: Math.round(anchor.x - size.width / 2),
            top: Math.round(anchor.y - size.height / 2),
            width: size.width,
            height: size.height
          };
        })
  };
}

function childBoundsForFrame(frameBounds: SelectionBounds, frame: RendererNode): SelectionBounds[] {
  return frame.children
    .filter((child) => isNodeVisible(child))
    .map((child) => ({
      x: frameBounds.x + child.transform.x,
      y: frameBounds.y + child.transform.y,
      width: child.size.width,
      height: child.size.height
    }));
}

function boundsUnion(boundsList: SelectionBounds[]): SelectionBounds {
  const left = Math.min(...boundsList.map((bounds) => bounds.x));
  const top = Math.min(...boundsList.map((bounds) => bounds.y));
  const right = Math.max(...boundsList.map((bounds) => bounds.x + bounds.width));
  const bottom = Math.max(...boundsList.map((bounds) => bounds.y + bounds.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createFrameSpacingOverlay(
  frameBounds: SelectionBounds,
  frame: RendererNode,
  viewport: EditorState["viewport"]
): FrameSpacingOverlay | null {
  const children = childBoundsForFrame(frameBounds, frame);
  if (!children.length) {
    return null;
  }

  const contentBounds = boundsUnion(children);
  const contentCenterX = contentBounds.x + contentBounds.width / 2;
  const contentCenterY = contentBounds.y + contentBounds.height / 2;
  const segments: FrameSpacingSegment[] = [];

  addFrameSpacingSegment(segments, "padding-left", "frame-padding-left", "horizontal", {
    start: { x: frameBounds.x, y: contentCenterY },
    end: { x: contentBounds.x, y: contentCenterY },
    distance: contentBounds.x - frameBounds.x,
    viewport
  });
  addFrameSpacingSegment(segments, "padding-right", "frame-padding-right", "horizontal", {
    start: { x: contentBounds.x + contentBounds.width, y: contentCenterY },
    end: { x: frameBounds.x + frameBounds.width, y: contentCenterY },
    distance: frameBounds.x + frameBounds.width - (contentBounds.x + contentBounds.width),
    viewport
  });
  addFrameSpacingSegment(segments, "padding-top", "frame-padding-top", "vertical", {
    start: { x: contentCenterX, y: frameBounds.y },
    end: { x: contentCenterX, y: contentBounds.y },
    distance: contentBounds.y - frameBounds.y,
    viewport
  });
  addFrameSpacingSegment(segments, "padding-bottom", "frame-padding-bottom", "vertical", {
    start: { x: contentCenterX, y: contentBounds.y + contentBounds.height },
    end: { x: contentCenterX, y: frameBounds.y + frameBounds.height },
    distance: frameBounds.y + frameBounds.height - (contentBounds.y + contentBounds.height),
    viewport
  });

  addSiblingSpacingSegments(segments, children, "vertical", viewport);
  addSiblingSpacingSegments(segments, children, "horizontal", viewport);

  return segments.length ? { segments } : null;
}

function gridViewportTrackCountsForOverlay(layout: NodeLayout, frame: RendererNode) {
  const flowChildren = frame.children.filter(
    (child) => (child.layout_item?.position ?? "static") === "static" && isNodeVisible(child)
  );
  let columns = gridTrackCountForOverlay(layout.grid_column_tracks, layout.grid_columns, 2);
  let rows = gridTrackCountForOverlay(
    layout.grid_row_tracks,
    layout.grid_rows,
    Math.max(1, Math.ceil(flowChildren.length / columns))
  );
  if (isVerticalGridDirection(layout.direction)) {
    columns = Math.max(columns, Math.ceil(flowChildren.length / rows), 1);
  } else {
    rows = Math.max(rows, Math.ceil(flowChildren.length / columns), 1);
  }

  return { columns, rows };
}

function createGridViewportOverlay(
  frameBounds: SelectionBounds,
  frame: RendererNode,
  viewport: EditorState["viewport"],
  options: {
    selectedChild?: RendererNode | null;
    showTrackControls?: boolean;
  } = {}
): GridViewportOverlay | null {
  const layout = normalizedInspectorLayout(frame.layout);
  if (layout.mode !== "grid") {
    return null;
  }
  const showTrackControls = options.showTrackControls ?? true;

  const columnGap = layout.column_gap ?? layout.gap;
  const rowGap = layout.row_gap ?? layout.gap;
  const { columns, rows } = gridViewportTrackCountsForOverlay(layout, frame);

  const availableWidth = Math.max(
    0,
    frame.size.width - layout.padding.left - layout.padding.right - columnGap * Math.max(0, columns - 1)
  );
  const availableHeight = Math.max(
    0,
    frame.size.height - layout.padding.top - layout.padding.bottom - rowGap * Math.max(0, rows - 1)
  );
  const columnTracks = resolveGridTracksForOverlay(layout.grid_column_tracks, columns);
  const rowTracks = resolveGridTracksForOverlay(layout.grid_row_tracks, rows);
  const columnSizes = resolveGridTrackSizesForOverlay(columnTracks, availableWidth);
  const rowSizes = resolveGridTrackSizesForOverlay(rowTracks, availableHeight);
  const columnStarts = gridTrackStartsForOverlay(columnSizes, columnGap);
  const rowStarts = gridTrackStartsForOverlay(rowSizes, rowGap);
  const gridLeft = frameBounds.x + layout.padding.left;
  const gridTop = frameBounds.y + layout.padding.top;
  const gridWidth = columnSizes.reduce((total, size) => total + size, 0) + columnGap * Math.max(0, columns - 1);
  const gridHeight = rowSizes.reduce((total, size) => total + size, 0) + rowGap * Math.max(0, rows - 1);
  if (gridWidth <= 0 || gridHeight <= 0) {
    return null;
  }

  const topLeft = documentPointToViewport({ x: gridLeft, y: gridTop, space: "document" }, viewport);
  const bottomRight = documentPointToViewport(
    { x: gridLeft + gridWidth, y: gridTop + gridHeight, space: "document" },
    viewport
  );
  const viewportGridHeight = bottomRight.y - topLeft.y;
  const viewportGridWidth = bottomRight.x - topLeft.x;
  const lines: GridViewportLine[] = [];
  const handles: GridViewportHandle[] = [];
  const removeControls: GridViewportRemoveControl[] = [];
  const headerControls: GridViewportHeaderControl[] = [];
  const cellControls: GridViewportCellControl[] = [];
  const areaBoundaryHandles: GridAreaBoundaryHandle[] = [];
  const addControls: GridViewportAddControl[] = showTrackControls
    ? [
        {
          id: "add-column",
          testId: "grid-column-add-control",
          axis: "column",
          left: Math.round(bottomRight.x + GRID_ADD_CONTROL_OFFSET),
          top: Math.round(topLeft.y - GRID_ADD_CONTROL_SIZE - GRID_ADD_CONTROL_OFFSET),
          label: "+",
          title: "그리드 열 추가"
        },
        {
          id: "add-row",
          testId: "grid-row-add-control",
          axis: "row",
          left: Math.round(topLeft.x - GRID_ADD_CONTROL_SIZE - GRID_ADD_CONTROL_OFFSET),
          top: Math.round(bottomRight.y + GRID_ADD_CONTROL_OFFSET),
          label: "+",
          title: "그리드 행 추가"
        }
      ]
    : [];

  columnStarts.forEach((start, index) => {
    const startPoint = documentPointToViewport({ x: gridLeft + start, y: gridTop, space: "document" }, viewport);
    lines.push({
      id: `column-start-${index}`,
      orientation: "vertical",
      left: Math.round(startPoint.x),
      top: Math.round(topLeft.y),
      height: Math.round(viewportGridHeight)
    });
    const endPoint = documentPointToViewport(
      { x: gridLeft + start + columnSizes[index], y: gridTop, space: "document" },
      viewport
    );
    if (showTrackControls) {
      headerControls.push({
        id: `column-header-${index + 1}`,
        testId: `grid-column-header-${index + 1}`,
        axis: "column",
        index,
        left: Math.round((startPoint.x + endPoint.x) / 2 - GRID_ADD_CONTROL_SIZE / 2),
        top: Math.round(topLeft.y - GRID_HEADER_CONTROL_OFFSET),
        label: String(index + 1),
        title: `그리드 ${index + 1}열 메뉴`
      });
      if (columns > 1) {
        removeControls.push({
          id: `remove-column-${index + 1}`,
          testId: `grid-column-remove-control-${index + 1}`,
          axis: "column",
          index,
          left: Math.round((startPoint.x + endPoint.x) / 2 - GRID_ADD_CONTROL_SIZE / 2),
          top: Math.round(topLeft.y - GRID_ADD_CONTROL_SIZE - GRID_ADD_CONTROL_OFFSET),
          label: "-",
          title: `그리드 ${index + 1}열 삭제`
        });
      }
    }
    lines.push({
      id: `column-end-${index}`,
      orientation: "vertical",
      left: Math.round(endPoint.x),
      top: Math.round(topLeft.y),
      height: Math.round(viewportGridHeight)
    });
    if (showTrackControls && index < columns - 1) {
      handles.push({
        id: `column-${index + 1}`,
        testId: `grid-column-resize-handle-${index + 1}`,
        axis: "column",
        index,
        left: Math.round(endPoint.x - GRID_RESIZE_HANDLE_SIZE / 2),
        top: Math.round(topLeft.y),
        width: GRID_RESIZE_HANDLE_SIZE,
        height: Math.round(viewportGridHeight),
        cursor: "col-resize"
      });
    }
  });

  rowStarts.forEach((start, index) => {
    const startPoint = documentPointToViewport({ x: gridLeft, y: gridTop + start, space: "document" }, viewport);
    lines.push({
      id: `row-start-${index}`,
      orientation: "horizontal",
      left: Math.round(topLeft.x),
      top: Math.round(startPoint.y),
      width: Math.round(viewportGridWidth)
    });
    const endPoint = documentPointToViewport(
      { x: gridLeft, y: gridTop + start + rowSizes[index], space: "document" },
      viewport
    );
    if (showTrackControls) {
      headerControls.push({
        id: `row-header-${index + 1}`,
        testId: `grid-row-header-${index + 1}`,
        axis: "row",
        index,
        left: Math.round(topLeft.x - GRID_HEADER_CONTROL_OFFSET),
        top: Math.round((startPoint.y + endPoint.y) / 2 - GRID_ADD_CONTROL_SIZE / 2),
        label: String(index + 1),
        title: `그리드 ${index + 1}행 메뉴`
      });
      if (rows > 1) {
        removeControls.push({
          id: `remove-row-${index + 1}`,
          testId: `grid-row-remove-control-${index + 1}`,
          axis: "row",
          index,
          left: Math.round(topLeft.x - GRID_ADD_CONTROL_SIZE - GRID_ADD_CONTROL_OFFSET),
          top: Math.round((startPoint.y + endPoint.y) / 2 - GRID_ADD_CONTROL_SIZE / 2),
          label: "-",
          title: `그리드 ${index + 1}행 삭제`
        });
      }
    }
    lines.push({
      id: `row-end-${index}`,
      orientation: "horizontal",
      left: Math.round(topLeft.x),
      top: Math.round(endPoint.y),
      width: Math.round(viewportGridWidth)
    });
    if (showTrackControls && index < rows - 1) {
      handles.push({
        id: `row-${index + 1}`,
        testId: `grid-row-resize-handle-${index + 1}`,
        axis: "row",
        index,
        left: Math.round(topLeft.x),
        top: Math.round(endPoint.y - GRID_RESIZE_HANDLE_SIZE / 2),
        width: Math.round(viewportGridWidth),
        height: GRID_RESIZE_HANDLE_SIZE,
        cursor: "row-resize"
      });
    }
  });

  if (showTrackControls) {
    rowStarts.forEach((rowStart, rowIndex) => {
      const rowStartPoint = documentPointToViewport(
        { x: gridLeft, y: gridTop + rowStart, space: "document" },
        viewport
      );
      const rowEndPoint = documentPointToViewport(
        { x: gridLeft, y: gridTop + rowStart + rowSizes[rowIndex], space: "document" },
        viewport
      );

      columnStarts.forEach((columnStart, columnIndex) => {
        const columnStartPoint = documentPointToViewport(
          { x: gridLeft + columnStart, y: gridTop, space: "document" },
          viewport
        );
        const columnEndPoint = documentPointToViewport(
          { x: gridLeft + columnStart + columnSizes[columnIndex], y: gridTop, space: "document" },
          viewport
        );

        cellControls.push({
          id: `cell-${columnIndex + 1}-${rowIndex + 1}`,
          testId: `grid-cell-hit-zone-${columnIndex + 1}-${rowIndex + 1}`,
          column: columnIndex,
          row: rowIndex,
          left: Math.round(columnStartPoint.x),
          top: Math.round(rowStartPoint.y),
          width: Math.max(1, Math.round(columnEndPoint.x - columnStartPoint.x)),
          height: Math.max(1, Math.round(rowEndPoint.y - rowStartPoint.y)),
          title: `그리드 ${columnIndex + 1}열 ${rowIndex + 1}행 셀 메뉴`
        });
      });
    });
  }

  const selectedChild = options.selectedChild;
  if (
    selectedChild &&
    !isNodeLocked(selectedChild) &&
    isNodeVisible(selectedChild) &&
    (selectedChild.layout_item?.position ?? "static") === "static"
  ) {
    const layoutItem = normalizedAppLayoutItem(selectedChild.layout_item);
    const areaName = normalizeGridAreaNameForOverlay(layoutItem.grid_area);
    const areaPlacement = areaName
      ? gridAreaPlacementsByNameForOverlay(layout.grid_areas, columns, rows).get(areaName) ?? null
      : null;
    const explicitPlacement = areaName ? null : manualGridPlacementForOverlay(layoutItem, columns, rows);
    const autoPlacement =
      areaName || explicitPlacement
        ? null
        : autoGridPlacementForOverlay(frame, selectedChild, layout, columns, rows);
    const placement = areaPlacement ?? explicitPlacement ?? autoPlacement;
    const columnEndIndex = placement ? placement.column + placement.columnSpan - 1 : -1;
    const rowEndIndex = placement ? placement.row + placement.rowSpan - 1 : -1;
    if (
      placement &&
      placement.column >= 0 &&
      placement.row >= 0 &&
      columnEndIndex < columnSizes.length &&
      rowEndIndex < rowSizes.length
    ) {
      const areaLeft = documentPointToViewport(
        { x: gridLeft + columnStarts[placement.column], y: gridTop, space: "document" },
        viewport
      ).x;
      const areaRight = documentPointToViewport(
        {
          x: gridLeft + columnStarts[columnEndIndex] + columnSizes[columnEndIndex],
          y: gridTop,
          space: "document"
        },
        viewport
      ).x;
      const areaTop = documentPointToViewport(
        { x: gridLeft, y: gridTop + rowStarts[placement.row], space: "document" },
        viewport
      ).y;
      const areaBottom = documentPointToViewport(
        {
          x: gridLeft,
          y: gridTop + rowStarts[rowEndIndex] + rowSizes[rowEndIndex],
          space: "document"
        },
        viewport
      ).y;
      const handleSize = GRID_AREA_BOUNDARY_HANDLE_SIZE;
      const verticalHeight = Math.max(1, Math.round(areaBottom - areaTop));
      const horizontalWidth = Math.max(1, Math.round(areaRight - areaLeft));
      areaBoundaryHandles.push(
        {
          id: `${selectedChild.id}-area-left`,
          testId: "grid-area-boundary-handle-left",
          parentNodeId: frame.id,
          childNodeId: selectedChild.id,
          edge: "left",
          left: Math.round(areaLeft - handleSize / 2),
          top: Math.round(areaTop),
          width: handleSize,
          height: verticalHeight,
          cursor: "col-resize",
          title: "그리드 영역 왼쪽 경계 조절"
        },
        {
          id: `${selectedChild.id}-area-right`,
          testId: "grid-area-boundary-handle-right",
          parentNodeId: frame.id,
          childNodeId: selectedChild.id,
          edge: "right",
          left: Math.round(areaRight - handleSize / 2),
          top: Math.round(areaTop),
          width: handleSize,
          height: verticalHeight,
          cursor: "col-resize",
          title: "그리드 영역 오른쪽 경계 조절"
        },
        {
          id: `${selectedChild.id}-area-top`,
          testId: "grid-area-boundary-handle-top",
          parentNodeId: frame.id,
          childNodeId: selectedChild.id,
          edge: "top",
          left: Math.round(areaLeft),
          top: Math.round(areaTop - handleSize / 2),
          width: horizontalWidth,
          height: handleSize,
          cursor: "row-resize",
          title: "그리드 영역 위쪽 경계 조절"
        },
        {
          id: `${selectedChild.id}-area-bottom`,
          testId: "grid-area-boundary-handle-bottom",
          parentNodeId: frame.id,
          childNodeId: selectedChild.id,
          edge: "bottom",
          left: Math.round(areaLeft),
          top: Math.round(areaBottom - handleSize / 2),
          width: horizontalWidth,
          height: handleSize,
          cursor: "row-resize",
          title: "그리드 영역 아래쪽 경계 조절"
        }
      );
    }
  }

  return {
    nodeId: frame.id,
    lines,
    handles,
    areaBoundaryHandles,
    addControls,
    removeControls,
    headerControls,
    cellControls
  };
}

function addFrameSpacingSegment(
  segments: FrameSpacingSegment[],
  id: string,
  testId: string,
  orientation: "horizontal" | "vertical",
  details: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    distance: number;
    viewport: EditorState["viewport"];
  }
) {
  if (details.distance <= 0) {
    return;
  }

  const start = documentPointToViewport({ ...details.start, space: "document" }, details.viewport);
  const end = documentPointToViewport({ ...details.end, space: "document" }, details.viewport);
  const left = Math.round(Math.min(start.x, end.x));
  const top = Math.round(Math.min(start.y, end.y));
  const width = Math.max(1, Math.round(Math.abs(end.x - start.x)));
  const height = Math.max(1, Math.round(Math.abs(end.y - start.y)));

  segments.push({
    id,
    testId,
    orientation,
    left,
    top,
    width: orientation === "horizontal" ? width : undefined,
    height: orientation === "vertical" ? height : undefined,
    labelLeft: Math.round((start.x + end.x) / 2),
    labelTop: Math.round((start.y + end.y) / 2),
    text: String(Math.round(details.distance))
  });
}

function addSiblingSpacingSegments(
  segments: FrameSpacingSegment[],
  children: SelectionBounds[],
  orientation: "horizontal" | "vertical",
  viewport: EditorState["viewport"]
) {
  const sorted = [...children].sort((first, second) =>
    orientation === "vertical" ? first.y - second.y : first.x - second.x
  );

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (!current || !next) {
      continue;
    }

    if (orientation === "vertical") {
      const currentBottom = current.y + current.height;
      const nextTop = next.y;
      const overlapStart = Math.max(current.x, next.x);
      const overlapEnd = Math.min(current.x + current.width, next.x + next.width);
      if (nextTop <= currentBottom || overlapEnd < overlapStart) {
        continue;
      }

      addFrameSpacingSegment(
        segments,
        `spacing-vertical-${index}`,
        "frame-spacing-vertical",
        "vertical",
        {
          start: { x: (overlapStart + overlapEnd) / 2, y: currentBottom },
          end: { x: (overlapStart + overlapEnd) / 2, y: nextTop },
          distance: nextTop - currentBottom,
          viewport
        }
      );
      continue;
    }

    const currentRight = current.x + current.width;
    const nextLeft = next.x;
    const overlapStart = Math.max(current.y, next.y);
    const overlapEnd = Math.min(current.y + current.height, next.y + next.height);
    if (nextLeft <= currentRight || overlapEnd < overlapStart) {
      continue;
    }

    addFrameSpacingSegment(
      segments,
      `spacing-horizontal-${index}`,
      "frame-spacing-horizontal",
      "horizontal",
      {
        start: { x: currentRight, y: (overlapStart + overlapEnd) / 2 },
        end: { x: nextLeft, y: (overlapStart + overlapEnd) / 2 },
        distance: nextLeft - currentRight,
        viewport
      }
    );
  }
}

function normalizedInspectorLayout(layout: RendererNode["layout"]): NodeLayout {
  return layout
    ? {
        ...DEFAULT_NODE_LAYOUT,
        ...layout,
        padding: {
          ...DEFAULT_NODE_LAYOUT.padding,
          ...layout.padding
        }
      }
    : DEFAULT_NODE_LAYOUT;
}

function gridTrackCountForOverlay(
  tracks: GridTrack[] | undefined,
  explicitCount: number | undefined,
  fallback: number
): number {
  const count = explicitCount ?? tracks?.length ?? fallback;
  return Math.max(1, Math.round(Number.isFinite(count) ? count : fallback));
}

function resolveGridTracksForOverlay(tracks: GridTrack[] | undefined, count: number): GridTrack[] {
  return Array.from({ length: count }, (_, index) => normalizeGridTrackForOverlay(tracks?.[index]));
}

function normalizeGridTrackForOverlay(track: GridTrack | undefined): GridTrack {
  if (track?.type === "px") {
    return { type: "px", value: Math.max(0, finiteGridValue(track.value, 0)) };
  }
  if (track?.type === "auto") {
    return { type: "auto" };
  }
  return { type: "fr", value: Math.max(0.0001, finiteGridValue(track?.value, 1)) };
}

function duplicateGridTrackForOverlay(track: GridTrack): GridTrack {
  if (track.type === "auto") {
    return { type: "auto" };
  }

  return { type: track.type, value: track.value };
}

function finiteGridValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveGridTrackSizesForOverlay(tracks: GridTrack[], availableSize: number): number[] {
  const fixedSizes = tracks.map((track) => (track.type === "px" ? track.value ?? 0 : 0));
  const fixedSize = fixedSizes.reduce((total, size) => total + size, 0);
  const frTotal = tracks.reduce((total, track) => total + (track.type === "fr" ? track.value ?? 1 : 0), 0);
  const remainingSize = Math.max(0, availableSize - fixedSize);
  return fixedSizes.map((size, index) =>
    tracks[index].type === "fr" && frTotal > 0 ? remainingSize * ((tracks[index].value ?? 1) / frTotal) : size
  );
}

function gridTrackStartsForOverlay(trackSizes: number[], gap: number): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const size of trackSizes) {
    starts.push(cursor);
    cursor += size + gap;
  }
  return starts;
}

function gridLineOffsetsForOverlay(trackStarts: number[], trackSizes: number[]): number[] {
  if (!trackStarts.length || !trackSizes.length) {
    return [0];
  }
  const offsets = [0];
  for (let index = 0; index < trackSizes.length; index += 1) {
    offsets.push((trackStarts[index] ?? 0) + (trackSizes[index] ?? 0));
  }
  return offsets;
}

function nearestGridLineIndexForOverlay(coordinate: number, trackStarts: number[], trackSizes: number[]): number {
  const lineOffsets = gridLineOffsetsForOverlay(trackStarts, trackSizes);
  return lineOffsets.reduce((closestIndex, offset, index) => {
    const closestOffset = lineOffsets[closestIndex] ?? 0;
    return Math.abs(offset - coordinate) < Math.abs(closestOffset - coordinate) ? index : closestIndex;
  }, 0);
}

function clampGridLineForOverlay(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeGridPlacementForOverlay(value: number | undefined): number | undefined {
  const normalized = finiteGridValue(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(1, Math.round(normalized)) : undefined;
}

function normalizeGridSpanForOverlay(value: number | undefined): number | undefined {
  const normalized = finiteGridValue(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(1, Math.round(normalized)) : undefined;
}

function normalizeGridPlacementLineForOverlay(value: number | undefined, max: number, fallback: number): number {
  return Math.min(normalizeGridPlacementForOverlay(value) ?? fallback, Math.max(1, max));
}

function gridPlacementIndexForOverlay(value: number | undefined, max: number, fallback: number): number {
  const line = normalizeGridPlacementForOverlay(value) ?? fallback;
  return Math.min(Math.max(0, line - 1), Math.max(0, max - 1));
}

function gridPlacementSpanForOverlay(value: number | undefined, remainingTracks: number): number {
  return Math.min(value ?? 1, Math.max(1, remainingTracks));
}

function normalizeGridAreaNameForOverlay(value: string | undefined): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function normalizeGridAreaForOverlay(area: GridArea | undefined, columns: number, rows: number): GridArea | null {
  const name = normalizeGridAreaNameForOverlay(area?.name);
  if (!name) {
    return null;
  }
  const column = normalizeGridPlacementLineForOverlay(area?.column, columns, 1);
  const row = normalizeGridPlacementLineForOverlay(area?.row, rows, 1);
  return {
    name,
    column,
    row,
    column_span: gridPlacementSpanForOverlay(
      normalizeGridSpanForOverlay(area?.column_span),
      columns - (column - 1)
    ),
    row_span: gridPlacementSpanForOverlay(
      normalizeGridSpanForOverlay(area?.row_span),
      rows - (row - 1)
    )
  };
}

function normalizeGridAreasForOverlay(
  areas: GridArea[] | undefined,
  columns: number,
  rows: number
): GridArea[] {
  return (areas ?? [])
    .map((area) => normalizeGridAreaForOverlay(area, columns, rows))
    .filter((area): area is GridArea => area !== null);
}

function nextGridAreaNameForOverlay(areas: GridArea[] | undefined): string {
  const existingNames = new Set((areas ?? []).map((area) => normalizeGridAreaNameForOverlay(area.name)).filter(Boolean));
  for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const name = `area${index}`;
    if (!existingNames.has(name)) {
      return name;
    }
  }
  return `area${Date.now()}`;
}

function gridAreaPlacementsByNameForOverlay(
  areas: GridArea[] | undefined,
  columns: number,
  rows: number
): Map<string, GridPlacement> {
  const placements = new Map<string, GridPlacement>();
  for (const area of normalizeGridAreasForOverlay(areas, columns, rows)) {
    if (!placements.has(area.name)) {
      placements.set(area.name, {
        column: area.column - 1,
        row: area.row - 1,
        columnSpan: area.column_span,
        rowSpan: area.row_span
      });
    }
  }
  return placements;
}

function gridCellRangeFromCoordinates(anchor: GridCellCoordinate, focus: GridCellCoordinate): GridCellRange {
  const startColumn = Math.min(anchor.column, focus.column);
  const endColumn = Math.max(anchor.column, focus.column);
  const startRow = Math.min(anchor.row, focus.row);
  const endRow = Math.max(anchor.row, focus.row);
  return {
    column: startColumn,
    row: startRow,
    columnSpan: endColumn - startColumn + 1,
    rowSpan: endRow - startRow + 1
  };
}

function gridCellRangeFromSelection(selection: GridCellSelectionState): GridCellRange {
  return gridCellRangeFromCoordinates(selection.anchor, selection.focus);
}

function isGridCellInRange(cell: GridCellCoordinate, range: GridCellRange): boolean {
  return (
    cell.column >= range.column &&
    cell.column < range.column + range.columnSpan &&
    cell.row >= range.row &&
    cell.row < range.row + range.rowSpan
  );
}

function gridAreaNameAtCell(areas: GridArea[], cell: GridCellCoordinate): string | undefined {
  const column = cell.column + 1;
  const row = cell.row + 1;
  return areas.find(
    (area) =>
      column >= area.column &&
      column < area.column + area.column_span &&
      row >= area.row &&
      row < area.row + area.row_span
  )?.name;
}

function manualGridPlacementForOverlay(layoutItem: NodeLayoutItem, columns: number, rows: number): GridPlacement | null {
  const columnSpan = normalizeGridSpanForOverlay(layoutItem.grid_column_span);
  const rowSpan = normalizeGridSpanForOverlay(layoutItem.grid_row_span);
  if (
    layoutItem.grid_column === undefined &&
    layoutItem.grid_row === undefined &&
    columnSpan === undefined &&
    rowSpan === undefined
  ) {
    return null;
  }
  const column = gridPlacementIndexForOverlay(layoutItem.grid_column, columns, 1);
  const row = gridPlacementIndexForOverlay(layoutItem.grid_row, rows, 1);
  return {
    column,
    row,
    columnSpan: gridPlacementSpanForOverlay(columnSpan, columns - column),
    rowSpan: gridPlacementSpanForOverlay(rowSpan, rows - row)
  };
}

function gridPlacementCellsForOverlay(placement: GridPlacement): Array<{ column: number; row: number }> {
  return Array.from({ length: placement.rowSpan }, (_, rowOffset) =>
    Array.from({ length: placement.columnSpan }, (__, columnOffset) => ({
      column: placement.column + columnOffset,
      row: placement.row + rowOffset
    }))
  ).flat();
}

function occupyGridPlacementForOverlay(occupiedCells: Set<string>, placement: GridPlacement): void {
  for (const cell of gridPlacementCellsForOverlay(placement)) {
    occupiedCells.add(`${cell.column}:${cell.row}`);
  }
}

function nextAutoGridCellForOverlay(
  startCursor: number,
  columns: number,
  rows: number,
  occupiedCells: Set<string>,
  direction: NodeLayout["direction"]
): { column: number; row: number; cursor: number } | null {
  const totalCells = Math.max(1, columns * rows);
  const isVertical = isVerticalGridDirection(direction);
  const isReverse = direction === "horizontal_reverse" || direction === "vertical_reverse";
  for (let offset = 0; offset < totalCells; offset += 1) {
    const cursor = (startCursor + offset) % totalCells;
    const orderedCursor = isReverse ? totalCells - 1 - cursor : cursor;
    const column = isVertical ? Math.floor(orderedCursor / rows) : orderedCursor % columns;
    const row = isVertical ? orderedCursor % rows : Math.floor(orderedCursor / columns);
    if (!occupiedCells.has(`${column}:${row}`)) {
      return { column, row, cursor: cursor + 1 };
    }
  }
  return null;
}

function autoGridPlacementForOverlay(
  frame: RendererNode,
  child: RendererNode,
  layout: NodeLayout,
  columns: number,
  rows: number
): GridPlacement | null {
  const areaPlacements = gridAreaPlacementsByNameForOverlay(layout.grid_areas, columns, rows);
  const flowChildren = frame.children.filter(
    (candidate) => (candidate.layout_item?.position ?? "static") === "static" && isNodeVisible(candidate)
  );
  const placements = new Map<string, GridPlacement>();
  const occupiedCells = new Set<string>();
  for (const candidate of flowChildren) {
    const layoutItem = normalizedAppLayoutItem(candidate.layout_item);
    const placement =
      (normalizeGridAreaNameForOverlay(layoutItem.grid_area)
        ? areaPlacements.get(normalizeGridAreaNameForOverlay(layoutItem.grid_area) ?? "") ?? null
        : null) ?? manualGridPlacementForOverlay(layoutItem, columns, rows);
    if (!placement) {
      continue;
    }
    placements.set(candidate.id, placement);
    occupyGridPlacementForOverlay(occupiedCells, placement);
  }

  let autoCursor = 0;
  for (const candidate of flowChildren) {
    if (placements.has(candidate.id)) {
      continue;
    }
    const autoCell = nextAutoGridCellForOverlay(autoCursor, columns, rows, occupiedCells, layout.direction);
    if (!autoCell) {
      break;
    }
    autoCursor = autoCell.cursor;
    const placement = { column: autoCell.column, row: autoCell.row, columnSpan: 1, rowSpan: 1 };
    placements.set(candidate.id, placement);
    occupyGridPlacementForOverlay(occupiedCells, placement);
    if (candidate.id === child.id) {
      return placement;
    }
  }

  return placements.get(child.id) ?? null;
}

function isVerticalGridDirection(direction: NodeLayout["direction"]): boolean {
  return direction === "vertical" || direction === "vertical_reverse";
}

function resizeHandleVisualSize(_handle: ResizeHandle): { width: number; height: number } {
  const size = editorKonvaTokens.selection.handleSize;
  return { width: size, height: size };
}

function resizeHandleHitSize(_handle: ResizeHandle): { width: number; height: number } {
  const cornerHitSize = editorKonvaTokens.selection.handleSize + 8;
  return { width: cornerHitSize, height: cornerHitSize };
}

function resizeCursorForHandle(handle: ResizeHandle): "nwse-resize" | "nesw-resize" {
  return RESIZE_HANDLE_CURSORS[handle];
}

function resizeHandlePoint(bounds: SelectionBounds, handle: ResizeHandle): { x: number; y: number } {
  return {
    x: handle.endsWith("right")
      ? bounds.x + bounds.width
      : handle.endsWith("left")
        ? bounds.x
        : bounds.x + bounds.width / 2,
    y: handle.startsWith("bottom")
      ? bounds.y + bounds.height
      : handle.startsWith("top")
        ? bounds.y
        : bounds.y + bounds.height / 2
  };
}

function resizeHandleAtPoint(
  bounds: SelectionBounds,
  point: { x: number; y: number }
): ResizeHandle | null {
  for (const handle of RESIZE_HIT_HANDLES) {
    const candidate = resizeHandlePoint(bounds, handle);
    const hitSize = resizeHandleHitSize(handle);
    if (
      point.x >= candidate.x - hitSize.width / 2 &&
      point.x <= candidate.x + hitSize.width / 2 &&
      point.y >= candidate.y - hitSize.height / 2 &&
      point.y <= candidate.y + hitSize.height / 2
    ) {
      return handle;
    }
  }

  return null;
}

function resizePatchFromHandle(
  node: RendererNode,
  absolute: { x: number; y: number },
  pointer: { x: number; y: number },
  handle: ResizeHandle
): GeometryPatch {
  const right = absolute.x + node.size.width;
  const bottom = absolute.y + node.size.height;
  const nextLeft = handle.endsWith("left")
    ? Math.min(Math.round(pointer.x), right - MIN_RESIZE_SIZE)
    : absolute.x;
  const nextTop = handle.startsWith("top")
    ? Math.min(Math.round(pointer.y), bottom - MIN_RESIZE_SIZE)
    : absolute.y;
  const nextRight = handle.endsWith("right")
    ? Math.max(Math.round(pointer.x), absolute.x + MIN_RESIZE_SIZE)
    : right;
  const nextBottom = handle.startsWith("bottom")
    ? Math.max(Math.round(pointer.y), absolute.y + MIN_RESIZE_SIZE)
    : bottom;
  const patch: GeometryPatch = {
    width: Math.round(nextRight - nextLeft),
    height: Math.round(nextBottom - nextTop)
  };

  if (nextLeft !== absolute.x) {
    patch.x = Math.round(node.transform.x + nextLeft - absolute.x);
  }
  if (nextTop !== absolute.y) {
    patch.y = Math.round(node.transform.y + nextTop - absolute.y);
  }

  return patch;
}

function konvaResizeHandleRect(
  node: RendererNode,
  handle: ResizeHandle,
  size: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const anchor = resizeHandlePoint(
    { x: 0, y: 0, width: node.size.width, height: node.size.height },
    handle
  );

  return {
    x: anchor.x - size.width / 2,
    y: anchor.y - size.height / 2,
    width: size.width,
    height: size.height
  };
}

function setStageCursor(
  event: KonvaEventObject<MouseEvent | TouchEvent | DragEvent>,
  cursor: string
) {
  const stageContainer = event.target.getStage()?.container();
  if (stageContainer) {
    stageContainer.style.cursor = cursor;
  }
}

function renderNode({
  node,
  selectedNodeId,
  selectedNodeIds,
  hasSelectedAncestor = false,
  hasComponentInstanceAncestor = false,
  isCanvasPanning = false,
  dragPreview = null,
  onSelect,
  onGeometryChange,
  onResizeStart,
  onTextEditStart,
  onDragStart,
  onDragMove,
  onDragEnd
}: {
  node: RendererNode;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  hasSelectedAncestor?: boolean;
  hasComponentInstanceAncestor?: boolean;
  isCanvasPanning?: boolean;
  dragPreview?: NodeDragPreview | null;
  onSelect: (nodeId: string, additive: boolean, preserveMultiSelection?: boolean) => void;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onResizeStart: (nodeId: string, handle: ResizeHandle) => void;
  onTextEditStart: (nodeId: string) => void;
  onDragStart: (
    nodeId: string,
    event: KonvaEventObject<MouseEvent | TouchEvent | DragEvent>
  ) => void;
  onDragMove: (nodeId: string, event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (nodeId: string, event: KonvaEventObject<DragEvent>) => void;
}) {
  if (!isNodeVisible(node)) {
    return null;
  }

  const isSelected = selectedNodeIds.includes(node.id);
  const isPrimarySelected = node.id === selectedNodeId;
  const nodeIsLocked = isNodeLocked(node);
  const shouldDeferToAncestor = hasSelectedAncestor || hasComponentInstanceAncestor;
  const canResize =
    isPrimarySelected && selectedNodeIds.length === 1 && !isCanvasPanning && !nodeIsLocked;
  const previewDelta =
    dragPreview &&
    dragPreview.primaryNodeId !== node.id &&
    dragPreview.nodeIds.includes(node.id)
      ? dragPreview.delta
      : null;
  const startResize = (
    handle: ResizeHandle,
    event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>
  ) => {
    event.cancelBubble = true;
    setStageCursor(event, resizeCursorForHandle(handle));
    onResizeStart(node.id, handle);
  };
  const showResizeCursor = (handle: ResizeHandle, event: KonvaEventObject<MouseEvent>) => {
    setStageCursor(event, resizeCursorForHandle(handle));
  };
  const clearResizeCursor = (event: KonvaEventObject<MouseEvent>) => {
    if (event.evt.buttons === 0) {
      setStageCursor(event, "");
    }
  };
  const selectAndPrimeDrag = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (isCanvasPanning) {
      return;
    }
    if (nodeIsLocked) {
      event.cancelBubble = true;
      return;
    }
    if (shouldDeferToAncestor) {
      return;
    }

    event.cancelBubble = true;
    const additive = "shiftKey" in event.evt ? event.evt.shiftKey : false;
    if (additive) {
      onSelect(node.id, additive);
      return;
    }
    if (isSelected) {
      if (!isPrimarySelected) {
        onSelect(node.id, false, true);
      }
      onDragStart(node.id, event);
      return;
    }

    onSelect(node.id, false);
  };
  const selectFromClick = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (isCanvasPanning) {
      return;
    }
    if (nodeIsLocked) {
      event.cancelBubble = true;
      return;
    }
    if (shouldDeferToAncestor) {
      return;
    }

    event.cancelBubble = true;
    const additive = "shiftKey" in event.evt ? event.evt.shiftKey : false;
    onSelect(node.id, additive, !additive && isSelected);
  };
  const startTextEditFromDoubleClick = (
    event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>
  ) => {
    if (
      isCanvasPanning ||
      nodeIsLocked ||
      shouldDeferToAncestor ||
      node.kind !== "text" ||
      node.content.type !== "text"
    ) {
      return;
    }

    event.cancelBubble = true;
    onSelect(node.id, false, true);
    onTextEditStart(node.id);
  };

  const body =
    node.kind === "group" ? null : node.kind === "image" && node.content.type === "image" ? (
      <CanvasImageBody
        assetId={node.content.asset_id}
        width={node.size.width}
        height={node.size.height}
        opacity={node.style.opacity}
        fitMode={node.content.fit_mode ?? "fill"}
        naturalWidth={node.content.natural_width}
        naturalHeight={node.content.natural_height}
      />
    ) : node.kind === "text" && node.content.type === "text" ? (
      <Text
        width={node.size.width}
        height={node.size.height}
        text={node.content.value}
        fontSize={node.content.font_size}
        fontFamily={node.content.font_family}
        fill={node.style.fill}
      />
    ) : (
      <Rect
        width={node.size.width}
        height={node.size.height}
        fill={node.style.fill}
        stroke={node.style.stroke ?? undefined}
        strokeWidth={node.style.stroke_width}
        opacity={node.style.opacity}
        cornerRadius={node.kind === "frame" ? editorKonvaTokens.radius.frame : editorKonvaTokens.radius.none}
      />
    );

  return (
    <Group
      key={node.id}
      x={node.transform.x + (previewDelta?.x ?? 0)}
      y={node.transform.y + (previewDelta?.y ?? 0)}
      rotation={node.transform.rotation}
      draggable={!nodeIsLocked && !shouldDeferToAncestor && isSelected && !isCanvasPanning}
      onMouseDown={selectAndPrimeDrag}
      onTouchStart={selectAndPrimeDrag}
      onClick={selectFromClick}
      onTap={selectFromClick}
      onDblClick={startTextEditFromDoubleClick}
      onDblTap={startTextEditFromDoubleClick}
      onDragStart={(event) => onDragStart(node.id, event)}
      onDragMove={(event) => onDragMove(node.id, event)}
      onDragEnd={(event) => onDragEnd(node.id, event)}
    >
      {body}
      {isSelected ? (
        <>
          <Rect
            name="selection-export-overlay"
            width={node.size.width}
            height={node.size.height}
            stroke={editorKonvaTokens.selection.stroke}
            strokeWidth={editorKonvaTokens.selection.strokeWidth}
            listening={false}
          />
          {canResize ? (
            <>
              {RESIZE_HANDLES.map((handle) => {
                const hitRect = konvaResizeHandleRect(node, handle, resizeHandleHitSize(handle));
                const visualRect = konvaResizeHandleRect(node, handle, resizeHandleVisualSize(handle));
                return (
                  <Group key={handle} name="selection-export-overlay">
                    <Rect
                      {...hitRect}
                      fill={editorKonvaTokens.selection.handleFill}
                      opacity={0.01}
                      onMouseEnter={(event) => showResizeCursor(handle, event)}
                      onMouseLeave={clearResizeCursor}
                      onMouseDown={(event) => startResize(handle, event)}
                      onTouchStart={(event) => startResize(handle, event)}
                    />
                    <Rect
                      {...visualRect}
                      fill={editorKonvaTokens.selection.handleFill}
                      stroke={editorKonvaTokens.selection.stroke}
                      strokeWidth={editorKonvaTokens.selection.strokeWidth}
                      onMouseEnter={(event) => showResizeCursor(handle, event)}
                      onMouseLeave={clearResizeCursor}
                      onMouseDown={(event) => startResize(handle, event)}
                      onTouchStart={(event) => startResize(handle, event)}
                    />
                  </Group>
                );
              })}
            </>
          ) : null}
        </>
      ) : null}
      {node.children.map((child) =>
        renderNode({
          node: child,
          selectedNodeId,
          selectedNodeIds,
          hasSelectedAncestor: hasSelectedAncestor || isSelected,
          hasComponentInstanceAncestor: hasComponentInstanceAncestor || node.kind === "component_instance",
          isCanvasPanning,
          dragPreview,
          onSelect,
          onGeometryChange,
          onResizeStart,
          onTextEditStart,
          onDragStart,
          onDragMove,
          onDragEnd
        })
      )}
    </Group>
  );
}

function RemotePresenceOverlay({
  localSessionId,
  presence,
  nowMs,
  viewport
}: {
  localSessionId: string | null;
  presence: CollaborationPresence[];
  nowMs: number;
  viewport: EditorState["viewport"];
}) {
  const remotePresence = getRemotePresence(presence, localSessionId, {
    nowMs,
    staleAfterMs: REMOTE_PRESENCE_STALE_MS
  });

  return (
    <div className="remote-presence-layer" data-testid="remote-presence-layer" aria-hidden="true">
      {remotePresence.map((member) => {
        const cursorPosition = member.cursor ? documentPointToViewport(member.cursor, viewport) : null;
        const selectionPosition = member.selectedNodeBounds
          ? documentPointToViewport(member.selectedNodeBounds, viewport)
          : null;

        return (
          <div key={member.sessionId}>
            {selectionPosition && member.selectedNodeBounds ? (
              <div
                className="remote-selection"
                data-testid="remote-selection"
                data-member-session-id={member.sessionId}
                data-selected-node-id={member.selectedNodeId ?? ""}
                style={{
                  left: selectionPosition.x,
                  top: selectionPosition.y,
                  width: member.selectedNodeBounds.width * viewport.scale,
                  height: member.selectedNodeBounds.height * viewport.scale,
                  borderColor: member.color,
                  transform: `rotate(${member.selectedNodeBounds.rotation}deg)`
                }}
              >
                <span style={{ backgroundColor: member.color }}>{member.displayName}</span>
              </div>
            ) : null}
            {cursorPosition ? (
              <div
                className="remote-cursor"
                data-testid="remote-cursor"
                data-member-session-id={member.sessionId}
                style={{
                  left: cursorPosition.x,
                  top: cursorPosition.y,
                  color: member.color
                }}
              >
                <span className="remote-cursor-mark" style={{ borderTopColor: member.color }} />
                <span className="remote-cursor-label" style={{ backgroundColor: member.color }}>
                  {member.displayName}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function InspectorAlignmentControls({
  canAlign,
  canDistribute,
  onAlign,
  onDistribute
}: {
  canAlign: boolean;
  canDistribute: boolean;
  onAlign: (mode: AlignmentMode) => void;
  onDistribute: (mode: DistributionMode) => void;
}) {
  const alignmentActions: Array<{ mode: AlignmentMode; label: string; icon: string }> = [
    { mode: "left", label: "왼쪽 맞춤", icon: "⇤" },
    { mode: "center", label: "가로 가운데 맞춤", icon: "↔" },
    { mode: "right", label: "오른쪽 맞춤", icon: "⇥" },
    { mode: "top", label: "위쪽 맞춤", icon: "↥" },
    { mode: "middle", label: "세로 가운데 맞춤", icon: "↕" },
    { mode: "bottom", label: "아래쪽 맞춤", icon: "↧" }
  ];
  const distributionActions: Array<{ mode: DistributionMode; label: string; icon: string }> = [
    { mode: "horizontal", label: "가로 간격 균등", icon: "⟷" },
    { mode: "vertical", label: "세로 간격 균등", icon: "↕" }
  ];

  return (
    <section className="inspector-section" aria-label="정렬">
      <h3>정렬</h3>
      <div className="inspector-control-groups">
        <div
          className="inspector-control-group"
          data-testid="inspector-align-group"
          aria-labelledby="inspector-align-label"
        >
          <span className="inspector-control-label" id="inspector-align-label">
            맞춤
          </span>
          <div className="inspector-action-grid inspector-action-grid--align">
            {alignmentActions.map((action) => (
              <button
                key={action.mode}
                type="button"
                aria-label={`검사기 ${action.label}`}
                className={!canAlign ? "is-disabled" : undefined}
                title={action.label}
                disabled={!canAlign}
                onClick={() => onAlign(action.mode)}
              >
                {action.icon}
              </button>
            ))}
          </div>
        </div>
        <div
          className="inspector-control-group"
          data-testid="inspector-distribute-group"
          aria-labelledby="inspector-distribute-label"
        >
          <span className="inspector-control-label" id="inspector-distribute-label">
            간격 균등
          </span>
          <div className="inspector-action-grid inspector-action-grid--distribute">
            {distributionActions.map((action) => (
              <button
                key={action.mode}
                type="button"
                aria-label={`검사기 ${action.label}`}
                className={!canDistribute ? "is-disabled" : undefined}
                title={action.label}
                disabled={!canDistribute}
                onClick={() => onDistribute(action.mode)}
              >
                {action.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function InspectorHeader({
  zoomLabel,
  canShare,
  activeTab,
  onTabChange,
  onShare
}: {
  zoomLabel: string;
  canShare: boolean;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onShare: () => void;
}) {
  const tabs: Array<{ id: InspectorTab; label: string; testId: string }> = [
    { id: "design", label: "디자인", testId: "inspector-tab-design" },
    { id: "prototype", label: "프로토타입", testId: "inspector-tab-prototype" },
    { id: "dev", label: "개발", testId: "inspector-tab-dev" }
  ];

  return (
    <>
      <div className="inspector-action-strip" data-testid="inspector-action-strip" aria-label="검사기 빠른 작업">
        <button
          type="button"
          className="inspector-avatar"
          data-testid="inspector-avatar"
          aria-label="계정 메뉴"
        >
          L
        </button>
        <div className="inspector-action-buttons">
          <button type="button" aria-label="미리보기" title="미리보기">
            ▷
          </button>
          <button type="button" aria-label="코드 보기" title="코드 보기" onClick={() => onTabChange("dev")}>
            &lt;/&gt;
          </button>
          <button type="button" className="inspector-share-button" onClick={onShare} disabled={!canShare}>
            공유하기
          </button>
        </div>
        <span className="inspector-zoom-readout" data-testid="inspector-zoom-readout">
          {zoomLabel}
        </span>
      </div>
      <h2 className="visually-hidden">검사기</h2>
      <div className="inspector-tabs" data-testid="inspector-tabs" role="tablist" aria-label="검사기 모드">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-testid={tab.testId}
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );
}

function InspectorEmptySections() {
  return (
    <>
      <section className="inspector-section" data-testid="inspector-section-frame" aria-label="프레임">
        <h3>프레임</h3>
        <p className="empty-state">프레임을 만들거나 레이어를 선택하세요.</p>
      </section>
      <section className="inspector-section" data-testid="inspector-section-presets" aria-label="프리셋">
        <h3>프리셋</h3>
        <ul className="inspector-preset-list">
          {FRAME_PRESET_CATEGORIES.map((preset) => (
            <li key={preset.name}>
              <button type="button" className="inspector-preset-row" aria-expanded="false">
                <span className="inspector-preset-name">
                  <span aria-hidden="true">▸</span>
                  {preset.name}
                </span>
                <span className="inspector-preset-size">{preset.size}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function InspectorTokenControls({
  draft,
  status,
  canEdit,
  onDraftChange,
  onExport,
  onImport
}: {
  draft: string;
  status: string;
  canEdit: boolean;
  onDraftChange: (value: string) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <section className="inspector-section" data-testid="inspector-section-tokens" aria-label="토큰">
      <h3>토큰</h3>
      <div className="inspector-token-actions">
        <button type="button" onClick={onExport} disabled={!canEdit}>
          토큰 내보내기
        </button>
        <button type="button" onClick={onImport} disabled={!canEdit || !draft.trim()}>
          토큰 가져오기
        </button>
      </div>
      <label className="stacked-field">
        DTCG JSON
        <textarea
          className="inspector-token-textarea"
          data-testid="dtcg-token-json"
          value={draft}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          spellCheck={false}
        />
      </label>
      <div className="inspector-token-status" data-testid="dtcg-token-status">
        {status}
      </div>
    </section>
  );
}

const PNG_EXPORT_SCALES = [1, 2, 3] as const;
type PngExportScale = (typeof PNG_EXPORT_SCALES)[number];
const EXPORT_PRESET_FORMATS = ["png", "jpeg", "webp", "svg", "pdf"] as const;
type ExportPresetFormat = (typeof EXPORT_PRESET_FORMATS)[number];

function exportPresetFormatLabel(format: ExportPresetFormat) {
  return format.toUpperCase();
}

function DevPanel({
  selectedNode,
  selectedNodes,
  pageName,
  pageExportNodes,
  pageExportReviewItems,
  codeExport,
  codeExportStatus,
  onDownloadPng,
  onDownloadJpeg,
  onDownloadWebp,
  onDownloadRaster,
  onDownloadNodeRaster,
  onExportPresetsChange
}: {
  selectedNode: RendererNode | null;
  selectedNodes: RendererNode[];
  pageName: string;
  pageExportNodes: RendererNode[];
  pageExportReviewItems: ExportPresetReviewItem[];
  codeExport: CodeExportPayload | null;
  codeExportStatus: string;
  onDownloadPng: (scale: PngExportScale) => string | null;
  onDownloadJpeg: (scale: PngExportScale) => string | null;
  onDownloadWebp: (scale: PngExportScale) => string | null;
  onDownloadRaster: (format: "png" | "jpeg" | "webp", scale: PngExportScale, filename: string) => string | null;
  onDownloadNodeRaster: (
    format: "png" | "jpeg" | "webp",
    scale: PngExportScale,
    nodeId: string,
    filename: string,
    options?: { download?: boolean }
  ) => string | null;
  onExportPresetsChange: (nodeId: string, presets: NodeExportPreset[]) => void;
}) {
  const [copyStatus, setCopyStatus] = useState("복사 대기 중");
  const [assetStatus, setAssetStatus] = useState("에셋 다운로드 대기 중");
  const [pngScale, setPngScale] = useState<PngExportScale>(2);
  const [presetFormat, setPresetFormat] = useState<ExportPresetFormat>("png");
  const [presetScale, setPresetScale] = useState<PngExportScale>(1);
  const [presetSuffix, setPresetSuffix] = useState("");
  const [excludedReviewItemKeys, setExcludedReviewItemKeys] = useState<string[]>([]);
  const codeStructure = selectedNode ? findCodeStructureForNode(codeExport, selectedNode.id) : null;
  const cssSnippet = codeExport && codeStructure ? cssSnippetForCodeNode(codeExport.css, codeStructure.className) : "";
  const htmlSnippet = codeExport && selectedNode ? htmlSnippetForCodeNode(codeExport.html, selectedNode.id) : "";
  const structureSnippet = codeStructure ? JSON.stringify(codeStructure, null, 2) : "";
  const exportPresets = selectedNode?.export_presets ?? [];
  const selectedExportReviewItems = selectedNodes.length > 1 ? buildExportPresetReviewItems(selectedNodes) : [];
  const isPageExportReview = !selectedNode && selectedExportReviewItems.length === 0;
  const exportReviewItems = isPageExportReview ? pageExportReviewItems : selectedExportReviewItems;
  const exportReviewNodes = isPageExportReview ? pageExportNodes : selectedNodes;
  const exportReviewScopeLabel = isPageExportReview
    ? `페이지 export review · ${pageName}`
    : "선택 레이어 export review";
  const exportReviewSignature = `${exportReviewScopeLabel}|${exportReviewItems.map((item) => item.key).join("|")}`;

  useEffect(() => {
    setCopyStatus(selectedNode ? "복사 대기 중" : "레이어 선택 대기 중");
    setAssetStatus(
      selectedNode
        ? "에셋 다운로드 대기 중"
        : pageExportReviewItems.length > 0
          ? "페이지 export review 대기 중"
          : "레이어 선택 대기 중"
    );
  }, [pageExportReviewItems.length, selectedNode?.id]);

  useEffect(() => {
    setExcludedReviewItemKeys([]);
  }, [exportReviewSignature]);

  const copySnippet = async (label: string, value: string) => {
    if (!value) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setCopyStatus(`${label} 복사 실패`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} 복사됨`);
    } catch {
      setCopyStatus(`${label} 복사 실패`);
    }
  };

  const downloadSelectedSvg = async () => {
    if (!selectedNode) {
      return;
    }
    try {
      const assets = await loadArtifactAssetsForNode(selectedNode);
      downloadBlob(new Blob([svgForNode(selectedNode, { assets })], { type: "image/svg+xml" }), `${selectedNode.id}.svg`);
      setAssetStatus(`${selectedNode.name} SVG 다운로드됨`);
    } catch {
      setAssetStatus("SVG 다운로드 실패");
    }
  };

  const downloadSelectedPng = () => {
    const nextStatus = onDownloadPng(pngScale);
    setAssetStatus(nextStatus ?? "PNG 다운로드 실패");
  };

  const downloadSelectedJpeg = () => {
    const nextStatus = onDownloadJpeg(pngScale);
    setAssetStatus(nextStatus ?? "JPEG 다운로드 실패");
  };

  const downloadSelectedWebp = () => {
    const nextStatus = onDownloadWebp(pngScale);
    setAssetStatus(nextStatus ?? "WEBP 다운로드 실패");
  };

  const downloadSelectedPdf = async () => {
    if (!selectedNode) {
      return;
    }
    try {
      const assets = await loadArtifactAssetsForNode(selectedNode);
      downloadBlob(new Blob([pdfForNode(selectedNode, { assets })], { type: "application/pdf" }), `${selectedNode.id}.pdf`);
      setAssetStatus(`${selectedNode.name} PDF 다운로드됨`);
    } catch {
      setAssetStatus("PDF 다운로드 실패");
    }
  };

  const nextPresetId = () => `${selectedNode?.id ?? "node"}-export-preset-${exportPresets.length + 1}`;
  const addExportPreset = () => {
    if (!selectedNode) {
      return;
    }
    onExportPresetsChange(selectedNode.id, [
      ...exportPresets,
      {
        id: nextPresetId(),
        format: presetFormat,
        scale: presetScale,
        suffix: presetSuffix.trim()
      }
    ]);
    setAssetStatus(`${selectedNode.name} export preset 추가됨`);
  };

  const removeExportPreset = (presetId: string) => {
    if (!selectedNode) {
      return;
    }
    onExportPresetsChange(
      selectedNode.id,
      exportPresets.filter((preset) => preset.id !== presetId)
    );
    setAssetStatus(`${selectedNode.name} export preset 삭제됨`);
  };

  const presetRasterScale = (scale: number): PngExportScale => (scale === 3 ? 3 : scale === 1 ? 1 : 2);

  const normalizeExportPresetFormat = (format: NodeExportPreset["format"]): ExportPresetFormat =>
    EXPORT_PRESET_FORMATS.includes(format as ExportPresetFormat) ? (format as ExportPresetFormat) : "png";

  const downloadExportPreset = async (preset: NodeExportPreset): Promise<boolean> => {
    if (!selectedNode) {
      return false;
    }
    const format = normalizeExportPresetFormat(preset.format);
    const filename = `${selectedNode.id}${preset.suffix}.${exportPresetExtension(format)}`;
    try {
      if (format === "svg") {
        const assets = await loadArtifactAssetsForNode(selectedNode);
        downloadBlob(new Blob([svgForNode(selectedNode, { assets })], { type: "image/svg+xml" }), filename);
      } else if (format === "pdf") {
        const assets = await loadArtifactAssetsForNode(selectedNode);
        downloadBlob(new Blob([pdfForNode(selectedNode, { assets })], { type: "application/pdf" }), filename);
      } else {
        return Boolean(onDownloadRaster(format, presetRasterScale(preset.scale), filename));
      }
      return true;
    } catch {
      return false;
    }
  };

  const downloadAllExportPresets = async () => {
    if (!selectedNode || exportPresets.length === 0) {
      setAssetStatus("export preset 없음");
      return;
    }
    let downloadCount = 0;
    for (const preset of exportPresets) {
      if (await downloadExportPreset(preset)) {
        downloadCount += 1;
      }
    }
    setAssetStatus(
      downloadCount === exportPresets.length
        ? `${downloadCount}개 export preset 다운로드됨`
        : `${downloadCount}/${exportPresets.length}개 export preset 다운로드됨`
    );
  };

  const toggleReviewItem = (itemKey: string, included: boolean) => {
    setExcludedReviewItemKeys((current) =>
      included ? current.filter((key) => key !== itemKey) : [...new Set([...current, itemKey])]
    );
  };

  const exportReviewItemToBlob = async (item: ExportPresetReviewItem): Promise<ZipBlobEntry | null> => {
    const node = exportReviewNodes.find((candidate) => candidate.id === item.nodeId);
    if (!node) {
      return null;
    }
    const format = normalizeExportPresetFormat(item.format);
    try {
      if (format === "svg") {
        const assets = await loadArtifactAssetsForNode(node);
        return { path: item.filename, data: new Blob([svgForNode(node, { assets })], { type: "image/svg+xml" }) };
      }
      if (format === "pdf") {
        const assets = await loadArtifactAssetsForNode(node);
        return { path: item.filename, data: new Blob([pdfForNode(node, { assets })], { type: "application/pdf" }) };
      }
      const dataUrl = onDownloadNodeRaster(format, presetRasterScale(item.scale), item.nodeId, item.filename, {
        download: false
      });
      return dataUrl ? { path: item.filename, data: await dataUrlToBlob(dataUrl) } : null;
    } catch {
      return null;
    }
  };

  const downloadSelectedExportReviewItems = async () => {
    const includedItems = exportReviewItems.filter((item) => !excludedReviewItemKeys.includes(item.key));
    if (includedItems.length === 0) {
      setAssetStatus("선택된 export preset 없음");
      return;
    }
    const zipEntries: ZipBlobEntry[] = [];
    for (const item of includedItems) {
      const entry = await exportReviewItemToBlob(item);
      if (entry) {
        zipEntries.push(entry);
      }
    }
    if (zipEntries.length === 0) {
      setAssetStatus("export preset ZIP 다운로드 실패");
      return;
    }
    try {
      const zip = await createZipBlob(zipEntries);
      downloadBlob(zip, exportReviewZipName(isPageExportReview ? pageName : "selected-layers"));
      setAssetStatus(
        zipEntries.length === exportReviewItems.length
          ? `${zipEntries.length}개 export preset ZIP 다운로드됨`
          : `${zipEntries.length}/${exportReviewItems.length}개 export preset ZIP 다운로드됨`
      );
    } catch {
      setAssetStatus("export preset ZIP 다운로드 실패");
    }
  };

  const renderExportReviewCard = () =>
    exportReviewItems.length > 0 ? (
      <div className="dev-panel-export-review-card" data-testid="dev-panel-export-review">
        <div className="dev-panel-code-header">
          <span data-testid="dev-panel-export-review-scope">{exportReviewScopeLabel}</span>
          <button
            type="button"
            className="dev-panel-copy-button"
            data-testid="dev-panel-export-review-download"
            onClick={() => void downloadSelectedExportReviewItems()}
          >
            선택 항목 다운로드
          </button>
        </div>
        <div className="dev-panel-export-review-list">
          {exportReviewItems.map((item) => {
            const checked = !excludedReviewItemKeys.includes(item.key);
            return (
              <label
                key={item.key}
                className="dev-panel-export-review-row"
                data-testid={`dev-panel-export-review-row-${item.key}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  data-testid={`dev-panel-export-review-toggle-${item.key}`}
                  onChange={(event) => toggleReviewItem(item.key, event.currentTarget.checked)}
                />
                <span className="dev-panel-export-review-label">{item.label}</span>
                <span className="dev-panel-export-review-filename">{item.filename}</span>
              </label>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <section className="inspector-section dev-panel" data-testid="dev-panel" aria-label="개발 핸드오프">
      <h3>개발</h3>
      <div className="dev-panel-status" data-testid="dev-panel-status" aria-live="polite">
        {codeExportStatus}
      </div>
      {!selectedNode ? (
        <>
          <p className="empty-state">레이어를 선택하면 개발 스펙을 볼 수 있습니다.</p>
          {exportReviewItems.length > 0 ? (
            <div className="dev-panel-asset-card" data-testid="dev-panel-page-export-assets">
              <div className="dev-panel-asset-status" data-testid="dev-panel-asset-status" aria-live="polite">
                {assetStatus}
              </div>
              {renderExportReviewCard()}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="dev-panel-selected-node" data-testid="dev-panel-selected-node">
            <strong>{selectedNode.name}</strong>
            <span>{selectedNode.id}</span>
            <span>{nodeKindLabel(selectedNode.kind)}</span>
          </div>
          <div className="dev-panel-specs" data-testid="dev-panel-specs">
            <span>X {numericInputValue(selectedNode.transform.x)}</span>
            <span>Y {numericInputValue(selectedNode.transform.y)}</span>
            <span>W {numericInputValue(selectedNode.size.width)}</span>
            <span>H {numericInputValue(selectedNode.size.height)}</span>
            <span>Fill {selectedNode.style.fill}</span>
            <span>Opacity {numericInputValue(selectedNode.style.opacity)}</span>
          </div>
          <div className="dev-panel-copy-status" data-testid="dev-panel-copy-status" aria-live="polite">
            {copyStatus}
          </div>
          <div className="dev-panel-asset-card" data-testid="dev-panel-assets">
            <div className="dev-panel-code-header">
              <span>에셋</span>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-download-svg"
                onClick={downloadSelectedSvg}
              >
                SVG 다운로드
              </button>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-download-png"
                onClick={downloadSelectedPng}
              >
                PNG 다운로드
              </button>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-download-jpeg"
                onClick={downloadSelectedJpeg}
              >
                JPEG 다운로드
              </button>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-download-webp"
                onClick={downloadSelectedWebp}
              >
                WEBP 다운로드
              </button>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-download-pdf"
                onClick={downloadSelectedPdf}
              >
                PDF 다운로드
              </button>
            </div>
            <div
              className="dev-panel-scale-control"
              data-testid="dev-panel-png-scale-control"
              role="radiogroup"
              aria-label="래스터 배율"
            >
              <span>래스터 배율</span>
              <div className="dev-panel-scale-options">
                {PNG_EXPORT_SCALES.map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    role="radio"
                    aria-checked={pngScale === scale}
                    className={`dev-panel-scale-button${pngScale === scale ? " is-active" : ""}`}
                    data-testid={`dev-panel-png-scale-${scale}x`}
                    onClick={() => setPngScale(scale)}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
            </div>
            <div className="dev-panel-asset-status" data-testid="dev-panel-asset-status" aria-live="polite">
              {assetStatus}
            </div>
            {renderExportReviewCard()}
            <div className="dev-panel-export-presets-card">
              <div className="dev-panel-code-header">
                <span>Export presets</span>
                <button
                  type="button"
                  className="dev-panel-copy-button"
                  data-testid="dev-panel-export-presets-download-all"
                  onClick={downloadAllExportPresets}
                  disabled={exportPresets.length === 0}
                >
                  모두 다운로드
                </button>
              </div>
              <div className="dev-panel-export-preset-builder">
                <label>
                  형식
                  <select
                    data-testid="dev-panel-export-preset-format"
                    value={presetFormat}
                    onChange={(event) => setPresetFormat(event.currentTarget.value as ExportPresetFormat)}
                  >
                    {EXPORT_PRESET_FORMATS.map((format) => (
                      <option key={format} value={format}>
                        {exportPresetFormatLabel(format)}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  className="dev-panel-scale-control"
                  data-testid="dev-panel-export-preset-scale-control"
                  role="radiogroup"
                  aria-label="export preset 배율"
                >
                  <span>배율</span>
                  <div className="dev-panel-scale-options">
                    {PNG_EXPORT_SCALES.map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        role="radio"
                        aria-checked={presetScale === scale}
                        className={`dev-panel-scale-button${presetScale === scale ? " is-active" : ""}`}
                        data-testid={`dev-panel-export-preset-scale-${scale}x`}
                        onClick={() => setPresetScale(scale)}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>
                <label>
                  suffix
                  <input
                    data-testid="dev-panel-export-preset-suffix"
                    value={presetSuffix}
                    onChange={(event) => setPresetSuffix(event.currentTarget.value)}
                    placeholder="@2x"
                  />
                </label>
                <button
                  type="button"
                  className="dev-panel-copy-button"
                  data-testid="dev-panel-export-preset-add"
                  onClick={addExportPreset}
                >
                  프리셋 추가
                </button>
              </div>
              <div className="dev-panel-export-presets" data-testid="dev-panel-export-presets">
                {exportPresets.length === 0 ? (
                  <span>저장된 export preset 없음</span>
                ) : (
                  exportPresets.map((preset) => (
                    <div key={preset.id} className="dev-panel-export-preset-row">
                      <span>
                        {exportPresetFormatLabel(preset.format as ExportPresetFormat)} {preset.scale}x
                        {preset.suffix ? ` ${preset.suffix}` : ""}
                      </span>
                      <button
                        type="button"
                        className="dev-panel-copy-button"
                        data-testid={`dev-panel-export-preset-remove-${preset.id}`}
                        onClick={() => removeExportPreset(preset.id)}
                      >
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="stacked-field dev-panel-code-block">
            <div className="dev-panel-code-header">
              <span>CSS</span>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-copy-css"
                disabled={!cssSnippet}
                onClick={() => void copySnippet("CSS", cssSnippet)}
              >
                CSS 복사
              </button>
            </div>
            <pre data-testid="dev-panel-css">{cssSnippet || "코드 내보내기 데이터를 기다리는 중"}</pre>
          </div>
          <div className="stacked-field dev-panel-code-block">
            <div className="dev-panel-code-header">
              <span>HTML</span>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-copy-html"
                disabled={!htmlSnippet}
                onClick={() => void copySnippet("HTML", htmlSnippet)}
              >
                HTML 복사
              </button>
            </div>
            <pre data-testid="dev-panel-html">{htmlSnippet || "코드 내보내기 데이터를 기다리는 중"}</pre>
          </div>
          <div className="stacked-field dev-panel-code-block">
            <div className="dev-panel-code-header">
              <span>구조</span>
              <button
                type="button"
                className="dev-panel-copy-button"
                data-testid="dev-panel-copy-structure"
                disabled={!structureSnippet}
                onClick={() => void copySnippet("구조", structureSnippet)}
              >
                구조 복사
              </button>
            </div>
            <pre data-testid="dev-panel-structure">{structureSnippet || "구조 데이터를 기다리는 중"}</pre>
          </div>
        </>
      )}
    </section>
  );
}

function PrototypePanel() {
  return (
    <section className="inspector-section" data-testid="prototype-panel" aria-label="프로토타입">
      <h3>프로토타입</h3>
      <p className="empty-state">프로토타입 연결은 아직 구현 대기 중입니다.</p>
    </section>
  );
}

function Inspector({
  activeTab,
  selectedNode,
  selectedNodes,
  pageName,
  pageExportNodes,
  pageExportReviewItems,
  selectedParentNode,
  selectedNodeCount,
  codeExport,
  codeExportStatus,
  documentTokens,
  canAlign,
  canDistribute,
  onGeometryChange,
  onFillChange,
  onTextChange,
  onLayoutChange,
  onLayoutItemChange,
  onConstraintsChange,
  onAlign,
  onDistribute,
  zoomLabel,
  canShare,
  onShare,
  tokenDtcgDraft,
  tokenDtcgStatus,
  canEditTokens,
  commentThreads,
  commentBody,
  commentReplyBodies,
  commentStatus,
  canComment,
  onTokenDtcgDraftChange,
  onExportTokensDtcg,
  onImportTokensDtcg,
  onCommentBodyChange,
  onCommentReplyBodyChange,
  onCreateComment,
  onCreateCommentReply,
  onResolveComment,
  onMarkCommentRead,
  onDownloadSelectedPng,
  onDownloadSelectedJpeg,
  onDownloadSelectedWebp,
  onDownloadSelectedRaster,
  onDownloadNodeRaster,
  onExportPresetsChange,
  onTabChange
}: {
  activeTab: InspectorTab;
  selectedNode: RendererNode | null;
  selectedNodes: RendererNode[];
  pageName: string;
  pageExportNodes: RendererNode[];
  pageExportReviewItems: ExportPresetReviewItem[];
  selectedParentNode: RendererNode | null;
  selectedNodeCount: number;
  codeExport: CodeExportPayload | null;
  codeExportStatus: string;
  documentTokens: DesignToken[];
  canAlign: boolean;
  canDistribute: boolean;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onFillChange: (nodeId: string, fill: string) => void;
  onTextChange: (nodeId: string, value: string) => void;
  onLayoutChange: (nodeId: string, layout: NodeLayout) => void;
  onLayoutItemChange: (nodeId: string, layoutItem: NodeLayoutItem) => void;
  onConstraintsChange: (nodeId: string, constraints: NodeConstraints) => void;
  onAlign: (mode: AlignmentMode) => void;
  onDistribute: (mode: DistributionMode) => void;
  zoomLabel: string;
  canShare: boolean;
  onShare: () => void;
  tokenDtcgDraft: string;
  tokenDtcgStatus: string;
  canEditTokens: boolean;
  commentThreads: CommentThread[];
  commentBody: string;
  commentReplyBodies: Record<string, string>;
  commentStatus: string;
  canComment: boolean;
  onTokenDtcgDraftChange: (value: string) => void;
  onExportTokensDtcg: () => void;
  onImportTokensDtcg: () => void;
  onCommentBodyChange: (value: string) => void;
  onCommentReplyBodyChange: (threadId: string, value: string) => void;
  onCreateComment: (nodeId: string) => void;
  onCreateCommentReply: (threadId: string) => void;
  onResolveComment: (threadId: string) => void;
  onMarkCommentRead: (threadId: string) => void;
  onDownloadSelectedPng: (scale: PngExportScale) => string | null;
  onDownloadSelectedJpeg: (scale: PngExportScale) => string | null;
  onDownloadSelectedWebp: (scale: PngExportScale) => string | null;
  onDownloadSelectedRaster: (
    format: "png" | "jpeg" | "webp",
    scale: PngExportScale,
    filename: string
  ) => string | null;
  onDownloadNodeRaster: (
    format: "png" | "jpeg" | "webp",
    scale: PngExportScale,
    nodeId: string,
    filename: string,
    options?: { download?: boolean }
  ) => string | null;
  onExportPresetsChange: (nodeId: string, presets: NodeExportPreset[]) => void;
  onTabChange: (tab: InspectorTab) => void;
}) {
  const tokenControls = (
    <InspectorTokenControls
      draft={tokenDtcgDraft}
      status={tokenDtcgStatus}
      canEdit={canEditTokens}
      onDraftChange={onTokenDtcgDraftChange}
      onExport={onExportTokensDtcg}
      onImport={onImportTokensDtcg}
    />
  );

  if (selectedNodeCount > 1) {
    return (
      <aside className="inspector">
        <InspectorHeader
          zoomLabel={zoomLabel}
          canShare={canShare}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onShare={onShare}
        />
        <div className="node-summary">
          <strong>{selectedNodeCount}개 레이어 선택됨</strong>
          <span>다중 선택</span>
        </div>
        {activeTab === "dev" ? (
          <DevPanel
            selectedNode={selectedNode}
            selectedNodes={selectedNodes}
            pageName={pageName}
            pageExportNodes={pageExportNodes}
            pageExportReviewItems={pageExportReviewItems}
            codeExport={codeExport}
            codeExportStatus={codeExportStatus}
            onDownloadPng={onDownloadSelectedPng}
            onDownloadJpeg={onDownloadSelectedJpeg}
            onDownloadWebp={onDownloadSelectedWebp}
            onDownloadRaster={onDownloadSelectedRaster}
            onDownloadNodeRaster={onDownloadNodeRaster}
            onExportPresetsChange={onExportPresetsChange}
          />
        ) : activeTab === "prototype" ? (
          <PrototypePanel />
        ) : (
          <>
            <InspectorAlignmentControls
              canAlign={canAlign}
              canDistribute={canDistribute}
              onAlign={onAlign}
              onDistribute={onDistribute}
            />
            {tokenControls}
          </>
        )}
      </aside>
    );
  }

  if (!selectedNode) {
    return (
      <aside className="inspector">
        <InspectorHeader
          zoomLabel={zoomLabel}
          canShare={canShare}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onShare={onShare}
        />
        {activeTab === "dev" ? (
          <DevPanel
            selectedNode={selectedNode}
            selectedNodes={selectedNodes}
            pageName={pageName}
            pageExportNodes={pageExportNodes}
            pageExportReviewItems={pageExportReviewItems}
            codeExport={codeExport}
            codeExportStatus={codeExportStatus}
            onDownloadPng={onDownloadSelectedPng}
            onDownloadJpeg={onDownloadSelectedJpeg}
            onDownloadWebp={onDownloadSelectedWebp}
            onDownloadRaster={onDownloadSelectedRaster}
            onDownloadNodeRaster={onDownloadNodeRaster}
            onExportPresetsChange={onExportPresetsChange}
          />
        ) : activeTab === "prototype" ? (
          <PrototypePanel />
        ) : (
          <>
            <p className="empty-state">레이어 또는 캔버스 요소를 선택하세요.</p>
            <InspectorEmptySections />
            {tokenControls}
          </>
        )}
      </aside>
    );
  }

  const updateNumber = (patchKey: keyof GeometryPatch) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.currentTarget.value);
    if (Number.isFinite(nextValue)) {
      onGeometryChange(selectedNode.id, { [patchKey]: nextValue });
    }
  };
  const layout: NodeLayout = selectedNode.layout
    ? {
        ...DEFAULT_NODE_LAYOUT,
        ...selectedNode.layout,
        padding: {
          ...DEFAULT_NODE_LAYOUT.padding,
          ...selectedNode.layout.padding
        }
      }
    : DEFAULT_NODE_LAYOUT;
  const layoutItem: NodeLayoutItem = selectedNode.layout_item
    ? {
        ...DEFAULT_NODE_LAYOUT_ITEM,
        ...selectedNode.layout_item,
        margin: {
          ...DEFAULT_NODE_LAYOUT_ITEM.margin,
          ...selectedNode.layout_item.margin
        }
      }
    : DEFAULT_NODE_LAYOUT_ITEM;
  const selectedParentUsesGrid = selectedParentNode?.layout?.mode === "grid";
  const constraints = selectedNode.constraints ?? DEFAULT_NODE_CONSTRAINTS;
  const fillToken = selectedNode.style.fill_token
    ? documentTokens.find((token) => token.id === selectedNode.style.fill_token && token.type === "color") ?? null
    : null;
  const spacingTokens = documentTokens.filter((token) => token.type === "spacing");
  const updateLayout = (patch: Partial<NodeLayout>) => {
    onLayoutChange(selectedNode.id, {
      ...layout,
      ...patch,
      padding: patch.padding ?? layout.padding,
      spacing_tokens: patch.spacing_tokens ?? layout.spacing_tokens
    });
  };
  const bindGapSpacingToken = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const token = spacingTokens.find((candidate) => candidate.id === event.currentTarget.value);
    if (!token) {
      updateLayout({
        spacing_tokens: {
          ...(layout.spacing_tokens ?? {}),
          gap: null,
          row_gap: null,
          column_gap: null
        }
      });
      return;
    }
    const value = spacingTokenNumber(token);
    if (value === null) {
      return;
    }
    updateLayout({
      mode: layout.mode === "none" ? "auto" : layout.mode,
      gap: value,
      row_gap: value,
      column_gap: value,
      spacing_tokens: {
        ...(layout.spacing_tokens ?? {}),
        gap: token.id,
        row_gap: token.id,
        column_gap: token.id
      }
    });
  };
  const bindPaddingSpacingToken = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const token = spacingTokens.find((candidate) => candidate.id === event.currentTarget.value);
    if (!token) {
      updateLayout({
        spacing_tokens: {
          ...(layout.spacing_tokens ?? {}),
          padding_top: null,
          padding_right: null,
          padding_bottom: null,
          padding_left: null
        }
      });
      return;
    }
    const value = spacingTokenNumber(token);
    if (value === null) {
      return;
    }
    updateLayout({
      mode: layout.mode === "none" ? "auto" : layout.mode,
      padding: { top: value, right: value, bottom: value, left: value },
      spacing_tokens: {
        ...(layout.spacing_tokens ?? {}),
        padding_top: token.id,
        padding_right: token.id,
        padding_bottom: token.id,
        padding_left: token.id
      }
    });
  };
  const updatePadding =
    (side: keyof NodeLayout["padding"]) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);
      if (Number.isFinite(nextValue)) {
        const tokenKeyBySide: Record<keyof NodeLayout["padding"], LayoutSpacingTokenKey> = {
          top: "padding_top",
          right: "padding_right",
          bottom: "padding_bottom",
          left: "padding_left"
        };
        updateLayout({
          padding: {
            ...layout.padding,
            [side]: nextValue
          },
          spacing_tokens: {
            ...(layout.spacing_tokens ?? {}),
            [tokenKeyBySide[side]]: null
          }
        });
      }
    };
  const updateLayoutItemPosition = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onLayoutItemChange(selectedNode.id, {
      ...layoutItem,
      position: event.currentTarget.value as NodeLayoutItem["position"]
    });
  };
  const updateLayoutItemMargin =
    (side: keyof NodeLayoutItem["margin"]) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);
      if (Number.isFinite(nextValue)) {
        onLayoutItemChange(selectedNode.id, {
          ...layoutItem,
          margin: {
            ...layoutItem.margin,
            [side]: nextValue
          }
        });
      }
    };
  const updateLayoutItemGridPlacement =
    (key: "grid_column" | "grid_row" | "grid_column_span" | "grid_row_span") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);
      if (Number.isFinite(nextValue)) {
        onLayoutItemChange(selectedNode.id, {
          ...layoutItem,
          [key]: nextValue
        });
      }
    };
  const updateLayoutItemSelfAlignment =
    (key: "justify_self" | "align_self") => (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.currentTarget.value;
      onLayoutItemChange(selectedNode.id, {
        ...layoutItem,
        [key]: value === "" ? undefined : value
      } as NodeLayoutItem);
    };
  const updateLayoutSizeLimit =
    (key: "min_width" | "max_width" | "min_height" | "max_height") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.currentTarget.value;
      if (rawValue.trim() === "") {
        updateLayout({ [key]: undefined } as Partial<NodeLayout>);
        return;
      }
      const nextValue = Number(rawValue);
      if (Number.isFinite(nextValue)) {
        updateLayout({ [key]: nextValue } as Partial<NodeLayout>);
      }
    };
  const updateLayoutItemSizeLimit =
    (key: "min_width" | "max_width" | "min_height" | "max_height") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.currentTarget.value;
      if (rawValue.trim() === "") {
        onLayoutItemChange(selectedNode.id, {
          ...layoutItem,
          [key]: undefined
        } as NodeLayoutItem);
        return;
      }
      const nextValue = Number(rawValue);
      if (Number.isFinite(nextValue)) {
        onLayoutItemChange(selectedNode.id, {
          ...layoutItem,
          [key]: nextValue
        } as NodeLayoutItem);
      }
    };
  const updateConstraints = (patch: Partial<NodeConstraints>) => {
    onConstraintsChange(selectedNode.id, { ...constraints, ...patch });
  };

  return (
    <aside className="inspector">
      <InspectorHeader
        zoomLabel={zoomLabel}
        canShare={canShare}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onShare={onShare}
      />
      <div className="node-summary">
        <strong>{selectedNode.name}</strong>
        <span>{nodeKindLabel(selectedNode.kind)}</span>
      </div>
      {activeTab === "dev" ? (
        <DevPanel
          selectedNode={selectedNode}
          selectedNodes={selectedNodes}
          pageName={pageName}
          pageExportNodes={pageExportNodes}
          pageExportReviewItems={pageExportReviewItems}
          codeExport={codeExport}
          codeExportStatus={codeExportStatus}
          onDownloadPng={onDownloadSelectedPng}
          onDownloadJpeg={onDownloadSelectedJpeg}
          onDownloadWebp={onDownloadSelectedWebp}
          onDownloadRaster={onDownloadSelectedRaster}
          onDownloadNodeRaster={onDownloadNodeRaster}
          onExportPresetsChange={onExportPresetsChange}
        />
      ) : activeTab === "prototype" ? (
        <PrototypePanel />
      ) : (
        <>
      <InspectorAlignmentControls
        canAlign={canAlign}
        canDistribute={canDistribute}
        onAlign={onAlign}
        onDistribute={onDistribute}
      />
      <div className="field-grid">
        <label>
          X
          <input
            data-testid="inspector-x"
            type="number"
            value={numericInputValue(selectedNode.transform.x)}
            onChange={updateNumber("x")}
          />
        </label>
        <label>
          Y
          <input
            data-testid="inspector-y"
            type="number"
            value={numericInputValue(selectedNode.transform.y)}
            onChange={updateNumber("y")}
          />
        </label>
        <label>
          W
          <input
            data-testid="inspector-width"
            type="number"
            value={numericInputValue(selectedNode.size.width)}
            onChange={updateNumber("width")}
          />
        </label>
        <label>
          H
          <input
            data-testid="inspector-height"
            type="number"
            value={numericInputValue(selectedNode.size.height)}
            onChange={updateNumber("height")}
          />
        </label>
      </div>
      <label className="stacked-field">
        채우기
        <input
          data-testid="inspector-fill"
          type="color"
          value={selectedNode.style.fill}
          onChange={(event) => onFillChange(selectedNode.id, event.currentTarget.value)}
        />
      </label>
      {selectedNode.style.fill_token ? (
        <div className="inspector-token-readout" data-testid="inspector-fill-token">
          토큰 {fillToken?.name ?? selectedNode.style.fill_token}
        </div>
      ) : null}
      {tokenControls}
      {selectedNode.content.type === "text" ? (
        <label className="stacked-field">
          텍스트
          <textarea
            className="inspector-text-field"
            data-testid="inspector-text"
            placeholder="텍스트 입력"
            value={selectedNode.content.value}
            onChange={(event) => onTextChange(selectedNode.id, event.currentTarget.value)}
          />
        </label>
      ) : null}
      <section className="inspector-section comment-panel" data-testid="comment-panel" aria-label="코멘트">
        <h3>코멘트</h3>
        <div className="comment-target">
          <strong>{selectedNode.name}</strong>
          <span>{selectedNode.id}</span>
        </div>
        <label className="stacked-field">
          새 코멘트
          <textarea
            className="comment-body-field"
            data-testid="comment-body"
            placeholder="코멘트 입력"
            value={commentBody}
            onChange={(event) => onCommentBodyChange(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="comment-submit"
          onClick={() => onCreateComment(selectedNode.id)}
          disabled={!canComment || !commentBody.trim()}
        >
          코멘트 추가
        </button>
        <div className="comment-status" data-testid="comment-status" aria-live="polite">
          {commentStatus}
        </div>
        <ul className="comment-list" data-testid="comment-list">
          {commentThreads.length === 0 ? (
            <li className="comment-empty">활성 코멘트 없음</li>
          ) : (
            commentThreads.map((thread) => (
              <li className="comment-row" key={thread.threadId}>
                <div className="comment-row-header">
                  <span className="comment-summary">
                    <strong>{thread.body}</strong>
                    <span>
                      {thread.nodeId} · {thread.authorName}
                    </span>
                    <CommentMentionChips mentions={thread.mentions} mentionTargets={thread.mentionTargets} />
                    {thread.unread ? <span className="comment-unread-badge">읽지 않음</span> : null}
                  </span>
                  <span className="comment-row-actions">
                    {thread.unread ? (
                      <button type="button" onClick={() => onMarkCommentRead(thread.threadId)}>
                        읽음 처리
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${thread.body} 해결`}
                      onClick={() => onResolveComment(thread.threadId)}
                    >
                      해결
                    </button>
                  </span>
                </div>
                {thread.replies.length > 0 ? (
                  <ul className="comment-reply-list" data-testid="comment-reply-list">
                    {thread.replies.map((reply) => (
                      <li className="comment-reply" key={reply.replyId}>
                        <strong>{reply.body}</strong>
                        <span>{reply.authorName}</span>
                        <CommentMentionChips mentions={reply.mentions} mentionTargets={reply.mentionTargets} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="comment-reply-compose">
                  <textarea
                    className="comment-body-field comment-reply-body-field"
                    data-testid="comment-reply-body"
                    placeholder="답글 입력"
                    value={commentReplyBodies[thread.threadId] ?? ""}
                    onChange={(event) =>
                      onCommentReplyBodyChange(thread.threadId, event.currentTarget.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => onCreateCommentReply(thread.threadId)}
                    disabled={!canComment || !(commentReplyBodies[thread.threadId] ?? "").trim()}
                  >
                    답글 추가
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className="inspector-section" aria-label="레이아웃">
        <h3>레이아웃</h3>
        <label className="stacked-field">
          모드
          <select
            data-testid="inspector-layout-mode"
            value={layout.mode}
            onChange={(event) =>
              updateLayout({ mode: event.currentTarget.value as NodeLayout["mode"] })
            }
          >
            <option value="none">없음</option>
            <option value="auto">자동</option>
            <option value="grid">그리드</option>
          </select>
        </label>
        {layout.mode === "grid" ? (
          <div className="field-grid">
            <label>
              그리드 열
              <input
                data-testid="inspector-layout-grid-columns"
                type="number"
                value={numericInputValue(layout.grid_columns ?? 2)}
                onChange={(event) => {
                  const nextValue = Number(event.currentTarget.value);
                  if (Number.isFinite(nextValue)) {
                    updateLayout({ grid_columns: nextValue });
                  }
                }}
              />
            </label>
            <label>
              그리드 행
              <input
                data-testid="inspector-layout-grid-rows"
                type="number"
                value={numericInputValue(layout.grid_rows ?? 2)}
                onChange={(event) => {
                  const nextValue = Number(event.currentTarget.value);
                  if (Number.isFinite(nextValue)) {
                    updateLayout({ grid_rows: nextValue });
                  }
                }}
              />
            </label>
            <label>
              열 트랙
              <input
                data-testid="inspector-layout-grid-column-tracks"
                value={gridTrackInputValue(layout.grid_column_tracks, layout.grid_columns ?? 2)}
                onChange={(event) => {
                  const nextTracks = parseGridTrackInput(event.currentTarget.value);
                  if (nextTracks) {
                    updateLayout({
                      grid_columns: nextTracks.length,
                      grid_column_tracks: nextTracks
                    });
                  }
                }}
              />
            </label>
            <label>
              행 트랙
              <input
                data-testid="inspector-layout-grid-row-tracks"
                value={gridTrackInputValue(layout.grid_row_tracks, layout.grid_rows ?? 2)}
                onChange={(event) => {
                  const nextTracks = parseGridTrackInput(event.currentTarget.value);
                  if (nextTracks) {
                    updateLayout({
                      grid_rows: nextTracks.length,
                      grid_row_tracks: nextTracks
                    });
                  }
                }}
              />
            </label>
          </div>
        ) : null}
        {layout.mode === "grid" ? (
          <label className="stacked-field">
            영역
            <input
              data-testid="inspector-layout-grid-areas"
              placeholder="hero:2/1/2/2"
              value={gridAreaInputValue(layout.grid_areas)}
              onChange={(event) => {
                const nextAreas = parseGridAreaInput(event.currentTarget.value);
                if (nextAreas) {
                  updateLayout({ grid_areas: nextAreas });
                }
              }}
            />
          </label>
        ) : null}
        <label className="stacked-field">
          방향
          <select
            data-testid="inspector-layout-direction"
            value={layout.direction}
            onChange={(event) =>
              updateLayout({ direction: event.currentTarget.value as NodeLayout["direction"] })
            }
          >
            <option value="vertical">세로</option>
            <option value="vertical_reverse">세로 역순</option>
            <option value="horizontal">가로</option>
            <option value="horizontal_reverse">가로 역순</option>
          </select>
        </label>
        <label className="stacked-field">
          줄바꿈
          <select
            data-testid="inspector-layout-wrap"
            value={layout.wrap ?? "nowrap"}
            onChange={(event) =>
              updateLayout({ wrap: event.currentTarget.value as NodeLayout["wrap"] })
            }
          >
            <option value="nowrap">한 줄</option>
            <option value="wrap">줄바꿈</option>
          </select>
        </label>
        <label className="stacked-field">
          너비 크기
          <select
            data-testid="inspector-layout-width-sizing"
            value={layout.width_sizing ?? "fixed"}
            onChange={(event) =>
              updateLayout({ width_sizing: event.currentTarget.value as NodeLayout["width_sizing"] })
            }
          >
            <option value="fixed">고정</option>
            <option value="fit">내용 맞춤</option>
          </select>
        </label>
        <label className="stacked-field">
          높이 크기
          <select
            data-testid="inspector-layout-height-sizing"
            value={layout.height_sizing ?? "fixed"}
            onChange={(event) =>
              updateLayout({ height_sizing: event.currentTarget.value as NodeLayout["height_sizing"] })
            }
          >
            <option value="fixed">고정</option>
            <option value="fit">내용 맞춤</option>
          </select>
        </label>
        <div className="field-grid">
          <label>
            최소 너비
            <input
              data-testid="inspector-layout-min-width"
              type="number"
              min="0"
              value={optionalNumericInputValue(layout.min_width)}
              onChange={updateLayoutSizeLimit("min_width")}
            />
          </label>
          <label>
            최대 너비
            <input
              data-testid="inspector-layout-max-width"
              type="number"
              min="0"
              value={optionalNumericInputValue(layout.max_width)}
              onChange={updateLayoutSizeLimit("max_width")}
            />
          </label>
          <label>
            최소 높이
            <input
              data-testid="inspector-layout-min-height"
              type="number"
              min="0"
              value={optionalNumericInputValue(layout.min_height)}
              onChange={updateLayoutSizeLimit("min_height")}
            />
          </label>
          <label>
            최대 높이
            <input
              data-testid="inspector-layout-max-height"
              type="number"
              min="0"
              value={optionalNumericInputValue(layout.max_height)}
              onChange={updateLayoutSizeLimit("max_height")}
            />
          </label>
        </div>
        <label className="stacked-field">
          줄 정렬
          <select
            data-testid="inspector-layout-align-content"
            value={layout.align_content ?? "start"}
            onChange={(event) =>
              updateLayout({ align_content: event.currentTarget.value as NodeLayout["align_content"] })
            }
          >
            <option value="start">시작</option>
            <option value="center">가운데</option>
            <option value="end">끝</option>
            <option value="space_between">사이</option>
            <option value="space_around">둘레</option>
            <option value="space_evenly">균등</option>
          </select>
        </label>
        <label className="stacked-field">
          교차축 정렬
          <select
            data-testid="inspector-layout-align-items"
            value={layout.align_items}
            onChange={(event) =>
              updateLayout({ align_items: event.currentTarget.value as NodeLayout["align_items"] })
            }
          >
            <option value="start">시작</option>
            <option value="center">가운데</option>
            <option value="end">끝</option>
            <option value="stretch">늘림</option>
            <option value="baseline">기준선</option>
          </select>
        </label>
        <label className="stacked-field">
          주축 분배
          <select
            data-testid="inspector-layout-justify-content"
            value={layout.justify_content}
            onChange={(event) =>
              updateLayout({
                justify_content: event.currentTarget.value as NodeLayout["justify_content"]
              })
            }
          >
            <option value="start">시작</option>
            <option value="center">가운데</option>
            <option value="end">끝</option>
            <option value="space_between">사이</option>
            <option value="space_around">둘레</option>
            <option value="space_evenly">균등</option>
          </select>
        </label>
        {layout.mode === "grid" ? (
          <label className="stacked-field">
            그리드 가로 정렬
            <select
              data-testid="inspector-layout-grid-justify-items"
              value={layout.justify_items ?? "start"}
              onChange={(event) =>
                updateLayout({
                  justify_items: event.currentTarget.value as NodeLayout["justify_items"]
                })
              }
            >
              <option value="start">시작</option>
              <option value="center">가운데</option>
              <option value="end">끝</option>
              <option value="stretch">늘림</option>
            </select>
          </label>
        ) : null}
        {spacingTokens.length ? (
          <div className="field-grid">
            <label>
              간격 토큰
              <select
                data-testid="inspector-layout-gap-token"
                value={uniformTokenValue(layout.spacing_tokens, ["gap", "row_gap", "column_gap"])}
                onChange={bindGapSpacingToken}
              >
                <option value="">토큰 없음</option>
                {spacingTokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              패딩 토큰
              <select
                data-testid="inspector-layout-padding-token"
                value={uniformTokenValue(layout.spacing_tokens, [
                  "padding_top",
                  "padding_right",
                  "padding_bottom",
                  "padding_left"
                ])}
                onChange={bindPaddingSpacingToken}
              >
                <option value="">토큰 없음</option>
                {spacingTokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <div className="field-grid">
          <label>
            간격
            <input
              data-testid="inspector-layout-gap"
              type="number"
              value={numericInputValue(layout.gap)}
              onChange={(event) => {
                const nextValue = Number(event.currentTarget.value);
                if (Number.isFinite(nextValue)) {
                  updateLayout({
                    gap: nextValue,
                    spacing_tokens: {
                      ...(layout.spacing_tokens ?? {}),
                      gap: null,
                      row_gap: null,
                      column_gap: null
                    }
                  });
                }
              }}
            />
          </label>
          <label>
            행 간격
            <input
              data-testid="inspector-layout-row-gap"
              type="number"
              value={numericInputValue(layout.row_gap ?? layout.gap)}
              onChange={(event) => {
                const nextValue = Number(event.currentTarget.value);
                if (Number.isFinite(nextValue)) {
                  updateLayout({
                    row_gap: nextValue,
                    spacing_tokens: {
                      ...(layout.spacing_tokens ?? {}),
                      row_gap: null
                    }
                  });
                }
              }}
            />
          </label>
          <label>
            열 간격
            <input
              data-testid="inspector-layout-column-gap"
              type="number"
              value={numericInputValue(layout.column_gap ?? layout.gap)}
              onChange={(event) => {
                const nextValue = Number(event.currentTarget.value);
                if (Number.isFinite(nextValue)) {
                  updateLayout({
                    column_gap: nextValue,
                    spacing_tokens: {
                      ...(layout.spacing_tokens ?? {}),
                      column_gap: null
                    }
                  });
                }
              }}
            />
          </label>
          <label>
            위
            <input
              data-testid="inspector-layout-padding-top"
              type="number"
              value={numericInputValue(layout.padding.top)}
              onChange={updatePadding("top")}
            />
          </label>
          <label>
            오른쪽
            <input
              data-testid="inspector-layout-padding-right"
              type="number"
              value={numericInputValue(layout.padding.right)}
              onChange={updatePadding("right")}
            />
          </label>
          <label>
            아래
            <input
              data-testid="inspector-layout-padding-bottom"
              type="number"
              value={numericInputValue(layout.padding.bottom)}
              onChange={updatePadding("bottom")}
            />
          </label>
          <label>
            왼쪽
            <input
              data-testid="inspector-layout-padding-left"
              type="number"
              value={numericInputValue(layout.padding.left)}
              onChange={updatePadding("left")}
            />
          </label>
        </div>
      </section>
      <section className="inspector-section" aria-label="레이아웃 아이템">
        <h3>레이아웃 아이템</h3>
        <label className="stacked-field">
          위치
          <select
            data-testid="inspector-layout-item-position"
            value={layoutItem.position ?? "static"}
            onChange={updateLayoutItemPosition}
          >
            <option value="static">흐름</option>
            <option value="absolute">절대</option>
          </select>
        </label>
        {selectedParentUsesGrid ? (
          <div className="field-grid">
            <label>
              아이템 가로 정렬
              <select
                data-testid="inspector-layout-item-justify-self"
                value={layoutItem.justify_self ?? ""}
                onChange={updateLayoutItemSelfAlignment("justify_self")}
              >
                <option value="">상속</option>
                <option value="start">시작</option>
                <option value="center">가운데</option>
                <option value="end">끝</option>
                <option value="stretch">늘림</option>
              </select>
            </label>
            <label>
              아이템 세로 정렬
              <select
                data-testid="inspector-layout-item-align-self"
                value={layoutItem.align_self ?? ""}
                onChange={updateLayoutItemSelfAlignment("align_self")}
              >
                <option value="">상속</option>
                <option value="start">시작</option>
                <option value="center">가운데</option>
                <option value="end">끝</option>
                <option value="stretch">늘림</option>
              </select>
            </label>
            <label>
              그리드 영역
              <input
                data-testid="inspector-layout-item-grid-area"
                value={layoutItem.grid_area ?? ""}
                onChange={(event) => {
                  const gridArea = event.currentTarget.value.trim();
                  onLayoutItemChange(selectedNode.id, {
                    ...layoutItem,
                    grid_area: gridArea || undefined
                  });
                }}
              />
            </label>
            <label>
              그리드 열 위치
              <input
                data-testid="inspector-layout-item-grid-column"
                type="number"
                min="1"
                value={numericInputValue(layoutItem.grid_column ?? 1)}
                onChange={updateLayoutItemGridPlacement("grid_column")}
              />
            </label>
            <label>
              그리드 행 위치
              <input
                data-testid="inspector-layout-item-grid-row"
                type="number"
                min="1"
                value={numericInputValue(layoutItem.grid_row ?? 1)}
                onChange={updateLayoutItemGridPlacement("grid_row")}
              />
            </label>
            <label>
              그리드 열 범위
              <input
                data-testid="inspector-layout-item-grid-column-span"
                type="number"
                min="1"
                value={numericInputValue(layoutItem.grid_column_span ?? 1)}
                onChange={updateLayoutItemGridPlacement("grid_column_span")}
              />
            </label>
            <label>
              그리드 행 범위
              <input
                data-testid="inspector-layout-item-grid-row-span"
                type="number"
                min="1"
                value={numericInputValue(layoutItem.grid_row_span ?? 1)}
                onChange={updateLayoutItemGridPlacement("grid_row_span")}
              />
            </label>
          </div>
        ) : null}
        <label className="stacked-field">
          아이템 너비
          <select
            data-testid="inspector-layout-item-width-sizing"
            value={layoutItem.width_sizing ?? "fixed"}
            onChange={(event) =>
              onLayoutItemChange(selectedNode.id, {
                ...layoutItem,
                width_sizing: event.currentTarget.value as NodeLayoutItem["width_sizing"]
              })
            }
          >
            <option value="fixed">고정</option>
            <option value="fill">채우기</option>
          </select>
        </label>
        <label className="stacked-field">
          아이템 높이
          <select
            data-testid="inspector-layout-item-height-sizing"
            value={layoutItem.height_sizing ?? "fixed"}
            onChange={(event) =>
              onLayoutItemChange(selectedNode.id, {
                ...layoutItem,
                height_sizing: event.currentTarget.value as NodeLayoutItem["height_sizing"]
              })
            }
          >
            <option value="fixed">고정</option>
            <option value="fill">채우기</option>
          </select>
        </label>
        <div className="field-grid">
          <label>
            최소 너비
            <input
              data-testid="inspector-layout-item-min-width"
              type="number"
              min="0"
              value={optionalNumericInputValue(layoutItem.min_width)}
              onChange={updateLayoutItemSizeLimit("min_width")}
            />
          </label>
          <label>
            최대 너비
            <input
              data-testid="inspector-layout-item-max-width"
              type="number"
              min="0"
              value={optionalNumericInputValue(layoutItem.max_width)}
              onChange={updateLayoutItemSizeLimit("max_width")}
            />
          </label>
          <label>
            최소 높이
            <input
              data-testid="inspector-layout-item-min-height"
              type="number"
              min="0"
              value={optionalNumericInputValue(layoutItem.min_height)}
              onChange={updateLayoutItemSizeLimit("min_height")}
            />
          </label>
          <label>
            최대 높이
            <input
              data-testid="inspector-layout-item-max-height"
              type="number"
              min="0"
              value={optionalNumericInputValue(layoutItem.max_height)}
              onChange={updateLayoutItemSizeLimit("max_height")}
            />
          </label>
        </div>
        <div className="field-grid">
          <label>
            마진 위
            <input
              data-testid="inspector-layout-item-margin-top"
              type="number"
              value={numericInputValue(layoutItem.margin.top)}
              onChange={updateLayoutItemMargin("top")}
            />
          </label>
          <label>
            마진 오른쪽
            <input
              data-testid="inspector-layout-item-margin-right"
              type="number"
              value={numericInputValue(layoutItem.margin.right)}
              onChange={updateLayoutItemMargin("right")}
            />
          </label>
          <label>
            마진 아래
            <input
              data-testid="inspector-layout-item-margin-bottom"
              type="number"
              value={numericInputValue(layoutItem.margin.bottom)}
              onChange={updateLayoutItemMargin("bottom")}
            />
          </label>
          <label>
            마진 왼쪽
            <input
              data-testid="inspector-layout-item-margin-left"
              type="number"
              value={numericInputValue(layoutItem.margin.left)}
              onChange={updateLayoutItemMargin("left")}
            />
          </label>
        </div>
      </section>
      <section className="inspector-section" aria-label="제약">
        <h3>제약</h3>
        <label className="stacked-field">
          가로
          <select
            data-testid="inspector-constraint-horizontal"
            value={constraints.horizontal}
            onChange={(event) =>
              updateConstraints({
                horizontal: event.currentTarget.value as NodeConstraints["horizontal"]
              })
            }
          >
            <option value="left">왼쪽</option>
            <option value="right">오른쪽</option>
            <option value="left_right">좌우</option>
            <option value="center">가운데</option>
            <option value="scale">비율</option>
          </select>
        </label>
        <label className="stacked-field">
          세로
          <select
            data-testid="inspector-constraint-vertical"
            value={constraints.vertical}
            onChange={(event) =>
              updateConstraints({
                vertical: event.currentTarget.value as NodeConstraints["vertical"]
              })
            }
          >
            <option value="top">위</option>
            <option value="bottom">아래</option>
            <option value="top_bottom">상하</option>
            <option value="center">가운데</option>
            <option value="scale">비율</option>
          </select>
        </label>
      </section>
        </>
      )}
    </aside>
  );
}

export function App() {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const [gridResizeSession, setGridResizeSession] = useState<GridResizeSession | null>(null);
  const [gridAreaBoundarySession, setGridAreaBoundarySession] = useState<GridAreaBoundarySession | null>(null);
  const [teamName, setTeamName] = useState("디자인 팀");
  const [relayUrl, setRelayUrl] = useState("");
  const [relayToken, setRelayToken] = useState("");
  const [memberToken, setMemberToken] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestStatus, setManifestStatus] = useState("");
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectManifest | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [projectStatus, setProjectStatus] = useState("프로젝트 불러오는 중");
  const [fileVersions, setFileVersions] = useState<FileVersionSummary[]>([]);
  const [fileVersionPreview, setFileVersionPreview] = useState<FileVersionPreviewState | null>(null);
  const [fileVersionMessage, setFileVersionMessage] = useState("검토 전");
  const [fileVersionRetentionKeep, setFileVersionRetentionKeep] = useState("10");
  const [fileVersionStatus, setFileVersionStatus] = useState("버전 기록 대기 중");
  const [fileArchiveReview, setFileArchiveReview] = useState<FileArchiveReviewState | null>(null);
  const [fileArchiveImportName, setFileArchiveImportName] = useState("");
  const [fileArchiveStatus, setFileArchiveStatus] = useState("아카이브 대기 중");
  const [libraryArchiveReview, setLibraryArchiveReview] = useState<LibraryArchiveReviewState | null>(null);
  const [libraryArchivePrefix, setLibraryArchivePrefix] = useState("shared");
  const [libraryArchiveStatus, setLibraryArchiveStatus] = useState("라이브러리 아카이브 대기 중");
  const [projectArchiveReview, setProjectArchiveReview] = useState<ProjectArchiveReviewState | null>(null);
  const [projectArchiveImportName, setProjectArchiveImportName] = useState("");
  const [projectArchiveStatus, setProjectArchiveStatus] = useState("프로젝트 아카이브 대기 중");
  const [commentThreads, setCommentThreads] = useState<CommentThread[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentReplyBodies, setCommentReplyBodies] = useState<Record<string, string>>({});
  const [commentStatus, setCommentStatus] = useState("코멘트 대기 중");
  const [commentNotificationSummary, setCommentNotificationSummary] =
    useState<CommentNotificationSummary | null>(null);
  const [commentActivityFeed, setCommentActivityFeed] = useState<CommentActivityFeed | null>(null);
  const [tokenDtcgDraft, setTokenDtcgDraft] = useState("");
  const [tokenDtcgStatus, setTokenDtcgStatus] = useState("");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [codeExportPayload, setCodeExportPayload] = useState<CodeExportPayload | null>(null);
  const [codeExportStatus, setCodeExportStatus] = useState("코드 내보내기 대기 중");
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionPassphrase, setEncryptionPassphrase] = useState("");
  const [teamPanelMode, setTeamPanelMode] = useState<TeamPanelMode>("local");
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>("assets");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [collabSession, setCollabSession] = useState<CollabDocumentSession | null>(null);
  const [collabStatus, setCollabStatus] = useState("offline");
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [areaSelection, setAreaSelection] = useState<AreaSelectionSession | null>(null);
  const [dragPreview, setDragPreview] = useState<NodeDragPreview | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [inlineTextEditingNodeId, setInlineTextEditingNodeId] = useState<string | null>(null);
  const [objectContextMenu, setObjectContextMenu] = useState<ObjectContextMenuState | null>(null);
  const [gridTrackContextMenu, setGridTrackContextMenu] = useState<GridTrackContextMenuState | null>(null);
  const [gridCellContextMenu, setGridCellContextMenu] = useState<GridCellContextMenuState | null>(null);
  const [gridCellSelection, setGridCellSelection] = useState<GridCellSelectionState | null>(null);
  const editorRef = useRef<EditorState | null>(null);
  const objectClipboardRef = useRef<EditorNodeClipboard | null>(null);
  const styleClipboardRef = useRef<EditorNodeStyle | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const gridResizeSessionRef = useRef<GridResizeSession | null>(null);
  const gridResizeClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const gridAreaBoundarySessionRef = useRef<GridAreaBoundarySession | null>(null);
  const gridAreaBoundaryClientPointRef = useRef<{ x: number; y: number } | null>(null);
  const gridTrackDragRef = useRef<GridTrackDragState | null>(null);
  const areaSelectionRef = useRef<AreaSelectionSession | null>(null);
  const dragSessionRef = useRef<NodeDragSession | null>(null);
  const panSessionRef = useRef<{
    clientX: number;
    clientY: number;
    viewport: EditorState["viewport"];
  } | null>(null);
  const isSpacePanningRef = useRef(false);
  const collabSessionRef = useRef<CollabDocumentSession | null>(null);
  const publishedCursorRef = useRef<PublishedCursor | null>(null);
  const remotePresenceSignatureRef = useRef(new Map<string, string>());
  const remotePresenceSeenAtRef = useRef(new Map<string, number>());
  const manifestFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const libraryArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const projectArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const imageReplacementFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageReplacementNodeIdRef = useRef<string | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const konvaStageRef = useRef<KonvaStage | null>(null);
  const inlineTextEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>(editorKonvaTokens.stage);
  const [measurementTargetNodeId, setMeasurementTargetNodeId] = useState<string | null>(null);
  const visibleProjects = useMemo(
    () => getVisibleProjects(projects, recentProjectIds, projectSearch),
    [projects, projectSearch, recentProjectIds]
  );
  const projectFilterSummary = projectSearch.trim()
    ? visibleProjects.length === 0
      ? "검색 결과 없음"
      : `${visibleProjects.length}개 프로젝트`
    : `${projects.length}개 프로젝트`;

  const resetFileVersions = (status = "버전 기록 대기 중") => {
    setFileVersions([]);
    setFileVersionPreview(null);
    setFileVersionStatus(status);
  };

  const refreshFileVersions = async (fileId: string, status?: string) => {
    try {
      const versions = await listFileVersions(fileId);
      setFileVersions(versions);
      setFileVersionPreview(null);
      setFileVersionStatus(status ?? (versions.length > 0 ? `${versions.length}개 버전` : "저장된 버전 없음"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "버전 기록을 불러오지 못했습니다";
      setFileVersions([]);
      setFileVersionPreview(null);
      setFileVersionStatus(message);
    }
  };

  const resetCommentThreads = (status = "코멘트 대기 중") => {
    setCommentThreads([]);
    setCommentBody("");
    setCommentReplyBodies({});
    setCommentStatus(status);
  };

  const resetCommentNotifications = () => {
    setCommentNotificationSummary(null);
  };

  const resetCommentActivity = () => {
    setCommentActivityFeed(null);
  };

  const refreshCommentNotifications = async () => {
    try {
      const summary = await listCommentNotifications(LOCAL_COMMENT_VIEWER_ID);
      setCommentNotificationSummary(summary);
    } catch {
      setCommentNotificationSummary(null);
    }
  };

  const refreshCommentActivity = async () => {
    try {
      const feed = await listCommentActivity(LOCAL_COMMENT_VIEWER_ID, 8);
      setCommentActivityFeed(feed);
    } catch {
      setCommentActivityFeed(null);
    }
  };

  const refreshCommentThreads = async (fileId: string, status?: string) => {
    try {
      const threads = await listCommentThreads(fileId, false, fetch, LOCAL_COMMENT_VIEWER_ID);
      const unreadCount = threads.filter((thread) => thread.unread).length;
      setCommentThreads(threads);
      setCommentStatus(
        status ??
          (unreadCount > 0
            ? `${unreadCount}개 읽지 않은 코멘트`
            : threads.length > 0
              ? `${threads.length}개 활성 코멘트`
              : "활성 코멘트 없음")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "코멘트를 불러오지 못했습니다";
      setCommentThreads([]);
      setCommentReplyBodies({});
      setCommentStatus(message);
    }
  };

  useEffect(() => {
    const fileId = currentProject?.currentDocumentId;
    if (!fileId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void Promise.all([
        refreshCommentThreads(fileId),
        refreshCommentNotifications(),
        refreshCommentActivity()
      ]);
    }, COMMENT_LIVE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [currentProject?.currentDocumentId]);

  useEffect(() => {
    const fileId = currentProject?.currentDocumentId;
    if (!fileId) {
      return;
    }

    return subscribeToCommentEvents({
      fileId,
      viewerId: LOCAL_COMMENT_VIEWER_ID,
      onCommentEvent: (event) => {
        if (event.fileId !== fileId) {
          return;
        }
        void Promise.all([
          refreshCommentThreads(fileId),
          refreshCommentNotifications(),
          refreshCommentActivity()
        ]);
      }
    });
  }, [currentProject?.currentDocumentId]);

  useEffect(() => {
    if (inspectorTab !== "dev") {
      return undefined;
    }

    const fileId = currentProject?.currentDocumentId;
    if (!fileId) {
      setCodeExportPayload(null);
      setCodeExportStatus("코드 내보내기 대기 중");
      return undefined;
    }

    let cancelled = false;
    setCodeExportPayload(null);
    setCodeExportStatus("코드 내보내기 불러오는 중");
    void exportCode(fileId, { moduleBasePath: "./elements" })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setCodeExportPayload(payload);
        setCodeExportStatus("코드 내보내기 준비됨");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "코드 내보내기를 불러오지 못했습니다";
        setCodeExportPayload(null);
        setCodeExportStatus(message);
      });

    return () => {
      cancelled = true;
    };
  }, [currentProject?.currentDocumentId, inspectorTab]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const loadProjectDocument = async (project: ProjectManifest, projectList = projects) => {
    const response = await fetch(apiUrl(`/files/${project.currentDocumentId}`));
    if (!response.ok) {
      throw new Error(`프로젝트 문서를 불러오지 못했습니다: ${response.status}`);
    }
    const payload = await response.json();
    setProjects(projectList);
    setCurrentProject(project);
    setProjectNameDraft(project.name);
    await projectStore.setCurrentProjectId(project.projectId);
    setRecentProjectIds((current) => promoteRecentProject(project.projectId, current));
    setEditor(createEditorState(parseDocumentPayload(payload)));
    setTokenDtcgDraft("");
    setTokenDtcgStatus("");
    setProjectStatus(`${project.name} 불러옴`);
    void refreshFileVersions(project.currentDocumentId);
    void refreshCommentThreads(project.currentDocumentId);
    void refreshCommentNotifications();
    void refreshCommentActivity();
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitialProject = async () => {
      try {
        const [projectList, storedProjectId, storedRecentProjectIds] = await Promise.all([
          fetchProjects(),
          projectStore.getCurrentProjectId(),
          projectStore.getRecentProjectIds()
        ]);
        const orderedProjectList = getVisibleProjects(projectList, storedRecentProjectIds, "");
        const selectedProject =
          orderedProjectList.find((project) => project.projectId === storedProjectId) ??
          orderedProjectList[0] ??
          null;
        if (!selectedProject) {
          if (!cancelled) {
            setProjects(projectList);
            setRecentProjectIds(storedRecentProjectIds);
            setProjectStatus("저장된 프로젝트 없음");
            resetFileVersions("프로젝트 없음");
            resetCommentThreads("프로젝트 없음");
            resetCommentNotifications();
            resetCommentActivity();
            setEditor(null);
          }
          return;
        }

        const response = await fetch(apiUrl(`/files/${selectedProject.currentDocumentId}`));
        if (!response.ok) {
          throw new Error(`프로젝트 문서를 불러오지 못했습니다: ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        setProjects(projectList);
        setCurrentProject(selectedProject);
        setProjectNameDraft(selectedProject.name);
        await projectStore.setCurrentProjectId(selectedProject.projectId);
        setRecentProjectIds(promoteRecentProject(selectedProject.projectId, storedRecentProjectIds));
        setEditor(createEditorState(parseDocumentPayload(payload)));
        setTokenDtcgDraft("");
        setTokenDtcgStatus("");
        setProjectStatus(`${selectedProject.name} 불러옴`);
        void refreshFileVersions(selectedProject.currentDocumentId);
        void refreshCommentThreads(selectedProject.currentDocumentId);
        void refreshCommentNotifications();
        void refreshCommentActivity();
      } catch {
        if (!cancelled) {
          setProjectStatus("로컬 서버를 시작하면 프로젝트를 불러옵니다");
          resetFileVersions("버전 기록 대기 중");
          resetCommentThreads("코멘트 대기 중");
          resetCommentNotifications();
          resetCommentActivity();
          setEditor(null);
        }
      }
    };

    void loadInitialProject();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      collabSessionRef.current?.destroy();
    },
    []
  );

  useEffect(() => {
    const stageFrame = stageFrameRef.current;
    if (!stageFrame) {
      return undefined;
    }

    const updateStageSize = () => {
      const nextWidth = Math.max(1, Math.round(stageFrame.clientWidth));
      const nextHeight = Math.max(1, Math.round(stageFrame.clientHeight));
      setStageSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stageFrame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!collabSession) {
      return undefined;
    }

    const interval = window.setInterval(() => setPresenceClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [collabSession]);

  const nodes = useMemo(
    () => (editor ? flattenRendererNodes(editor.document) : []),
    [editor]
  );
  const activePage = editor?.document.pages[0] ?? null;
  const pageExportReviewItems = useMemo(
    () => (editor ? buildPageExportPresetReviewItems(editor.document, activePage?.id) : []),
    [activePage?.id, editor]
  );
  const selectedNode = useMemo(
    () => (editor?.selection.nodeId ? findNodeById(editor.document, editor.selection.nodeId) : null),
    [editor]
  );
  const selectedNodeCommentThreads = useMemo(
    () => (selectedNode ? commentThreads.filter((thread) => thread.nodeId === selectedNode.id) : []),
    [commentThreads, selectedNode]
  );
  const commentBubbleOverlays = useMemo(
    () => (editor ? createCommentBubbleOverlays(editor.document, commentThreads, editor.viewport) : []),
    [commentThreads, editor]
  );
  const currentProjectCommentNotification = useMemo(
    () =>
      currentProject
        ? commentNotificationSummary?.projects.find((project) => project.projectId === currentProject.projectId) ??
          null
        : null,
    [commentNotificationSummary, currentProject]
  );
  const currentFileUnreadCommentCount = useMemo(
    () =>
      currentProjectCommentNotification?.files.find(
        (file) => file.fileId === currentProject?.currentDocumentId
      )?.unreadCount ?? 0,
    [currentProject, currentProjectCommentNotification]
  );
  const currentProjectCommentActivity = useMemo(
    () =>
      currentProject
        ? (commentActivityFeed?.events.filter((event) => event.projectId === currentProject.projectId) ?? [])
        : [],
    [commentActivityFeed, currentProject]
  );
  const selectedParentNode = useMemo(
    () =>
      selectedNode
        ? nodes.find((node) => node.children.some((child) => child.id === selectedNode.id)) ?? null
        : null,
    [nodes, selectedNode]
  );
  const contextMenuNode = useMemo(
    () =>
      objectContextMenu?.nodeId && editor
        ? findNodeById(editor.document, objectContextMenu.nodeId)
        : selectedNode,
    [editor, objectContextMenu, selectedNode]
  );
  const selectedNodeIds = editor?.selection.nodeIds ?? [];
  const selectedNodes = useMemo(() => {
    if (!editor) {
      return [];
    }
    return selectedNodeIds.flatMap((nodeId) => {
      const node = findNodeById(editor.document, nodeId);
      return node ? [node] : [];
    });
  }, [editor, selectedNodeIds]);
  const contextMenuNodeIsLocked = isNodeLocked(contextMenuNode);
  const contextMenuNodeIsHidden = contextMenuNode ? !isNodeVisible(contextMenuNode) : false;
  const canMutateContextMenuNode = Boolean(contextMenuNode && !contextMenuNodeIsLocked);
  const canPasteContextStyle = Boolean(styleClipboardRef.current && canMutateContextMenuNode);
  const canReplaceContextImage = Boolean(
    contextMenuNode?.kind === "image" &&
      contextMenuNode.content.type === "image" &&
      canMutateContextMenuNode
  );
  const contextImageFitMode =
    contextMenuNode?.kind === "image" && contextMenuNode.content.type === "image"
      ? contextMenuNode.content.fit_mode ?? "fill"
      : null;
  const canResizeContextImageToNaturalSize = Boolean(
    contextMenuNode?.kind === "image" &&
      contextMenuNode.content.type === "image" &&
      contextMenuNode.content.natural_width &&
      contextMenuNode.content.natural_height &&
      canMutateContextMenuNode
  );
  const canGroupContextSelection = selectedNodeIds.length >= 2 && canMutateContextMenuNode;
  const canFrameContextSelection = selectedNodeIds.length >= 2 && canMutateContextMenuNode;
  const canUngroupContextSelection = Boolean(
    contextMenuNode && contextMenuNode.kind === "group" && !contextMenuNodeIsLocked
  );
  const canDeleteGridTrackFromContextMenu = useMemo(() => {
    if (!editor || !gridTrackContextMenu) {
      return false;
    }

    const node = findNodeById(editor.document, gridTrackContextMenu.nodeId);
    if (!node || (node.kind !== "frame" && node.kind !== "component")) {
      return false;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      return false;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    return gridTrackContextMenu.axis === "column" ? columns > 1 : rows > 1;
  }, [editor, gridTrackContextMenu]);
  const canAlignSelection = selectedNodeIds.length >= 2;
  const canDistributeSelection = selectedNodeIds.length >= 3;
  const canAlignInspectorSelection = selectedNodeIds.length === 1 ? true : canAlignSelection;
  const areaSelectionBox = useMemo(() => {
    if (!editor || !areaSelection?.hasDragged) {
      return null;
    }

    const bounds = selectionBoundsFromPoints(areaSelection.start, areaSelection.current);
    const topLeft = documentPointToViewport({ x: bounds.x, y: bounds.y, space: "document" }, editor.viewport);

    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bounds.width * editor.viewport.scale,
      height: bounds.height * editor.viewport.scale
    };
  }, [areaSelection, editor]);
  const measurementOverlay = useMemo(() => {
    if (!editor || !measurementTargetNodeId || !selectedNodeIds.length) {
      return null;
    }

    const selectedBounds = getSelectionBoundsForNodeIds(editor.document, selectedNodeIds);
    const targetBounds = getNodeBounds(editor.document, measurementTargetNodeId);
    if (!selectedBounds || !targetBounds) {
      return null;
    }

    const sourceBounds =
      dragPreview && selectedNodeIds.every((nodeId) => dragPreview.nodeIds.includes(nodeId))
        ? translateBounds(selectedBounds, dragPreview.delta)
        : selectedBounds;

    return createMeasurementOverlay(sourceBounds, targetBounds, editor.viewport);
  }, [dragPreview, editor, measurementTargetNodeId, selectedNodeIds]);
  const selectionChromeOverlay = useMemo(() => {
    if (!editor || !selectedNodeIds.length) {
      return null;
    }

    const selectedBounds = getSelectionBoundsForNodeIds(editor.document, selectedNodeIds);
    if (!selectedBounds) {
      return null;
    }

    const chromeBounds =
      dragPreview && selectedNodeIds.every((nodeId) => dragPreview.nodeIds.includes(nodeId))
        ? translateBounds(selectedBounds, dragPreview.delta)
        : selectedBounds;

    const canResizeSelection =
      selectedNodeIds.length === 1 && selectedNode
        ? !isNodeLocked(selectedNode) && isNodeVisible(selectedNode)
        : false;

    return createSelectionChromeOverlay(
      chromeBounds,
      editor.viewport,
      selectedNodeIds.length > 1,
      canResizeSelection
    );
  }, [dragPreview, editor, selectedNode, selectedNodeIds]);
  const inlineTextEditorOverlay = useMemo<InlineTextEditorOverlay | null>(() => {
    if (!editor || !inlineTextEditingNodeId) {
      return null;
    }

    const node = findNodeById(editor.document, inlineTextEditingNodeId);
    const bounds = getNodeBounds(editor.document, inlineTextEditingNodeId);
    if (
      !node ||
      !bounds ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      node.kind !== "text" ||
      node.content.type !== "text"
    ) {
      return null;
    }

    const viewportRect = viewportBounds(bounds, editor.viewport);
    return {
      nodeId: node.id,
      value: node.content.value,
      left: viewportRect.left,
      top: viewportRect.top,
      width: Math.max(1, viewportRect.width),
      height: Math.max(1, viewportRect.height),
      fontSize: Math.max(1, node.content.font_size * editor.viewport.scale),
      fontFamily: node.content.font_family,
      color: node.style.fill
    };
  }, [editor, inlineTextEditingNodeId]);
  const frameSpacingOverlay = useMemo(() => {
    if (!editor || selectedNodeIds.length !== 1 || !selectedNode || selectedNode.kind !== "frame") {
      return null;
    }

    const frameBounds = getNodeBounds(editor.document, selectedNode.id);
    if (!frameBounds) {
      return null;
    }

    return createFrameSpacingOverlay(frameBounds, selectedNode, editor.viewport);
  }, [editor, selectedNode, selectedNodeIds]);
  const gridViewportOverlay = useMemo(() => {
    if (!editor || selectedNodeIds.length !== 1 || !selectedNode) {
      return null;
    }

    const selectedGridFrame =
      (selectedNode.kind === "frame" || selectedNode.kind === "component") && selectedNode.layout?.mode === "grid"
        ? selectedNode
        : null;
    const parentGridFrame =
      selectedParentNode &&
      (selectedParentNode.kind === "frame" || selectedParentNode.kind === "component") &&
      selectedParentNode.layout?.mode === "grid"
        ? selectedParentNode
        : null;
    const frame = selectedGridFrame ?? parentGridFrame;
    const selectedChild = selectedGridFrame ? null : selectedNode;
    if (!frame) {
      return null;
    }

    const frameBounds = getNodeBounds(editor.document, frame.id);
    if (!frameBounds) {
      return null;
    }

    return createGridViewportOverlay(frameBounds, frame, editor.viewport, {
      selectedChild,
      showTrackControls: selectedChild === null
    });
  }, [editor, selectedNode, selectedNodeIds, selectedParentNode]);
  const gridCellSelectionBox = useMemo(() => {
    if (!gridViewportOverlay || !gridCellSelection || gridViewportOverlay.nodeId !== gridCellSelection.nodeId) {
      return null;
    }

    const range = gridCellRangeFromSelection(gridCellSelection);
    const selectedControls = gridViewportOverlay.cellControls.filter((control) =>
      isGridCellInRange({ column: control.column, row: control.row }, range)
    );
    if (!selectedControls.length) {
      return null;
    }

    const left = Math.min(...selectedControls.map((control) => control.left));
    const top = Math.min(...selectedControls.map((control) => control.top));
    const right = Math.max(...selectedControls.map((control) => control.left + control.width));
    const bottom = Math.max(...selectedControls.map((control) => control.top + control.height));
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }, [gridCellSelection, gridViewportOverlay]);
  useEffect(() => {
    if (!gridCellSelection) {
      return;
    }

    if (!gridViewportOverlay || gridViewportOverlay.nodeId !== gridCellSelection.nodeId) {
      setGridCellSelection(null);
    }
  }, [gridCellSelection, gridViewportOverlay]);
  const snapGuideOverlays = useMemo(() => {
    if (!editor || !snapGuides.length) {
      return [];
    }

    return snapGuides.map((guide, index) => {
      if (guide.orientation === "vertical") {
        const start = documentPointToViewport(
          { x: guide.x, y: guide.y1, space: "document" },
          editor.viewport
        );
        const end = documentPointToViewport(
          { x: guide.x, y: guide.y2, space: "document" },
          editor.viewport
        );

        return {
          id: `vertical-${index}`,
          orientation: guide.orientation,
          left: Math.round(start.x),
          top: Math.round(Math.min(start.y, end.y)),
          height: Math.max(1, Math.round(Math.abs(end.y - start.y)))
        };
      }

      const start = documentPointToViewport(
        { x: guide.x1, y: guide.y, space: "document" },
        editor.viewport
      );
      const end = documentPointToViewport(
        { x: guide.x2, y: guide.y, space: "document" },
        editor.viewport
      );

      return {
        id: `horizontal-${index}`,
        orientation: guide.orientation,
        left: Math.round(Math.min(start.x, end.x)),
        top: Math.round(start.y),
        width: Math.max(1, Math.round(Math.abs(end.x - start.x)))
      };
    });
  }, [editor, snapGuides]);
  const components = editor?.document.components ?? [];
  const selectedComponent = selectedNode
    ? components.find((component) => component.source_node.id === selectedNode.id)
    : undefined;
  const localSessionId = collabSession?.getLocalPresence().sessionId ?? null;
  const currentDocumentName = editor?.document.name ?? "문서 없음";
  const currentProjectName = currentProject?.name ?? "프로젝트 없음";
  const topFileShareLabel =
    currentProject?.sharing.mode === "team"
      ? `공유됨 · ${collabSession?.team.name ?? currentProject.sharing.teamId}`
      : "비공개";
  const showProjectPanel = leftPanelMode === "files";
  const showAssetPanel = leftPanelMode === "assets";
  const showLayerPanel = leftPanelMode === "files" || leftPanelMode === "layers";
  const showTeamPanel = leftPanelMode === "files" || leftPanelMode === "team";
  const leftPanelTitle =
    leftPanelMode === "files"
      ? "파일"
      : leftPanelMode === "assets"
        ? "에셋"
        : leftPanelMode === "layers"
          ? "레이어"
          : "팀";

  useEffect(() => {
    if (!inlineTextEditingNodeId) {
      return;
    }

    const inlineEditor = inlineTextEditorRef.current;
    if (!inlineEditor) {
      return;
    }

    inlineEditor.focus();
    inlineEditor.select();
  }, [inlineTextEditingNodeId]);

  useEffect(() => {
    if (inlineTextEditingNodeId && !inlineTextEditorOverlay) {
      setInlineTextEditingNodeId(null);
    }
  }, [inlineTextEditingNodeId, inlineTextEditorOverlay]);

  useEffect(() => {
    if (!objectContextMenu) {
      return undefined;
    }

    const closeFromPointer = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-testid="object-context-menu"]')
      ) {
        return;
      }

      setObjectContextMenu(null);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setObjectContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", closeFromPointer);
    window.addEventListener("keydown", closeFromEscape);
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer);
      window.removeEventListener("keydown", closeFromEscape);
    };
  }, [objectContextMenu]);

  useEffect(() => {
    if (!gridTrackContextMenu) {
      return undefined;
    }

    const closeFromPointer = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-testid="grid-track-context-menu"]')
      ) {
        return;
      }

      setGridTrackContextMenu(null);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGridTrackContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", closeFromPointer);
    window.addEventListener("keydown", closeFromEscape);
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer);
      window.removeEventListener("keydown", closeFromEscape);
    };
  }, [gridTrackContextMenu]);

  useEffect(() => {
    if (!gridCellContextMenu) {
      return undefined;
    }

    const closeFromPointer = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-testid="grid-cell-context-menu"]')
      ) {
        return;
      }

      setGridCellContextMenu(null);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGridCellContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", closeFromPointer);
    window.addEventListener("keydown", closeFromEscape);
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer);
      window.removeEventListener("keydown", closeFromEscape);
    };
  }, [gridCellContextMenu]);

  const normalizePresenceForOverlay = (
    nextPresence: CollaborationPresence[],
    nextLocalSessionId: string | null
  ) => {
    const nowMs = Date.now();
    const activeSessionIds = new Set(nextPresence.map((member) => member.sessionId));
    for (const sessionId of remotePresenceSignatureRef.current.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        remotePresenceSignatureRef.current.delete(sessionId);
        remotePresenceSeenAtRef.current.delete(sessionId);
      }
    }

    return nextPresence.map((member) => {
      if (member.sessionId === nextLocalSessionId) {
        return member;
      }

      const signature = remotePresenceSignature(member);
      if (remotePresenceSignatureRef.current.get(member.sessionId) !== signature) {
        remotePresenceSignatureRef.current.set(member.sessionId, signature);
        remotePresenceSeenAtRef.current.set(member.sessionId, nowMs);
      }

      return {
        ...member,
        updatedAtMs: remotePresenceSeenAtRef.current.get(member.sessionId) ?? nowMs
      };
    });
  };

  const publishPresenceSnapshot = (activeSession: CollabDocumentSession) => {
    setPresence(
      normalizePresenceForOverlay(
        activeSession.getPresence(),
        activeSession.getLocalPresence().sessionId
      )
    );
  };

  const publishEditorPresence = (
    state: EditorState,
    patch: Partial<CollaborationPresence> = {}
  ) => {
    const activeSession = collabSessionRef.current;
    if (!activeSession) {
      return;
    }

    activeSession.updatePresence({
      selectedNodeId: state.selection.nodeId,
      selectedNodeBounds: getSelectedNodeBounds(state.document, state.selection.nodeId),
      viewport: state.viewport,
      updatedAtMs: Date.now(),
      ...patch
    });
    setPresenceClock(Date.now());
    publishPresenceSnapshot(activeSession);
  };

  const updateViewportFromInteraction = (deriveNextState: (state: EditorState) => EditorState) => {
    setEditor((current) => {
      if (!current) {
        return current;
      }

      const nextState = deriveNextState(current);
      publishEditorPresence(nextState);
      return nextState;
    });
  };

  const scopeStateToContextNode = (state: EditorState) => {
    const nodeId = objectContextMenu?.nodeId;
    if (!nodeId) {
      return state;
    }

    return state.selection.nodeIds.includes(nodeId) && state.selection.nodeIds.length > 1
      ? setMultiSelection(state, state.selection.nodeIds, nodeId)
      : setSelection(state, nodeId);
  };

  const runContextMenuStateAction = (deriveNextState: (state: EditorState) => EditorState) => {
    updateViewportFromInteraction((state) => deriveNextState(scopeStateToContextNode(state)));
    setObjectContextMenu(null);
  };

  const copyContextSelection = () => {
    setEditor((current) => {
      if (!current) {
        return current;
      }

      const scopedState = scopeStateToContextNode(current);
      const clipboard = copySelectedNode(scopedState);
      if (clipboard) {
        objectClipboardRef.current = clipboard;
      }
      publishEditorPresence(scopedState);
      return scopedState;
    });
    setObjectContextMenu(null);
  };

  const copyContextStyle = () => {
    if (contextMenuNode) {
      styleClipboardRef.current = { ...contextMenuNode.style };
      setProjectStatus(`${contextMenuNode.name} 스타일 복사됨`);
    }
    setObjectContextMenu(null);
  };

  const pasteContextStyle = () => {
    const style = styleClipboardRef.current;
    const currentEditor = editorRef.current;
    const scopedState = currentEditor ? scopeStateToContextNode(currentEditor) : null;
    const targetNodeId = scopedState?.selection.nodeId ?? null;
    const targetNode = targetNodeId && scopedState ? findNodeById(scopedState.document, targetNodeId) : null;
    if (!style || !targetNode || isNodeLocked(targetNode)) {
      setObjectContextMenu(null);
      return;
    }

    updateViewportFromInteraction((state) => setSelectedNodeStyle(scopeStateToContextNode(state), style));
    setProjectStatus(`${targetNode.name} 스타일 적용됨`);
    setObjectContextMenu(null);
  };

  const cutContextSelection = () => {
    setEditor((current) => {
      if (!current) {
        return current;
      }

      const scopedState = scopeStateToContextNode(current);
      const clipboard = copySelectedNode(scopedState);
      if (!clipboard) {
        publishEditorPresence(scopedState);
        return scopedState;
      }

      objectClipboardRef.current = clipboard;
      const nextState = deleteSelectedNode(scopedState);
      publishEditorPresence(nextState);
      return nextState;
    });
    setObjectContextMenu(null);
  };

  const pasteContextSelectionAtMenuPoint = () => {
    runContextMenuStateAction((state) =>
      pasteCopiedNodeAt(state, objectClipboardRef.current, objectContextMenu?.documentPoint ?? null)
    );
  };

  const selectAllContextNodes = () => {
    runContextMenuStateAction(selectAllPageNodes);
  };

  const selectSameKindContextNodes = () => {
    runContextMenuStateAction(selectNodesWithSameKind);
  };

  const flipContextSelection = (axis: FlipAxis) => {
    runContextMenuStateAction((state) => flipSelectedNodes(state, axis));
  };

  const fitContextSelectionToViewport = () => {
    const stageFrame = stageFrameRef.current;
    if (!stageFrame) {
      setObjectContextMenu(null);
      return;
    }

    const bounds = stageFrame.getBoundingClientRect();
    updateViewportFromInteraction((state) =>
      fitViewportToSelection(scopeStateToContextNode(state), {
        width: bounds.width,
        height: bounds.height
      })
    );
    setObjectContextMenu(null);
  };

  const downloadContextCodeExport = async () => {
    if (!currentProject) {
      setObjectContextMenu(null);
      return;
    }

    const documentId = currentProject.currentDocumentId;
    setObjectContextMenu(null);
    try {
      const response = await fetch(apiUrl(`/files/${documentId}/export/code`));
      if (!response.ok) {
        throw new Error(`코드 내보내기 실패: ${response.status} ${response.statusText}`.trim());
      }
      const payload = await response.json();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json"
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `layo-code-export-${documentId}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setProjectStatus("코드 내보내기 완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : "코드 내보내기에 실패했습니다";
      setProjectStatus(message);
    }
  };

  const renderSelectionRasterFromState = (
    scopedState: EditorState,
    {
      scale = 2,
      nodeId: explicitNodeId,
      mimeType,
      failureMessage
    }: {
      scale?: PngExportScale;
      nodeId?: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      failureMessage: string;
    }
  ): { node: RendererNode; dataUrl: string } | null => {
    const stage = konvaStageRef.current;
    if (!stage) {
      setProjectStatus(failureMessage);
      return null;
    }

    const nodeId = explicitNodeId ?? scopedState.selection.nodeId;
    const node = nodeId ? findNodeById(scopedState.document, nodeId) : null;
    const bounds = nodeId ? getNodeBounds(scopedState.document, nodeId) : null;
    if (!node || !bounds) {
      setProjectStatus(failureMessage);
      return null;
    }

    const viewportRect = viewportBounds(bounds, scopedState.viewport);
    const padding = 2;
    const x = Math.max(0, viewportRect.left - padding);
    const y = Math.max(0, viewportRect.top - padding);
    const width = Math.max(1, Math.min(stageSize.width - x, viewportRect.width + padding * 2));
    const height = Math.max(1, Math.min(stageSize.height - y, viewportRect.height + padding * 2));
    const selectionOverlays = stage.find(".selection-export-overlay");

    try {
      selectionOverlays.forEach((overlay) => overlay.visible(false));
      stage.draw();
      return {
        node,
        dataUrl: stage.toDataURL({
          x,
          y,
          width,
          height,
          pixelRatio: scale,
          mimeType,
          quality: mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.92 : undefined
        })
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : failureMessage;
      setProjectStatus(message);
      return null;
    } finally {
      selectionOverlays.forEach((overlay) => overlay.visible(true));
      stage.draw();
    }
  };

  const downloadSelectionRasterFromState = (
    scopedState: EditorState,
    {
      scale = 2,
      nodeId: explicitNodeId,
      filename,
      mimeType,
      failureMessage
    }: {
      scale?: PngExportScale;
      nodeId?: string;
      filename?: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      failureMessage: string;
    }
  ): RendererNode | null => {
    const rendered = renderSelectionRasterFromState(scopedState, {
      scale,
      nodeId: explicitNodeId,
      mimeType,
      failureMessage
    });
    if (!rendered) {
      return null;
    }
    downloadDataUrl(
      rendered.dataUrl,
      filename ??
        `${rendered.node.id}.${mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png"}`
    );
    return rendered.node;
  };

  const downloadContextSelectionPng = () => {
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      setObjectContextMenu(null);
      return;
    }

    const node = downloadSelectionRasterFromState(scopeStateToContextNode(currentEditor), {
      mimeType: "image/png",
      failureMessage: "PNG 내보내기에 실패했습니다"
    });
    if (node) {
      setProjectStatus(`${node.name} PNG 내보내기 완료`);
    }
    setObjectContextMenu(null);
  };

  const downloadSelectedNodeRasterFromDevPanel = (
    format: "png" | "jpeg" | "webp",
    scale: PngExportScale,
    filenameOverride?: string
  ) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return null;
    }

    const nodeId = currentEditor.selection.nodeId;
    const extension = format === "jpeg" ? "jpg" : format;
    const filename = filenameOverride ?? (nodeId ? `${nodeId}${scale === 2 ? "" : `@${scale}x`}.${extension}` : undefined);
    const node = downloadSelectionRasterFromState(currentEditor, {
      scale,
      filename,
      mimeType: format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp",
      failureMessage: `${format.toUpperCase()} 다운로드 실패`
    });
    return node ? `${node.name} ${format.toUpperCase()}${scale === 2 ? "" : ` ${scale}x`} 다운로드됨` : null;
  };

  const downloadNodeRasterFromDevPanel = (
    format: "png" | "jpeg" | "webp",
    scale: PngExportScale,
    nodeId: string,
    filename: string,
    options: { download?: boolean } = {}
  ) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return null;
    }

    const mimeType = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
    if (options.download === false) {
      return (
        renderSelectionRasterFromState(currentEditor, {
          scale,
          nodeId,
          mimeType,
          failureMessage: `${format.toUpperCase()} 다운로드 실패`
        })?.dataUrl ?? null
      );
    }

    const node = downloadSelectionRasterFromState(currentEditor, {
      scale,
      nodeId,
      filename,
      mimeType,
      failureMessage: `${format.toUpperCase()} 다운로드 실패`
    });
    return node ? `${node.name} ${format.toUpperCase()}${scale === 2 ? "" : ` ${scale}x`} 다운로드됨` : null;
  };

  const downloadSelectedNodePngFromDevPanel = (scale: PngExportScale) =>
    downloadSelectedNodeRasterFromDevPanel("png", scale);

  const downloadSelectedNodeJpegFromDevPanel = (scale: PngExportScale) =>
    downloadSelectedNodeRasterFromDevPanel("jpeg", scale);

  const downloadSelectedNodeWebpFromDevPanel = (scale: PngExportScale) =>
    downloadSelectedNodeRasterFromDevPanel("webp", scale);

  const createContextComponent = () => {
    runContextMenuStateAction((state) => {
      const nodeId = state.selection.nodeId;
      const node = nodeId ? findNodeById(state.document, nodeId) : null;
      if (!node || node.kind === "component_instance") {
        return state;
      }

      return executeEditorCommand(state, {
        type: "create_component",
        nodeId: node.id,
        componentId: `component-${(state.document.components ?? []).length + 1}`,
        name: `${node.name} 컴포넌트`
      });
    });
  };

  const createContextInstance = () => {
    runContextMenuStateAction((state) => {
      const nodeId = state.selection.nodeId;
      const node = nodeId ? findNodeById(state.document, nodeId) : null;
      const definition = node
        ? (state.document.components ?? []).find((component) => component.source_node.id === node.id)
        : null;
      const firstPage = state.document.pages[0];
      if (!node || !definition || !firstPage) {
        return state;
      }

      return executeEditorCommand(state, {
        type: "create_component_instance",
        parentId: firstPage.id,
        definitionId: definition.id,
        instanceId: `instance-${flattenRendererNodes(state.document).length + 1}`,
        x: node.transform.x + 440,
        y: node.transform.y + 40
      });
    });
  };

  const detachContextInstance = () => {
    runContextMenuStateAction((state) => {
      const nodeId = state.selection.nodeId;
      const node = nodeId ? findNodeById(state.document, nodeId) : null;
      return node?.component_instance
        ? executeEditorCommand(state, { type: "detach_instance", nodeId: node.id })
        : state;
    });
  };

  const alignContextSelection = (mode: AlignmentMode) => {
    runContextMenuStateAction((state) =>
      state.selection.nodeIds.length === 1
        ? alignSelectedNodeToParent(state, mode)
        : alignSelectedNodes(state, mode)
    );
  };

  const distributeContextSelection = (mode: DistributionMode) => {
    runContextMenuStateAction((state) => distributeSelectedNodes(state, mode));
  };

  const reorderContextSelection = (direction: Parameters<typeof reorderSelectedNode>[1]) => {
    runContextMenuStateAction((state) => reorderSelectedNode(state, direction));
  };

  const renameContextSelection = () => {
    const currentName = contextMenuNode?.name ?? "";
    const nextName = window.prompt("레이어 이름", currentName);
    if (nextName === null || !nextName.trim()) {
      setObjectContextMenu(null);
      return;
    }

    runContextMenuStateAction((state) => renameSelectedNode(state, nextName));
  };

  const groupContextSelection = () => {
    runContextMenuStateAction((state) => {
      const sequence = flattenRendererNodes(state.document).length + 1;
      return groupSelectedNodes(state, `group-${sequence}`, `그룹 ${sequence}`);
    });
  };

  const frameContextSelection = () => {
    runContextMenuStateAction((state) => {
      const sequence = flattenRendererNodes(state.document).length + 1;
      return frameSelectedNodes(state, `frame-${sequence}`, `프레임 ${sequence}`);
    });
  };

  const resizeContextImageToNaturalSize = () => {
    runContextMenuStateAction((state) => resizeSelectedImageToNaturalSize(state));
  };

  const setContextImageFitMode = async (fitMode: ImageFitMode) => {
    if (
      !currentProject ||
      contextMenuNode?.kind !== "image" ||
      contextMenuNode.content.type !== "image" ||
      !canMutateContextMenuNode
    ) {
      setObjectContextMenu(null);
      return;
    }

    const nodeId = contextMenuNode.id;
    const nodeName = contextMenuNode.name;
    setObjectContextMenu(null);

    if ((contextMenuNode.content.fit_mode ?? "fill") === fitMode) {
      return;
    }

    try {
      await persistImageFitMode(currentProject.currentDocumentId, nodeId, fitMode);
      dispatch({ type: "set_image_fit_mode", nodeId, fitMode });
      setProjectStatus(`${nodeName} 이미지 ${fitMode === "fit" ? "맞춤" : "채우기"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 맞춤을 저장하지 못했습니다";
      setProjectStatus(message);
    }
  };

  const startContextImageReplacement = () => {
    if (
      contextMenuNode?.kind !== "image" ||
      contextMenuNode.content.type !== "image" ||
      !canMutateContextMenuNode
    ) {
      setObjectContextMenu(null);
      return;
    }

    imageReplacementNodeIdRef.current = contextMenuNode.id;
    setObjectContextMenu(null);
    imageReplacementFileInputRef.current?.click();
  };

  const replaceContextImageFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = imageFilesFromList(event.currentTarget.files ?? [])[0];
    event.currentTarget.value = "";
    const nodeId = imageReplacementNodeIdRef.current;
    imageReplacementNodeIdRef.current = null;
    if (!file || !nodeId || !currentProject) {
      return;
    }

    const currentEditor = editorRef.current;
    const node = currentEditor ? findNodeById(currentEditor.document, nodeId) : null;
    if (!node || node.kind !== "image" || isNodeLocked(node)) {
      return;
    }

    try {
      const [asset, naturalSize]: [UploadedAsset, { width: number; height: number }] =
        await Promise.all([uploadImageAsset(file), readImageFileSize(file)]);
      const replacement = {
        assetId: asset.assetId,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height
      };
      await persistImageAssetReplacement(currentProject.currentDocumentId, nodeId, replacement);
      dispatch({
        type: "replace_image_asset",
        nodeId,
        assetId: replacement.assetId,
        naturalWidth: replacement.naturalWidth,
        naturalHeight: replacement.naturalHeight
      });
      setProjectStatus(`${node.name} 이미지 바뀜`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지를 바꾸지 못했습니다";
      setProjectStatus(message);
    }
  };

  const ungroupContextSelection = () => {
    runContextMenuStateAction((state) => ungroupSelectedNode(state));
  };

  const toggleContextNodeLocked = () => {
    runContextMenuStateAction((state) => {
      const nodeId = state.selection.nodeId;
      const node = nodeId ? findNodeById(state.document, nodeId) : null;
      return node ? setSelectedNodeLocked(state, !isNodeLocked(node)) : state;
    });
  };

  const toggleContextNodeVisible = () => {
    runContextMenuStateAction((state) => {
      const nodeId = state.selection.nodeId;
      const node = nodeId ? findNodeById(state.document, nodeId) : null;
      return node ? setSelectedNodeVisible(state, !isNodeVisible(node)) : state;
    });
  };

  const clearSelectionFromInteraction = () => {
    setEditor((current) => {
      if (!current) {
        return current;
      }

      const nextState = setSelection(current, null);
      publishEditorPresence(nextState, {
        activeTool: "select",
        selectedNodeId: null,
        selectedNodeBounds: null
      });
      return nextState;
    });
  };

  const openObjectContextMenuFromPointer = (event: KonvaEventObject<MouseEvent>) => {
    event.evt.preventDefault();
    event.cancelBubble = true;
    setInlineTextEditingNodeId(null);
    setMeasurementTargetNodeId(null);
    setGridTrackContextMenu(null);
    setGridCellContextMenu(null);

    if (!editor) {
      return;
    }

    const documentPoint = documentPointFromKonvaEvent(event, editor.viewport, stageFrameRef.current);
    const targetNodeId = documentPoint
      ? getTopmostNodeIdAtPoint(editor.document, documentPoint)
      : null;

    if (targetNodeId) {
      setEditor((current) => {
        if (!current) {
          return current;
        }

        const nextState =
          current.selection.nodeIds.includes(targetNodeId) && current.selection.nodeIds.length > 1
            ? setMultiSelection(current, current.selection.nodeIds, targetNodeId)
            : setSelection(current, targetNodeId);
        publishEditorPresence(nextState, { activeTool: "select" });
        return nextState;
      });
    }

    setObjectContextMenu({
      ...objectContextMenuPosition(event.evt.clientX, event.evt.clientY),
      nodeId: targetNodeId,
      documentPoint
    });
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const shouldZoom = event.ctrlKey || event.metaKey;
    if (shouldZoom) {
      const stageFrame = stageFrameRef.current;
      if (!stageFrame) {
        return;
      }

      const bounds = stageFrame.getBoundingClientRect();
      const point = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      };
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      updateViewportFromInteraction((state) => zoomViewportAtPoint(state, delta, point));
      return;
    }

    const panDeltaX = event.shiftKey ? event.deltaY : event.deltaX;
    const panDeltaY = event.shiftKey ? 0 : event.deltaY;
    updateViewportFromInteraction((state) =>
      panViewport(state, { x: -panDeltaX, y: -panDeltaY })
    );
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        isSpacePanningRef.current = true;
        setIsSpacePanning(true);
        return;
      }

      const isCommand = event.metaKey || event.ctrlKey;
      const centerPoint = {
        x: Math.max(1, stageSize.width) / 2,
        y: Math.max(1, stageSize.height) / 2
      };

      if (isCommand && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        updateViewportFromInteraction((state) => zoomViewportAtPoint(state, ZOOM_STEP, centerPoint));
        return;
      }
      if (isCommand && event.key === "-") {
        event.preventDefault();
        updateViewportFromInteraction((state) => zoomViewportAtPoint(state, -ZOOM_STEP, centerPoint));
        return;
      }
      if (isCommand && event.key === "0") {
        event.preventDefault();
        updateViewportFromInteraction((state) => setViewport(state, { scale: 1, x: 0, y: 0 }));
        return;
      }
      if (isCommand && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setEditor((current) => {
          if (!current) {
            return current;
          }

          const nextState = event.shiftKey ? redo(current) : undo(current);
          publishEditorPresence(nextState);
          return nextState;
        });
        return;
      }
      if (!isCommand && event.shiftKey && event.code === "Digit1") {
        event.preventDefault();
        updateViewportFromInteraction((state) =>
          fitViewportToSelection(state, {
            width: Math.max(1, stageSize.width),
            height: Math.max(1, stageSize.height)
          })
        );
        return;
      }
      if (isCommand && event.key.toLowerCase() === "a") {
        event.preventDefault();
        updateViewportFromInteraction(event.shiftKey ? selectNodesWithSameKind : selectAllPageNodes);
        return;
      }
      if (isCommand && event.altKey && event.key.toLowerCase() === "c") {
        const currentEditor = editorRef.current;
        const nodeId = currentEditor?.selection.nodeId ?? null;
        const node = nodeId && currentEditor ? findNodeById(currentEditor.document, nodeId) : null;
        if (node) {
          event.preventDefault();
          styleClipboardRef.current = { ...node.style };
          setProjectStatus(`${node.name} 스타일 복사됨`);
        }
        return;
      }
      if (isCommand && event.altKey && event.key.toLowerCase() === "v") {
        const style = styleClipboardRef.current;
        const currentEditor = editorRef.current;
        const nodeId = currentEditor?.selection.nodeId ?? null;
        const node = nodeId && currentEditor ? findNodeById(currentEditor.document, nodeId) : null;
        if (style && node && !isNodeLocked(node)) {
          event.preventDefault();
          updateViewportFromInteraction((state) => setSelectedNodeStyle(state, style));
          setProjectStatus(`${node.name} 스타일 적용됨`);
        }
        return;
      }
      if (isCommand && event.key.toLowerCase() === "c") {
        const clipboard = editorRef.current ? copySelectedNode(editorRef.current) : null;
        if (clipboard) {
          event.preventDefault();
          objectClipboardRef.current = clipboard;
        }
        return;
      }
      if (isCommand && event.key.toLowerCase() === "x") {
        const currentEditor = editorRef.current;
        const nodeId = currentEditor?.selection.nodeId ?? null;
        const node = nodeId && currentEditor ? findNodeById(currentEditor.document, nodeId) : null;
        const clipboard = currentEditor && node && !isNodeLocked(node) ? copySelectedNode(currentEditor) : null;
        if (clipboard) {
          event.preventDefault();
          objectClipboardRef.current = clipboard;
          updateViewportFromInteraction(deleteSelectedNode);
        }
        return;
      }
      if (isCommand && event.key.toLowerCase() === "v" && objectClipboardRef.current) {
        event.preventDefault();
        updateViewportFromInteraction((state) => pasteCopiedNode(state, objectClipboardRef.current));
        return;
      }
      if (isCommand && event.key.toLowerCase() === "r") {
        const currentEditor = editorRef.current;
        const nodeId = currentEditor?.selection.nodeId ?? null;
        const node = nodeId && currentEditor ? findNodeById(currentEditor.document, nodeId) : null;
        if (node && !isNodeLocked(node)) {
          event.preventDefault();
          const nextName = window.prompt("레이어 이름", node.name);
          if (nextName?.trim()) {
            updateViewportFromInteraction((state) => renameSelectedNode(state, nextName));
          }
        }
        return;
      }
      if (isCommand && event.key.toLowerCase() === "d") {
        event.preventDefault();
        updateViewportFromInteraction(duplicateSelectedNode);
        return;
      }
      if (isCommand && event.key.toLowerCase() === "g") {
        event.preventDefault();
        updateViewportFromInteraction((state) => {
          if (event.shiftKey) {
            return ungroupSelectedNode(state);
          }

          const sequence = flattenRendererNodes(state.document).length + 1;
          return groupSelectedNodes(state, `group-${sequence}`, `그룹 ${sequence}`);
        });
        return;
      }
      if (!isCommand && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        updateViewportFromInteraction(deleteSelectedNode);
        return;
      }
      const alignmentShortcut = event.altKey ? ALIGNMENT_SHORTCUTS[event.key.toLowerCase()] : undefined;
      if (!isCommand && alignmentShortcut) {
        event.preventDefault();
        updateViewportFromInteraction((state) =>
          state.selection.nodeIds.length === 1
            ? alignSelectedNodeToParent(state, alignmentShortcut)
            : alignSelectedNodes(state, alignmentShortcut)
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelectionFromInteraction();
        return;
      }

      const panStep = event.shiftKey ? KEYBOARD_PAN_STEP_LARGE : KEYBOARD_PAN_STEP;
      const nudgeStep = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateViewportFromInteraction((state) =>
          state.selection.nodeId
            ? nudgeSelectedNode(state, { x: -nudgeStep, y: 0 })
            : panViewport(state, { x: panStep, y: 0 })
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateViewportFromInteraction((state) =>
          state.selection.nodeId
            ? nudgeSelectedNode(state, { x: nudgeStep, y: 0 })
            : panViewport(state, { x: -panStep, y: 0 })
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        updateViewportFromInteraction((state) =>
          state.selection.nodeId
            ? nudgeSelectedNode(state, { x: 0, y: -nudgeStep })
            : panViewport(state, { x: 0, y: panStep })
        );
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        updateViewportFromInteraction((state) =>
          state.selection.nodeId
            ? nudgeSelectedNode(state, { x: 0, y: nudgeStep })
            : panViewport(state, { x: 0, y: -panStep })
        );
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") {
        return;
      }

      isSpacePanningRef.current = false;
      panSessionRef.current = null;
      setIsSpacePanning(false);
    };

    const handleWindowBlur = () => {
      isSpacePanningRef.current = false;
      panSessionRef.current = null;
      setIsSpacePanning(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [stageSize.height, stageSize.width]);

  const dispatch = (command: Parameters<typeof executeEditorCommand>[1]) => {
    const activeSession = collabSessionRef.current;
    if (!activeSession) {
      setEditor((current) => (current ? executeEditorCommand(current, command) : current));
      return;
    }

    if (!editor) {
      return;
    }

    const nextState = executeEditorCommand(
      { ...editor, document: activeSession.getDocument() },
      command
    );
    activeSession.transact("editor-command", () => nextState.document);
    publishEditorPresence(nextState);
    setEditor(nextState);
  };

  const dispatchPreservingSelection = (
    command: Parameters<typeof executeEditorCommand>[1],
    nodeId: string
  ) => {
    const activeSession = collabSessionRef.current;
    if (!activeSession) {
      setEditor((current) => (current ? setSelection(executeEditorCommand(current, command), nodeId) : current));
      return;
    }

    if (!editor) {
      return;
    }

    const nextState = setSelection(
      executeEditorCommand({ ...editor, document: activeSession.getDocument() }, command),
      nodeId
    );
    activeSession.transact("editor-command", () => nextState.document);
    publishEditorPresence(nextState);
    setEditor(nextState);
  };

  const startInlineTextEdit = (nodeId: string) => {
    const currentEditor = editorRef.current;
    const node = currentEditor ? findNodeById(currentEditor.document, nodeId) : null;
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      node.kind !== "text" ||
      node.content.type !== "text"
    ) {
      return;
    }

    setMeasurementTargetNodeId(null);
    setInlineTextEditingNodeId(nodeId);
  };

  const stopInlineTextEdit = () => {
    setInlineTextEditingNodeId(null);
  };

  const updateTextNode = (nodeId: string, value: string) => {
    dispatch({ type: "update_text", nodeId, value });
    if (!currentProject) {
      return;
    }

    void persistTextChange(currentProject.currentDocumentId, nodeId, value).catch((error) => {
      const message = error instanceof Error ? error.message : "텍스트를 저장하지 못했습니다";
      setProjectStatus(message);
    });
  };

  const updateInlineText = (nodeId: string, value: string) => {
    updateTextNode(nodeId, value);
  };

  const handleInlineTextKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    stopInlineTextEdit();
  };

  const selectNode = (nodeId: string, additive = false, preserveMultiSelection = false) => {
    setMeasurementTargetNodeId(null);
    if (dragSessionRef.current && !dragSessionRef.current.hasMoved) {
      dragSessionRef.current = null;
      setDragPreview(null);
      setSnapGuides([]);
    }

    setEditor((current) => {
      if (!current) {
        return current;
      }

      const isAlreadyInMultiSelection =
        preserveMultiSelection &&
        current.selection.nodeIds.length > 1 &&
        current.selection.nodeIds.includes(nodeId);
      const nextState = additive
        ? toggleSelection(current, nodeId)
        : isAlreadyInMultiSelection
          ? setMultiSelection(current, current.selection.nodeIds, nodeId)
          : setSelection(current, nodeId);
      publishEditorPresence(nextState, { activeTool: "select" });
      return nextState;
    });
  };

  const updateGeometry = (nodeId: string, patch: GeometryPatch) => {
    dispatch({ type: "update_node_geometry", nodeId, patch });
  };

  const startNodeDrag = (
    nodeId: string,
    event: KonvaEventObject<MouseEvent | TouchEvent | DragEvent>
  ) => {
    if (!editor) {
      return;
    }
    const dragNode = findNodeById(editor.document, nodeId);
    if (!dragNode || isNodeLocked(dragNode) || !isNodeVisible(dragNode)) {
      return;
    }
    const activeDrag = dragSessionRef.current;
    if (activeDrag?.nodeId === nodeId && !activeDrag.hasMoved) {
      return;
    }

    const startPointer = documentPointFromKonvaEvent(event, editor.viewport, stageFrameRef.current);
    if (!startPointer) {
      return;
    }

    const candidateNodeIds = editor.selection.nodeIds.includes(nodeId)
      ? editor.selection.nodeIds
      : [nodeId];
    const movingGeometries = getNodeDragGeometriesForNodeIds(editor.document, candidateNodeIds);
    const movingNodeIds = movingGeometries.map((geometry) => geometry.nodeId);
    const primaryGeometry = movingGeometries.find((geometry) => geometry.nodeId === nodeId);
    const selectionBounds = getSelectionBoundsForNodeIds(editor.document, movingNodeIds);
    if (!primaryGeometry || !selectionBounds) {
      dragSessionRef.current = null;
      setDragPreview(null);
      setSnapGuides([]);
      return;
    }

    dragSessionRef.current = {
      nodeId,
      selectedNodeIds: movingNodeIds,
      startPosition: {
        x: primaryGeometry.transform.x,
        y: primaryGeometry.transform.y
      },
      startPointer,
      selectionBounds,
      hasMoved: false
    };
    setDragPreview({ primaryNodeId: nodeId, nodeIds: movingNodeIds, delta: { x: 0, y: 0 } });
    setSnapGuides([]);
  };

  const updateNodeDragPreview = (nodeId: string, event: KonvaEventObject<DragEvent>) => {
    const activeDrag = dragSessionRef.current;
    if (!editor || !activeDrag || activeDrag.nodeId !== nodeId) {
      return null;
    }

    const documentPoint = documentPointFromKonvaEvent(event, editor.viewport, stageFrameRef.current);
    const pointerDelta = documentPoint
      ? (() => {
          return {
            x: documentPoint.x - activeDrag.startPointer.x,
            y: documentPoint.y - activeDrag.startPointer.y
          };
        })()
      : {
          x: event.target.x() - activeDrag.startPosition.x,
          y: event.target.y() - activeDrag.startPosition.y
        };
    const rawDelta = pointerDelta;
    activeDrag.hasMoved = true;
    const snapped = calculateSnapForMovingBounds(
      editor.document,
      activeDrag.selectedNodeIds,
      activeDrag.selectionBounds,
      rawDelta
    );

    if (activeDrag.selectedNodeIds.length === 1 && !snapped.guides.length) {
      setSnapGuides([]);
      return { delta: rawDelta, guides: snapped.guides, nativePosition: true };
    }

    event.target.position({
      x: activeDrag.startPosition.x + rawDelta.x,
      y: activeDrag.startPosition.y + rawDelta.y
    });
    setDragPreview({
      primaryNodeId: activeDrag.nodeId,
      nodeIds: activeDrag.selectedNodeIds,
      delta: rawDelta
    });
    setSnapGuides(snapped.guides);
    return { delta: rawDelta, guides: snapped.guides };
  };

  const finishNodeDrag = (nodeId: string, event: KonvaEventObject<DragEvent>) => {
    const activeDrag = dragSessionRef.current;
    if (!activeDrag || activeDrag.nodeId !== nodeId) {
      updateGeometry(nodeId, {
        x: Math.round(event.target.x()),
        y: Math.round(event.target.y())
      });
      return;
    }

    const snapped = updateNodeDragPreview(nodeId, event);
    if (snapped && "nativePosition" in snapped && snapped.nativePosition) {
      dragSessionRef.current = null;
      setDragPreview(null);
      setSnapGuides([]);
      updateGeometry(nodeId, {
        x: Math.round(event.target.x()),
        y: Math.round(event.target.y())
      });
      return;
    }

    const finalDelta = snapped?.delta ?? { x: 0, y: 0 };
    dragSessionRef.current = null;
    setDragPreview(null);
    setSnapGuides([]);
    updateViewportFromInteraction((state) => {
      const selected = setMultiSelection(state, activeDrag.selectedNodeIds, activeDrag.nodeId);
      return moveSelectedNodesBy(selected, finalDelta, activeDrag.selectedNodeIds);
    });
  };

  const updateLayout = (nodeId: string, layout: NodeLayout) => {
    const persistedLayout = layout.mode === "none" ? null : layout;
    dispatch({
      type: "set_node_layout",
      nodeId,
      layout: persistedLayout
    });
    if (currentProject && persistedLayout) {
      void persistNodeLayout(currentProject.currentDocumentId, nodeId, persistedLayout).catch((error) => {
        const message = error instanceof Error ? error.message : "레이아웃을 저장하지 못했습니다";
        setProjectStatus(message);
      });
    }
  };

  const layoutForGridResizeAtPoint = (
    state: EditorState,
    session: GridResizeSession,
    documentPoint: { x: number; y: number }
  ): NodeLayout | null => {
    const node = findNodeById(state.document, session.nodeId);
    const frameBounds = getNodeBounds(state.document, session.nodeId);
    if (
      !node ||
      !frameBounds ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component")
    ) {
      return null;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      return null;
    }

    const columnGap = layout.column_gap ?? layout.gap;
    const rowGap = layout.row_gap ?? layout.gap;
    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);

    if (session.axis === "column") {
      if (session.index < 0 || session.index >= columns - 1) {
        return null;
      }
      const availableWidth = Math.max(
        0,
        node.size.width - layout.padding.left - layout.padding.right - columnGap * Math.max(0, columns - 1)
      );
      const tracks = resolveGridTracksForOverlay(layout.grid_column_tracks, columns);
      const trackStarts = gridTrackStartsForOverlay(resolveGridTrackSizesForOverlay(tracks, availableWidth), columnGap);
      const trackStart = trackStarts[session.index] ?? 0;
      const nextSize = Math.max(
        GRID_MIN_TRACK_SIZE,
        Math.round(documentPoint.x - (frameBounds.x + layout.padding.left) - trackStart)
      );
      return {
        ...layout,
        grid_columns: columns,
        grid_column_tracks: tracks.map((track, index) =>
          index === session.index ? { type: "px", value: nextSize } : track
        )
      };
    }

    if (session.index < 0 || session.index >= rows - 1) {
      return null;
    }
    const availableHeight = Math.max(
      0,
      node.size.height - layout.padding.top - layout.padding.bottom - rowGap * Math.max(0, rows - 1)
    );
    const tracks = resolveGridTracksForOverlay(layout.grid_row_tracks, rows);
    const trackStarts = gridTrackStartsForOverlay(resolveGridTrackSizesForOverlay(tracks, availableHeight), rowGap);
    const trackStart = trackStarts[session.index] ?? 0;
    const nextSize = Math.max(
      GRID_MIN_TRACK_SIZE,
      Math.round(documentPoint.y - (frameBounds.y + layout.padding.top) - trackStart)
    );
    return {
      ...layout,
      grid_rows: rows,
      grid_row_tracks: tracks.map((track, index) =>
        index === session.index ? { type: "px", value: nextSize } : track
      )
    };
  };

  const updateGridResizeFromClientPoint = (
    session: GridResizeSession,
    clientPoint: { x: number; y: number }
  ) => {
    const currentEditor = editorRef.current;
    const documentPoint = currentEditor
      ? documentPointFromClientPoint(clientPoint, currentEditor.viewport, stageFrameRef.current)
      : null;
    if (!currentEditor || !documentPoint) {
      return;
    }

    const nextLayout = layoutForGridResizeAtPoint(currentEditor, session, documentPoint);
    if (!nextLayout) {
      return;
    }

    dispatch({
      type: "set_node_layout",
      nodeId: session.nodeId,
      layout: nextLayout
    });
  };

  const updateGridAreaBoundaryFromClientPoint = (
    session: GridAreaBoundarySession,
    clientPoint: { x: number; y: number }
  ) => {
    const currentEditor = editorRef.current;
    const documentPoint = currentEditor
      ? documentPointFromClientPoint(clientPoint, currentEditor.viewport, stageFrameRef.current)
      : null;
    if (!currentEditor || !documentPoint) {
      return;
    }

    const parent = findNodeById(currentEditor.document, session.parentNodeId);
    const child = findNodeById(currentEditor.document, session.childNodeId);
    const frameBounds = getNodeBounds(currentEditor.document, session.parentNodeId);
    if (
      !parent ||
      !child ||
      !frameBounds ||
      isNodeLocked(parent) ||
      isNodeLocked(child) ||
      !isNodeVisible(parent) ||
      !isNodeVisible(child) ||
      (parent.kind !== "frame" && parent.kind !== "component") ||
      (child.layout_item?.position ?? "static") !== "static"
    ) {
      return;
    }

    const layout = normalizedInspectorLayout(parent.layout);
    if (layout.mode !== "grid") {
      return;
    }

    const columnGap = layout.column_gap ?? layout.gap;
    const rowGap = layout.row_gap ?? layout.gap;
    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, parent);
    const availableWidth = Math.max(
      0,
      parent.size.width - layout.padding.left - layout.padding.right - columnGap * Math.max(0, columns - 1)
    );
    const availableHeight = Math.max(
      0,
      parent.size.height - layout.padding.top - layout.padding.bottom - rowGap * Math.max(0, rows - 1)
    );
    const columnTracks = resolveGridTracksForOverlay(layout.grid_column_tracks, columns);
    const rowTracks = resolveGridTracksForOverlay(layout.grid_row_tracks, rows);
    const columnSizes = resolveGridTrackSizesForOverlay(columnTracks, availableWidth);
    const rowSizes = resolveGridTrackSizesForOverlay(rowTracks, availableHeight);
    const columnStarts = gridTrackStartsForOverlay(columnSizes, columnGap);
    const rowStarts = gridTrackStartsForOverlay(rowSizes, rowGap);
    const layoutItem = normalizedAppLayoutItem(child.layout_item);
    const areaName = normalizeGridAreaNameForOverlay(layoutItem.grid_area);
    const normalizedAreas = normalizeGridAreasForOverlay(layout.grid_areas, columns, rows);
    const namedArea = areaName ? normalizedAreas.find((area) => area.name === areaName) ?? null : null;
    const areaPlacement = namedArea
      ? {
          column: namedArea.column - 1,
          row: namedArea.row - 1,
          columnSpan: namedArea.column_span,
          rowSpan: namedArea.row_span
        }
      : null;
    const explicitPlacement = areaName ? null : manualGridPlacementForOverlay(layoutItem, columns, rows);
    const autoPlacement =
      areaName || explicitPlacement ? null : autoGridPlacementForOverlay(parent, child, layout, columns, rows);
    const placement = areaPlacement ?? explicitPlacement ?? autoPlacement;
    if (!placement) {
      return;
    }

    const nextPlacement = { ...placement };
    if (session.edge === "left" || session.edge === "right") {
      const relativeX = documentPoint.x - (frameBounds.x + layout.padding.left);
      const targetLine = nearestGridLineIndexForOverlay(relativeX, columnStarts, columnSizes);
      const currentEnd = placement.column + placement.columnSpan;
      if (session.edge === "right") {
        const nextEnd = clampGridLineForOverlay(targetLine, placement.column + 1, columns);
        nextPlacement.columnSpan = nextEnd - placement.column;
      } else {
        const nextStart = clampGridLineForOverlay(targetLine, 0, currentEnd - 1);
        nextPlacement.column = nextStart;
        nextPlacement.columnSpan = currentEnd - nextStart;
      }
    } else {
      const relativeY = documentPoint.y - (frameBounds.y + layout.padding.top);
      const targetLine = nearestGridLineIndexForOverlay(relativeY, rowStarts, rowSizes);
      const currentEnd = placement.row + placement.rowSpan;
      if (session.edge === "bottom") {
        const nextEnd = clampGridLineForOverlay(targetLine, placement.row + 1, rows);
        nextPlacement.rowSpan = nextEnd - placement.row;
      } else {
        const nextStart = clampGridLineForOverlay(targetLine, 0, currentEnd - 1);
        nextPlacement.row = nextStart;
        nextPlacement.rowSpan = currentEnd - nextStart;
      }
    }

    const placementDidChange =
      nextPlacement.column !== placement.column ||
      nextPlacement.row !== placement.row ||
      nextPlacement.columnSpan !== placement.columnSpan ||
      nextPlacement.rowSpan !== placement.rowSpan;
    if (!placementDidChange) {
      return;
    }

    if (areaName && namedArea) {
      dispatchPreservingSelection(
        {
          type: "set_node_layout",
          nodeId: parent.id,
          layout: {
            ...layout,
            grid_areas: normalizedAreas.map((area) =>
              area.name === areaName
                ? {
                    ...area,
                    column: nextPlacement.column + 1,
                    row: nextPlacement.row + 1,
                    column_span: nextPlacement.columnSpan,
                    row_span: nextPlacement.rowSpan
                  }
                : area
            )
          }
        },
        child.id
      );
      return;
    }

    dispatch({
      type: "set_node_layout_item",
      nodeId: child.id,
      layoutItem: {
        ...layoutItem,
        grid_area: undefined,
        grid_column: nextPlacement.column + 1,
        grid_row: nextPlacement.row + 1,
        grid_column_span: nextPlacement.columnSpan,
        grid_row_span: nextPlacement.rowSpan
      }
    });
  };

  const addGridTrackFromViewportControl = (
    control: GridViewportAddControl,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const currentEditor = editorRef.current;
    if (!currentEditor || !selectedNode || selectedNode.id !== currentEditor.selection.nodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const node = findNodeById(currentEditor.document, selectedNode.id);
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component")
    ) {
      return;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      return;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    const nextLayout =
      control.axis === "column"
        ? {
            ...layout,
            grid_columns: columns + 1,
            grid_column_tracks: [
              ...resolveGridTracksForOverlay(layout.grid_column_tracks, columns),
              { type: "fr" as const, value: 1 }
            ]
          }
        : {
            ...layout,
            grid_rows: rows + 1,
            grid_row_tracks: [
              ...resolveGridTracksForOverlay(layout.grid_row_tracks, rows),
              { type: "fr" as const, value: 1 }
            ]
          };

    dispatch({
      type: "set_node_layout",
      nodeId: selectedNode.id,
      layout: nextLayout
    });
  };

  const removeGridTrackFromViewportControl = (
    control: GridViewportRemoveControl,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const currentEditor = editorRef.current;
    if (!currentEditor || !selectedNode || selectedNode.id !== currentEditor.selection.nodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const node = findNodeById(currentEditor.document, selectedNode.id);
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component")
    ) {
      return;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      return;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    if (control.axis === "column") {
      if (columns <= 1 || control.index < 0 || control.index >= columns) {
        return;
      }

      const tracks = resolveGridTracksForOverlay(layout.grid_column_tracks, columns);
      dispatch({
        type: "set_node_layout",
        nodeId: selectedNode.id,
        layout: {
          ...layout,
          grid_columns: columns - 1,
          grid_column_tracks: tracks.filter((_, index) => index !== control.index)
        }
      });
      return;
    }

    if (rows <= 1 || control.index < 0 || control.index >= rows) {
      return;
    }

    const tracks = resolveGridTracksForOverlay(layout.grid_row_tracks, rows);
    dispatch({
      type: "set_node_layout",
      nodeId: selectedNode.id,
      layout: {
        ...layout,
        grid_rows: rows - 1,
        grid_row_tracks: tracks.filter((_, index) => index !== control.index)
      }
    });
  };

  const openGridCellContextMenuFromCell = (
    control: GridViewportCellControl,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editor || !selectedNode || selectedNode.id !== editor.selection.nodeId) {
      return;
    }

    const node = findNodeById(editor.document, selectedNode.id);
    const layout = node ? normalizedInspectorLayout(node.layout) : null;
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component") ||
      layout?.mode !== "grid"
    ) {
      return;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    const normalizedAreas = normalizeGridAreasForOverlay(layout.grid_areas, columns, rows);
    const clickedCell = { column: control.column, row: control.row };
    const currentSelectionRange =
      gridCellSelection?.nodeId === node.id ? gridCellRangeFromSelection(gridCellSelection) : null;
    const range =
      currentSelectionRange && isGridCellInRange(clickedCell, currentSelectionRange)
        ? currentSelectionRange
        : { ...clickedCell, columnSpan: 1, rowSpan: 1 };

    setInlineTextEditingNodeId(null);
    setMeasurementTargetNodeId(null);
    setObjectContextMenu(null);
    setGridTrackContextMenu(null);
    setGridCellContextMenu({
      ...objectContextMenuPosition(event.clientX, event.clientY),
      nodeId: node.id,
      column: control.column,
      row: control.row,
      range,
      areaName: gridAreaNameAtCell(normalizedAreas, clickedCell)
    });
  };

  const selectGridCellRangeFromCell = (
    control: GridViewportCellControl,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    if (!editor || !selectedNode || selectedNode.id !== editor.selection.nodeId) {
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      setGridCellSelection(null);
      return;
    }

    const node = findNodeById(editor.document, selectedNode.id);
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component") ||
      normalizedInspectorLayout(node.layout).mode !== "grid"
    ) {
      return;
    }

    const cell = { column: control.column, row: control.row };
    setGridCellSelection((current) =>
      current && current.nodeId === node.id
        ? {
            ...current,
            focus: cell
          }
        : {
            nodeId: node.id,
            anchor: cell,
            focus: cell
          }
    );
  };

  const openGridTrackContextMenuFromHeader = (
    control: GridViewportHeaderControl,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (gridTrackDragRef.current) {
      return;
    }
    if (!editor || !selectedNode || selectedNode.id !== editor.selection.nodeId) {
      return;
    }

    setInlineTextEditingNodeId(null);
    setMeasurementTargetNodeId(null);
    setObjectContextMenu(null);
    setGridCellContextMenu(null);
    setGridCellSelection(null);
    setGridTrackContextMenu({
      ...objectContextMenuPosition(event.clientX, event.clientY),
      nodeId: selectedNode.id,
      axis: control.axis,
      index: control.index
    });
  };

  const startGridTrackReorderFromHeader = (
    control: GridViewportHeaderControl,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    if (!editor || !selectedNode || selectedNode.id !== editor.selection.nodeId) {
      return;
    }

    event.preventDefault();
    setInlineTextEditingNodeId(null);
    setMeasurementTargetNodeId(null);
    setObjectContextMenu(null);
    setGridCellContextMenu(null);
    setGridTrackContextMenu(null);
    gridTrackDragRef.current = {
      nodeId: selectedNode.id,
      axis: control.axis,
      index: control.index,
      preserveChildren: event.ctrlKey || event.metaKey
    };
    document.body.style.cursor = "grabbing";
  };

  useEffect(() => {
    const stopGridTrackReorder = (event: MouseEvent) => {
      const session = gridTrackDragRef.current;
      if (!session) {
        return;
      }

      gridTrackDragRef.current = null;
      document.body.style.cursor = "";
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const targetHeader =
        target instanceof Element ? target.closest<HTMLElement>('[data-grid-track-header="true"]') : null;
      const targetNodeId = targetHeader?.dataset.gridTrackNodeId;
      const targetAxis = targetHeader?.dataset.gridTrackAxis;
      const targetIndex = Number(targetHeader?.dataset.gridTrackIndex);
      if (
        targetNodeId !== session.nodeId ||
        targetAxis !== session.axis ||
        !Number.isInteger(targetIndex) ||
        targetIndex === session.index
      ) {
        return;
      }

      dispatch({
        type: "reorder_grid_track_with_children",
        nodeId: session.nodeId,
        axis: session.axis,
        fromIndex: session.index,
        toIndex: targetIndex,
        preserveChildren: session.preserveChildren
      });
    };

    const cancelGridTrackReorder = () => {
      gridTrackDragRef.current = null;
      document.body.style.cursor = "";
    };

    window.addEventListener("mouseup", stopGridTrackReorder);
    window.addEventListener("blur", cancelGridTrackReorder);
    return () => {
      window.removeEventListener("mouseup", stopGridTrackReorder);
      window.removeEventListener("blur", cancelGridTrackReorder);
      cancelGridTrackReorder();
    };
  }, [dispatch]);

  const layoutForGridTrackContextAction = (
    state: EditorState,
    menu: GridTrackContextMenuState,
    action: GridTrackContextMenuAction
  ): NodeLayout | null => {
    const node = findNodeById(state.document, menu.nodeId);
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component")
    ) {
      return null;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      return null;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    const trackCount = menu.axis === "column" ? columns : rows;
    if (menu.index < 0 || menu.index >= trackCount) {
      return null;
    }

    const currentTracks =
      menu.axis === "column"
        ? resolveGridTracksForOverlay(layout.grid_column_tracks, columns)
        : resolveGridTracksForOverlay(layout.grid_row_tracks, rows);
    const selectedTrack = currentTracks[menu.index];
    if (!selectedTrack) {
      return null;
    }

    const nextTracks = (() => {
      if (action === "delete") {
        return currentTracks.length <= 1
          ? null
          : currentTracks.filter((_, index) => index !== menu.index);
      }

      const insertedTrack =
        action === "duplicate" ? duplicateGridTrackForOverlay(selectedTrack) : ({ type: "fr", value: 1 } as const);
      const insertionIndex = action === "insert-before" ? menu.index : menu.index + 1;
      return [
        ...currentTracks.slice(0, insertionIndex),
        insertedTrack,
        ...currentTracks.slice(insertionIndex)
      ];
    })();
    if (!nextTracks) {
      return null;
    }

    return menu.axis === "column"
      ? {
          ...layout,
          grid_columns: nextTracks.length,
          grid_column_tracks: nextTracks
        }
      : {
          ...layout,
          grid_rows: nextTracks.length,
          grid_row_tracks: nextTracks
        };
  };

  const applyGridTrackContextAction = (action: GridTrackContextMenuAction) => {
    const currentEditor = editorRef.current;
    if (!currentEditor || !gridTrackContextMenu) {
      return;
    }

    if (action === "delete-with-children") {
      dispatch({
        type: "delete_grid_track_with_children",
        nodeId: gridTrackContextMenu.nodeId,
        axis: gridTrackContextMenu.axis,
        index: gridTrackContextMenu.index
      });
      setGridTrackContextMenu(null);
      return;
    }

    const nextLayout = layoutForGridTrackContextAction(currentEditor, gridTrackContextMenu, action);
    if (!nextLayout) {
      setGridTrackContextMenu(null);
      return;
    }

    dispatch({
      type: "set_node_layout",
      nodeId: gridTrackContextMenu.nodeId,
      layout: nextLayout
    });
    setGridTrackContextMenu(null);
  };

  const applyGridCellMergeAction = () => {
    const currentEditor = editorRef.current;
    if (!currentEditor || !gridCellContextMenu) {
      return;
    }

    const node = findNodeById(currentEditor.document, gridCellContextMenu.nodeId);
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component")
    ) {
      setGridCellContextMenu(null);
      return;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      setGridCellContextMenu(null);
      return;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    if (
      gridCellContextMenu.column < 0 ||
      gridCellContextMenu.column >= columns ||
      gridCellContextMenu.row < 0 ||
      gridCellContextMenu.row >= rows ||
      gridCellContextMenu.range.column < 0 ||
      gridCellContextMenu.range.row < 0 ||
      gridCellContextMenu.range.column >= columns ||
      gridCellContextMenu.range.row >= rows
    ) {
      setGridCellContextMenu(null);
      return;
    }

    const columnSpan = Math.min(gridCellContextMenu.range.columnSpan, columns - gridCellContextMenu.range.column);
    const rowSpan = Math.min(gridCellContextMenu.range.rowSpan, rows - gridCellContextMenu.range.row);
    if (columnSpan <= 0 || rowSpan <= 0) {
      setGridCellContextMenu(null);
      return;
    }

    const normalizedAreas = normalizeGridAreasForOverlay(layout.grid_areas, columns, rows);
    dispatch({
      type: "set_node_layout",
      nodeId: node.id,
      layout: {
        ...layout,
        grid_areas: [
          ...normalizedAreas,
          {
            name: nextGridAreaNameForOverlay(normalizedAreas),
            column: gridCellContextMenu.range.column + 1,
            row: gridCellContextMenu.range.row + 1,
            column_span: columnSpan,
            row_span: rowSpan
          }
        ]
      }
    });
    setGridCellContextMenu(null);
    setGridCellSelection(null);
  };

  const applyGridCellSplitAction = () => {
    const currentEditor = editorRef.current;
    if (!currentEditor || !gridCellContextMenu?.areaName) {
      setGridCellContextMenu(null);
      return;
    }

    const node = findNodeById(currentEditor.document, gridCellContextMenu.nodeId);
    if (
      !node ||
      isNodeLocked(node) ||
      !isNodeVisible(node) ||
      (node.kind !== "frame" && node.kind !== "component")
    ) {
      setGridCellContextMenu(null);
      return;
    }

    const layout = normalizedInspectorLayout(node.layout);
    if (layout.mode !== "grid") {
      setGridCellContextMenu(null);
      return;
    }

    const { columns, rows } = gridViewportTrackCountsForOverlay(layout, node);
    const normalizedAreas = normalizeGridAreasForOverlay(layout.grid_areas, columns, rows);
    const nextAreas = normalizedAreas.filter((area) => area.name !== gridCellContextMenu.areaName);
    dispatch({
      type: "set_node_layout",
      nodeId: node.id,
      layout: {
        ...layout,
        grid_areas: nextAreas.length ? nextAreas : undefined
      }
    });
    setGridCellContextMenu(null);
    setGridCellSelection(null);
  };

  const startGridResize = (
    handle: GridViewportHandle,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!editor || !selectedNode || selectedNode.id !== editor.selection.nodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextSession = {
      nodeId: selectedNode.id,
      axis: handle.axis,
      index: handle.index
    };
    gridResizeSessionRef.current = nextSession;
    gridResizeClientPointRef.current = { x: event.clientX, y: event.clientY };
    setGridResizeSession(nextSession);
    document.body.style.cursor = handle.cursor;
  };

  useEffect(() => {
    if (!gridResizeSession) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      event.preventDefault();
      gridResizeClientPointRef.current = { x: event.clientX, y: event.clientY };
    };
    const stopGridResize = () => {
      const lastPoint = gridResizeClientPointRef.current;
      if (lastPoint) {
        updateGridResizeFromClientPoint(gridResizeSession, lastPoint);
      }
      gridResizeSessionRef.current = null;
      gridResizeClientPointRef.current = null;
      setGridResizeSession(null);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopGridResize, { once: true });
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopGridResize);
      if (gridResizeSessionRef.current === gridResizeSession) {
        gridResizeSessionRef.current = null;
      }
      gridResizeClientPointRef.current = null;
      document.body.style.cursor = "";
    };
  }, [gridResizeSession]);

  const startGridAreaBoundaryResize = (
    handle: GridAreaBoundaryHandle,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!editor || selectedNodeIds.length !== 1 || selectedNode?.id !== handle.childNodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextSession = {
      parentNodeId: handle.parentNodeId,
      childNodeId: handle.childNodeId,
      edge: handle.edge
    };
    gridAreaBoundarySessionRef.current = nextSession;
    gridAreaBoundaryClientPointRef.current = { x: event.clientX, y: event.clientY };
    setGridAreaBoundarySession(nextSession);
    document.body.style.cursor = handle.cursor;
  };

  useEffect(() => {
    if (!gridAreaBoundarySession) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      gridAreaBoundaryClientPointRef.current = { x: event.clientX, y: event.clientY };
    };
    const stopGridAreaBoundaryResize = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const lastPoint = gridAreaBoundaryClientPointRef.current;
      if (lastPoint) {
        updateGridAreaBoundaryFromClientPoint(gridAreaBoundarySession, lastPoint);
      }
      gridAreaBoundarySessionRef.current = null;
      gridAreaBoundaryClientPointRef.current = null;
      setGridAreaBoundarySession(null);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handlePointerMove, { capture: true });
    window.addEventListener("mouseup", stopGridAreaBoundaryResize, { capture: true, once: true });
    return () => {
      window.removeEventListener("mousemove", handlePointerMove, { capture: true });
      window.removeEventListener("mouseup", stopGridAreaBoundaryResize, { capture: true });
      if (gridAreaBoundarySessionRef.current === gridAreaBoundarySession) {
        gridAreaBoundarySessionRef.current = null;
      }
      gridAreaBoundaryClientPointRef.current = null;
      document.body.style.cursor = "";
    };
  }, [gridAreaBoundarySession]);

  const updateLayoutItem = (nodeId: string, layoutItem: NodeLayoutItem) => {
    dispatch({ type: "set_node_layout_item", nodeId, layoutItem });
  };

  const updateConstraints = (nodeId: string, constraints: NodeConstraints) => {
    dispatch({ type: "set_node_constraints", nodeId, constraints });
  };

  const updateExportPresets = (nodeId: string, presets: NodeExportPreset[]) => {
    dispatch({ type: "set_node_export_presets", nodeId, presets });
    if (currentProject) {
      void persistNodeExportPresets(currentProject.currentDocumentId, nodeId, presets).catch((error) => {
        const message = error instanceof Error ? error.message : "export preset을 저장하지 못했습니다";
        setProjectStatus(message);
      });
    }
  };

  const openProject = async (projectId: string) => {
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      return;
    }

    try {
      await loadProjectDocument(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다";
      setProjectStatus(message);
    }
  };

  const createNewProject = async () => {
    try {
      const project = await createSavedProject({
        name: `새 프로젝트 ${projects.length + 1}`,
        documentName: `새 문서 ${projects.length + 1}`
      });
      const nextProjects = [project, ...projects.filter((candidate) => candidate.projectId !== project.projectId)];
      await loadProjectDocument(project, nextProjects);
      setProjectStatus("새 프로젝트 저장됨");
    } catch (error) {
      const message = error instanceof Error ? error.message : "새 프로젝트를 만들지 못했습니다";
      setProjectStatus(message);
    }
  };

  const exportCurrentFileArchive = async () => {
    if (!currentProject) {
      setFileArchiveStatus("프로젝트 없음");
      return;
    }

    try {
      const archive = await exportFileArchive(currentProject.currentDocumentId);
      downloadBlob(archive.blob, archive.fileName);
      setFileArchiveStatus(`${archive.fileName} 내보냄`);
      setProjectStatus("파일 아카이브 내보냄");
    } catch (error) {
      const message = error instanceof Error ? error.message : "파일 아카이브를 내보내지 못했습니다";
      setFileArchiveStatus(message);
      setProjectStatus(message);
    }
  };

  const reviewSelectedFileArchive = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      setFileArchiveStatus("아카이브 검토 중");
      const archiveBase64 = await readFileAsBase64(file);
      const review = await reviewFileArchive(archiveBase64);
      setFileArchiveReview({
        review,
        archiveBase64,
        sourceFileName: file.name
      });
      setFileArchiveImportName(review.suggestedName || review.originalName);
      setFileArchiveStatus(`${review.suggestedName || review.originalName} 검토됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "아카이브를 검토하지 못했습니다";
      setFileArchiveReview(null);
      setFileArchiveImportName("");
      setFileArchiveStatus(message);
    } finally {
      input.value = "";
    }
  };

  const cancelFileArchiveImport = () => {
    setFileArchiveReview(null);
    setFileArchiveImportName("");
    setFileArchiveStatus("아카이브 가져오기 취소됨");
  };

  const importReviewedFileArchive = async () => {
    if (!fileArchiveReview) {
      setFileArchiveStatus("검토된 아카이브 없음");
      return;
    }

    const archiveName =
      fileArchiveImportName.trim() ||
      fileArchiveReview.review.suggestedName ||
      fileArchiveReview.review.originalName ||
      "가져온 파일";

    try {
      setFileArchiveStatus("아카이브 가져오는 중");
      const project = await createSavedProject({
        name: archiveName,
        documentName: archiveName
      });
      const imported = await importFileArchive({
        archiveBase64: fileArchiveReview.archiveBase64,
        fileId: project.currentDocumentId,
        name: archiveName
      });
      const importedName = imported.name || archiveName;
      const importedProject: ProjectManifest = {
        ...project,
        name: importedName,
        documents: project.documents.map((document) =>
          document.documentId === project.currentDocumentId
            ? { ...document, name: importedName, updatedAt: new Date().toISOString() }
            : document
        )
      };
      const nextProjects = [
        importedProject,
        ...projects.filter((candidate) => candidate.projectId !== importedProject.projectId)
      ];
      await loadProjectDocument(importedProject, nextProjects);
      setFileArchiveReview(null);
      setFileArchiveImportName("");
      setFileArchiveStatus(`${importedName} 가져옴`);
      setProjectStatus(`${importedName} 가져옴`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "아카이브를 가져오지 못했습니다";
      setFileArchiveStatus(message);
      setProjectStatus(message);
    }
  };

  const exportCurrentLibraryArchive = async () => {
    if (!currentProject) {
      setLibraryArchiveStatus("프로젝트 없음");
      return;
    }

    try {
      const archive = await exportLibraryArchive(currentProject.currentDocumentId);
      downloadBlob(archive.blob, archive.fileName);
      setLibraryArchiveStatus(`${archive.fileName} 내보냄`);
      setProjectStatus("라이브러리 아카이브 내보냄");
    } catch (error) {
      const message = error instanceof Error ? error.message : "라이브러리 아카이브를 내보내지 못했습니다";
      setLibraryArchiveStatus(message);
      setProjectStatus(message);
    }
  };

  const reviewSelectedLibraryArchive = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!currentProject) {
      setLibraryArchiveStatus("프로젝트 없음");
      input.value = "";
      return;
    }

    try {
      setLibraryArchiveStatus("라이브러리 아카이브 검토 중");
      const archiveBase64 = await readFileAsBase64(file);
      const review = await reviewLibraryArchive(currentProject.currentDocumentId, archiveBase64);
      setLibraryArchiveReview({
        review,
        archiveBase64,
        sourceFileName: file.name
      });
      setLibraryArchivePrefix("shared");
      setLibraryArchiveStatus(`${review.originalName} 라이브러리 검토됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "라이브러리 아카이브를 검토하지 못했습니다";
      setLibraryArchiveReview(null);
      setLibraryArchiveStatus(message);
    } finally {
      input.value = "";
    }
  };

  const cancelLibraryArchiveImport = () => {
    setLibraryArchiveReview(null);
    setLibraryArchiveStatus("라이브러리 가져오기 취소됨");
  };

  const importReviewedLibraryArchive = async () => {
    if (!currentProject) {
      setLibraryArchiveStatus("프로젝트 없음");
      return;
    }
    if (!libraryArchiveReview) {
      setLibraryArchiveStatus("검토된 라이브러리 아카이브 없음");
      return;
    }

    try {
      setLibraryArchiveStatus("라이브러리 가져오는 중");
      const imported = await importLibraryArchive(currentProject.currentDocumentId, {
        archiveBase64: libraryArchiveReview.archiveBase64,
        idPrefix: libraryArchivePrefix.trim() || undefined
      });
      await loadProjectDocument(currentProject, projects);
      setLibraryArchiveReview(null);
      setLibraryArchiveStatus(
        `라이브러리 가져옴 · 컴포넌트 ${imported.componentCount}개 · 토큰 ${imported.tokenCount}개`
      );
      setProjectStatus("라이브러리 가져옴");
    } catch (error) {
      const message = error instanceof Error ? error.message : "라이브러리 아카이브를 가져오지 못했습니다";
      setLibraryArchiveStatus(message);
      setProjectStatus(message);
    }
  };

  const exportCurrentProjectArchive = async () => {
    if (!currentProject) {
      setProjectArchiveStatus("프로젝트 없음");
      return;
    }

    try {
      const archive = await exportProjectArchive(currentProject.projectId);
      downloadBlob(archive.blob, archive.fileName);
      setProjectArchiveStatus(`${archive.fileName} 내보냄`);
      setProjectStatus("프로젝트 아카이브 내보냄");
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트 아카이브를 내보내지 못했습니다";
      setProjectArchiveStatus(message);
      setProjectStatus(message);
    }
  };

  const reviewSelectedProjectArchive = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      setProjectArchiveStatus("프로젝트 아카이브 검토 중");
      const archiveBase64 = await readFileAsBase64(file);
      const review = await reviewProjectArchive(archiveBase64);
      setProjectArchiveReview({
        review,
        archiveBase64,
        sourceFileName: file.name
      });
      setProjectArchiveImportName(review.suggestedName || review.originalName);
      setProjectArchiveStatus(`${review.suggestedName || review.originalName} 검토됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트 아카이브를 검토하지 못했습니다";
      setProjectArchiveReview(null);
      setProjectArchiveImportName("");
      setProjectArchiveStatus(message);
    } finally {
      input.value = "";
    }
  };

  const cancelProjectArchiveImport = () => {
    setProjectArchiveReview(null);
    setProjectArchiveImportName("");
    setProjectArchiveStatus("프로젝트 아카이브 가져오기 취소됨");
  };

  const importReviewedProjectArchive = async () => {
    if (!projectArchiveReview) {
      setProjectArchiveStatus("검토된 프로젝트 아카이브 없음");
      return;
    }

    const archiveName =
      projectArchiveImportName.trim() ||
      projectArchiveReview.review.suggestedName ||
      projectArchiveReview.review.originalName ||
      "가져온 프로젝트";

    try {
      setProjectArchiveStatus("프로젝트 아카이브 가져오는 중");
      const imported = await importProjectArchive({
        archiveBase64: projectArchiveReview.archiveBase64,
        name: archiveName
      });
      const nextProjects = [
        imported.project,
        ...projects.filter((candidate) => candidate.projectId !== imported.project.projectId)
      ];
      await loadProjectDocument(imported.project, nextProjects);
      setProjectArchiveReview(null);
      setProjectArchiveImportName("");
      setProjectArchiveStatus(`${imported.project.name} 가져옴`);
      setProjectStatus(`${imported.project.name} 가져옴`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트 아카이브를 가져오지 못했습니다";
      setProjectArchiveStatus(message);
      setProjectStatus(message);
    }
  };

  const saveProjectName = async () => {
    if (!currentProject) {
      return;
    }

    try {
      const project = await updateProject(currentProject.projectId, { name: projectNameDraft });
      setCurrentProject(project);
      setProjects((current) =>
        current.map((candidate) => (candidate.projectId === project.projectId ? project : candidate))
      );
      setProjectNameDraft(project.name);
      void refreshCommentNotifications();
      setProjectStatus(`${project.name} 저장됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트 이름을 저장하지 못했습니다";
      setProjectStatus(message);
    }
  };

  const duplicateCurrentProject = async () => {
    if (!currentProject) {
      return;
    }

    try {
      const project = await duplicateProject(currentProject.projectId, {
        name: `${currentProject.name} 사본`
      });
      const nextProjects = [project, ...projects.filter((candidate) => candidate.projectId !== project.projectId)];
      await loadProjectDocument(project, nextProjects);
      setProjectStatus("프로젝트 복제됨");
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트를 복제하지 못했습니다";
      setProjectStatus(message);
    }
  };

  const deleteCurrentProject = async () => {
    if (!currentProject) {
      return;
    }
    if (projects.length <= 1) {
      setProjectStatus("마지막 프로젝트는 삭제할 수 없습니다");
      return;
    }
    if (!window.confirm(`${currentProject.name} 프로젝트를 삭제할까요?`)) {
      return;
    }

    try {
      const deletedProject = currentProject;
      await deleteProject(currentProject.projectId);
      const nextProjects = projects.filter((candidate) => candidate.projectId !== deletedProject.projectId);
      const nextProject = nextProjects[0] ?? null;
      if (nextProject) {
        await loadProjectDocument(nextProject, nextProjects);
      } else {
        setProjects([]);
        setCurrentProject(null);
        setProjectNameDraft("");
        resetFileVersions("프로젝트 없음");
        resetCommentThreads("프로젝트 없음");
        resetCommentNotifications();
        await projectStore.setCurrentProjectId("");
      }
      setProjectStatus(`${deletedProject.name} 프로젝트 삭제됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트를 삭제하지 못했습니다";
      setProjectStatus(message);
    }
  };

  const linkProjectToCurrentTeam = async () => {
    if (!currentProject || !collabSession) {
      return;
    }

    try {
      const project = await setProjectSharing(currentProject.projectId, {
        mode: "team",
        teamId: collabSession.team.teamId
      });
      const documentSummaries = project.documents.map((document) => ({
        documentId: document.documentId,
        name: document.name,
        updatedAt: document.updatedAt
      }));
      const knownDocumentIds = new Set(documentSummaries.map((document) => document.documentId));
      const nextTeam: TeamManifest = {
        ...collabSession.team,
        documents: [
          ...collabSession.team.documents.filter((document) => !knownDocumentIds.has(document.documentId)),
          ...documentSummaries
        ]
      };
      await teamStore.saveTeam(nextTeam);
      setCurrentProject(project);
      setProjects((current) =>
        current.map((candidate) => (candidate.projectId === project.projectId ? project : candidate))
      );
      setManifestText(exportTeamManifest(nextTeam));
      setManifestStatus(`${nextTeam.name} 프로젝트 연결됨`);
      setProjectStatus(`${project.name} 공유 설정 저장됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "프로젝트 공유 설정을 저장하지 못했습니다";
      setProjectStatus(message);
    }
  };

  const saveCurrentFileVersion = async () => {
    if (!currentProject) {
      setFileVersionStatus("프로젝트 없음");
      return;
    }

    const message = fileVersionMessage.trim() || "저장된 버전";
    try {
      const version = await saveFileVersion(currentProject.currentDocumentId, message);
      setFileVersionMessage(version.message);
      await refreshFileVersions(currentProject.currentDocumentId, `${version.message} 저장됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "현재 버전을 저장하지 못했습니다";
      setFileVersionStatus(message);
    }
  };

  const previewCurrentFileVersion = async (version: FileVersionSummary) => {
    if (!currentProject || !editorRef.current) {
      setFileVersionStatus("프로젝트 없음");
      return;
    }

    try {
      const snapshot = await readFileVersion(currentProject.currentDocumentId, version.versionId);
      const summary = await summarizeDocumentChanges(
        currentProject.currentDocumentId,
        snapshot.document,
        editorRef.current.document
      );
      setFileVersionPreview({ version, summary });
      setFileVersionStatus(`${version.message} 미리보기`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "버전을 미리보지 못했습니다";
      setFileVersionPreview(null);
      setFileVersionStatus(message);
    }
  };

  const restoreCurrentFileVersion = async (version: FileVersionSummary) => {
    if (!currentProject) {
      setFileVersionStatus("프로젝트 없음");
      return;
    }

    try {
      const result = await restoreFileVersion(currentProject.currentDocumentId, version.versionId);
      setEditor((current) => {
        const nextState = createEditorState(result.file);
        return current ? { ...nextState, viewport: current.viewport } : nextState;
      });
      setFileVersionPreview(null);
      setTokenDtcgDraft("");
      setTokenDtcgStatus("");
      await refreshFileVersions(currentProject.currentDocumentId, `${version.message} 복원됨`);
      void refreshCommentThreads(currentProject.currentDocumentId);
      void refreshCommentNotifications();
    } catch (error) {
      const message = error instanceof Error ? error.message : "버전을 복원하지 못했습니다";
      setFileVersionStatus(message);
    }
  };

  const toggleFileVersionPinned = async (version: FileVersionSummary) => {
    if (!currentProject) {
      setFileVersionStatus("프로젝트 없음");
      return;
    }

    try {
      const updated = await setFileVersionPinned(
        currentProject.currentDocumentId,
        version.versionId,
        !version.pinned
      );
      await refreshFileVersions(
        currentProject.currentDocumentId,
        updated.pinned ? `${updated.message} 고정됨` : `${updated.message} 고정 해제됨`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "버전 고정 상태를 저장하지 못했습니다";
      setFileVersionStatus(message);
    }
  };

  const deleteCurrentFileVersion = async (version: FileVersionSummary) => {
    if (!currentProject) {
      setFileVersionStatus("프로젝트 없음");
      return;
    }

    try {
      const deleted = await deleteFileVersion(currentProject.currentDocumentId, version.versionId);
      if (fileVersionPreview?.version.versionId === version.versionId) {
        setFileVersionPreview(null);
      }
      await refreshFileVersions(currentProject.currentDocumentId, `${deleted.message} 삭제됨`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "버전을 삭제하지 못했습니다";
      setFileVersionStatus(message);
    }
  };

  const pruneCurrentFileVersions = async () => {
    if (!currentProject) {
      setFileVersionStatus("프로젝트 없음");
      return;
    }

    const keepUnpinned = Math.max(0, Math.floor(Number(fileVersionRetentionKeep)));
    if (!Number.isFinite(keepUnpinned)) {
      setFileVersionStatus("보관 개수를 입력하세요");
      return;
    }

    try {
      const result = await pruneFileVersions(currentProject.currentDocumentId, keepUnpinned);
      setFileVersionPreview((preview) =>
        preview && result.deletedVersions.some((version) => version.versionId === preview.version.versionId)
          ? null
          : preview
      );
      await refreshFileVersions(
        currentProject.currentDocumentId,
        result.deletedVersions.length > 0
          ? `오래된 버전 ${result.deletedVersions.length}개 정리됨`
          : "정리할 오래된 버전 없음"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "오래된 버전을 정리하지 못했습니다";
      setFileVersionStatus(message);
    }
  };

  const createSelectedNodeComment = async (nodeId: string) => {
    if (!currentProject) {
      setCommentStatus("프로젝트 없음");
      return;
    }
    const body = commentBody.trim();
    if (!body) {
      setCommentStatus("코멘트 내용을 입력하세요");
      return;
    }

    try {
      await createCommentThread(currentProject.currentDocumentId, {
        nodeId,
        body,
        authorName: "사용자",
        mentionTargets: resolveCommentMentionTargets(body, collabSession?.team)
      });
      setCommentBody("");
      await Promise.all([
        refreshCommentThreads(currentProject.currentDocumentId, "코멘트 추가됨"),
        refreshCommentNotifications(),
        refreshCommentActivity()
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "코멘트를 추가하지 못했습니다";
      setCommentStatus(message);
    }
  };

  const createSelectedNodeCommentReply = async (threadId: string) => {
    if (!currentProject) {
      setCommentStatus("프로젝트 없음");
      return;
    }
    const body = (commentReplyBodies[threadId] ?? "").trim();
    if (!body) {
      setCommentStatus("답글 내용을 입력하세요");
      return;
    }

    try {
      await addCommentReply(currentProject.currentDocumentId, threadId, {
        body,
        authorName: "사용자",
        mentionTargets: resolveCommentMentionTargets(body, collabSession?.team)
      });
      setCommentReplyBodies((current) => ({ ...current, [threadId]: "" }));
      await Promise.all([
        refreshCommentThreads(currentProject.currentDocumentId, "답글 추가됨"),
        refreshCommentNotifications(),
        refreshCommentActivity()
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "답글을 추가하지 못했습니다";
      setCommentStatus(message);
    }
  };

  const resolveSelectedNodeComment = async (threadId: string) => {
    if (!currentProject) {
      setCommentStatus("프로젝트 없음");
      return;
    }

    try {
      await resolveCommentThread(currentProject.currentDocumentId, threadId);
      await Promise.all([
        refreshCommentThreads(currentProject.currentDocumentId, "코멘트 해결됨"),
        refreshCommentNotifications(),
        refreshCommentActivity()
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "코멘트를 해결하지 못했습니다";
      setCommentStatus(message);
    }
  };

  const markSelectedNodeCommentRead = async (threadId: string) => {
    if (!currentProject) {
      setCommentStatus("프로젝트 없음");
      return;
    }

    try {
      await markCommentThreadRead(currentProject.currentDocumentId, threadId, LOCAL_COMMENT_VIEWER_ID);
      await Promise.all([
        refreshCommentThreads(currentProject.currentDocumentId, "코멘트 읽음"),
        refreshCommentNotifications()
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "코멘트를 읽음 처리하지 못했습니다";
      setCommentStatus(message);
    }
  };

  const markCurrentFileCommentsRead = async () => {
    if (!currentProject) {
      setProjectStatus("프로젝트 없음");
      return;
    }

    try {
      await markFileCommentsRead(currentProject.currentDocumentId, LOCAL_COMMENT_VIEWER_ID);
      await Promise.all([
        refreshCommentThreads(currentProject.currentDocumentId, "코멘트 읽음"),
        refreshCommentNotifications()
      ]);
      setProjectStatus("현재 파일 코멘트 읽음");
    } catch (error) {
      const message = error instanceof Error ? error.message : "현재 파일 코멘트를 읽음 처리하지 못했습니다";
      setProjectStatus(message);
    }
  };

  const exportCurrentDocumentTokensDtcg = async () => {
    if (!currentProject) {
      setTokenDtcgStatus("프로젝트 없음");
      return;
    }

    try {
      const tokens = await exportDesignTokensDtcg(currentProject.currentDocumentId);
      setTokenDtcgDraft(JSON.stringify(tokens, null, 2));
      const count = editorRef.current?.document.tokens?.length ?? 0;
      setTokenDtcgStatus(`${count}개 토큰 내보냄`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "토큰을 내보내지 못했습니다";
      setTokenDtcgStatus(message);
    }
  };

  const importCurrentDocumentTokensDtcg = async () => {
    if (!currentProject) {
      setTokenDtcgStatus("프로젝트 없음");
      return;
    }

    let parsedTokens: unknown;
    try {
      parsedTokens = JSON.parse(tokenDtcgDraft);
    } catch {
      setTokenDtcgStatus("JSON 형식이 올바르지 않습니다");
      return;
    }

    try {
      const document = await importDesignTokensDtcg(currentProject.currentDocumentId, parsedTokens);
      setEditor((current) => {
        const nextState = createEditorState(document);
        return current ? { ...nextState, viewport: current.viewport } : nextState;
      });
      setTokenDtcgStatus(`${document.tokens?.length ?? 0}개 토큰 가져옴`);
      setProjectStatus("토큰 가져오기 완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : "토큰을 가져오지 못했습니다";
      setTokenDtcgStatus(message);
    }
  };

  const createNode = (kind: "rectangle" | "text") => {
    if (!editor) {
      return;
    }

    const firstPage = editor.document.pages[0];
    if (!firstPage) {
      return;
    }
    const selectedContainer =
      selectedNode && (selectedNode.kind === "frame" || selectedNode.kind === "component")
        ? selectedNode
        : null;

    dispatch({
      type: "create_node",
      parentId: selectedContainer?.id ?? firstPage.id,
      node:
        kind === "rectangle"
          ? createRectangleNode(nodes.length + 1)
          : createTextNode(nodes.length + 1)
    });
  };

  const insertImageFiles = async (
    files: File[],
    insertionPoint: { x: number; y: number } | null
  ) => {
    if (!editor || !currentProject || files.length === 0) {
      return;
    }

    const firstPage = editor.document.pages[0];
    if (!firstPage) {
      return;
    }

    const selectedContainer =
      selectedNode && (selectedNode.kind === "frame" || selectedNode.kind === "component")
        ? selectedNode
        : null;
    const parentId = selectedContainer?.id ?? firstPage.id;
    const parentOrigin = selectedContainer
      ? (getNodeAbsolutePosition(editor.document, selectedContainer.id) ?? { x: 0, y: 0 })
      : { x: 0, y: 0 };
    const baseSequence = nodes.length;
    const point = insertionPoint ?? {
      x: (stageSize.width / 2 - editor.viewport.x) / editor.viewport.scale,
      y: (stageSize.height / 2 - editor.viewport.y) / editor.viewport.scale
    };

    try {
      for (const [index, file] of files.entries()) {
        const [asset, naturalSize]: [UploadedAsset, { width: number; height: number }] =
          await Promise.all([uploadImageAsset(file), readImageFileSize(file)]);
        const imageSize = fitImportedImageSize(naturalSize);
        const node = createImageNode(baseSequence + index + 1, {
          assetId: asset.assetId,
          naturalWidth: naturalSize.width,
          naturalHeight: naturalSize.height,
          x: point.x - parentOrigin.x - imageSize.width / 2 + index * 24,
          y: point.y - parentOrigin.y - imageSize.height / 2 + index * 24,
          width: imageSize.width,
          height: imageSize.height
        });

        await persistCreatedNode(currentProject.currentDocumentId, parentId, node);
        dispatch({ type: "create_node", parentId, node });
        setProjectStatus(`${node.name} 추가됨`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지를 가져오지 못했습니다";
      setProjectStatus(message);
    }
  };

  const handleImageDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (imageFilesFromList(event.dataTransfer.files).length === 0) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleImageDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const imageFiles = imageFilesFromList(event.dataTransfer.files);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const point = editor
      ? documentPointFromClientPoint(
          { x: event.clientX, y: event.clientY },
          editor.viewport,
          stageFrameRef.current
        )
      : null;
    void insertImageFiles(imageFiles, point);
  };

  const createComponent = () => {
    if (!selectedNode || isNodeLocked(selectedNode) || selectedNode.kind === "component_instance") {
      return;
    }

    dispatch({
      type: "create_component",
      nodeId: selectedNode.id,
      componentId: `component-${components.length + 1}`,
      name: `${selectedNode.name} 컴포넌트`
    });
  };

  const createInstance = () => {
    if (!editor || !selectedComponent) {
      return;
    }

    const firstPage = editor.document.pages[0];
    if (!firstPage) {
      return;
    }

    dispatch({
      type: "create_component_instance",
      parentId: firstPage.id,
      definitionId: selectedComponent.id,
      instanceId: `instance-${nodes.length + 1}`,
      x: selectedNode ? selectedNode.transform.x + 440 : 520,
      y: selectedNode ? selectedNode.transform.y + 40 : 140
    });
  };

  const detachInstance = () => {
    if (!selectedNode?.component_instance || isNodeLocked(selectedNode)) {
      return;
    }

    dispatch({ type: "detach_instance", nodeId: selectedNode.id });
  };

  const activateTeam = async (
    team: TeamManifest,
    credentials: { relayToken?: string; memberToken?: string; encryptionPassphrase?: string } = {}
  ) => {
    if (!editor) {
      return;
    }
    const runtimeEncryptionPassphrase = credentials.encryptionPassphrase?.trim();
    if (team.encryption.mode === "shared-key" && !runtimeEncryptionPassphrase) {
      throw new Error("암호화 팀 동기화에는 공유 암호가 필요합니다");
    }

    await teamStore.saveTeam(team);
    await teamStore.setCurrentTeam(team.teamId);
    collabSessionRef.current?.destroy();

    const session = createCollabDocumentSession({
      team,
      documentId: editor.document.id,
      initialDocument: editor.document,
      relayToken: credentials.relayToken,
      memberToken: credentials.memberToken,
      encryptionPassphrase: runtimeEncryptionPassphrase
    });
    session.subscribe((document) => {
      setEditor((current) => {
        if (!current) {
          return createEditorState(document);
        }

        return {
          ...current,
          document,
          selection: setMultiSelection(
            { ...current, document },
            current.selection.nodeIds,
            current.selection.nodeId
          ).selection
        };
      });
      setPresence(session.getPresence());
    });
    session.subscribePresence((nextPresence) => {
      setPresence(normalizePresenceForOverlay(nextPresence, session.getLocalPresence().sessionId));
    });
    session.subscribeStatus((nextStatus) => {
      setCollabStatus(nextStatus);
    });
    collabSessionRef.current = session;
    session.updatePresence({
      selectedNodeId: editor.selection.nodeId,
      selectedNodeBounds: getSelectedNodeBounds(editor.document, editor.selection.nodeId),
      viewport: editor.viewport,
      updatedAtMs: Date.now()
    });
    setCollabSession(session);
    setCollabStatus(session.status);
    publishPresenceSnapshot(session);
    setEncryptionEnabled(team.encryption.mode === "shared-key");
    setManifestStatus(`${team.name} 불러옴`);
  };

  const setManifestError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "잘못된 팀 설정입니다";
    setManifestStatus(`팀 설정 가져오기 실패: ${message}`);
  };

  const createLocalTeam = () => {
    void activateTeam(
      createTeamManifest({
        name: teamName,
        currentUser: {
          userId: "local-user",
          displayName: "로컬 사용자",
          color: LOCAL_USER_COLOR
        }
      })
    );
  };

  const createRelayTeam = () => {
    if (!relayUrl.trim()) {
      return;
    }
    const runtimeEncryptionPassphrase = encryptionPassphrase.trim();
    if (encryptionEnabled && !runtimeEncryptionPassphrase) {
      setManifestError(new Error("암호화 팀 동기화에는 공유 암호가 필요합니다"));
      return;
    }

    void activateTeam(
      createTeamManifest({
        name: teamName,
        currentUser: {
          userId: "local-user",
          displayName: "로컬 사용자",
          color: LOCAL_USER_COLOR
        },
        sync: {
          mode: "websocket",
          roomPrefix: "layo",
          relayUrl: relayUrl.trim()
        },
        encryption: encryptionEnabled ? createSharedKeyEncryptionConfig() : { mode: "none" }
      }),
      {
        relayToken: relayToken.trim() || undefined,
        memberToken: memberToken.trim() || undefined,
        encryptionPassphrase: encryptionEnabled ? runtimeEncryptionPassphrase : undefined
      }
    ).catch(setManifestError);
  };

  const exportCurrentTeam = () => {
    if (collabSession) {
      setManifestText(exportTeamManifest(collabSession.team));
      setManifestStatus(`${collabSession.team.name} 내보냄`);
    }
  };

  const importTeam = () => {
    if (!manifestText.trim()) {
      return;
    }

    try {
      const team = importTeamManifest(manifestText);
      void activateTeam(team, {
        encryptionPassphrase:
          team.encryption.mode === "shared-key" ? encryptionPassphrase.trim() : undefined
      }).catch(setManifestError);
    } catch (error) {
      setManifestError(error);
    }
  };

  const downloadCurrentTeam = () => {
    if (!collabSession) {
      return;
    }

    const download = createTeamManifestDownload(collabSession.team);
    const url = URL.createObjectURL(
      new Blob([download.contents], {
        type: download.mimeType
      })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setManifestStatus(`${download.filename} 다운로드됨`);
  };

  const uploadTeamManifest = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const team = await readTeamManifestFile(file);
      setManifestText(exportTeamManifest(team));
      await activateTeam(team, {
        encryptionPassphrase:
          team.encryption.mode === "shared-key" ? encryptionPassphrase.trim() : undefined
      });
    } catch (error) {
      setManifestError(error);
    }
  };

  const importTeamFromUrl = async () => {
    if (!manifestUrl.trim()) {
      return;
    }

    try {
      const team = await fetchTeamManifestFromUrl(manifestUrl.trim());
      setManifestText(exportTeamManifest(team));
      await activateTeam(team, {
        encryptionPassphrase:
          team.encryption.mode === "shared-key" ? encryptionPassphrase.trim() : undefined
      });
    } catch (error) {
      setManifestError(error);
    }
  };

  const finishResize = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    const activeResize = resizeSessionRef.current ?? resizeSession;
    if (!editor || !activeResize) {
      return;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const absolute = getNodeAbsolutePosition(editor.document, activeResize.nodeId);
    const node = findNodeById(editor.document, activeResize.nodeId);
    if (!pointer || !absolute || !node) {
      resizeSessionRef.current = null;
      setResizeSession(null);
      setStageCursor(event, "");
      return;
    }

    const stagePoint = documentPointFromStagePointer(pointer, editor.viewport);

    updateGeometry(
      activeResize.nodeId,
      resizePatchFromHandle(node, absolute, stagePoint, activeResize.handle)
    );
    resizeSessionRef.current = null;
    setResizeSession(null);
    setStageCursor(event, "");
  };

  const clearStageCursor = () => {
    const stageContainer = stageFrameRef.current?.querySelector<HTMLElement>(".konvajs-content");
    if (stageContainer) {
      stageContainer.style.cursor = "";
    }
  };

  const updateCursorFromPointer = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (!editor || !collabSessionRef.current) {
      return;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }

    const cursor = {
      x: Math.round((pointer.x - editor.viewport.x) / editor.viewport.scale),
      y: Math.round((pointer.y - editor.viewport.y) / editor.viewport.scale),
      space: "document" as const
    };
    const nowMs = performance.now();
    if (!shouldPublishCursor(publishedCursorRef.current, cursor, nowMs)) {
      return;
    }

    publishedCursorRef.current = { point: cursor, publishedAtMs: nowMs };
    publishEditorPresence(editor, { cursor });
  };

  const updateMeasurementTargetFromPointer = (
    event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>
  ) => {
    if (!editor || !editor.selection.nodeIds.length || areaSelectionRef.current || panSessionRef.current) {
      setMeasurementTargetNodeId(null);
      return;
    }

    const documentPoint = documentPointFromKonvaEvent(event, editor.viewport, stageFrameRef.current);
    if (!documentPoint) {
      setMeasurementTargetNodeId(null);
      return;
    }

    const targetNodeId = getTopmostNodeIdAtPoint(
      editor.document,
      documentPoint,
      new Set(editor.selection.nodeIds)
    );
    setMeasurementTargetNodeId((current) => (current === targetNodeId ? current : targetNodeId));
  };

  const clearCursorPresence = () => {
    const activeSession = collabSessionRef.current;
    clearStageCursor();
    setMeasurementTargetNodeId(null);
    if (!activeSession) {
      return;
    }

    activeSession.updatePresence({ cursor: null, updatedAtMs: Date.now() });
    setPresenceClock(Date.now());
    publishPresenceSnapshot(activeSession);
    publishedCursorRef.current = null;
  };

  const startResizeFromPointer = (event: KonvaEventObject<MouseEvent>) => {
    if (
      !editor ||
      !selectedNode ||
      isNodeLocked(selectedNode) ||
      !isNodeVisible(selectedNode) ||
      editor.selection.nodeIds.length !== 1
    ) {
      return false;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const absolute = getNodeAbsolutePosition(editor.document, selectedNode.id);
    if (!pointer || !absolute) {
      return false;
    }

    const stagePoint = documentPointFromStagePointer(pointer, editor.viewport);
    const handle = resizeHandleAtPoint(
      { x: absolute.x, y: absolute.y, width: selectedNode.size.width, height: selectedNode.size.height },
      stagePoint
    );

    if (handle) {
      event.cancelBubble = true;
      const nextResizeSession = { nodeId: selectedNode.id, handle };
      resizeSessionRef.current = nextResizeSession;
      setResizeSession(nextResizeSession);
      return true;
    }

    return false;
  };

  const updateResizeCursorFromPointer = (event: KonvaEventObject<MouseEvent>) => {
    if (
      !editor ||
      !selectedNode ||
      isNodeLocked(selectedNode) ||
      !isNodeVisible(selectedNode) ||
      editor.selection.nodeIds.length !== 1 ||
      areaSelectionRef.current ||
      panSessionRef.current ||
      isSpacePanningRef.current
    ) {
      setStageCursor(event, "");
      return false;
    }

    const activeResize = resizeSessionRef.current;
    if (activeResize) {
      setStageCursor(event, resizeCursorForHandle(activeResize.handle));
      return true;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const absolute = getNodeAbsolutePosition(editor.document, selectedNode.id);
    if (!pointer || !absolute) {
      setStageCursor(event, "");
      return false;
    }

    const stagePoint = documentPointFromStagePointer(pointer, editor.viewport);
    const handle = resizeHandleAtPoint(
      { x: absolute.x, y: absolute.y, width: selectedNode.size.width, height: selectedNode.size.height },
      stagePoint
    );

    if (!handle) {
      setStageCursor(event, "");
      return false;
    }

    setStageCursor(event, resizeCursorForHandle(handle));
    return true;
  };

  const startAreaSelectionFromPointer = (event: KonvaEventObject<MouseEvent>) => {
    if (!editor || event.evt.button !== 0) {
      return false;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return false;
    }

    event.evt.preventDefault();
    const documentPoint = documentPointFromStagePointer(pointer, editor.viewport);
    const nextAreaSelection: AreaSelectionSession = {
      start: documentPoint,
      current: documentPoint,
      mode: event.evt.shiftKey ? "add" : "replace",
      hasDragged: false
    };
    areaSelectionRef.current = nextAreaSelection;
    setAreaSelection(nextAreaSelection);
    return true;
  };

  const continueAreaSelection = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    const activeAreaSelection = areaSelectionRef.current;
    if (!editor || !activeAreaSelection) {
      return false;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return false;
    }

    event.evt.preventDefault();
    const documentPoint = documentPointFromStagePointer(pointer, editor.viewport);
    const distance = Math.hypot(
      documentPoint.x - activeAreaSelection.start.x,
      documentPoint.y - activeAreaSelection.start.y
    );
    const nextAreaSelection = {
      ...activeAreaSelection,
      current: documentPoint,
      hasDragged: activeAreaSelection.hasDragged || distance >= AREA_SELECTION_DRAG_THRESHOLD
    };
    areaSelectionRef.current = nextAreaSelection;
    setAreaSelection(nextAreaSelection);
    return true;
  };

  const finishAreaSelection = () => {
    const activeAreaSelection = areaSelectionRef.current;
    if (!activeAreaSelection) {
      return false;
    }

    areaSelectionRef.current = null;
    setAreaSelection(null);

    if (activeAreaSelection.hasDragged) {
      const bounds = selectionBoundsFromPoints(activeAreaSelection.start, activeAreaSelection.current);
      setEditor((current) => {
        if (!current) {
          return current;
        }

        const nextState = selectNodesInBounds(current, bounds, activeAreaSelection.mode);
        publishEditorPresence(nextState, { activeTool: "select" });
        return nextState;
      });
      return true;
    }

    if (activeAreaSelection.mode === "replace") {
      clearSelectionFromInteraction();
    }

    return true;
  };

  const startCanvasPan = (event: MouseEvent | TouchEvent) => {
    if (!isSpacePanningRef.current || !editor) {
      return false;
    }

    const point = pointerClientPoint(event);
    if (!point) {
      return false;
    }

    event.preventDefault();
    clearStageCursor();
    panSessionRef.current = {
      clientX: point.x,
      clientY: point.y,
      viewport: editor.viewport
    };
    return true;
  };

  const continueCanvasPan = (event: MouseEvent | TouchEvent) => {
    const activePan = panSessionRef.current;
    if (!activePan) {
      return false;
    }

    const point = pointerClientPoint(event);
    if (!point) {
      return false;
    }

    event.preventDefault();
    const nextViewport = {
      x: activePan.viewport.x + point.x - activePan.clientX,
      y: activePan.viewport.y + point.y - activePan.clientY
    };
    updateViewportFromInteraction((state) => setViewport(state, nextViewport));
    return true;
  };

  const endCanvasPan = () => {
    if (!panSessionRef.current) {
      return false;
    }

    panSessionRef.current = null;
    return true;
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableKeyboardTarget(event.target) || isEditableKeyboardTarget(document.activeElement)) {
        return;
      }

      const imageFiles = event.clipboardData ? imageFilesFromList(event.clipboardData.files) : [];
      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      void insertImageFiles(imageFiles, null);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [editor, currentProject, selectedNode, nodes.length, stageSize.height, stageSize.width]);

  return (
    <main className={`app-shell${isSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <nav className="editor-rail" data-testid="editor-rail" aria-label="편집기 탐색">
        <div className="editor-rail-brand" aria-label="Layo">
          <img
            src="/assets/brand/layo-logo-mark.png"
            alt=""
            data-testid="layo-brand-logo"
            aria-hidden="true"
          />
        </div>
        <div className="editor-rail-group">
          <button
            type="button"
            aria-label="파일"
            aria-pressed={leftPanelMode === "files"}
            title="파일"
            onClick={() => setLeftPanelMode("files")}
          >
            ▦
          </button>
          <button
            type="button"
            aria-label="에셋"
            aria-pressed={leftPanelMode === "assets"}
            title="에셋"
            onClick={() => setLeftPanelMode("assets")}
          >
            ◇
          </button>
          <button
            type="button"
            aria-label="레이어"
            aria-pressed={leftPanelMode === "layers"}
            title="레이어"
            onClick={() => setLeftPanelMode("layers")}
          >
            ☰
          </button>
          <button
            type="button"
            aria-label="팀"
            aria-pressed={leftPanelMode === "team"}
            title="팀"
            onClick={() => setLeftPanelMode("team")}
          >
            ◎
          </button>
        </div>
        <div className="editor-rail-group">
          <button type="button" aria-label="도움말" aria-pressed="false" title="도움말">
            ?
          </button>
        </div>
      </nav>
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={isSidebarCollapsed ? "왼쪽 사이드바 펼치기" : "왼쪽 사이드바 접기"}
          aria-expanded={!isSidebarCollapsed}
          onClick={() => setIsSidebarCollapsed((current) => !current)}
        >
          {isSidebarCollapsed ? "☰" : "‹"}
        </button>
        {isSidebarCollapsed ? null : (
          <>
            <h1>{leftPanelTitle}</h1>
            {showProjectPanel ? (
              <section className="project-panel" data-testid="project-panel" aria-label="프로젝트">
                <label>
                  프로젝트
                  <select
                    data-testid="project-switcher"
                    value={currentProject?.projectId ?? ""}
                    onChange={(event) => void openProject(event.currentTarget.value)}
                  >
                    {visibleProjects.map((project) => (
                      <option key={project.projectId} value={project.projectId}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  검색
                  <input
                    data-testid="project-search"
                    value={projectSearch}
                    placeholder="프로젝트 또는 문서 이름"
                    onChange={(event) => setProjectSearch(event.currentTarget.value)}
                  />
                </label>
                <div className="project-status" data-testid="project-filter-summary">
                  {projectFilterSummary}
                </div>
                <label>
                  이름
                  <input
                    data-testid="project-name"
                    value={projectNameDraft}
                    onChange={(event) => setProjectNameDraft(event.currentTarget.value)}
                  />
                </label>
                <div className="project-actions">
                  <button type="button" onClick={createNewProject}>
                    새 프로젝트 만들기
                  </button>
                  <button type="button" onClick={saveProjectName} disabled={!currentProject}>
                    이름 저장
                  </button>
                  <button type="button" onClick={duplicateCurrentProject} disabled={!currentProject}>
                    현재 프로젝트 복제
                  </button>
                  <button type="button" onClick={deleteCurrentProject} disabled={!currentProject || projects.length <= 1}>
                    현재 프로젝트 삭제
                  </button>
                  <button type="button" onClick={linkProjectToCurrentTeam} disabled={!currentProject || !collabSession}>
                    현재 팀과 공유
                  </button>
                </div>
                <div className="project-status" data-testid="project-status">
                  {projectStatus}
                </div>
                <div className="project-status" data-testid="project-sharing-status">
                  {topFileShareLabel === "비공개" ? "비공개 프로젝트" : topFileShareLabel}
                </div>
                <section className="file-archive-panel" data-testid="file-archive-panel" aria-label="파일 아카이브">
                  <div className="file-archive-heading">
                    <strong>파일 아카이브</strong>
                  </div>
                  <div className="project-actions file-archive-actions">
                    <button type="button" onClick={() => void exportCurrentFileArchive()} disabled={!currentProject}>
                      현재 파일 아카이브 내보내기
                    </button>
                    <button type="button" onClick={() => fileArchiveInputRef.current?.click()}>
                      아카이브 파일 선택
                    </button>
                  </div>
                  <input
                    ref={fileArchiveInputRef}
                    className="visually-hidden"
                    data-testid="file-archive-upload"
                    type="file"
                    accept=".layo.zip,.zip,application/zip,application/vnd.layo.file-archive+zip"
                    onChange={(event) => void reviewSelectedFileArchive(event)}
                  />
                  <div className="project-status" data-testid="file-archive-status">
                    {fileArchiveStatus}
                  </div>
                  {fileArchiveReview ? (
                    <div className="file-archive-review" data-testid="file-archive-review">
                      <div className="file-archive-review-header">
                        <span>
                          <strong>가져오기 전 검토</strong>
                          <span>
                            {fileArchiveReview.review.suggestedName} · {fileArchiveReview.sourceFileName}
                          </span>
                        </span>
                        <button type="button" onClick={cancelFileArchiveImport}>
                          검토 취소
                        </button>
                      </div>
                      <div className="file-archive-review-body">
                        <strong>{fileArchiveReview.review.originalName}</strong>
                        <span>
                          페이지 {fileArchiveReview.review.pageCount}개 · 객체 {fileArchiveReview.review.nodeCount}개 ·
                          에셋 {fileArchiveReview.review.assetCount}개
                        </span>
                        <span>원본 파일 {fileArchiveReview.review.originalFileId}</span>
                      </div>
                      <label>
                        가져올 이름
                        <input
                          data-testid="file-archive-import-name"
                          value={fileArchiveImportName}
                          onChange={(event) => setFileArchiveImportName(event.currentTarget.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="file-archive-import"
                        onClick={() => void importReviewedFileArchive()}
                      >
                        검토한 아카이브 가져오기
                      </button>
                    </div>
                  ) : null}
                </section>
                <section
                  className="file-archive-panel"
                  data-testid="library-archive-panel"
                  aria-label="라이브러리 아카이브"
                >
                  <div className="file-archive-heading">
                    <strong>라이브러리 아카이브</strong>
                  </div>
                  <div className="project-actions file-archive-actions">
                    <button type="button" onClick={() => void exportCurrentLibraryArchive()} disabled={!currentProject}>
                      현재 파일 라이브러리 내보내기
                    </button>
                    <button type="button" onClick={() => libraryArchiveInputRef.current?.click()}>
                      라이브러리 가져오기
                    </button>
                  </div>
                  <input
                    ref={libraryArchiveInputRef}
                    className="visually-hidden"
                    data-testid="library-archive-upload"
                    type="file"
                    accept=".layo-library.zip,.zip,application/zip,application/vnd.layo.library-archive+zip"
                    onChange={(event) => void reviewSelectedLibraryArchive(event)}
                  />
                  <div className="project-status" data-testid="library-archive-status">
                    {libraryArchiveStatus}
                  </div>
                  {libraryArchiveReview ? (
                    <div className="file-archive-review" data-testid="library-archive-review">
                      <div className="file-archive-review-header">
                        <span>
                          <strong>가져오기 전 라이브러리 검토</strong>
                          <span>
                            {libraryArchiveReview.review.originalName} · {libraryArchiveReview.sourceFileName}
                          </span>
                        </span>
                        <button type="button" onClick={cancelLibraryArchiveImport}>
                          검토 취소
                        </button>
                      </div>
                      <div className="file-archive-review-body">
                        <strong>{libraryArchiveReview.review.originalName}</strong>
                        <span>
                          컴포넌트 {libraryArchiveReview.review.componentCount}개 · 토큰{" "}
                          {libraryArchiveReview.review.tokenCount}개 · 에셋 {libraryArchiveReview.review.assetCount}개
                        </span>
                        <span>원본 파일 {libraryArchiveReview.review.originalFileId}</span>
                        {libraryArchiveReview.review.components.map((component) => (
                          <span key={component.originalComponentId}>
                            {component.name} · 객체 {component.nodeCount}개
                            {component.conflict ? " · 충돌" : ""}
                          </span>
                        ))}
                        {libraryArchiveReview.review.tokens.map((token) => (
                          <span key={token.originalTokenId}>
                            {token.name} · {token.type}
                            {token.conflict ? " · 충돌" : ""}
                          </span>
                        ))}
                      </div>
                      <label>
                        가져올 ID 접두어
                        <input
                          data-testid="library-archive-prefix"
                          value={libraryArchivePrefix}
                          onChange={(event) => setLibraryArchivePrefix(event.currentTarget.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="file-archive-import"
                        onClick={() => void importReviewedLibraryArchive()}
                      >
                        검토한 라이브러리 가져오기
                      </button>
                    </div>
                  ) : null}
                </section>
                <section
                  className="file-archive-panel"
                  data-testid="project-archive-panel"
                  aria-label="프로젝트 아카이브"
                >
                  <div className="file-archive-heading">
                    <strong>프로젝트 아카이브</strong>
                  </div>
                  <div className="project-actions file-archive-actions">
                    <button type="button" onClick={() => void exportCurrentProjectArchive()} disabled={!currentProject}>
                      현재 프로젝트 아카이브 내보내기
                    </button>
                    <button type="button" onClick={() => projectArchiveInputRef.current?.click()}>
                      프로젝트 아카이브 가져오기
                    </button>
                  </div>
                  <input
                    ref={projectArchiveInputRef}
                    className="visually-hidden"
                    data-testid="project-archive-upload"
                    type="file"
                    accept=".layo-project.zip,.zip,application/zip,application/vnd.layo.project-archive+zip"
                    onChange={(event) => void reviewSelectedProjectArchive(event)}
                  />
                  <div className="project-status" data-testid="project-archive-status">
                    {projectArchiveStatus}
                  </div>
                  {projectArchiveReview ? (
                    <div className="file-archive-review" data-testid="project-archive-review">
                      <div className="file-archive-review-header">
                        <span>
                          <strong>가져오기 전 프로젝트 검토</strong>
                          <span>
                            {projectArchiveReview.review.suggestedName} · {projectArchiveReview.sourceFileName}
                          </span>
                        </span>
                        <button type="button" onClick={cancelProjectArchiveImport}>
                          검토 취소
                        </button>
                      </div>
                      <div className="file-archive-review-body">
                        <strong>{projectArchiveReview.review.originalName}</strong>
                        <span>
                          문서 {projectArchiveReview.review.documentCount}개 · 에셋{" "}
                          {projectArchiveReview.review.assetCount}개
                        </span>
                        <span>원본 프로젝트 {projectArchiveReview.review.originalProjectId}</span>
                        {projectArchiveReview.review.documents.map((document) => (
                          <span key={document.originalFileId}>
                            {document.originalName} · 페이지 {document.pageCount}개 · 객체 {document.nodeCount}개
                          </span>
                        ))}
                      </div>
                      <label>
                        가져올 프로젝트 이름
                        <input
                          data-testid="project-archive-import-name"
                          value={projectArchiveImportName}
                          onChange={(event) => setProjectArchiveImportName(event.currentTarget.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="file-archive-import"
                        onClick={() => void importReviewedProjectArchive()}
                      >
                        검토한 프로젝트 아카이브 가져오기
                      </button>
                    </div>
                  ) : null}
                </section>
                <section
                  className="comment-notification-summary"
                  data-testid="comment-notification-summary"
                  aria-label="코멘트 알림"
                >
                  <div className="comment-notification-heading">
                    <strong>코멘트 알림</strong>
                    <div className="comment-notification-pills">
                      <span
                        className={
                          commentNotificationSummary?.totalUnread
                            ? "comment-notification-pill comment-notification-pill-unread"
                            : "comment-notification-pill"
                        }
                      >
                        {commentNotificationSummary
                          ? commentNotificationSummary.totalUnread > 0
                            ? `읽지 않은 코멘트 ${commentNotificationSummary.totalUnread}개`
                            : "읽지 않은 코멘트 없음"
                          : "코멘트 알림 대기 중"}
                      </span>
                      {commentNotificationSummary ? (
                        <span
                          className={
                            commentNotificationSummary.totalMentions > 0
                              ? "comment-notification-pill comment-notification-pill-mention"
                              : "comment-notification-pill"
                          }
                        >
                          {commentNotificationSummary.totalMentions > 0
                            ? `나를 멘션 ${commentNotificationSummary.totalMentions}개`
                            : "나를 멘션 없음"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ul className="comment-notification-list">
                    {currentProjectCommentNotification?.files.length ? (
                      currentProjectCommentNotification.files.map((file) => (
                        <li className="comment-notification-row" key={file.fileId}>
                          <span>{file.name}</span>
                          <strong>
                            {file.unreadCount}개
                            {file.mentionCount > 0 ? ` · 멘션 ${file.mentionCount}개` : ""}
                          </strong>
                        </li>
                      ))
                    ) : (
                      <li className="comment-notification-empty">현재 프로젝트 알림 없음</li>
                    )}
                  </ul>
                  <button
                    type="button"
                    data-testid="mark-file-comments-read"
                    onClick={() => void markCurrentFileCommentsRead()}
                    disabled={!currentProject || currentFileUnreadCommentCount === 0}
                  >
                    현재 파일 읽음
                  </button>
                </section>
                <section
                  className="comment-activity-feed"
                  data-testid="comment-activity-feed"
                  aria-label="최근 코멘트 활동"
                >
                  <div className="comment-activity-heading">
                    <strong>최근 코멘트 활동</strong>
                  </div>
                  <ul className="comment-activity-list">
                    {currentProjectCommentActivity.length > 0 ? (
                      currentProjectCommentActivity.map((event) => (
                        <li className="comment-activity-row" key={event.eventId}>
                          <span className="comment-activity-meta">
                            {formatCommentActivityType(event.type)} · {event.fileName}
                          </span>
                          <strong>{event.actorName}</strong>
                          <span className="comment-activity-body">{event.body}</span>
                        </li>
                      ))
                    ) : (
                      <li className="comment-activity-empty">최근 코멘트 활동 없음</li>
                    )}
                  </ul>
                </section>
                <section className="file-version-panel" data-testid="file-version-panel" aria-label="버전 기록">
                  <div className="file-version-heading">
                    <strong>버전 기록</strong>
                  </div>
                  <label>
                    메시지
                    <input
                      data-testid="file-version-message"
                      value={fileVersionMessage}
                      placeholder="예: 검토 전"
                      onChange={(event) => setFileVersionMessage(event.currentTarget.value)}
                    />
                  </label>
                  <div className="project-actions file-version-actions">
                    <button type="button" onClick={saveCurrentFileVersion} disabled={!currentProject}>
                      현재 버전 저장
                    </button>
                    <button
                      type="button"
                      onClick={() => currentProject && void refreshFileVersions(currentProject.currentDocumentId)}
                      disabled={!currentProject}
                    >
                      새로고침
                    </button>
                  </div>
                  <label>
                    최근 보관
                    <input
                      data-testid="file-version-retention-keep"
                      type="number"
                      min="0"
                      step="1"
                      value={fileVersionRetentionKeep}
                      onChange={(event) => setFileVersionRetentionKeep(event.currentTarget.value)}
                    />
                  </label>
                  <div className="project-actions file-version-actions">
                    <button type="button" onClick={pruneCurrentFileVersions} disabled={!currentProject}>
                      오래된 버전 정리
                    </button>
                  </div>
                  <div className="project-status" data-testid="file-version-status">
                    {fileVersionStatus}
                  </div>
                  {fileVersionPreview ? (
                    <div className="file-version-preview" data-testid="file-version-preview">
                      <div className="file-version-preview-header">
                        <span>
                          <strong>{fileVersionPreview.version.message}</strong>
                          <span>
                            {formatFileVersionCreatedAt(fileVersionPreview.version.createdAt)} ·{" "}
                            {formatFileVersionSource(fileVersionPreview.version.source)}
                          </span>
                        </span>
                        <button type="button" onClick={() => setFileVersionPreview(null)}>
                          미리보기 닫기
                        </button>
                      </div>
                      <div className="file-version-preview-body">
                        <strong>현재 파일과 비교</strong>
                        <span>
                          생성 {fileVersionPreview.summary.createdNodeIds.length} · 변경{" "}
                          {fileVersionPreview.summary.updatedNodeIds.length} · 삭제{" "}
                          {fileVersionPreview.summary.removedNodeIds.length}
                        </span>
                        <span>
                          {fileVersionPreview.summary.changedNodeIds.length > 0
                            ? fileVersionPreview.summary.changedNodeIds.join(", ")
                            : "변경된 객체 없음"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="file-version-preview-restore"
                        onClick={() => void restoreCurrentFileVersion(fileVersionPreview.version)}
                      >
                        이 버전 복원
                      </button>
                    </div>
                  ) : null}
                  <ul className="file-version-list" data-testid="file-version-list">
                    {fileVersions.length === 0 ? (
                      <li className="file-version-empty">저장된 버전 없음</li>
                    ) : (
                      fileVersions.map((version) => (
                        <li className="file-version-row" key={version.versionId}>
                          <span className="file-version-summary">
                            <strong>{version.message}</strong>
                            {version.pinned ? <span className="file-version-pin-badge">고정됨</span> : null}
                            <span>
                              {formatFileVersionCreatedAt(version.createdAt)} · {version.nodeCount}개 객체 ·{" "}
                              {formatFileVersionSource(version.source)}
                            </span>
                          </span>
                          <span className="file-version-row-actions">
                            <button
                              type="button"
                              aria-label={`${version.message} ${version.pinned ? "고정 해제" : "고정"}`}
                              onClick={() => void toggleFileVersionPinned(version)}
                            >
                              {version.pinned ? "고정 해제" : "고정"}
                            </button>
                            <button
                              type="button"
                              aria-label={`${version.message} 삭제`}
                              onClick={() => void deleteCurrentFileVersion(version)}
                            >
                              삭제
                            </button>
                            <button
                              type="button"
                              aria-label={`${version.message} 미리보기`}
                              onClick={() => void previewCurrentFileVersion(version)}
                            >
                              미리보기
                            </button>
                            <button
                              type="button"
                              aria-label={`${version.message} 복원`}
                              onClick={() => void restoreCurrentFileVersion(version)}
                            >
                              복원
                            </button>
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              </section>
            ) : null}
            {showAssetPanel ? (
              <section className="asset-panel" data-testid="asset-panel" aria-label="에셋">
                <label>
                  <span className="visually-hidden">라이브러리 검색</span>
                  <input data-testid="asset-search" placeholder="모든 라이브러리 검색" />
                </label>
                <div className="asset-empty-card">
                  <span className="asset-empty-icon" aria-hidden="true">
                    ◧
                  </span>
                  <strong>아직 라이브러리가 없습니다.</strong>
                  <span>팀에서 생성한 에셋을 찾아 이 파일에 추가해 사용할 수 있습니다.</span>
                  <button type="button">팀 라이브러리 탐색하기</button>
                </div>
                <p className="asset-kit-intro">또는 사전 제작된 UI 키트로 시작하세요</p>
                <div className="asset-library-list">
                  {ASSET_LIBRARY_KITS.map((kit) => (
                    <button
                      type="button"
                      className="asset-library-card"
                      data-testid="asset-library-card"
                      key={kit.name}
                      aria-label={`${kit.name} 라이브러리`}
                    >
                      <span
                        className={`asset-library-thumbnail asset-library-thumbnail-${kit.preview}`}
                        data-testid="asset-library-thumbnail"
                        aria-label={`${kit.name} 라이브러리 미리보기`}
                      >
                        <span className="asset-thumbnail-frame">
                          <span className="asset-thumbnail-panel asset-thumbnail-panel-primary" />
                          <span className="asset-thumbnail-panel asset-thumbnail-panel-secondary" />
                          <span className="asset-thumbnail-panel asset-thumbnail-panel-tertiary" />
                        </span>
                        <span className="asset-thumbnail-swatches" aria-hidden="true">
                          {kit.swatches.map((swatch) => (
                            <span
                              key={`${kit.name}-${swatch}`}
                              className={`asset-library-swatch asset-library-swatch-${swatch}`}
                            />
                          ))}
                        </span>
                      </span>
                      <span className="asset-library-copy">
                        <strong>{kit.name}</strong>
                        <span className="asset-library-meta">
                          <span>{kit.count}</span>
                          <span>{kit.templateCount}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {showLayerPanel ? (
              <section data-testid="layer-panel" aria-label="레이어">
                <div className="panel-header">
                  <span className="panel-eyebrow">레이어</span>
                  <p>{editor ? editor.document.name : "로컬 서버를 시작하면 프로젝트를 불러옵니다."}</p>
                </div>
                <div className="layer-list">
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      className={editor?.selection.nodeIds.includes(node.id) ? "is-selected" : undefined}
                      onClick={(event) => selectNode(node.id, event.shiftKey)}
                    >
                      {nodeLayerLabel(node)}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {showTeamPanel ? (
            <section className="team-panel" data-testid="team-panel" aria-label="팀 협업">
              <h2>팀</h2>
              <div className="team-mode-tabs" role="tablist" aria-label="팀 협업 모드">
                <button
                  type="button"
                  role="tab"
                  aria-selected={teamPanelMode === "local"}
                  onClick={() => setTeamPanelMode("local")}
                >
                  로컬 작업
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={teamPanelMode === "relay"}
                  onClick={() => setTeamPanelMode("relay")}
                >
                  실시간 협업
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={teamPanelMode === "manifest"}
                  onClick={() => setTeamPanelMode("manifest")}
                >
                  팀 설정
                </button>
              </div>
              <div className="team-fields" role="tabpanel">
                <label>
                  이름
                  <input
                    data-testid="team-name"
                    value={teamName}
                    onChange={(event) => setTeamName(event.currentTarget.value)}
                  />
                </label>
                {teamPanelMode === "relay" ? (
                  <>
                    <label>
                      협업 서버 주소
                      <input
                        data-testid="relay-url"
                        value={relayUrl}
                        placeholder="ws://127.0.0.1:4327"
                        onChange={(event) => setRelayUrl(event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      서버 접속 토큰
                      <input
                        data-testid="relay-token"
                        value={relayToken}
                        onChange={(event) => setRelayToken(event.currentTarget.value)}
                      />
                    </label>
                    <label>
                      멤버 인증 토큰
                      <input
                        data-testid="member-token"
                        value={memberToken}
                        onChange={(event) => setMemberToken(event.currentTarget.value)}
                      />
                    </label>
                    <label className="team-toggle-field">
                      종단간 암호화
                      <input
                        data-testid="team-e2ee-toggle"
                        type="checkbox"
                        checked={encryptionEnabled}
                        onChange={(event) => setEncryptionEnabled(event.currentTarget.checked)}
                      />
                    </label>
                    <label>
                      공유 암호
                      <input
                        data-testid="team-e2ee-passphrase"
                        type="password"
                        value={encryptionPassphrase}
                        onChange={(event) => setEncryptionPassphrase(event.currentTarget.value)}
                      />
                    </label>
                  </>
                ) : null}
                {teamPanelMode === "manifest" ? (
                  <label>
                    팀 설정 URL
                    <input
                      data-testid="team-manifest-url"
                      value={manifestUrl}
                      placeholder="https://raw.githubusercontent.com/..."
                      onChange={(event) => setManifestUrl(event.currentTarget.value)}
                    />
                  </label>
                ) : null}
              </div>
              <div className="team-actions">
                {teamPanelMode === "local" ? (
                  <button type="button" onClick={createLocalTeam} disabled={!editor}>
                    로컬 팀 만들기
                  </button>
                ) : null}
                {teamPanelMode === "relay" ? (
                  <button type="button" onClick={createRelayTeam} disabled={!editor || !relayUrl.trim()}>
                    협업 팀 만들기
                  </button>
                ) : null}
                {teamPanelMode === "manifest" ? (
                  <>
                    <button type="button" onClick={exportCurrentTeam} disabled={!collabSession}>
                      설정 내보내기
                    </button>
                    <button type="button" onClick={importTeam} disabled={!editor || !manifestText.trim()}>
                      설정 가져오기
                    </button>
                    <button type="button" onClick={downloadCurrentTeam} disabled={!collabSession}>
                      파일로 저장
                    </button>
                    <button type="button" onClick={() => manifestFileInputRef.current?.click()} disabled={!editor}>
                      파일 불러오기
                    </button>
                    <button type="button" onClick={importTeamFromUrl} disabled={!editor || !manifestUrl.trim()}>
                      URL에서 불러오기
                    </button>
                  </>
                ) : null}
              </div>
              <input
                ref={manifestFileInputRef}
                data-testid="team-manifest-file"
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={uploadTeamManifest}
              />
              <div className="team-status" data-testid="team-status">
                {collabSession ? `${collabSession.team.name} · ${collaborationStatusLabel(collabStatus)}` : "팀 없음"}
              </div>
              <div className="team-status" data-testid="team-manifest-status" aria-live="polite">
                {manifestStatus || "팀 설정 대기 중"}
              </div>
              <div className="presence-list" data-testid="presence-list">
                {presence.map((member, index) => (
                  <span key={`${member.userId}-${index}`} className="presence-member">
                    <span style={{ backgroundColor: member.color }} />
                    {member.displayName}
                    {member.selectedNodeId ? ` · ${member.selectedNodeId}` : ""}
                  </span>
                ))}
              </div>
              {teamPanelMode === "manifest" ? (
                <textarea
                  data-testid="team-manifest"
                  value={manifestText}
                  onChange={(event) => setManifestText(event.currentTarget.value)}
                />
              ) : null}
            </section>
            ) : null}
          </>
        )}
      </aside>
      <section className="editor-workspace">
        <div className="top-file-bar" data-testid="top-file-bar" aria-label="파일 바">
          <div className="top-file-tabs">
            <div className="top-file-tab" data-testid="top-file-project">
              <span>{currentProjectName}</span>
            </div>
            <div className="top-file-tab" data-testid="top-file-document">
              <span>{currentDocumentName}</span>
            </div>
          </div>
          <button
            type="button"
            className="top-file-share"
            data-testid="top-file-share"
            disabled={!currentProject || !collabSession}
            onClick={linkProjectToCurrentTeam}
          >
            <span>{topFileShareLabel}</span>
          </button>
        </div>
        <div className="canvas-ruler-corner" aria-hidden="true" />
        <div className="canvas-ruler canvas-ruler-horizontal" data-testid="canvas-ruler-horizontal" aria-hidden="true">
          {RULER_MARKS.map((mark) => (
            <span key={`x-${mark}`} style={{ left: mark }}>
              {mark}
            </span>
          ))}
        </div>
        <div className="canvas-ruler canvas-ruler-vertical" data-testid="canvas-ruler-vertical" aria-hidden="true">
          {RULER_MARKS.map((mark) => (
            <span key={`y-${mark}`} style={{ top: mark }}>
              {mark}
            </span>
          ))}
        </div>
        <div className="toolbar" data-testid="floating-toolbar" aria-label="에디터 도구 모음">
          <button type="button" aria-label="사각형 만들기" onClick={() => createNode("rectangle")}>
            ▭
          </button>
          <button type="button" aria-label="텍스트 만들기" onClick={() => createNode("text")}>
            T
          </button>
          <button
            type="button"
            aria-label="컴포넌트 만들기"
            disabled={!selectedNode || isNodeLocked(selectedNode) || selectedNode.kind === "component_instance"}
            onClick={createComponent}
          >
            <span className="toolbar-icon toolbar-icon-component" aria-hidden="true">
              ◈
            </span>
          </button>
          <button
            type="button"
            aria-label="인스턴스 만들기"
            disabled={!selectedComponent}
            onClick={createInstance}
          >
            <span className="toolbar-icon toolbar-icon-instance" aria-hidden="true">
              ◇
            </span>
          </button>
          <button
            type="button"
            aria-label="인스턴스 분리"
            disabled={!selectedNode?.component_instance || isNodeLocked(selectedNode)}
            onClick={detachInstance}
          >
            <span className="toolbar-icon toolbar-icon-detach" aria-hidden="true">
              ◇
            </span>
          </button>
          <button
            type="button"
            aria-label="왼쪽으로 이동"
            onClick={() => updateViewportFromInteraction((current) => panViewport(current, { x: -40, y: 0 }))}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="오른쪽으로 이동"
            onClick={() => updateViewportFromInteraction((current) => panViewport(current, { x: 40, y: 0 }))}
          >
            →
          </button>
          <button
            type="button"
            aria-label="축소"
            onClick={() => updateViewportFromInteraction((current) => zoomViewport(current, -ZOOM_STEP))}
          >
            −
          </button>
          <span className="zoom-readout">{Math.round((editor?.viewport.scale ?? 1) * 100)}%</span>
          <button
            type="button"
            aria-label="확대"
            onClick={() => updateViewportFromInteraction((current) => zoomViewport(current, ZOOM_STEP))}
          >
            +
          </button>
        </div>
        <div className="canvas-area" data-testid="canvas-area">
          <div
            ref={stageFrameRef}
            className={`stage-frame${isSpacePanning ? " is-panning" : ""}`}
            data-testid="stage-frame"
            onWheel={handleCanvasWheel}
            onDragOver={handleImageDragOver}
            onDrop={handleImageDrop}
            onMouseLeave={clearCursorPresence}
          >
            <Stage
              ref={konvaStageRef}
              width={stageSize.width}
              height={stageSize.height}
              scaleX={editor?.viewport.scale ?? 1}
              scaleY={editor?.viewport.scale ?? 1}
              x={editor?.viewport.x ?? 0}
              y={editor?.viewport.y ?? 0}
              onMouseDown={(event) => {
                if (startCanvasPan(event.evt)) {
                  return;
                }

                if (startResizeFromPointer(event)) {
                  return;
                }

                if (event.target === event.target.getStage()) {
                  startAreaSelectionFromPointer(event);
                }
              }}
              onTouchStart={(event) => {
                if (startCanvasPan(event.evt)) {
                  return;
                }
              }}
              onContextMenu={openObjectContextMenuFromPointer}
              onMouseMove={(event) => {
                if (continueCanvasPan(event.evt)) {
                  return;
                }

                if (continueAreaSelection(event)) {
                  return;
                }

                const isResizeHandleHover = updateResizeCursorFromPointer(event);
                if (isResizeHandleHover) {
                  setMeasurementTargetNodeId(null);
                } else {
                  updateMeasurementTargetFromPointer(event);
                }
                updateCursorFromPointer(event);
              }}
              onTouchMove={(event) => {
                if (continueCanvasPan(event.evt)) {
                  return;
                }

                updateMeasurementTargetFromPointer(event);
                updateCursorFromPointer(event);
              }}
              onMouseUp={(event) => {
                if (endCanvasPan()) {
                  return;
                }

                if (finishAreaSelection()) {
                  return;
                }

                finishResize(event);
              }}
              onTouchEnd={(event) => {
                if (endCanvasPan()) {
                  return;
                }

                finishResize(event);
              }}
            >
              <Layer>
                {editor?.document.pages[0]?.children.map((node) =>
                  renderNode({
                    node,
                    selectedNodeId: editor.selection.nodeId,
                    selectedNodeIds: editor.selection.nodeIds,
                    isCanvasPanning: isSpacePanning,
                    dragPreview,
                    onSelect: selectNode,
                    onGeometryChange: updateGeometry,
                    onResizeStart: (nodeId, handle) => {
                      const nextResizeSession = { nodeId, handle };
                      resizeSessionRef.current = nextResizeSession;
                      setResizeSession(nextResizeSession);
                    },
                    onTextEditStart: startInlineTextEdit,
                    onDragStart: startNodeDrag,
                    onDragMove: updateNodeDragPreview,
                    onDragEnd: finishNodeDrag
                  })
                )}
              </Layer>
            </Stage>
            {inlineTextEditorOverlay ? (
              <textarea
                ref={inlineTextEditorRef}
                className="inline-text-editor"
                data-testid="inline-text-editor"
                aria-label="텍스트 직접 편집"
                value={inlineTextEditorOverlay.value}
                onChange={(event) =>
                  updateInlineText(inlineTextEditorOverlay.nodeId, event.currentTarget.value)
                }
                onBlur={stopInlineTextEdit}
                onKeyDown={handleInlineTextKeyDown}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                style={{
                  left: inlineTextEditorOverlay.left,
                  top: inlineTextEditorOverlay.top,
                  width: inlineTextEditorOverlay.width,
                  height: inlineTextEditorOverlay.height,
                  fontSize: inlineTextEditorOverlay.fontSize,
                  fontFamily: inlineTextEditorOverlay.fontFamily,
                  color: inlineTextEditorOverlay.color
                }}
              />
            ) : null}
            {editor ? (
              <RemotePresenceOverlay
                localSessionId={localSessionId}
                nowMs={presenceClock}
                presence={presence}
                viewport={editor.viewport}
              />
            ) : null}
            {snapGuideOverlays.map((guide) => (
              <div
                key={guide.id}
                className={`snap-guide snap-guide-${guide.orientation}`}
                data-testid={
                  guide.orientation === "vertical"
                    ? "snap-guide-vertical"
                    : "snap-guide-horizontal"
                }
                aria-hidden="true"
                style={
                  guide.orientation === "vertical"
                    ? {
                        left: guide.left,
                        top: guide.top,
                        height: guide.height
                      }
                    : {
                        left: guide.left,
                        top: guide.top,
                        width: guide.width
                      }
                }
              />
            ))}
            {gridViewportOverlay ? (
              <div className="grid-viewport-overlay" data-testid="grid-viewport-overlay">
                {gridViewportOverlay.cellControls.map((control) => (
                  <button
                    key={control.id}
                    type="button"
                    className="grid-cell-hit-zone"
                    data-testid={control.testId}
                    aria-label={control.title}
                    title={control.title}
                    style={{
                      left: control.left,
                      top: control.top,
                      width: control.width,
                      height: control.height
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => selectGridCellRangeFromCell(control, event)}
                    onContextMenu={(event) => openGridCellContextMenuFromCell(control, event)}
                  />
                ))}
                {gridCellSelectionBox ? (
                  <div
                    className="grid-cell-selection-range"
                    data-testid="grid-cell-selection-range"
                    aria-hidden="true"
                    style={{
                      left: gridCellSelectionBox.left,
                      top: gridCellSelectionBox.top,
                      width: gridCellSelectionBox.width,
                      height: gridCellSelectionBox.height
                    }}
                  />
                ) : null}
                {gridViewportOverlay.lines.map((line) => (
                  <div
                    key={line.id}
                    className={`grid-viewport-line grid-viewport-line-${line.orientation}`}
                    aria-hidden="true"
                    style={
                      line.orientation === "vertical"
                        ? {
                            left: line.left,
                            top: line.top,
                            height: line.height
                          }
                        : {
                            left: line.left,
                            top: line.top,
                            width: line.width
                          }
                    }
                  />
                ))}
                {gridViewportOverlay.headerControls.map((control) => (
                  <button
                    key={control.id}
                    type="button"
                    className={`grid-track-header grid-track-header-${control.axis}`}
                    data-testid={control.testId}
                    aria-label={control.title}
                    title={control.title}
                    data-grid-track-header="true"
                    data-grid-track-node-id={gridViewportOverlay.nodeId}
                    data-grid-track-axis={control.axis}
                    data-grid-track-index={control.index}
                    style={{
                      left: control.left,
                      top: control.top
                    }}
                    onMouseDown={(event) => startGridTrackReorderFromHeader(control, event)}
                    onContextMenu={(event) => openGridTrackContextMenuFromHeader(control, event)}
                  >
                    {control.label}
                  </button>
                ))}
                {gridViewportOverlay.addControls.map((control) => (
                  <button
                    key={control.id}
                    type="button"
                    className={`grid-add-control grid-add-control-${control.axis}`}
                    data-testid={control.testId}
                    aria-label={control.title}
                    title={control.title}
                    style={{
                      left: control.left,
                      top: control.top
                    }}
                    onClick={(event) => addGridTrackFromViewportControl(control, event)}
                  >
                    {control.label}
                  </button>
                ))}
                {gridViewportOverlay.removeControls.map((control) => (
                  <button
                    key={control.id}
                    type="button"
                    className={`grid-remove-control grid-remove-control-${control.axis}`}
                    data-testid={control.testId}
                    aria-label={control.title}
                    title={control.title}
                    style={{
                      left: control.left,
                      top: control.top
                    }}
                    onClick={(event) => removeGridTrackFromViewportControl(control, event)}
                  >
                    {control.label}
                  </button>
                ))}
                {gridViewportOverlay.handles.map((handle) => (
                  <div
                    key={handle.id}
                    className={`grid-resize-handle grid-resize-handle-${handle.axis}`}
                    data-testid={handle.testId}
                    aria-hidden="true"
                    style={{
                      left: handle.left,
                      top: handle.top,
                      width: handle.width,
                      height: handle.height,
                      cursor: handle.cursor
                    }}
                    onMouseDown={(event) => startGridResize(handle, event)}
                  />
                ))}
                {gridViewportOverlay.areaBoundaryHandles.map((handle) => (
                  <div
                    key={handle.id}
                    className={`grid-area-boundary-handle grid-area-boundary-handle-${handle.edge}`}
                    data-testid={handle.testId}
                    aria-label={handle.title}
                    title={handle.title}
                    style={{
                      left: handle.left,
                      top: handle.top,
                      width: handle.width,
                      height: handle.height,
                      cursor: handle.cursor
                    }}
                    onMouseDown={(event) => startGridAreaBoundaryResize(handle, event)}
                  />
                ))}
              </div>
            ) : null}
            {measurementOverlay ? (
              <div className="measurement-overlay" data-testid="measurement-overlay" aria-hidden="true">
                <div
                  className="measurement-target-outline"
                  style={{
                    left: measurementOverlay.target.left,
                    top: measurementOverlay.target.top,
                    width: measurementOverlay.target.width,
                    height: measurementOverlay.target.height
                  }}
                />
                <div
                  className="measurement-label measurement-size-label"
                  data-testid="measurement-size-label"
                  style={{
                    left: measurementOverlay.size.left,
                    top: measurementOverlay.size.top
                  }}
                >
                  {measurementOverlay.size.text}
                </div>
                {measurementOverlay.horizontal ? (
                  <>
                    <div
                      className="measurement-line measurement-line-horizontal"
                      style={{
                        left: measurementOverlay.horizontal.left,
                        top: measurementOverlay.horizontal.top,
                        width: measurementOverlay.horizontal.width
                      }}
                    />
                    <div
                      className="measurement-label"
                      data-testid="measurement-distance-horizontal"
                      style={{
                        left: measurementOverlay.horizontal.labelLeft,
                        top: measurementOverlay.horizontal.labelTop
                      }}
                    >
                      {measurementOverlay.horizontal.text}
                    </div>
                  </>
                ) : null}
                {measurementOverlay.vertical ? (
                  <>
                    <div
                      className="measurement-line measurement-line-vertical"
                      style={{
                        left: measurementOverlay.vertical.left,
                        top: measurementOverlay.vertical.top,
                        height: measurementOverlay.vertical.height
                      }}
                    />
                    <div
                      className="measurement-label"
                      data-testid="measurement-distance-vertical"
                      style={{
                        left: measurementOverlay.vertical.labelLeft,
                        top: measurementOverlay.vertical.labelTop
                      }}
                    >
                      {measurementOverlay.vertical.text}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {selectionChromeOverlay ? (
              <div className="selection-chrome-overlay" aria-hidden="true">
                {selectionChromeOverlay.isMultiSelection ? (
                  <div
                    className="multi-selection-bounds"
                    data-testid="multi-selection-bounds"
                    style={{
                      left: selectionChromeOverlay.bounds.left,
                      top: selectionChromeOverlay.bounds.top,
                      width: selectionChromeOverlay.bounds.width,
                      height: selectionChromeOverlay.bounds.height
                    }}
                  />
                ) : null}
                {selectionChromeOverlay.handles.map((handle) => (
                  <div
                    key={handle.handle}
                    className="selection-resize-handle"
                    data-testid={`resize-handle-${handle.handle}`}
                    style={{
                      left: handle.left,
                      top: handle.top,
                      width: handle.width,
                      height: handle.height,
                      cursor: handle.cursor
                    }}
                  />
                ))}
                <div
                  className="selection-size-badge"
                  data-testid="selection-size-badge"
                  style={{
                    left: selectionChromeOverlay.badge.left,
                    top: selectionChromeOverlay.badge.top
                  }}
                >
                  {selectionChromeOverlay.badge.text}
                </div>
              </div>
            ) : null}
            {commentBubbleOverlays.length > 0 ? (
              <div className="comment-bubble-layer" data-testid="comment-bubble-layer" aria-label="캔버스 코멘트">
                {commentBubbleOverlays.map((bubble) => (
                  <button
                    key={bubble.nodeId}
                    type="button"
                    className="comment-bubble"
                    data-testid={`comment-bubble-${bubble.nodeId}`}
                    aria-label={`${bubble.nodeName} 활성 코멘트 ${bubble.count}개`}
                    title={`${bubble.nodeName} 활성 코멘트 ${bubble.count}개`}
                    style={{
                      left: bubble.left,
                      top: bubble.top
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectNode(bubble.nodeId);
                    }}
                  >
                    {bubble.count}
                  </button>
                ))}
              </div>
            ) : null}
            {frameSpacingOverlay ? (
              <div className="frame-spacing-overlay" data-testid="frame-spacing-overlay" aria-hidden="true">
                {frameSpacingOverlay.segments.map((segment) => (
                  <div key={segment.id}>
                    <div
                      className={`frame-spacing-line frame-spacing-line-${segment.orientation}`}
                      style={
                        segment.orientation === "horizontal"
                          ? {
                              left: segment.left,
                              top: segment.top,
                              width: segment.width
                            }
                          : {
                              left: segment.left,
                              top: segment.top,
                              height: segment.height
                            }
                      }
                    />
                    <div
                      className="frame-spacing-label"
                      data-testid={segment.testId}
                      style={{
                        left: segment.labelLeft,
                        top: segment.labelTop
                      }}
                    >
                      {segment.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {areaSelectionBox ? (
              <div
                className="area-selection-box"
                data-testid="area-selection-box"
                style={{
                  left: areaSelectionBox.left,
                  top: areaSelectionBox.top,
                  width: areaSelectionBox.width,
                  height: areaSelectionBox.height
                }}
              />
            ) : null}
          </div>
        </div>
      </section>
      <Inspector
        activeTab={inspectorTab}
        selectedNode={selectedNode}
        selectedNodes={selectedNodes}
        pageName={activePage?.name ?? currentDocumentName}
        pageExportNodes={nodes}
        pageExportReviewItems={pageExportReviewItems}
        selectedParentNode={selectedParentNode}
        selectedNodeCount={selectedNodeIds.length}
        codeExport={codeExportPayload}
        codeExportStatus={codeExportStatus}
        documentTokens={editor?.document.tokens ?? []}
        canAlign={canAlignInspectorSelection}
        canDistribute={canDistributeSelection}
        zoomLabel={`${Math.round((editor?.viewport.scale ?? 1) * 100)}%`}
        canShare={Boolean(currentProject && collabSession)}
        onShare={linkProjectToCurrentTeam}
        tokenDtcgDraft={tokenDtcgDraft}
        tokenDtcgStatus={tokenDtcgStatus}
        canEditTokens={Boolean(currentProject && editor)}
        commentThreads={selectedNodeCommentThreads}
        commentBody={commentBody}
        commentReplyBodies={commentReplyBodies}
        commentStatus={commentStatus}
        canComment={Boolean(currentProject && editor && selectedNode)}
        onTokenDtcgDraftChange={setTokenDtcgDraft}
        onExportTokensDtcg={() => void exportCurrentDocumentTokensDtcg()}
        onImportTokensDtcg={() => void importCurrentDocumentTokensDtcg()}
        onCommentBodyChange={setCommentBody}
        onCommentReplyBodyChange={(threadId, value) =>
          setCommentReplyBodies((current) => ({ ...current, [threadId]: value }))
        }
        onCreateComment={(nodeId) => void createSelectedNodeComment(nodeId)}
        onCreateCommentReply={(threadId) => void createSelectedNodeCommentReply(threadId)}
        onResolveComment={(threadId) => void resolveSelectedNodeComment(threadId)}
        onMarkCommentRead={(threadId) => void markSelectedNodeCommentRead(threadId)}
        onDownloadSelectedPng={downloadSelectedNodePngFromDevPanel}
        onDownloadSelectedJpeg={downloadSelectedNodeJpegFromDevPanel}
        onDownloadSelectedWebp={downloadSelectedNodeWebpFromDevPanel}
        onDownloadSelectedRaster={downloadSelectedNodeRasterFromDevPanel}
        onDownloadNodeRaster={downloadNodeRasterFromDevPanel}
        onExportPresetsChange={updateExportPresets}
        onTabChange={setInspectorTab}
        onGeometryChange={updateGeometry}
        onFillChange={(nodeId, fill) => dispatch({ type: "set_fill", nodeId, fill })}
        onTextChange={updateTextNode}
        onLayoutChange={updateLayout}
        onLayoutItemChange={updateLayoutItem}
        onConstraintsChange={updateConstraints}
        onAlign={(mode) =>
          updateViewportFromInteraction((current) =>
            current.selection.nodeIds.length === 1
              ? alignSelectedNodeToParent(current, mode)
              : alignSelectedNodes(current, mode)
          )
        }
        onDistribute={(mode) =>
          updateViewportFromInteraction((current) => distributeSelectedNodes(current, mode))
        }
      />
      {objectContextMenu ? (
        <div
          className="object-context-menu"
          data-testid="object-context-menu"
          role="menu"
          aria-label="객체 메뉴"
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: objectContextMenu.left, top: objectContextMenu.top }}
        >
          <ContextMenuSection label="클립보드">
            <ContextMenuItem
              label="잘라내기"
              shortcut="⌘X"
              disabled={!canMutateContextMenuNode}
              onClick={cutContextSelection}
            />
            <ContextMenuItem
              label="복사"
              shortcut="⌘C"
              disabled={!contextMenuNode}
              onClick={copyContextSelection}
            />
            <ContextMenuItem
              label="스타일 복사"
              shortcut="⌥⌘C"
              disabled={!contextMenuNode}
              onClick={copyContextStyle}
            />
            <ContextMenuItem
              label="스타일 붙여넣기"
              shortcut="⌥⌘V"
              disabled={!canPasteContextStyle}
              onClick={pasteContextStyle}
            />
            <ContextMenuItem
              label="붙여넣기"
              shortcut="⌘V"
              disabled={!objectClipboardRef.current}
              onClick={() => runContextMenuStateAction((state) => pasteCopiedNode(state, objectClipboardRef.current))}
            />
            <ContextMenuItem
              label="여기에 붙여넣기"
              disabled={!objectClipboardRef.current || !objectContextMenu.documentPoint}
              onClick={pasteContextSelectionAtMenuPoint}
            />
          </ContextMenuSection>
          <ContextMenuSection label="선택 및 내보내기">
            <ContextMenuItem label="전체 선택" shortcut="⌘A" disabled={!editor} onClick={selectAllContextNodes} />
            <ContextMenuItem
              label="같은 종류 선택"
              shortcut="⇧⌘A"
              disabled={!contextMenuNode}
              onClick={selectSameKindContextNodes}
            />
            <ContextMenuItem
              label="선택 영역 확대"
              shortcut="⇧1"
              disabled={!contextMenuNode}
              onClick={fitContextSelectionToViewport}
            />
            <ContextMenuItem
              label="코드로 내보내기"
              disabled={!currentProject}
              onClick={() => void downloadContextCodeExport()}
            />
            <ContextMenuItem
              label="PNG로 내보내기"
              disabled={!contextMenuNode}
              onClick={downloadContextSelectionPng}
            />
          </ContextMenuSection>
          <ContextMenuSection label="편집">
            <ContextMenuItem
              label="복제"
              shortcut="⌘D"
              disabled={!canMutateContextMenuNode}
              onClick={() => runContextMenuStateAction(duplicateSelectedNode)}
            />
            <ContextMenuItem
              label="삭제"
              shortcut="Delete"
              disabled={!canMutateContextMenuNode}
              onClick={() => runContextMenuStateAction(deleteSelectedNode)}
            />
            <ContextMenuItem
              label="이름 변경"
              shortcut="⌘R"
              disabled={!canMutateContextMenuNode}
              onClick={renameContextSelection}
            />
            <ContextMenuItem
              label="그룹으로 묶기"
              shortcut="⌘G"
              disabled={!canGroupContextSelection}
              onClick={groupContextSelection}
            />
            <ContextMenuItem
              label="선택 영역 프레임 만들기"
              disabled={!canFrameContextSelection}
              onClick={frameContextSelection}
            />
            <ContextMenuItem
              label="그룹 해제"
              shortcut="⇧⌘G"
              disabled={!canUngroupContextSelection}
              onClick={ungroupContextSelection}
            />
          </ContextMenuSection>
          {contextMenuNode?.kind === "image" ? (
            <ContextMenuSection label="이미지">
              <ContextMenuItem
                label="이미지 바꾸기"
                disabled={!canReplaceContextImage}
                onClick={startContextImageReplacement}
              />
              <ContextMenuItem
                label="원본 크기로 맞춤"
                disabled={!canResizeContextImageToNaturalSize}
                onClick={resizeContextImageToNaturalSize}
              />
              <ContextMenuItem
                label="이미지 채우기"
                disabled={!canReplaceContextImage || contextImageFitMode === "fill"}
                onClick={() => void setContextImageFitMode("fill")}
              />
              <ContextMenuItem
                label="이미지 맞춤"
                disabled={!canReplaceContextImage || contextImageFitMode === "fit"}
                onClick={() => void setContextImageFitMode("fit")}
              />
            </ContextMenuSection>
          ) : null}
          <ContextMenuSection label="상태">
            <ContextMenuItem
              label={contextMenuNodeIsLocked ? "잠금 해제" : "잠그기"}
              disabled={!contextMenuNode}
              onClick={toggleContextNodeLocked}
            />
            <ContextMenuItem
              label={contextMenuNodeIsHidden ? "표시" : "숨기기"}
              disabled={!contextMenuNode}
              onClick={toggleContextNodeVisible}
            />
          </ContextMenuSection>
          <ContextMenuSection label="레이어 순서">
            <ContextMenuItem
              label="맨 앞으로 가져오기"
              disabled={!canMutateContextMenuNode}
              onClick={() => reorderContextSelection("front")}
            />
            <ContextMenuItem
              label="앞으로 가져오기"
              disabled={!canMutateContextMenuNode}
              onClick={() => reorderContextSelection("forward")}
            />
            <ContextMenuItem
              label="뒤로 보내기"
              disabled={!canMutateContextMenuNode}
              onClick={() => reorderContextSelection("backward")}
            />
            <ContextMenuItem
              label="맨 뒤로 보내기"
              disabled={!canMutateContextMenuNode}
              onClick={() => reorderContextSelection("back")}
            />
            <ContextMenuItem
              label="가로 뒤집기"
              disabled={!canMutateContextMenuNode}
              onClick={() => flipContextSelection("horizontal")}
            />
            <ContextMenuItem
              label="세로 뒤집기"
              disabled={!canMutateContextMenuNode}
              onClick={() => flipContextSelection("vertical")}
            />
          </ContextMenuSection>
          <ContextMenuSection label="컴포넌트">
            <ContextMenuItem
              label="컴포넌트 만들기"
              disabled={!canMutateContextMenuNode || contextMenuNode?.kind === "component_instance"}
              onClick={createContextComponent}
            />
            <ContextMenuItem
              label="인스턴스 만들기"
              disabled={
                !canMutateContextMenuNode ||
                !components.some((component) => component.source_node.id === contextMenuNode?.id)
              }
              onClick={createContextInstance}
            />
            <ContextMenuItem
              label="인스턴스 분리"
              disabled={!canMutateContextMenuNode || !contextMenuNode?.component_instance}
              onClick={detachContextInstance}
            />
          </ContextMenuSection>
          <ContextMenuSection label="정렬 및 배치">
            <ContextMenuItem
              label="왼쪽 맞춤"
              shortcut="⌥A"
              disabled={!canMutateContextMenuNode}
              onClick={() => alignContextSelection("left")}
            />
            <ContextMenuItem
              label="가운데 맞춤"
              shortcut="⌥H"
              disabled={!canMutateContextMenuNode}
              onClick={() => alignContextSelection("center")}
            />
            <ContextMenuItem
              label="오른쪽 맞춤"
              shortcut="⌥D"
              disabled={!canMutateContextMenuNode}
              onClick={() => alignContextSelection("right")}
            />
            <ContextMenuItem
              label="위쪽 맞춤"
              shortcut="⌥W"
              disabled={!canMutateContextMenuNode}
              onClick={() => alignContextSelection("top")}
            />
            <ContextMenuItem
              label="세로 가운데 맞춤"
              shortcut="⌥V"
              disabled={!canMutateContextMenuNode}
              onClick={() => alignContextSelection("middle")}
            />
            <ContextMenuItem
              label="아래쪽 맞춤"
              shortcut="⌥S"
              disabled={!canMutateContextMenuNode}
              onClick={() => alignContextSelection("bottom")}
            />
            <ContextMenuItem
              label="가로 간격 균등"
              disabled={selectedNodeIds.length < 3 || !canMutateContextMenuNode}
              onClick={() => distributeContextSelection("horizontal")}
            />
            <ContextMenuItem
              label="세로 간격 균등"
              disabled={selectedNodeIds.length < 3 || !canMutateContextMenuNode}
              onClick={() => distributeContextSelection("vertical")}
            />
          </ContextMenuSection>
        </div>
      ) : null}
      {gridTrackContextMenu ? (
        <div
          className="object-context-menu"
          data-testid="grid-track-context-menu"
          role="menu"
          aria-label={gridTrackContextMenu.axis === "column" ? "그리드 열 메뉴" : "그리드 행 메뉴"}
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: gridTrackContextMenu.left, top: gridTrackContextMenu.top }}
        >
          {gridTrackContextMenu.axis === "column" ? (
            <ContextMenuSection label="열">
              <ContextMenuItem label="열 복제" onClick={() => applyGridTrackContextAction("duplicate")} />
              <ContextMenuItem
                label="왼쪽에 열 추가"
                onClick={() => applyGridTrackContextAction("insert-before")}
              />
              <ContextMenuItem
                label="오른쪽에 열 추가"
                onClick={() => applyGridTrackContextAction("insert-after")}
              />
              <ContextMenuItem
                label="열 삭제"
                disabled={!canDeleteGridTrackFromContextMenu}
                onClick={() => applyGridTrackContextAction("delete")}
              />
              <ContextMenuItem
                label="열과 객체 삭제"
                disabled={!canDeleteGridTrackFromContextMenu}
                onClick={() => applyGridTrackContextAction("delete-with-children")}
              />
            </ContextMenuSection>
          ) : (
            <ContextMenuSection label="행">
              <ContextMenuItem label="행 복제" onClick={() => applyGridTrackContextAction("duplicate")} />
              <ContextMenuItem
                label="위에 행 추가"
                onClick={() => applyGridTrackContextAction("insert-before")}
              />
              <ContextMenuItem
                label="아래에 행 추가"
                onClick={() => applyGridTrackContextAction("insert-after")}
              />
              <ContextMenuItem
                label="행 삭제"
                disabled={!canDeleteGridTrackFromContextMenu}
                onClick={() => applyGridTrackContextAction("delete")}
              />
              <ContextMenuItem
                label="행과 객체 삭제"
                disabled={!canDeleteGridTrackFromContextMenu}
                onClick={() => applyGridTrackContextAction("delete-with-children")}
              />
            </ContextMenuSection>
          )}
        </div>
      ) : null}
      {gridCellContextMenu ? (
        <div
          className="object-context-menu"
          data-testid="grid-cell-context-menu"
          role="menu"
          aria-label="그리드 셀 메뉴"
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: gridCellContextMenu.left, top: gridCellContextMenu.top }}
        >
          <ContextMenuSection label="셀">
            <ContextMenuItem label="셀 병합 영역 만들기" onClick={applyGridCellMergeAction} />
            <ContextMenuItem
              label="병합 영역 분리"
              disabled={!gridCellContextMenu.areaName}
              onClick={applyGridCellSplitAction}
            />
          </ContextMenuSection>
        </div>
      ) : null}
      <input
        ref={imageReplacementFileInputRef}
        data-testid="image-replacement-file"
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={replaceContextImageFromFile}
      />
    </main>
  );
}
