import type {
  CollaborationDocumentPoint,
  CollaborationPresence,
  CollaborationSelectionBounds,
  CollaborationViewport
} from "@canvas-mcp-editor/collaboration";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import { findNodeById, getNodeAbsolutePosition } from "../editor-state";

export interface PublishedCursor {
  point: CollaborationDocumentPoint;
  publishedAtMs: number;
}

export interface RemotePresenceFilterOptions {
  nowMs: number;
  staleAfterMs: number;
}

export const REMOTE_PRESENCE_STALE_MS = 4_000;
const CURSOR_THROTTLE_MS = 50;
const CURSOR_MIN_DELTA = 4;

export function getRemotePresence(
  presence: CollaborationPresence[],
  localSessionId: string | null,
  options?: RemotePresenceFilterOptions
): CollaborationPresence[] {
  return presence.filter((member) => {
    if (localSessionId && member.sessionId === localSessionId) {
      return false;
    }

    if (!options || member.updatedAtMs === null) {
      return true;
    }

    return options.nowMs - member.updatedAtMs <= options.staleAfterMs;
  });
}

export function documentPointToViewport(
  point: CollaborationDocumentPoint,
  viewport: CollaborationViewport
): { x: number; y: number } {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y
  };
}

export function getSelectedNodeBounds(
  document: RendererDocument,
  nodeId: string | null
): CollaborationSelectionBounds | null {
  if (!nodeId) {
    return null;
  }

  const node = findNodeById(document, nodeId);
  const position = getNodeAbsolutePosition(document, nodeId);
  if (!node || !position) {
    return null;
  }

  return {
    x: position.x,
    y: position.y,
    width: node.size.width,
    height: node.size.height,
    rotation: node.transform.rotation,
    space: "document"
  };
}

export function shouldPublishCursor(
  previous: PublishedCursor | null,
  next: CollaborationDocumentPoint,
  nowMs: number
): boolean {
  if (!previous) {
    return true;
  }

  const elapsedMs = nowMs - previous.publishedAtMs;
  if (elapsedMs >= CURSOR_THROTTLE_MS) {
    return true;
  }

  const deltaX = next.x - previous.point.x;
  const deltaY = next.y - previous.point.y;
  return Math.hypot(deltaX, deltaY) >= CURSOR_MIN_DELTA;
}
