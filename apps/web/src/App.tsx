import { useEffect, useMemo, useState } from "react";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import {
  flattenRendererNodes,
  type RendererDocument,
  type RendererNode
} from "@canvas-mcp-editor/renderer";
import { parseDocumentPayload } from "./document-api";

function renderNode(node: RendererNode) {
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
        cornerRadius={node.kind === "frame" ? 8 : 0}
      />
    );

  return (
    <Group
      key={node.id}
      x={node.transform.x}
      y={node.transform.y}
      rotation={node.transform.rotation}
    >
      {body}
      {node.children.map(renderNode)}
    </Group>
  );
}

export function App() {
  const [document, setDocument] = useState<RendererDocument | null>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:4317/files/sample-file")
      .then((response) => response.json())
      .then((payload) => setDocument(parseDocumentPayload(payload)))
      .catch(() => setDocument(null));
  }, []);

  const nodes = useMemo(() => (document ? flattenRendererNodes(document) : []), [document]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>Canvas MCP Editor</h1>
        <p>{document ? document.name : "Start the local server to load the sample file."}</p>
        <div className="layer-list">
          {nodes.map((node) => (
            <button key={node.id} type="button">
              {node.name}
            </button>
          ))}
        </div>
      </aside>
      <section className="canvas-area">
        <div className="stage-frame">
          <Stage width={960} height={640}>
            <Layer>{document?.pages[0]?.children.map(renderNode)}</Layer>
          </Stage>
        </div>
      </section>
    </main>
  );
}
