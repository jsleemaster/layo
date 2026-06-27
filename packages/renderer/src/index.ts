export interface LayoutSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutSpacingTokens {
  gap?: string | null;
  row_gap?: string | null;
  column_gap?: string | null;
  padding_top?: string | null;
  padding_right?: string | null;
  padding_bottom?: string | null;
  padding_left?: string | null;
}

export interface GridTrack {
  type: "px" | "fr" | "auto";
  value?: number;
}

export interface GridArea {
  name: string;
  column: number;
  row: number;
  column_span: number;
  row_span: number;
}

export interface NodeLayout {
  mode: "none" | "auto" | "grid";
  direction: "horizontal" | "horizontal_reverse" | "vertical" | "vertical_reverse";
  wrap?: "nowrap" | "wrap";
  align_items: "start" | "center" | "end" | "stretch" | "baseline";
  justify_content: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
  justify_items?: "start" | "center" | "end" | "stretch";
  align_content?: "start" | "center" | "end" | "space_between" | "space_around" | "space_evenly";
  width_sizing?: "fixed" | "fit";
  height_sizing?: "fixed" | "fit";
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  gap: number;
  row_gap?: number;
  column_gap?: number;
  grid_columns?: number;
  grid_rows?: number;
  grid_column_tracks?: GridTrack[];
  grid_row_tracks?: GridTrack[];
  grid_areas?: GridArea[];
  spacing_tokens?: LayoutSpacingTokens | null;
  padding: LayoutSpacing;
}

export interface NodeLayoutItem {
  position?: "static" | "absolute";
  width_sizing?: "fixed" | "fill";
  height_sizing?: "fixed" | "fill";
  justify_self?: "start" | "center" | "end" | "stretch";
  align_self?: "start" | "center" | "end" | "stretch";
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  grid_area?: string;
  grid_column?: number;
  grid_row?: number;
  grid_column_span?: number;
  grid_row_span?: number;
  margin: LayoutSpacing;
}

export interface NodeConstraints {
  horizontal: "left" | "right" | "left_right" | "center" | "scale";
  vertical: "top" | "bottom" | "top_bottom" | "center" | "scale";
}

export type ImageFitMode = "fill" | "fit";
export type ExportPresetFormat = "png" | "jpeg" | "webp" | "svg" | "pdf";

export interface NodeExportPreset {
  id: string;
  format: ExportPresetFormat;
  scale: number;
  suffix: string;
}

export interface RendererNode {
  id: string;
  kind: "frame" | "group" | "rectangle" | "text" | "image" | "component" | "component_instance";
  name: string;
  component_instance?: ComponentInstance | null;
  layout?: NodeLayout | null;
  layout_item?: NodeLayoutItem | null;
  constraints?: NodeConstraints | null;
  export_presets?: NodeExportPreset[];
  locked?: boolean;
  visible?: boolean;
  transform: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    fill_token?: string | null;
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

export interface DesignToken {
  id: string;
  name: string;
  type: "color" | "spacing";
  value: string;
}

export interface RendererDocument {
  id: string;
  name: string;
  tokens?: DesignToken[];
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
