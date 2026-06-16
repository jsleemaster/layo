export interface RendererNode {
  id: string;
  kind: "frame" | "rectangle" | "text" | "image";
  name: string;
  transform: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    stroke: string | null;
    stroke_width: number;
    opacity: number;
  };
  content:
    | { type: "empty" }
    | { type: "text"; value: string; font_size: number; font_family: string }
    | { type: "image"; asset_id: string };
  children: RendererNode[];
}

export interface RendererDocument {
  id: string;
  name: string;
  pages: Array<{ id: string; name: string; children: RendererNode[] }>;
}

export function flattenRendererNodes(document: RendererDocument): RendererNode[] {
  const nodes: RendererNode[] = [];

  const visit = (node: RendererNode) => {
    nodes.push(node);
    node.children.forEach(visit);
  };

  document.pages.forEach((page) => page.children.forEach(visit));
  return nodes;
}
