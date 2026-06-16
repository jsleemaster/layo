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
  createIndexedDbTeamStore,
  exportTeamManifest,
  importTeamManifest
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

function numericInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const teamStore = createIndexedDbTeamStore();
const LOCAL_USER_COLOR = "var(--editor-color-selection)";

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
  const [manifestText, setManifestText] = useState("");
  const [collabSession, setCollabSession] = useState<CollabDocumentSession | null>(null);
  const [collabStatus, setCollabStatus] = useState("offline");
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const resizeSessionRef = useRef<{ nodeId: string } | null>(null);
  const collabSessionRef = useRef<CollabDocumentSession | null>(null);

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
    setPresence(activeSession.getPresence());
    setEditor(nextState);
  };

  const selectNode = (nodeId: string) => {
    setEditor((current) => (current ? setSelection(current, nodeId) : current));
    collabSessionRef.current?.updatePresence({ selectedNodeId: nodeId, activeTool: "select" });
    if (collabSessionRef.current) {
      setPresence(collabSessionRef.current.getPresence());
    }
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

  const activateTeam = async (team: TeamManifest) => {
    if (!editor) {
      return;
    }

    await teamStore.saveTeam(team);
    await teamStore.setCurrentTeam(team.teamId);
    collabSessionRef.current?.destroy();

    const session = createCollabDocumentSession({
      team,
      documentId: editor.document.id,
      initialDocument: editor.document
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
      setPresence(nextPresence);
    });
    session.subscribeStatus((nextStatus) => {
      setCollabStatus(nextStatus);
    });
    collabSessionRef.current = session;
    setCollabSession(session);
    setCollabStatus(session.status);
    setPresence(session.getPresence());
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
          relayUrl: relayUrl.trim(),
          token: relayToken.trim() || undefined
        }
      })
    );
  };

  const exportCurrentTeam = () => {
    if (collabSession) {
      setManifestText(exportTeamManifest(collabSession.team));
    }
  };

  const importTeam = () => {
    if (!manifestText.trim()) {
      return;
    }

    void activateTeam(importTeamManifest(manifestText));
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
              Token
              <input
                data-testid="relay-token"
                value={relayToken}
                onChange={(event) => setRelayToken(event.currentTarget.value)}
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
          </div>
          <div className="team-status" data-testid="team-status">
            {collabSession ? `${collabSession.team.name} · ${collabStatus}` : "No team"}
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
            onClick={() => setEditor((current) => (current ? panViewport(current, { x: -40, y: 0 }) : current))}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Pan right"
            onClick={() => setEditor((current) => (current ? panViewport(current, { x: 40, y: 0 }) : current))}
          >
            →
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setEditor((current) => (current ? zoomViewport(current, -0.25) : current))}
          >
            −
          </button>
          <span className="zoom-readout">{Math.round((editor?.viewport.scale ?? 1) * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setEditor((current) => (current ? zoomViewport(current, 0.25) : current))}
          >
            +
          </button>
        </div>
        <div className="canvas-area" data-testid="canvas-area">
          <div className="stage-frame">
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
                  setEditor((current) => (current ? setSelection(current, null) : current));
                  collabSessionRef.current?.updatePresence({ selectedNodeId: null });
                  if (collabSessionRef.current) {
                    setPresence(collabSessionRef.current.getPresence());
                  }
                }
              }}
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
