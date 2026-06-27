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
export type TextWritingMode = "horizontal_tb" | "vertical_rl" | "vertical_lr";
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
    fill_style?: string | null;
    stroke: string | null;
    stroke_width: number;
    opacity: number;
  };
  content:
    | { type: "empty" }
    | {
        type: "text";
        value: string;
        font_size: number;
        font_family: string;
        writing_mode?: TextWritingMode;
        typography_token?: string | null;
        typography_style?: string | null;
      }
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

export type ComponentPropertyType = "select" | "boolean";

export interface ComponentProperty {
  name: string;
  value: string;
  type?: ComponentPropertyType;
}

export interface ComponentVariant {
  id: string;
  name: string;
  properties: ComponentProperty[];
  source_node?: RendererNode | null;
}

export interface ComponentInstance {
  definition_id: string;
  variant_id?: string | null;
  overrides: Array<{ node_id: string; field: string; value: string }>;
  detached: boolean;
}

export interface CodeComponentMappingProp {
  name: string;
  type: "string";
  source_node_id: string;
  source_field: "text";
  default_value: string;
}

export interface CodeComponentMappingVariantProp {
  name: string;
  type: "string";
  variant_property: string;
  default_value: string;
}

export interface CodeComponentMapping {
  id: string;
  component_id: string;
  package_name?: string;
  import_path: string;
  export_name: string;
  import_mode: "named" | "default";
  props: CodeComponentMappingProp[];
  variant_props: CodeComponentMappingVariantProp[];
  docs_url?: string;
}

export interface DesignToken {
  id: string;
  name: string;
  type: "color" | "spacing" | "typography";
  value: string;
  set_id?: string | null;
}

export interface DesignTokenSet {
  id: string;
  name: string;
  enabled: boolean;
}

export interface DesignTokenTheme {
  id: string;
  name: string;
  group?: string | null;
  enabled: boolean;
  token_set_ids: string[];
}

export interface DesignStyle {
  id: string;
  name: string;
  type: "color" | "typography";
  value: string;
}

export interface RendererDocument {
  id: string;
  name: string;
  tokens?: DesignToken[];
  token_sets?: DesignTokenSet[];
  token_themes?: DesignTokenTheme[];
  styles?: DesignStyle[];
  components?: ComponentDefinition[];
  code_mappings?: CodeComponentMapping[];
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
