export interface LayoutSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NodeLayout {
  mode: "none" | "auto";
  direction: "horizontal" | "vertical";
  wrap?: "nowrap" | "wrap";
  align_items: "start" | "center" | "end" | "stretch";
  justify_content: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
  align_content?: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
  gap: number;
  row_gap?: number;
  column_gap?: number;
  padding: LayoutSpacing;
}

export interface NodeLayoutItem {
  position?: "static" | "absolute";
  margin: LayoutSpacing;
}

export interface NodeConstraints {
  horizontal: "left" | "right" | "left_right" | "center" | "scale";
  vertical: "top" | "bottom" | "top_bottom" | "center" | "scale";
}

export type ImageFitMode = "fill" | "fit";

export interface RendererNode {
  id: string;
  kind: "frame" | "group" | "rectangle" | "text" | "image" | "component" | "component_instance";
  name: string;
  component_instance?: ComponentInstance | null;
  layout?: NodeLayout | null;
  layout_item?: NodeLayoutItem | null;
  constraints?: NodeConstraints | null;
  locked?: boolean;
  visible?: boolean;
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
    | {
        type: "image";
        asset_id: string;
        natural_width?: number;
        natural_height?: number;
        fit_mode?: ImageFitMode;
      };
  children: RendererNode[];
}

export interface ComponentDefinition {
  id: string;
  name: string;
  source_node: RendererNode;
  variants: ComponentVariant[];
}

export interface ComponentVariant {
  id: string;
  name: string;
  properties: Array<{ name: string; value: string }>;
}

export interface ComponentInstance {
  definition_id: string;
  overrides: Array<{ node_id: string; field: string; value: string }>;
  detached: boolean;
}

export interface RendererDocument {
  id: string;
  name: string;
  components?: ComponentDefinition[];
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
