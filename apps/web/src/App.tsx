import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import {
  flattenRendererNodes,
  type NodeConstraints,
  type NodeLayout,
  type RendererDocument,
  type RendererNode
} from "@canvas-mcp-editor/renderer";
import {
  createSharedKeyEncryptionConfig,
  createTeamManifest,
  type CollaborationPresence,
  type TeamManifest
} from "@canvas-mcp-editor/collaboration";
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
  getNodeDragGeometriesForNodeIds,
  getNodeAbsolutePosition,
  getNodeBounds,
  getSelectionBoundsForNodeIds,
  getTopmostNodeIdAtPoint,
  moveSelectedNodesBy,
  nudgeSelectedNode,
  panViewport,
  pasteCopiedNode,
  redo,
  selectNodesInBounds,
  setSelection,
  setMultiSelection,
  setViewport,
  toggleSelection,
  type AlignmentMode,
  type DistributionMode,
  type EditorNodeClipboard,
  type EditorState,
  type GeometryPatch,
  type SelectionBounds,
  type SnapGuide,
  undo,
  zoomViewport,
  zoomViewportAtPoint
} from "./editor-state";
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

const teamStore = createIndexedDbTeamStore();
const projectStore = createIndexedDbProjectStore();
const LOCAL_USER_COLOR = "var(--editor-color-selection)";
const DEFAULT_NODE_LAYOUT: NodeLayout = {
  mode: "none",
  direction: "vertical",
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
type TeamPanelMode = "local" | "relay" | "manifest";

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
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

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
  badge: { left: number; top: number; text: string };
  handles: Array<{
    handle: ResizeHandle;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
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

// Corners stay first for coarse stage hit-testing; edges render later so exact edge drags win.
const RESIZE_HANDLES: ResizeHandle[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
  "top",
  "right",
  "bottom",
  "left"
];
const RESIZE_HIT_HANDLES: ResizeHandle[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
  "top",
  "right",
  "bottom",
  "left"
];
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

function assetUrlForId(assetId: string) {
  return `http://127.0.0.1:4317/assets/${encodeURIComponent(assetId)}`;
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
  const response = await fetch(`http://127.0.0.1:4317/files/${fileId}/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId, node })
  });

  if (!response.ok) {
    throw new Error(`이미지 노드 저장 실패: ${response.status} ${response.statusText}`.trim());
  }
}

function CanvasImageBody({
  assetId,
  width,
  height,
  opacity
}: {
  assetId: string;
  width: number;
  height: number;
  opacity: number;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nextImage = new window.Image();
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

  return (
    <>
      <Rect width={width} height={height} fill={editorKonvaTokens.image.placeholderFill} opacity={opacity} />
      {image ? <KonvaImage image={image} width={width} height={height} opacity={opacity} /> : null}
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
  viewport: EditorState["viewport"]
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
    badge: {
      left: Math.round(centerX),
      top: Math.round(viewportRect.top + viewportRect.height + 20),
      text: `${Math.round(bounds.width)} x ${Math.round(bounds.height)}`
    },
    handles: RESIZE_HANDLES.map((handle) => {
      const size = resizeHandleVisualSize(handle);
      const anchor = resizeHandlePoint(viewportSelectionBounds, handle);
      return {
        handle,
        left: Math.round(anchor.x - size.width / 2),
        top: Math.round(anchor.y - size.height / 2),
        width: size.width,
        height: size.height
      };
    })
  };
}

function childBoundsForFrame(frameBounds: SelectionBounds, frame: RendererNode): SelectionBounds[] {
  return frame.children.map((child) => ({
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

function resizeHandleVisualSize(handle: ResizeHandle): { width: number; height: number } {
  const size = editorKonvaTokens.selection.handleSize;
  if (handle === "top" || handle === "bottom") {
    return { width: size * 3, height: size };
  }
  if (handle === "left" || handle === "right") {
    return { width: size, height: size * 3 };
  }

  return { width: size, height: size };
}

function resizeHandleHitSize(handle: ResizeHandle): { width: number; height: number } {
  const cornerHitSize =
    handle === "bottom-right"
      ? editorKonvaTokens.selection.resizeHitSize
      : editorKonvaTokens.selection.handleSize + 8;
  if (handle === "top" || handle === "bottom") {
    return { width: editorKonvaTokens.selection.handleSize * 3, height: cornerHitSize };
  }
  if (handle === "left" || handle === "right") {
    return { width: cornerHitSize, height: editorKonvaTokens.selection.handleSize * 3 };
  }

  return { width: cornerHitSize, height: cornerHitSize };
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
  onDragStart: (
    nodeId: string,
    event: KonvaEventObject<MouseEvent | TouchEvent | DragEvent>
  ) => void;
  onDragMove: (nodeId: string, event: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (nodeId: string, event: KonvaEventObject<DragEvent>) => void;
}) {
  const isSelected = selectedNodeIds.includes(node.id);
  const isPrimarySelected = node.id === selectedNodeId;
  const shouldDeferToAncestor = hasSelectedAncestor || hasComponentInstanceAncestor;
  const canResize = isPrimarySelected && selectedNodeIds.length === 1 && !isCanvasPanning;
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
    onResizeStart(node.id, handle);
  };
  const selectAndPrimeDrag = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (isCanvasPanning) {
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
    onDragStart(node.id, event);
    event.currentTarget.draggable(true);
    event.currentTarget.startDrag();
  };
  const selectFromClick = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (isCanvasPanning) {
      return;
    }
    if (shouldDeferToAncestor) {
      return;
    }

    event.cancelBubble = true;
    const additive = "shiftKey" in event.evt ? event.evt.shiftKey : false;
    onSelect(node.id, additive, !additive && isSelected);
  };

  const body =
    node.kind === "image" && node.content.type === "image" ? (
      <CanvasImageBody
        assetId={node.content.asset_id}
        width={node.size.width}
        height={node.size.height}
        opacity={node.style.opacity}
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
      draggable={!shouldDeferToAncestor && isSelected && !isCanvasPanning}
      onMouseDown={selectAndPrimeDrag}
      onTouchStart={selectAndPrimeDrag}
      onClick={selectFromClick}
      onTap={selectFromClick}
      onDragStart={(event) => onDragStart(node.id, event)}
      onDragMove={(event) => onDragMove(node.id, event)}
      onDragEnd={(event) => onDragEnd(node.id, event)}
    >
      {body}
      {isSelected ? (
        <>
          <Rect
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
                  <Group key={handle}>
                    <Rect
                      {...hitRect}
                      fill={editorKonvaTokens.selection.handleFill}
                      opacity={0.01}
                      onMouseDown={(event) => startResize(handle, event)}
                      onTouchStart={(event) => startResize(handle, event)}
                    />
                    <Rect
                      {...visualRect}
                      fill={editorKonvaTokens.selection.handleFill}
                      stroke={editorKonvaTokens.selection.stroke}
                      strokeWidth={editorKonvaTokens.selection.strokeWidth}
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
  return (
    <section className="inspector-section" aria-label="정렬">
      <h3>정렬</h3>
      <div className="inspector-action-grid">
        <button
          type="button"
          aria-label="검사기 왼쪽 맞춤"
          disabled={!canAlign}
          onClick={() => onAlign("left")}
        >
          ⇤
        </button>
        <button
          type="button"
          aria-label="검사기 가로 가운데 맞춤"
          disabled={!canAlign}
          onClick={() => onAlign("center")}
        >
          ↔
        </button>
        <button
          type="button"
          aria-label="검사기 오른쪽 맞춤"
          disabled={!canAlign}
          onClick={() => onAlign("right")}
        >
          ⇥
        </button>
        <button
          type="button"
          aria-label="검사기 위쪽 맞춤"
          disabled={!canAlign}
          onClick={() => onAlign("top")}
        >
          ↥
        </button>
        <button
          type="button"
          aria-label="검사기 세로 가운데 맞춤"
          disabled={!canAlign}
          onClick={() => onAlign("middle")}
        >
          ↕
        </button>
        <button
          type="button"
          aria-label="검사기 아래쪽 맞춤"
          disabled={!canAlign}
          onClick={() => onAlign("bottom")}
        >
          ↧
        </button>
        <button
          type="button"
          aria-label="검사기 가로 간격 균등"
          disabled={!canDistribute}
          onClick={() => onDistribute("horizontal")}
        >
          ⟷
        </button>
        <button
          type="button"
          aria-label="검사기 세로 간격 균등"
          disabled={!canDistribute}
          onClick={() => onDistribute("vertical")}
        >
          ↕
        </button>
      </div>
    </section>
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
  onDistribute
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
}) {
  if (selectedNodeCount > 1) {
    return (
      <aside className="inspector">
        <h2>검사기</h2>
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
        <h2>검사기</h2>
        <p className="empty-state">레이어 또는 캔버스 요소를 선택하세요.</p>
      </aside>
    );
  }

  const updateNumber = (patchKey: keyof GeometryPatch) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.currentTarget.value);
    if (Number.isFinite(nextValue)) {
      onGeometryChange(selectedNode.id, { [patchKey]: nextValue });
    }
  };
  const layout = selectedNode.layout ?? DEFAULT_NODE_LAYOUT;
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
      <h2>검사기</h2>
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
            data-testid="inspector-text"
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [collabSession, setCollabSession] = useState<CollabDocumentSession | null>(null);
  const [collabStatus, setCollabStatus] = useState("offline");
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [areaSelection, setAreaSelection] = useState<AreaSelectionSession | null>(null);
  const [dragPreview, setDragPreview] = useState<NodeDragPreview | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const editorRef = useRef<EditorState | null>(null);
  const objectClipboardRef = useRef<EditorNodeClipboard | null>(null);
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
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
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
    const response = await fetch(`http://127.0.0.1:4317/files/${project.currentDocumentId}`);
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

        const response = await fetch(`http://127.0.0.1:4317/files/${selectedProject.currentDocumentId}`);
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
  const selectedNodeIds = editor?.selection.nodeIds ?? [];
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
    if (!editor || selectedNodeIds.length !== 1) {
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

    return createSelectionChromeOverlay(chromeBounds, editor.viewport);
  }, [dragPreview, editor, selectedNodeIds]);
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
      if (isCommand && event.key.toLowerCase() === "c") {
        const clipboard = editorRef.current ? copySelectedNode(editorRef.current) : null;
        if (clipboard) {
          event.preventDefault();
          objectClipboardRef.current = clipboard;
        }
        return;
      }
      if (isCommand && event.key.toLowerCase() === "v" && objectClipboardRef.current) {
        event.preventDefault();
        updateViewportFromInteraction((state) => pasteCopiedNode(state, objectClipboardRef.current));
        return;
      }
      if (isCommand && event.key.toLowerCase() === "d") {
        event.preventDefault();
        updateViewportFromInteraction(duplicateSelectedNode);
        return;
      }
      if (!isCommand && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        updateViewportFromInteraction(deleteSelectedNode);
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
      return { ...snapped, nativePosition: true };
    }

    event.target.position({
      x: activeDrag.startPosition.x + snapped.delta.x,
      y: activeDrag.startPosition.y + snapped.delta.y
    });
    setDragPreview({
      primaryNodeId: activeDrag.nodeId,
      nodeIds: activeDrag.selectedNodeIds,
      delta: snapped.delta
    });
    setSnapGuides(snapped.guides);
    return snapped;
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
    if (!selectedNode || selectedNode.kind === "component_instance") {
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
    if (!selectedNode?.component_instance) {
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
          roomPrefix: "canvas-mcp-editor",
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
      return;
    }

    const stagePoint = documentPointFromStagePointer(pointer, editor.viewport);

    updateGeometry(
      activeResize.nodeId,
      resizePatchFromHandle(node, absolute, stagePoint, activeResize.handle)
    );
    resizeSessionRef.current = null;
    setResizeSession(null);
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
    if (!editor || !selectedNode || editor.selection.nodeIds.length !== 1) {
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
            <h1>캔버스 MCP 에디터</h1>
            <section className="project-panel" aria-label="프로젝트">
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
                {currentProject?.sharing.mode === "team"
                  ? `공유됨 · ${collabSession?.team.name ?? currentProject.sharing.teamId}`
                  : "비공개 프로젝트"}
              </div>
            </section>
            <p>{editor ? editor.document.name : "로컬 서버를 시작하면 프로젝트를 불러옵니다."}</p>
            <div className="layer-list">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={editor?.selection.nodeIds.includes(node.id) ? "is-selected" : undefined}
                  onClick={(event) => selectNode(node.id, event.shiftKey)}
                >
                  {node.name}
                  {node.kind === "component" ? " · 컴포넌트" : ""}
                  {node.kind === "component_instance" ? " · 인스턴스" : ""}
                </button>
              ))}
            </div>
            <section className="team-panel" aria-label="팀 협업">
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
          </>
        )}
      </aside>
      <section className="editor-workspace">
        <div className="toolbar" aria-label="에디터 도구 모음">
          <button type="button" aria-label="사각형 만들기" onClick={() => createNode("rectangle")}>
            ▭
          </button>
          <button type="button" aria-label="텍스트 만들기" onClick={() => createNode("text")}>
            T
          </button>
          <button
            type="button"
            aria-label="컴포넌트 만들기"
            disabled={!selectedNode || selectedNode.kind === "component_instance"}
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
            disabled={!selectedNode?.component_instance}
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
              onMouseMove={(event) => {
                if (continueCanvasPan(event.evt)) {
                  return;
                }

                if (continueAreaSelection(event)) {
                  return;
                }

                updateMeasurementTargetFromPointer(event);
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
                    onDragStart: startNodeDrag,
                    onDragMove: updateNodeDragPreview,
                    onDragEnd: finishNodeDrag
                  })
                )}
              </Layer>
            </Stage>
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
                {selectionChromeOverlay.handles.map((handle) => (
                  <div
                    key={handle.handle}
                    className="selection-resize-handle"
                    data-testid={`resize-handle-${handle.handle}`}
                    style={{
                      left: handle.left,
                      top: handle.top,
                      width: handle.width,
                      height: handle.height
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
    </main>
  );
}
