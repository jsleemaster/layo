use editor_core::DesignFile;

#[test]
fn sample_document_round_trips_through_json() {
    let file = DesignFile::sample();
    let json = serde_json::to_string_pretty(&file).unwrap();
    let parsed: DesignFile = serde_json::from_str(&json).unwrap();

    assert_eq!(parsed, file);
    assert_eq!(parsed.node_count(), 2);
}

#[test]
fn component_document_round_trips_through_json() {
    let mut file = DesignFile::sample();
    file.apply_command(editor_core::Command::CreateComponent {
        node_id: "frame-1".to_string(),
        component_id: "component-1".to_string(),
        name: "Card".to_string(),
    })
    .unwrap();
    file.apply_command(editor_core::Command::CreateComponentInstance {
        parent_id: "page-1".to_string(),
        definition_id: "component-1".to_string(),
        instance_id: "instance-1".to_string(),
        x: 480.0,
        y: 120.0,
    })
    .unwrap();

    let json = serde_json::to_string_pretty(&file).unwrap();
    let parsed: DesignFile = serde_json::from_str(&json).unwrap();

    assert_eq!(parsed.components.len(), 1);
    assert_eq!(parsed.components[0].id, "component-1");
    assert_eq!(parsed.components[0].variants[0].name, "Default");
    assert_eq!(parsed.pages[0].children[1].kind, editor_core::NodeKind::ComponentInstance);
    assert_eq!(
        parsed.pages[0].children[1]
            .component_instance
            .as_ref()
            .unwrap()
            .definition_id,
        "component-1"
    );
}

#[test]
fn layout_metadata_round_trips_through_json() {
    let raw = r##"
    {
      "id": "layout-file",
      "name": "Layout File",
      "version": 1,
      "components": [],
      "pages": [
        {
          "id": "page-1",
          "name": "페이지 1",
          "children": [
            {
              "id": "frame-1",
              "kind": "frame",
              "name": "Auto Frame",
              "layout": {
                "mode": "grid",
                "direction": "horizontal_reverse",
                "grid_columns": 2,
                "grid_rows": 2,
                "grid_column_tracks": [{ "type": "px", "value": 120 }, { "type": "fr", "value": 2 }],
                "grid_row_tracks": [{ "type": "auto" }, { "type": "fr", "value": 1 }],
                "grid_areas": [{ "name": "hero", "column": 2, "row": 1, "column_span": 2, "row_span": 2 }],
                "wrap": "wrap",
                "align_items": "center",
                "justify_content": "space_between",
                "justify_items": "stretch",
                "align_content": "space_around",
                "width_sizing": "fit",
                "height_sizing": "fit",
                "min_width": 220,
                "max_width": 240,
                "min_height": 160,
                "max_height": 170,
                "gap": 12,
                "row_gap": 24,
                "column_gap": 6,
                "padding": { "top": 20, "right": 24, "bottom": 20, "left": 24 }
              },
              "transform": { "x": 0, "y": 0, "rotation": 0 },
              "size": { "width": 320, "height": 240 },
              "style": { "fill": "#ffffff", "stroke": null, "stroke_width": 0, "opacity": 1 },
              "content": { "type": "empty" },
              "children": [
                {
                  "id": "child-1",
                  "kind": "rectangle",
                  "name": "Pinned Child",
                  "constraints": { "horizontal": "right", "vertical": "bottom" },
                  "layout_item": { "position": "absolute", "width_sizing": "fill", "height_sizing": "fill", "justify_self": "end", "align_self": "center", "min_width": 120, "max_width": 180, "min_height": 80, "max_height": 120, "grid_area": "hero", "grid_column": 3, "grid_row": 2, "grid_column_span": 2, "grid_row_span": 2, "margin": { "top": 10, "right": 8, "bottom": 14, "left": 6 } },
                  "transform": { "x": 220, "y": 180, "rotation": 0 },
                  "size": { "width": 64, "height": 32 },
                  "style": { "fill": "#e0f2fe", "stroke": null, "stroke_width": 0, "opacity": 1 },
                  "content": { "type": "empty" },
                  "children": []
                }
              ]
            }
          ]
        }
      ]
    }
    "##;

    let parsed: DesignFile = serde_json::from_str(raw).unwrap();
    let frame = &parsed.pages[0].children[0];
    let child = &frame.children[0];

    assert_eq!(frame.layout.as_ref().unwrap().mode, editor_core::LayoutMode::Grid);
    assert_eq!(
        frame.layout.as_ref().unwrap().direction,
        editor_core::LayoutDirection::HorizontalReverse
    );
    assert_eq!(frame.layout.as_ref().unwrap().grid_columns, Some(2));
    assert_eq!(frame.layout.as_ref().unwrap().grid_rows, Some(2));
    assert_eq!(
        frame.layout.as_ref().unwrap().grid_column_tracks.as_ref().unwrap()[0],
        editor_core::GridTrack {
            track_type: editor_core::GridTrackType::Px,
            value: Some(120.0)
        }
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().grid_column_tracks.as_ref().unwrap()[1],
        editor_core::GridTrack {
            track_type: editor_core::GridTrackType::Fr,
            value: Some(2.0)
        }
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().grid_row_tracks.as_ref().unwrap()[0],
        editor_core::GridTrack {
            track_type: editor_core::GridTrackType::Auto,
            value: None
        }
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().grid_areas.as_ref().unwrap()[0],
        editor_core::GridArea {
            name: "hero".to_string(),
            column: 2,
            row: 1,
            column_span: 2,
            row_span: 2
        }
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().wrap,
        editor_core::LayoutWrap::Wrap
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().align_items,
        editor_core::LayoutAlignItems::Center
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().justify_content,
        editor_core::LayoutJustifyContent::SpaceBetween
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().justify_items,
        editor_core::LayoutJustifyItems::Stretch
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().align_content,
        editor_core::LayoutAlignContent::SpaceAround
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().width_sizing,
        editor_core::LayoutSizing::Fit
    );
    assert_eq!(
        frame.layout.as_ref().unwrap().height_sizing,
        editor_core::LayoutSizing::Fit
    );
    assert_eq!(frame.layout.as_ref().unwrap().min_width, Some(220.0));
    assert_eq!(frame.layout.as_ref().unwrap().max_width, Some(240.0));
    assert_eq!(frame.layout.as_ref().unwrap().min_height, Some(160.0));
    assert_eq!(frame.layout.as_ref().unwrap().max_height, Some(170.0));
    assert_eq!(frame.layout.as_ref().unwrap().gap, 12.0);
    assert_eq!(frame.layout.as_ref().unwrap().row_gap, Some(24.0));
    assert_eq!(frame.layout.as_ref().unwrap().column_gap, Some(6.0));
    assert_eq!(
        child.constraints.as_ref().unwrap().horizontal,
        editor_core::HorizontalConstraint::Right
    );
    assert_eq!(
        child.layout_item.as_ref().unwrap().width_sizing,
        editor_core::LayoutItemSizing::Fill
    );
    assert_eq!(
        child.layout_item.as_ref().unwrap().height_sizing,
        editor_core::LayoutItemSizing::Fill
    );
    assert_eq!(
        child.layout_item.as_ref().unwrap().justify_self.as_ref().unwrap(),
        &editor_core::LayoutSelfAlignment::End
    );
    assert_eq!(
        child.layout_item.as_ref().unwrap().align_self.as_ref().unwrap(),
        &editor_core::LayoutSelfAlignment::Center
    );
    assert_eq!(child.layout_item.as_ref().unwrap().min_width, Some(120.0));
    assert_eq!(child.layout_item.as_ref().unwrap().max_width, Some(180.0));
    assert_eq!(child.layout_item.as_ref().unwrap().min_height, Some(80.0));
    assert_eq!(child.layout_item.as_ref().unwrap().max_height, Some(120.0));
    assert_eq!(child.layout_item.as_ref().unwrap().margin.top, 10.0);
    assert_eq!(child.layout_item.as_ref().unwrap().margin.right, 8.0);
    assert_eq!(child.layout_item.as_ref().unwrap().margin.bottom, 14.0);
    assert_eq!(child.layout_item.as_ref().unwrap().margin.left, 6.0);
    assert_eq!(
        child.layout_item.as_ref().unwrap().grid_area.as_ref().unwrap(),
        "hero"
    );
    assert_eq!(
        child.layout_item.as_ref().unwrap().position.as_ref().unwrap(),
        &editor_core::LayoutItemPosition::Absolute
    );
    assert_eq!(child.layout_item.as_ref().unwrap().grid_column_span, Some(2));
    assert_eq!(child.layout_item.as_ref().unwrap().grid_row_span, Some(2));

    let json = serde_json::to_string(&parsed).unwrap();
    assert!(json.contains("\"layout\""));
    assert!(json.contains("\"constraints\""));
    assert!(json.contains("\"grid_column\":3"));
    assert!(json.contains("\"grid_row\":2"));
    assert!(json.contains("\"grid_column_span\":2"));
    assert!(json.contains("\"grid_row_span\":2"));
    assert!(json.contains("\"min_width\":220.0"));
    assert!(json.contains("\"max_width\":240.0"));
    assert!(json.contains("\"min_height\":160.0"));
    assert!(json.contains("\"max_height\":170.0"));
    assert!(json.contains("\"direction\":\"horizontal_reverse\""));
    assert!(json.contains("\"grid_column_tracks\""));
    assert!(json.contains("\"grid_row_tracks\""));
    assert!(json.contains("\"grid_areas\""));
    assert!(json.contains("\"justify_items\":\"stretch\""));
    assert!(json.contains("\"justify_self\":\"end\""));
    assert!(json.contains("\"align_self\":\"center\""));
    assert!(json.contains("\"name\":\"hero\""));
    assert!(json.contains("\"grid_area\":\"hero\""));
    assert!(json.contains("\"type\":\"px\""));
    assert!(json.contains("\"type\":\"fr\""));
    assert!(json.contains("\"type\":\"auto\""));
    assert!(json.contains("\"layout_item\""));
}

#[test]
fn legacy_layout_metadata_defaults_alignment_fields() {
    let raw = r##"
    {
      "id": "legacy-layout-file",
      "name": "Legacy Layout File",
      "version": 1,
      "components": [],
      "pages": [
        {
          "id": "page-1",
          "name": "페이지 1",
          "children": [
            {
              "id": "frame-1",
              "kind": "frame",
              "name": "Legacy Auto Frame",
              "layout": {
                "mode": "auto",
                "direction": "vertical",
                "gap": 12,
                "padding": { "top": 20, "right": 24, "bottom": 20, "left": 24 }
              },
              "transform": { "x": 0, "y": 0, "rotation": 0 },
              "size": { "width": 320, "height": 240 },
              "style": { "fill": "#ffffff", "stroke": null, "stroke_width": 0, "opacity": 1 },
              "content": { "type": "empty" },
              "children": []
            }
          ]
        }
      ]
    }
    "##;

    let parsed: DesignFile = serde_json::from_str(raw).unwrap();
    let layout = parsed.pages[0].children[0].layout.as_ref().unwrap();

    assert_eq!(layout.align_items, editor_core::LayoutAlignItems::Start);
    assert_eq!(
        layout.justify_content,
        editor_core::LayoutJustifyContent::Start
    );
    assert_eq!(layout.justify_items, editor_core::LayoutJustifyItems::Start);
    assert_eq!(layout.width_sizing, editor_core::LayoutSizing::Fixed);
    assert_eq!(layout.height_sizing, editor_core::LayoutSizing::Fixed);
    assert_eq!(layout.row_gap, None);
    assert_eq!(layout.column_gap, None);

    let json = serde_json::to_string(&parsed).unwrap();
    assert!(!json.contains("\"width_sizing\""));
    assert!(!json.contains("\"height_sizing\""));
    assert!(!json.contains("\"row_gap\""));
    assert!(!json.contains("\"column_gap\""));
}

#[test]
fn node_interaction_metadata_round_trips_through_json() {
    let raw = r##"
    {
      "id": "interaction-file",
      "name": "Interaction File",
      "version": 1,
      "components": [],
      "pages": [
        {
          "id": "page-1",
          "name": "페이지 1",
          "children": [
            {
              "id": "locked-frame",
              "kind": "frame",
              "name": "Locked Frame",
              "locked": true,
              "visible": false,
              "transform": { "x": 0, "y": 0, "rotation": 0 },
              "size": { "width": 320, "height": 240 },
              "style": { "fill": "#ffffff", "stroke": null, "stroke_width": 0, "opacity": 1 },
              "content": { "type": "empty" },
              "children": []
            }
          ]
        }
      ]
    }
    "##;

    let parsed: DesignFile = serde_json::from_str(raw).unwrap();
    let frame = &parsed.pages[0].children[0];

    assert!(frame.locked);
    assert!(!frame.visible);

    let json = serde_json::to_string(&parsed).unwrap();
    assert!(json.contains("\"locked\":true"));
    assert!(json.contains("\"visible\":false"));
}

#[test]
fn group_nodes_round_trip_through_json() {
    let raw = r##"
    {
      "id": "group-file",
      "name": "Group File",
      "version": 1,
      "components": [],
      "pages": [
        {
          "id": "page-1",
          "name": "페이지 1",
          "children": [
            {
              "id": "group-1",
              "kind": "group",
              "name": "그룹 1",
              "transform": { "x": 120, "y": 80, "rotation": 0 },
              "size": { "width": 420, "height": 280 },
              "style": { "fill": "transparent", "stroke": null, "stroke_width": 0, "opacity": 1 },
              "content": { "type": "empty" },
              "children": [
                {
                  "id": "rectangle-1",
                  "kind": "rectangle",
                  "name": "사각형",
                  "transform": { "x": 0, "y": 0, "rotation": 0 },
                  "size": { "width": 160, "height": 96 },
                  "style": { "fill": "#e0f2fe", "stroke": null, "stroke_width": 0, "opacity": 1 },
                  "content": { "type": "empty" },
                  "children": []
                }
              ]
            }
          ]
        }
      ]
    }
    "##;

    let parsed: DesignFile = serde_json::from_str(raw).unwrap();
    let group = &parsed.pages[0].children[0];

    assert_eq!(group.kind, editor_core::NodeKind::Group);
    assert_eq!(group.subtree_count(), 2);

    let json = serde_json::to_string(&parsed).unwrap();
    assert!(json.contains("\"kind\":\"group\""));
}

#[test]
fn image_original_size_metadata_round_trips_through_json() {
    let raw = r##"
    {
      "id": "image-file",
      "name": "Image File",
      "version": 1,
      "components": [],
      "pages": [
        {
          "id": "page-1",
          "name": "페이지 1",
          "children": [
            {
              "id": "image-1",
              "kind": "image",
              "name": "이미지",
              "transform": { "x": 24, "y": 36, "rotation": 0 },
              "size": { "width": 360, "height": 240 },
              "style": { "fill": "#f3f4f6", "stroke": null, "stroke_width": 0, "opacity": 1 },
              "content": {
                "type": "image",
                "asset_id": "asset-large",
                "natural_width": 720,
                "natural_height": 480,
                "fit_mode": "fit"
              },
              "children": []
            }
          ]
        }
      ]
    }
    "##;

    let parsed: DesignFile = serde_json::from_str(raw).unwrap();
    let image = &parsed.pages[0].children[0];

    match &image.content {
        editor_core::NodeContent::Image {
            asset_id,
            natural_width,
            natural_height,
            fit_mode,
        } => {
            assert_eq!(asset_id, "asset-large");
            assert_eq!(*natural_width, Some(720.0));
            assert_eq!(*natural_height, Some(480.0));
            assert_eq!(fit_mode.as_deref(), Some("fit"));
        }
        _ => panic!("expected image content"),
    }

    let json = serde_json::to_string(&parsed).unwrap();
    assert!(json.contains("\"natural_width\":720.0"));
    assert!(json.contains("\"natural_height\":480.0"));
    assert!(json.contains("\"fit_mode\":\"fit\""));
}
