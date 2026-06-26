use crate::geometry::{Bounds, Size, Transform};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct DesignFile {
    pub id: String,
    pub name: String,
    pub version: u32,
    #[serde(default)]
    pub components: Vec<ComponentDefinition>,
    pub pages: Vec<Page>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub children: Vec<Node>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component_instance: Option<ComponentInstance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<NodeLayout>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_item: Option<NodeLayoutItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<NodeConstraints>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "default_visible")]
    pub visible: bool,
    pub children: Vec<Node>,
    pub transform: Transform,
    pub size: Size,
    pub style: Style,
    pub content: NodeContent,
}

fn default_visible() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ComponentDefinition {
    pub id: String,
    pub name: String,
    pub source_node: Node,
    pub variants: Vec<ComponentVariant>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ComponentVariant {
    pub id: String,
    pub name: String,
    pub properties: Vec<ComponentProperty>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ComponentProperty {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ComponentInstance {
    pub definition_id: String,
    pub overrides: Vec<ComponentOverride>,
    pub detached: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct ComponentOverride {
    pub node_id: String,
    pub field: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct NodeLayout {
    pub mode: LayoutMode,
    pub direction: LayoutDirection,
    #[serde(default = "default_layout_wrap")]
    pub wrap: LayoutWrap,
    #[serde(default = "default_layout_align_items")]
    pub align_items: LayoutAlignItems,
    #[serde(default = "default_layout_justify_content")]
    pub justify_content: LayoutJustifyContent,
    #[serde(default = "default_layout_align_content")]
    pub align_content: LayoutAlignContent,
    #[serde(default = "default_layout_sizing", skip_serializing_if = "is_fixed_layout_sizing")]
    pub width_sizing: LayoutSizing,
    #[serde(default = "default_layout_sizing", skip_serializing_if = "is_fixed_layout_sizing")]
    pub height_sizing: LayoutSizing,
    pub gap: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_gap: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_columns: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_rows: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_gap: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_column_tracks: Option<Vec<GridTrack>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_row_tracks: Option<Vec<GridTrack>>,
    pub padding: LayoutPadding,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct GridTrack {
    #[serde(rename = "type")]
    pub track_type: GridTrackType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum GridTrackType {
    Px,
    Fr,
    Auto,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct LayoutPadding {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutItemPosition {
    Static,
    Absolute,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutItemSizing {
    Fixed,
    Fill,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct NodeLayoutItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<LayoutItemPosition>,
    #[serde(default = "default_layout_item_sizing", skip_serializing_if = "is_fixed_layout_item_sizing")]
    pub width_sizing: LayoutItemSizing,
    #[serde(default = "default_layout_item_sizing", skip_serializing_if = "is_fixed_layout_item_sizing")]
    pub height_sizing: LayoutItemSizing,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_column: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_row: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_column_span: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grid_row_span: Option<u32>,
    pub margin: LayoutPadding,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutMode {
    None,
    Auto,
    Grid,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutDirection {
    Horizontal,
    Vertical,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutWrap {
    Nowrap,
    Wrap,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutAlignItems {
    Start,
    Center,
    End,
    Stretch,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutJustifyContent {
    Start,
    Center,
    End,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutAlignContent {
    Start,
    Center,
    End,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LayoutSizing {
    Fixed,
    Fit,
}

fn default_layout_wrap() -> LayoutWrap {
    LayoutWrap::Nowrap
}

fn default_layout_align_items() -> LayoutAlignItems {
    LayoutAlignItems::Start
}

fn default_layout_justify_content() -> LayoutJustifyContent {
    LayoutJustifyContent::Start
}

fn default_layout_align_content() -> LayoutAlignContent {
    LayoutAlignContent::Start
}

fn default_layout_sizing() -> LayoutSizing {
    LayoutSizing::Fixed
}

fn is_fixed_layout_sizing(value: &LayoutSizing) -> bool {
    matches!(value, LayoutSizing::Fixed)
}

fn default_layout_item_sizing() -> LayoutItemSizing {
    LayoutItemSizing::Fixed
}

fn is_fixed_layout_item_sizing(value: &LayoutItemSizing) -> bool {
    matches!(value, LayoutItemSizing::Fixed)
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct NodeConstraints {
    pub horizontal: HorizontalConstraint,
    pub vertical: VerticalConstraint,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum HorizontalConstraint {
    Left,
    Right,
    LeftRight,
    Center,
    Scale,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum VerticalConstraint {
    Top,
    Bottom,
    TopBottom,
    Center,
    Scale,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum NodeKind {
    Frame,
    Group,
    Rectangle,
    Text,
    Image,
    Component,
    ComponentInstance,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Style {
    pub fill: String,
    pub stroke: Option<String>,
    pub stroke_width: f64,
    pub opacity: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum NodeContent {
    Empty,
    Text {
        value: String,
        font_size: f64,
        font_family: String,
    },
    Image {
        asset_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        natural_width: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        natural_height: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fit_mode: Option<String>,
    },
}

impl DesignFile {
    pub fn sample() -> Self {
        Self {
            id: "sample-file".to_string(),
            name: "샘플 파일".to_string(),
            version: 1,
            components: vec![],
            pages: vec![Page {
                id: "page-1".to_string(),
                name: "페이지 1".to_string(),
                children: vec![Node {
                    id: "frame-1".to_string(),
                    kind: NodeKind::Frame,
                    name: "랜딩 프레임".to_string(),
                    component_instance: None,
                    layout: None,
                    layout_item: None,
                    constraints: None,
                    locked: false,
                    visible: true,
                    children: vec![Node {
                        id: "text-1".to_string(),
                        kind: NodeKind::Text,
                        name: "헤드라인".to_string(),
                        component_instance: None,
                        layout: None,
                        layout_item: None,
                        constraints: None,
                        locked: false,
                        visible: true,
                        children: vec![],
                        transform: Transform {
                            x: 32.0,
                            y: 40.0,
                            rotation: 0.0,
                        },
                        size: Size {
                            width: 260.0,
                            height: 48.0,
                        },
                        style: Style {
                            fill: "#111827".to_string(),
                            stroke: None,
                            stroke_width: 0.0,
                            opacity: 1.0,
                        },
                        content: NodeContent::Text {
                            value: "Layo".to_string(),
                            font_size: 28.0,
                            font_family: "Inter".to_string(),
                        },
                    }],
                    transform: Transform {
                        x: 120.0,
                        y: 80.0,
                        rotation: 0.0,
                    },
                    size: Size {
                        width: 420.0,
                        height: 280.0,
                    },
                    style: Style {
                        fill: "#ffffff".to_string(),
                        stroke: Some("#d1d5db".to_string()),
                        stroke_width: 1.0,
                        opacity: 1.0,
                    },
                    content: NodeContent::Empty,
                }],
            }],
        }
    }

    pub fn node_count(&self) -> usize {
        self.pages.iter().map(Page::node_count).sum()
    }
}

impl Page {
    pub fn node_count(&self) -> usize {
        self.children.iter().map(Node::subtree_count).sum()
    }
}

impl Node {
    pub fn bounds(&self) -> Bounds {
        Bounds {
            x: self.transform.x,
            y: self.transform.y,
            width: self.size.width,
            height: self.size.height,
        }
    }

    pub fn subtree_count(&self) -> usize {
        1 + self.children.iter().map(Node::subtree_count).sum::<usize>()
    }
}
