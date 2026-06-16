import { useEffect, useMemo, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import {
  flattenRendererNodes,
  type RendererDocument,
  type RendererNode
} from "@canvas-mcp-editor/renderer";
import { parseDocumentPayload } from "./document-api";
import { editorKonvaTokens } from "./design-tokens";
import {
  createEditorState,
  createRectangleNode,
  createTextNode,
  executeEditorCommand,
  findNodeById,
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

function renderNode({
  node,
  selectedNodeId,
  onSelect,
  onGeometryChange
}: {
  node: RendererNode;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onGeometryChange: (nodeId: string, patch: GeometryPatch) => void;
}) {
  const isSelected = node.id === selectedNodeId;
  const handleSize = editorKonvaTokens.selection.handleSize;

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

  const stopDragBubble = (event: KonvaEventObject<DragEvent>) => {
    event.cancelBubble = true;
  };

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
            x={node.size.width - handleSize}
            y={node.size.height - handleSize}
            width={handleSize}
            height={handleSize}
            fill={editorKonvaTokens.selection.handleFill}
            stroke={editorKonvaTokens.selection.stroke}
            strokeWidth={editorKonvaTokens.selection.strokeWidth}
            draggable
            onDragStart={stopDragBubble}
            onDragMove={stopDragBubble}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              onGeometryChange(node.id, {
                width: Math.round(event.target.x() + handleSize),
                height: Math.round(event.target.y() + handleSize)
              });
            }}
          />
        </>
      ) : null}
      {node.children.map((child) =>
        renderNode({
          node: child,
          selectedNodeId,
          onSelect,
          onGeometryChange
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

  useEffect(() => {
    fetch("http://127.0.0.1:4317/files/sample-file")
      .then((response) => response.json())
      .then((payload) => setEditor(createEditorState(parseDocumentPayload(payload))))
      .catch(() => setEditor(null));
  }, []);

  const nodes = useMemo(
    () => (editor ? flattenRendererNodes(editor.document) : []),
    [editor]
  );
  const selectedNode = useMemo(
    () => (editor?.selection.nodeId ? findNodeById(editor.document, editor.selection.nodeId) : null),
    [editor]
  );

  const dispatch = (command: Parameters<typeof executeEditorCommand>[1]) => {
    setEditor((current) => (current ? executeEditorCommand(current, command) : current));
  };

  const selectNode = (nodeId: string) => {
    setEditor((current) => (current ? setSelection(current, nodeId) : current));
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
            </button>
          ))}
        </div>
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
                if (event.target === event.target.getStage()) {
                  setEditor((current) => (current ? setSelection(current, null) : current));
                }
              }}
            >
              <Layer>
                {editor?.document.pages[0]?.children.map((node) =>
                  renderNode({
                    node,
                    selectedNodeId: editor.selection.nodeId,
                    onSelect: selectNode,
                    onGeometryChange: updateGeometry
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
