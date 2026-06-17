import { useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import {
  flattenRendererNodes,
  type RendererDocument,
  type RendererNode
} from "@canvas-mcp-editor/renderer";
import {
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
  executeEditorCommand,
  findNodeById,
  getNodeAbsolutePosition,
  panViewport,
  redo,
  setSelection,
  type EditorState,
  type GeometryPatch,
  undo,
  zoomViewport
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

function remotePresenceSignature(member: CollaborationPresence) {
  return JSON.stringify({
    selectedNodeId: member.selectedNodeId,
    selectedNodeBounds: member.selectedNodeBounds,
    cursor: member.cursor,
    viewport: member.viewport,
    activeTool: member.activeTool
  });
}

function renderNode({
  node,
  selectedNodeId,
  onSelect,
  onGeometryChange,
  onResizeStart
}: {
  node: RendererNode;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onResizeStart: (nodeId: string) => void;
}) {
  const isSelected = node.id === selectedNodeId;
  const handleSize = editorKonvaTokens.selection.handleSize;
  const resizeHitSize = editorKonvaTokens.selection.resizeHitSize;
  const startResize = (event: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>) => {
    event.cancelBubble = true;
    onResizeStart(node.id);
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
      draggable={isSelected}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect(node.id);
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect(node.id);
      }}
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
  onTextChange
}: {
  selectedNode: RendererNode | null;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
  onFillChange: (nodeId: string, fill: string) => void;
  onTextChange: (nodeId: string, value: string) => void;
}) {
  if (!selectedNode) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="empty-state">Select a layer or canvas node.</p>
      </aside>
    );
  }

  const updateNumber = (patchKey: keyof GeometryPatch) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.currentTarget.value);
    if (Number.isFinite(nextValue)) {
      onGeometryChange(selectedNode.id, { [patchKey]: nextValue });
    }
  };

  return (
    <aside className="inspector">
      <h2>Inspector</h2>
      <div className="node-summary">
        <strong>{selectedNode.name}</strong>
        <span>{selectedNode.kind}</span>
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
        Fill
        <input
          data-testid="inspector-fill"
          type="color"
          value={selectedNode.style.fill}
          onChange={(event) => onFillChange(selectedNode.id, event.currentTarget.value)}
        />
      </label>
      {selectedNode.content.type === "text" ? (
        <label className="stacked-field">
          Text
          <textarea
            data-testid="inspector-text"
            value={selectedNode.content.value}
            onChange={(event) => onTextChange(selectedNode.id, event.currentTarget.value)}
          />
        </label>
      ) : null}
    </aside>
  );
}

export function App() {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [resizeSession, setResizeSession] = useState<{ nodeId: string } | null>(null);
  const [teamName, setTeamName] = useState("Design Team");
  const [relayUrl, setRelayUrl] = useState("");
  const [relayToken, setRelayToken] = useState("");
  const [memberToken, setMemberToken] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifestStatus, setManifestStatus] = useState("");
  const [collabSession, setCollabSession] = useState<CollabDocumentSession | null>(null);
  const [collabStatus, setCollabStatus] = useState("offline");
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const resizeSessionRef = useRef<{ nodeId: string } | null>(null);
  const collabSessionRef = useRef<CollabDocumentSession | null>(null);
  const publishedCursorRef = useRef<PublishedCursor | null>(null);
  const remotePresenceSignatureRef = useRef(new Map<string, string>());
  const remotePresenceSeenAtRef = useRef(new Map<string, number>());
  const manifestFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const createNode = (kind: "rectangle" | "text") => {
    if (!editor) {
      return;
    }

    const firstPage = editor.document.pages[0];
    if (!firstPage) {
      return;
    }

    dispatch({
      type: "create_node",
      parentId: firstPage.id,
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
      name: `${selectedNode.name} Component`
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
    credentials: { relayToken?: string; memberToken?: string } = {}
  ) => {
    if (!editor) {
      return;
    }

    await teamStore.saveTeam(team);
    await teamStore.setCurrentTeam(team.teamId);
    collabSessionRef.current?.destroy();

    const session = createCollabDocumentSession({
      team,
      documentId: editor.document.id,
      initialDocument: editor.document,
      relayToken: credentials.relayToken,
      memberToken: credentials.memberToken
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
    setManifestStatus(`Loaded ${team.name}`);
  };

  const setManifestError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "invalid team manifest";
    setManifestStatus(`Manifest import failed: ${message}`);
  };

  const createLocalTeam = () => {
    void activateTeam(
      createTeamManifest({
        name: teamName,
        currentUser: {
          userId: "local-user",
          displayName: "Local user",
          color: LOCAL_USER_COLOR
        }
      })
    );
  };

  const createRelayTeam = () => {
    if (!relayUrl.trim()) {
      return;
    }

    void activateTeam(
      createTeamManifest({
        name: teamName,
        currentUser: {
          userId: "local-user",
          displayName: "Local user",
          color: LOCAL_USER_COLOR
        },
        sync: {
          mode: "websocket",
          roomPrefix: "canvas-mcp-editor",
          relayUrl: relayUrl.trim()
        }
      }),
      {
        relayToken: relayToken.trim() || undefined,
        memberToken: memberToken.trim() || undefined
      }
    );
  };

  const exportCurrentTeam = () => {
    if (collabSession) {
      setManifestText(exportTeamManifest(collabSession.team));
      setManifestStatus(`Exported ${collabSession.team.name}`);
    }
  };

  const importTeam = () => {
    if (!manifestText.trim()) {
      return;
    }

    try {
      void activateTeam(importTeamManifest(manifestText));
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
    setManifestStatus(`Downloaded ${download.filename}`);
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
      await activateTeam(team);
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
      await activateTeam(team);
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>Canvas MCP Editor</h1>
        <p>{editor ? editor.document.name : "Start the local server to load the sample file."}</p>
        <div className="layer-list">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={editor?.selection.nodeId === node.id ? "is-selected" : undefined}
              onClick={() => selectNode(node.id)}
            >
              {node.name}
              {node.kind === "component" ? " · Component" : ""}
              {node.kind === "component_instance" ? " · Instance" : ""}
            </button>
          ))}
        </div>
        <section className="team-panel" aria-label="Team collaboration">
          <h2>Team</h2>
          <div className="team-fields">
            <label>
              Name
              <input
                data-testid="team-name"
                value={teamName}
                onChange={(event) => setTeamName(event.currentTarget.value)}
              />
            </label>
            <label>
              Relay
              <input
                data-testid="relay-url"
                value={relayUrl}
                placeholder="ws://127.0.0.1:4327"
                onChange={(event) => setRelayUrl(event.currentTarget.value)}
              />
            </label>
            <label>
              Relay token
              <input
                data-testid="relay-token"
                value={relayToken}
                onChange={(event) => setRelayToken(event.currentTarget.value)}
              />
            </label>
            <label>
              Member token
              <input
                data-testid="member-token"
                value={memberToken}
                onChange={(event) => setMemberToken(event.currentTarget.value)}
              />
            </label>
            <label>
              Manifest URL
              <input
                data-testid="team-manifest-url"
                value={manifestUrl}
                placeholder="https://raw.githubusercontent.com/..."
                onChange={(event) => setManifestUrl(event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="team-actions">
            <button type="button" onClick={createLocalTeam} disabled={!editor}>
              Local
            </button>
            <button type="button" onClick={createRelayTeam} disabled={!editor || !relayUrl.trim()}>
              Relay
            </button>
            <button type="button" onClick={exportCurrentTeam} disabled={!collabSession}>
              Export
            </button>
            <button type="button" onClick={importTeam} disabled={!editor || !manifestText.trim()}>
              Import
            </button>
            <button type="button" onClick={downloadCurrentTeam} disabled={!collabSession}>
              Download
            </button>
            <button type="button" onClick={() => manifestFileInputRef.current?.click()} disabled={!editor}>
              Upload
            </button>
            <button type="button" onClick={importTeamFromUrl} disabled={!editor || !manifestUrl.trim()}>
              Load URL
            </button>
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
            {collabSession ? `${collabSession.team.name} · ${collabStatus}` : "No team"}
          </div>
          <div className="team-status" data-testid="team-manifest-status" aria-live="polite">
            {manifestStatus || "Manifest idle"}
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
          <textarea
            data-testid="team-manifest"
            value={manifestText}
            onChange={(event) => setManifestText(event.currentTarget.value)}
          />
        </section>
      </aside>
      <section className="editor-workspace">
        <div className="toolbar" aria-label="Editor toolbar">
          <button type="button" aria-label="Create rectangle" onClick={() => createNode("rectangle")}>
            ▭
          </button>
          <button type="button" aria-label="Create text" onClick={() => createNode("text")}>
            T
          </button>
          <button
            type="button"
            aria-label="Create component"
            disabled={!selectedNode || selectedNode.kind === "component_instance"}
            onClick={createComponent}
          >
            C
          </button>
          <button
            type="button"
            aria-label="Create instance"
            disabled={!selectedComponent}
            onClick={createInstance}
          >
            I
          </button>
          <button
            type="button"
            aria-label="Detach instance"
            disabled={!selectedNode?.component_instance}
            onClick={detachInstance}
          >
            D
          </button>
          <button
            type="button"
            aria-label="Undo"
            disabled={!editor?.history.past.length}
            onClick={() => setEditor((current) => (current ? undo(current) : current))}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Redo"
            disabled={!editor?.history.future.length}
            onClick={() => setEditor((current) => (current ? redo(current) : current))}
          >
            ↷
          </button>
          <button
            type="button"
            aria-label="Pan left"
            onClick={() =>
              setEditor((current) => {
                if (!current) {
                  return current;
                }

                const nextState = panViewport(current, { x: -40, y: 0 });
                publishEditorPresence(nextState);
                return nextState;
              })
            }
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Pan right"
            onClick={() =>
              setEditor((current) => {
                if (!current) {
                  return current;
                }

                const nextState = panViewport(current, { x: 40, y: 0 });
                publishEditorPresence(nextState);
                return nextState;
              })
            }
          >
            →
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              setEditor((current) => {
                if (!current) {
                  return current;
                }

                const nextState = zoomViewport(current, -0.25);
                publishEditorPresence(nextState);
                return nextState;
              })
            }
          >
            −
          </button>
          <span className="zoom-readout">{Math.round((editor?.viewport.scale ?? 1) * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setEditor((current) => {
                if (!current) {
                  return current;
                }

                const nextState = zoomViewport(current, 0.25);
                publishEditorPresence(nextState);
                return nextState;
              })
            }
          >
            +
          </button>
        </div>
        <div className="canvas-area" data-testid="canvas-area">
          <div className="stage-frame" data-testid="stage-frame" onMouseLeave={clearCursorPresence}>
            <Stage
              width={editorKonvaTokens.stage.width}
              height={editorKonvaTokens.stage.height}
              scaleX={editor?.viewport.scale ?? 1}
              scaleY={editor?.viewport.scale ?? 1}
              x={editor?.viewport.x ?? 0}
              y={editor?.viewport.y ?? 0}
              onMouseDown={(event) => {
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
              onMouseMove={updateCursorFromPointer}
              onTouchMove={updateCursorFromPointer}
              onMouseUp={finishResize}
              onTouchEnd={finishResize}
            >
              <Layer>
                {editor?.document.pages[0]?.children.map((node) =>
                  renderNode({
                    node,
                    selectedNodeId: editor.selection.nodeId,
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
      />
    </main>
  );
}
