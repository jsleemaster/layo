import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent
} from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
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
  createEditorState,
  createRectangleNode,
  createTextNode,
  deleteSelectedNode,
  duplicateSelectedNode,
  executeEditorCommand,
  findNodeById,
  getNodeAbsolutePosition,
  nudgeSelectedNode,
  panViewport,
  redo,
  setSelection,
  setViewport,
  type EditorState,
  type GeometryPatch,
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
type TeamPanelMode = "local" | "relay" | "manifest";

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

function renderNode({
  node,
  selectedNodeId,
  hasSelectedAncestor = false,
  hasComponentInstanceAncestor = false,
  isCanvasPanning = false,
  onSelect,
  onGeometryChange,
  onResizeStart
}: {
  node: RendererNode;
  selectedNodeId: string | null;
  hasSelectedAncestor?: boolean;
  hasComponentInstanceAncestor?: boolean;
  isCanvasPanning?: boolean;
  onSelect: (nodeId: string) => void;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onResizeStart: (nodeId: string) => void;
}) {
  const isSelected = node.id === selectedNodeId;
  const shouldDeferToAncestor = hasSelectedAncestor || hasComponentInstanceAncestor;
  const handleSize = editorKonvaTokens.selection.handleSize;
  const resizeHitSize = editorKonvaTokens.selection.resizeHitSize;
  const startResize = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    event.cancelBubble = true;
    onResizeStart(node.id);
  };
  const selectAndPrimeDrag = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (isCanvasPanning) {
      return;
    }
    if (shouldDeferToAncestor) {
      return;
    }

    event.cancelBubble = true;
    if (!isSelected) {
      onSelect(node.id);
      event.currentTarget.draggable(true);
      event.currentTarget.startDrag();
    }
  };
  const selectFromClick = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    if (isCanvasPanning) {
      return;
    }
    if (shouldDeferToAncestor) {
      return;
    }

    event.cancelBubble = true;
    onSelect(node.id);
  };

  const body =
    node.kind === "text" && node.content.type === "text" ? (
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
      x={node.transform.x}
      y={node.transform.y}
      rotation={node.transform.rotation}
      draggable={isSelected && !isCanvasPanning}
      onMouseDown={selectAndPrimeDrag}
      onTouchStart={selectAndPrimeDrag}
      onClick={selectFromClick}
      onTap={selectFromClick}
      onDragEnd={(event) => {
        onGeometryChange(node.id, {
          x: Math.round(event.target.x()),
          y: Math.round(event.target.y())
        });
      }}
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
          <Rect
            x={node.size.width - resizeHitSize}
            y={node.size.height - resizeHitSize}
            width={resizeHitSize}
            height={resizeHitSize}
            fill={editorKonvaTokens.selection.handleFill}
            opacity={0.01}
            onMouseDown={startResize}
            onTouchStart={startResize}
          />
          <Rect
            x={node.size.width - handleSize}
            y={node.size.height - handleSize}
            width={handleSize}
            height={handleSize}
            fill={editorKonvaTokens.selection.handleFill}
            stroke={editorKonvaTokens.selection.stroke}
            strokeWidth={editorKonvaTokens.selection.strokeWidth}
            onMouseDown={startResize}
            onTouchStart={startResize}
          />
        </>
      ) : null}
      {node.children.map((child) =>
        renderNode({
          node: child,
          selectedNodeId,
          hasSelectedAncestor: hasSelectedAncestor || isSelected,
          hasComponentInstanceAncestor: hasComponentInstanceAncestor || node.kind === "component_instance",
          isCanvasPanning,
          onSelect,
          onGeometryChange,
          onResizeStart
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

function Inspector({
  selectedNode,
  onGeometryChange,
  onFillChange,
  onTextChange,
  onLayoutChange,
  onConstraintsChange
}: {
  selectedNode: RendererNode | null;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onFillChange: (nodeId: string, fill: string) => void;
  onTextChange: (nodeId: string, value: string) => void;
  onLayoutChange: (nodeId: string, layout: NodeLayout) => void;
  onConstraintsChange: (nodeId: string, constraints: NodeConstraints) => void;
}) {
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
  const [resizeSession, setResizeSession] = useState<{ nodeId: string } | null>(null);
  const [teamName, setTeamName] = useState("디자인 팀");
  const [relayUrl, setRelayUrl] = useState("");
  const [relayToken, setRelayToken] = useState("");
  const [memberToken, setMemberToken] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestStatus, setManifestStatus] = useState("");
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [encryptionPassphrase, setEncryptionPassphrase] = useState("");
  const [teamPanelMode, setTeamPanelMode] = useState<TeamPanelMode>("local");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [collabSession, setCollabSession] = useState<CollabDocumentSession | null>(null);
  const [collabStatus, setCollabStatus] = useState("offline");
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const resizeSessionRef = useRef<{ nodeId: string } | null>(null);
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

  useEffect(() => {
    fetch("http://127.0.0.1:4317/files/sample-file")
      .then((response) => response.json())
      .then((payload) => setEditor(createEditorState(parseDocumentPayload(payload))))
      .catch(() => setEditor(null));
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

  const selectNode = (nodeId: string) => {
    setEditor((current) => {
      if (!current) {
        return current;
      }

      const nextState = setSelection(current, nodeId);
      publishEditorPresence(nextState, { activeTool: "select" });
      return nextState;
    });
  };

  const updateGeometry = (nodeId: string, patch: GeometryPatch) => {
    dispatch({ type: "update_node_geometry", nodeId, patch });
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
          selection: {
            nodeId:
              current.selection.nodeId && findNodeById(document, current.selection.nodeId)
                ? current.selection.nodeId
                : null
          }
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
    if (!pointer || !absolute) {
      resizeSessionRef.current = null;
      setResizeSession(null);
      return;
    }

    const stagePoint = {
      x: (pointer.x - editor.viewport.x) / editor.viewport.scale,
      y: (pointer.y - editor.viewport.y) / editor.viewport.scale
    };

    updateGeometry(activeResize.nodeId, {
      width: Math.round(stagePoint.x - absolute.x),
      height: Math.round(stagePoint.y - absolute.y)
    });
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

  const clearCursorPresence = () => {
    const activeSession = collabSessionRef.current;
    if (!activeSession) {
      return;
    }

    activeSession.updatePresence({ cursor: null, updatedAtMs: Date.now() });
    setPresenceClock(Date.now());
    publishPresenceSnapshot(activeSession);
    publishedCursorRef.current = null;
  };

  const startResizeFromPointer = (event: KonvaEventObject<MouseEvent>) => {
    if (!editor || !selectedNode) {
      return false;
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const absolute = getNodeAbsolutePosition(editor.document, selectedNode.id);
    if (!pointer || !absolute) {
      return false;
    }

    const stagePoint = {
      x: (pointer.x - editor.viewport.x) / editor.viewport.scale,
      y: (pointer.y - editor.viewport.y) / editor.viewport.scale
    };
    const hitSize = editorKonvaTokens.selection.resizeHitSize;
    const handleLeft = absolute.x + selectedNode.size.width - hitSize;
    const handleTop = absolute.y + selectedNode.size.height - hitSize;

    if (
      stagePoint.x >= handleLeft &&
      stagePoint.x <= absolute.x + selectedNode.size.width &&
      stagePoint.y >= handleTop &&
      stagePoint.y <= absolute.y + selectedNode.size.height
    ) {
      event.cancelBubble = true;
      const nextResizeSession = { nodeId: selectedNode.id };
      resizeSessionRef.current = nextResizeSession;
      setResizeSession(nextResizeSession);
      return true;
    }

    return false;
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
            <p>{editor ? editor.document.name : "로컬 서버를 시작하면 샘플 파일을 불러옵니다."}</p>
            <div className="layer-list">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={editor?.selection.nodeId === node.id ? "is-selected" : undefined}
                  onClick={() => selectNode(node.id)}
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
            aria-label="되돌리기"
            disabled={!editor?.history.past.length}
            onClick={() => setEditor((current) => (current ? undo(current) : current))}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="다시 실행"
            disabled={!editor?.history.future.length}
            onClick={() => setEditor((current) => (current ? redo(current) : current))}
          >
            ↷
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

                updateCursorFromPointer(event);
              }}
              onTouchMove={(event) => {
                if (continueCanvasPan(event.evt)) {
                  return;
                }

                updateCursorFromPointer(event);
              }}
              onMouseUp={(event) => {
                if (endCanvasPan()) {
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
                    isCanvasPanning: isSpacePanning,
                    onSelect: selectNode,
                    onGeometryChange: updateGeometry,
                    onResizeStart: (nodeId) => {
                      const nextResizeSession = { nodeId };
                      resizeSessionRef.current = nextResizeSession;
                      setResizeSession(nextResizeSession);
                    }
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
          </div>
        </div>
      </section>
      <Inspector
        selectedNode={selectedNode}
        onGeometryChange={updateGeometry}
        onFillChange={(nodeId, fill) => dispatch({ type: "set_fill", nodeId, fill })}
        onTextChange={(nodeId, value) => dispatch({ type: "update_text", nodeId, value })}
        onLayoutChange={updateLayout}
        onConstraintsChange={updateConstraints}
      />
    </main>
  );
}
