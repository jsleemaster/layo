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
                "mode": "auto",
                "direction": "vertical",
                "gap": 12,
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

    assert_eq!(frame.layout.as_ref().unwrap().mode, editor_core::LayoutMode::Auto);
    assert_eq!(
        frame.layout.as_ref().unwrap().direction,
        editor_core::LayoutDirection::Vertical
    );
    assert_eq!(frame.layout.as_ref().unwrap().gap, 12.0);
    assert_eq!(
        child.constraints.as_ref().unwrap().horizontal,
        editor_core::HorizontalConstraint::Right
    );

    let json = serde_json::to_string(&parsed).unwrap();
    assert!(json.contains("\"layout\""));
    assert!(json.contains("\"constraints\""));
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
