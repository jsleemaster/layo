import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
  type ImageFitMode,
  type NodeConstraints,
  type NodeLayout,
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
import { parseDocumentPayload } from "./document-api";
import { editorKonvaTokens } from "./design-tokens";
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
  createProject as createSavedProject,
  deleteProject,
  duplicateProject,
  fetchProjects,
  setProjectSharing,
  updateProject,
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

function numericInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
const DEFAULT_NODE_LAYOUT: NodeLayout = {
  mode: "none",
  direction: "vertical",
  align_items: "start",
  justify_content: "start",
  gap: 8,
  padding: { top: 16, right: 16, bottom: 16, left: 16 }
};
const DEFAULT_NODE_CONSTRAINTS: NodeConstraints = {
  horizontal: "left",
  vertical: "top"
};
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

interface ObjectContextMenuState {
  left: number;
  top: number;
  nodeId: string | null;
  documentPoint: { x: number; y: number } | null;
}

const RESIZE_HANDLES: ResizeHandle[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];
const RESIZE_HIT_HANDLES: ResizeHandle[] = RESIZE_HANDLES;
const MIN_RESIZE_SIZE = 1;
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
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
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
  onShare
}: {
  zoomLabel: string;
  canShare: boolean;
  onShare: () => void;
}) {
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
          <button type="button" aria-label="코드 보기" title="코드 보기">
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
        <button type="button" role="tab" aria-selected="true">
          디자인
        </button>
        <button type="button" role="tab" aria-selected="false">
          프로토타입
        </button>
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

function Inspector({
  selectedNode,
  selectedNodeCount,
  canAlign,
  canDistribute,
  onGeometryChange,
  onFillChange,
  onTextChange,
  onLayoutChange,
  onConstraintsChange,
  onAlign,
  onDistribute,
  zoomLabel,
  canShare,
  onShare
}: {
  selectedNode: RendererNode | null;
  selectedNodeCount: number;
  canAlign: boolean;
  canDistribute: boolean;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onFillChange: (nodeId: string, fill: string) => void;
  onTextChange: (nodeId: string, value: string) => void;
  onLayoutChange: (nodeId: string, layout: NodeLayout) => void;
  onConstraintsChange: (nodeId: string, constraints: NodeConstraints) => void;
  onAlign: (mode: AlignmentMode) => void;
  onDistribute: (mode: DistributionMode) => void;
  zoomLabel: string;
  canShare: boolean;
  onShare: () => void;
}) {
  if (selectedNodeCount > 1) {
    return (
      <aside className="inspector">
        <InspectorHeader zoomLabel={zoomLabel} canShare={canShare} onShare={onShare} />
        <div className="node-summary">
          <strong>{selectedNodeCount}개 레이어 선택됨</strong>
          <span>다중 선택</span>
        </div>
        <InspectorAlignmentControls
          canAlign={canAlign}
          canDistribute={canDistribute}
          onAlign={onAlign}
          onDistribute={onDistribute}
        />
      </aside>
    );
  }

  if (!selectedNode) {
    return (
      <aside className="inspector">
        <InspectorHeader zoomLabel={zoomLabel} canShare={canShare} onShare={onShare} />
        <p className="empty-state">레이어 또는 캔버스 요소를 선택하세요.</p>
        <InspectorEmptySections />
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
  const constraints = selectedNode.constraints ?? DEFAULT_NODE_CONSTRAINTS;
  const updateLayout = (patch: Partial<NodeLayout>) => {
    onLayoutChange(selectedNode.id, {
      ...layout,
      ...patch,
      padding: patch.padding ?? layout.padding
    });
  };
  const updatePadding =
    (side: keyof NodeLayout["padding"]) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.currentTarget.value);
      if (Number.isFinite(nextValue)) {
        updateLayout({
          padding: {
            ...layout.padding,
            [side]: nextValue
          }
        });
      }
    };
  const updateConstraints = (patch: Partial<NodeConstraints>) => {
    onConstraintsChange(selectedNode.id, { ...constraints, ...patch });
  };

  return (
    <aside className="inspector">
      <InspectorHeader zoomLabel={zoomLabel} canShare={canShare} onShare={onShare} />
      <div className="node-summary">
        <strong>{selectedNode.name}</strong>
        <span>{nodeKindLabel(selectedNode.kind)}</span>
      </div>
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
          </select>
        </label>
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
            <option value="horizontal">가로</option>
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
                  updateLayout({ gap: nextValue });
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
    </aside>
  );
}

export function App() {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
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
  const editorRef = useRef<EditorState | null>(null);
  const objectClipboardRef = useRef<EditorNodeClipboard | null>(null);
  const styleClipboardRef = useRef<EditorNodeStyle | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
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
    setProjectStatus(`${project.name} 불러옴`);
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
        setProjectStatus(`${selectedProject.name} 불러옴`);
      } catch {
        if (!cancelled) {
          setProjectStatus("로컬 서버를 시작하면 프로젝트를 불러옵니다");
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
  const selectedNode = useMemo(
    () => (editor?.selection.nodeId ? findNodeById(editor.document, editor.selection.nodeId) : null),
    [editor]
  );
  const contextMenuNode = useMemo(
    () =>
      objectContextMenu?.nodeId && editor
        ? findNodeById(editor.document, objectContextMenu.nodeId)
        : selectedNode,
    [editor, objectContextMenu, selectedNode]
  );
  const selectedNodeIds = editor?.selection.nodeIds ?? [];
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

  const downloadContextSelectionPng = () => {
    const stage = konvaStageRef.current;
    const currentEditor = editorRef.current;
    if (!stage || !currentEditor) {
      setObjectContextMenu(null);
      return;
    }

    const scopedState = scopeStateToContextNode(currentEditor);
    const nodeId = scopedState.selection.nodeId;
    const node = nodeId ? findNodeById(scopedState.document, nodeId) : null;
    const bounds = nodeId ? getNodeBounds(scopedState.document, nodeId) : null;
    if (!node || !bounds) {
      setObjectContextMenu(null);
      return;
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
      downloadDataUrl(
        stage.toDataURL({
          x,
          y,
          width,
          height,
          pixelRatio: 2,
          mimeType: "image/png"
        }),
        `${node.id}.png`
      );
      setProjectStatus(`${node.name} PNG 내보내기 완료`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PNG 내보내기에 실패했습니다";
      setProjectStatus(message);
    } finally {
      selectionOverlays.forEach((overlay) => overlay.visible(true));
      stage.draw();
      setObjectContextMenu(null);
    }
  };

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

  const updateInlineText = (nodeId: string, value: string) => {
    dispatch({ type: "update_text", nodeId, value });
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
    dispatch({
      type: "set_node_layout",
      nodeId,
      layout: layout.mode === "none" ? null : layout
    });
  };

  const updateConstraints = (nodeId: string, constraints: NodeConstraints) => {
    dispatch({ type: "set_node_constraints", nodeId, constraints });
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
        selectedNode={selectedNode}
        selectedNodeCount={selectedNodeIds.length}
        canAlign={canAlignInspectorSelection}
        canDistribute={canDistributeSelection}
        zoomLabel={`${Math.round((editor?.viewport.scale ?? 1) * 100)}%`}
        canShare={Boolean(currentProject && collabSession)}
        onShare={linkProjectToCurrentTeam}
        onGeometryChange={updateGeometry}
        onFillChange={(nodeId, fill) => dispatch({ type: "set_fill", nodeId, fill })}
        onTextChange={(nodeId, value) => dispatch({ type: "update_text", nodeId, value })}
        onLayoutChange={updateLayout}
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
