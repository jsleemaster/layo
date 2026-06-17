use editor_core::{Command, CommandError, DesignFile};

#[test]
fn moving_node_returns_inverse_command() {
    let mut file = DesignFile::sample();
    let inverse = file
        .apply_command(Command::MoveNode {
            node_id: "frame-1".to_string(),
            x: 200.0,
            y: 150.0,
        })
        .unwrap();

    assert_eq!(file.pages[0].children[0].transform.x, 200.0);
    assert_eq!(
        inverse,
        Command::MoveNode {
            node_id: "frame-1".to_string(),
            x: 120.0,
            y: 80.0
        }
    );
}

#[test]
fn resizing_rejects_non_positive_dimensions() {
    let mut file = DesignFile::sample();
    let error = file
        .apply_command(Command::ResizeNode {
            node_id: "frame-1".to_string(),
            width: 0.0,
            height: 20.0,
        })
        .unwrap_err();

    assert_eq!(error, CommandError::InvalidSize);
}

#[test]
fn setting_fill_returns_inverse_command() {
    let mut file = DesignFile::sample();
    let inverse = file
        .apply_command(Command::SetFill {
            node_id: "text-1".to_string(),
            fill: "#2563eb".to_string(),
        })
        .unwrap();

    assert_eq!(file.pages[0].children[0].children[0].style.fill, "#2563eb");
    assert_eq!(
        inverse,
        Command::SetFill {
            node_id: "text-1".to_string(),
            fill: "#111827".to_string()
        }
    );
}

#[test]
fn updating_text_returns_inverse_command() {
    let mut file = DesignFile::sample();
    let inverse = file
        .apply_command(Command::UpdateText {
            node_id: "text-1".to_string(),
            value: "Edited headline".to_string(),
        })
        .unwrap();

    match &file.pages[0].children[0].children[0].content {
        editor_core::NodeContent::Text { value, .. } => {
            assert_eq!(value, "Edited headline");
        }
        _ => panic!("expected text node"),
    }

    assert_eq!(
        inverse,
        Command::UpdateText {
            node_id: "text-1".to_string(),
            value: "캔버스 MCP 에디터".to_string()
        }
    );
}

#[test]
fn creating_component_converts_node_and_stores_definition() {
    let mut file = DesignFile::sample();
    let inverse = file
        .apply_command(Command::CreateComponent {
            node_id: "frame-1".to_string(),
            component_id: "component-1".to_string(),
            name: "Card".to_string(),
        })
        .unwrap();

    assert_eq!(file.components.len(), 1);
    assert_eq!(file.components[0].name, "Card");
    assert_eq!(file.components[0].source_node.id, "frame-1");
    assert_eq!(file.pages[0].children[0].kind, editor_core::NodeKind::Component);
    assert_eq!(
        inverse,
        Command::DeleteComponent {
            node_id: "frame-1".to_string(),
            component_id: "component-1".to_string()
        }
    );
}

#[test]
fn creating_and_detaching_component_instance_mutates_tree() {
    let mut file = DesignFile::sample();
    file.apply_command(Command::CreateComponent {
        node_id: "frame-1".to_string(),
        component_id: "component-1".to_string(),
        name: "Card".to_string(),
    })
    .unwrap();

    let inverse = file
        .apply_command(Command::CreateComponentInstance {
            parent_id: "page-1".to_string(),
            definition_id: "component-1".to_string(),
            instance_id: "instance-1".to_string(),
            x: 480.0,
            y: 120.0,
        })
        .unwrap();

    assert_eq!(file.pages[0].children[1].id, "instance-1");
    assert_eq!(file.pages[0].children[1].kind, editor_core::NodeKind::ComponentInstance);
    assert_eq!(
        file.pages[0].children[1]
            .component_instance
            .as_ref()
            .unwrap()
            .definition_id,
        "component-1"
    );
    assert_eq!(
        inverse,
        Command::DeleteNode {
            parent_id: "page-1".to_string(),
            node_id: "instance-1".to_string()
        }
    );

    file.apply_command(Command::DetachInstance {
        node_id: "instance-1".to_string(),
    })
    .unwrap();
    assert_eq!(file.pages[0].children[1].kind, editor_core::NodeKind::Frame);
    assert!(file.pages[0].children[1].component_instance.is_none());
}

#[test]
fn design_context_flattens_nodes_for_agents() {
    let file = DesignFile::sample();
    let context = file.design_context();

    assert_eq!(context.file_id, "sample-file");
    assert_eq!(context.node_count, 2);
    assert_eq!(context.nodes[0].id, "frame-1");
    assert_eq!(context.nodes[1].id, "text-1");
}
