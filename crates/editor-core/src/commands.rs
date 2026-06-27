use crate::geometry::{Size, Transform};
use crate::model::{
    ComponentDefinition, ComponentInstance, ComponentVariant, DesignFile, Node, NodeContent,
    NodeKind,
};
use thiserror::Error;

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    MoveNode { node_id: String, x: f64, y: f64 },
    ResizeNode {
        node_id: String,
        width: f64,
        height: f64,
    },
    SetFill {
        node_id: String,
        fill: String,
    },
    UpdateText {
        node_id: String,
        value: String,
    },
    CreateComponent {
        node_id: String,
        component_id: String,
        name: String,
    },
    DeleteComponent {
        node_id: String,
        component_id: String,
    },
    CreateComponentInstance {
        parent_id: String,
        definition_id: String,
        instance_id: String,
        x: f64,
        y: f64,
    },
    DeleteNode {
        parent_id: String,
        node_id: String,
    },
    DetachInstance {
        node_id: String,
    },
}

#[derive(Debug, Error, PartialEq)]
pub enum CommandError {
    #[error("node not found: {0}")]
    NodeNotFound(String),
    #[error("size must be positive")]
    InvalidSize,
    #[error("node is not text: {0}")]
    NodeIsNotText(String),
    #[error("component not found: {0}")]
    ComponentNotFound(String),
    #[error("parent not found: {0}")]
    ParentNotFound(String),
    #[error("node is not component instance: {0}")]
    NodeIsNotInstance(String),
}

impl DesignFile {
    pub fn apply_command(&mut self, command: Command) -> Result<Command, CommandError> {
        match command {
            Command::MoveNode { node_id, x, y } => {
                let node = self
                    .find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                let inverse = Command::MoveNode {
                    node_id,
                    x: node.transform.x,
                    y: node.transform.y,
                };
                node.transform = Transform {
                    x,
                    y,
                    rotation: node.transform.rotation,
                };
                Ok(inverse)
            }
            Command::ResizeNode {
                node_id,
                width,
                height,
            } => {
                if width <= 0.0 || height <= 0.0 {
                    return Err(CommandError::InvalidSize);
                }

                let node = self
                    .find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                let inverse = Command::ResizeNode {
                    node_id,
                    width: node.size.width,
                    height: node.size.height,
                };
                node.size = Size { width, height };
                Ok(inverse)
            }
            Command::SetFill { node_id, fill } => {
                let node = self
                    .find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                let inverse = Command::SetFill {
                    node_id,
                    fill: node.style.fill.clone(),
                };
                node.style.fill = fill;
                Ok(inverse)
            }
            Command::UpdateText { node_id, value } => {
                let node = self
                    .find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                match &mut node.content {
                    NodeContent::Text {
                        value: previous_value,
                        ..
                    } => {
                        let inverse = Command::UpdateText {
                            node_id,
                            value: previous_value.clone(),
                        };
                        *previous_value = value;
                        Ok(inverse)
                    }
                    _ => Err(CommandError::NodeIsNotText(node_id)),
                }
            }
            Command::CreateComponent {
                node_id,
                component_id,
                name,
            } => {
                let source_node = {
                    let node = self
                        .find_node_mut(&node_id)
                        .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                    node.kind = NodeKind::Component;
                    node.component_instance = None;
                    node.clone()
                };

                self.components.push(ComponentDefinition {
                    id: component_id.clone(),
                    name,
                    source_node,
                    variant_area: None,
                    variants: vec![ComponentVariant {
                        id: "default".to_string(),
                        name: "Default".to_string(),
                        properties: vec![],
                        source_node: None,
                    }],
                });

                Ok(Command::DeleteComponent {
                    node_id,
                    component_id,
                })
            }
            Command::DeleteComponent {
                node_id,
                component_id,
            } => {
                let node = self
                    .find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                node.kind = NodeKind::Frame;
                self.components
                    .retain(|component| component.id != component_id);
                Ok(Command::CreateComponent {
                    node_id,
                    component_id,
                    name: "복원된 컴포넌트".to_string(),
                })
            }
            Command::CreateComponentInstance {
                parent_id,
                definition_id,
                instance_id,
                x,
                y,
            } => {
                let definition = self
                    .components
                    .iter()
                    .find(|component| component.id == definition_id)
                    .ok_or_else(|| CommandError::ComponentNotFound(definition_id.clone()))?;
                let mut instance = definition.source_node.clone();
                rename_instance_tree(&mut instance, &instance_id);
                instance.id = instance_id.clone();
                instance.name = format!("{} 인스턴스", definition.name);
                instance.kind = NodeKind::ComponentInstance;
                instance.transform = Transform {
                    x,
                    y,
                    rotation: instance.transform.rotation,
                };
                instance.component_instance = Some(ComponentInstance {
                    definition_id,
                    variant_id: definition.variants.first().map(|variant| variant.id.clone()),
                    overrides: vec![],
                    detached: false,
                });

                let parent = self
                    .find_parent_children_mut(&parent_id)
                    .ok_or_else(|| CommandError::ParentNotFound(parent_id.clone()))?;
                parent.push(instance);

                Ok(Command::DeleteNode {
                    parent_id,
                    node_id: instance_id,
                })
            }
            Command::DeleteNode { parent_id, node_id } => {
                let parent = self
                    .find_parent_children_mut(&parent_id)
                    .ok_or_else(|| CommandError::ParentNotFound(parent_id.clone()))?;
                parent.retain(|node| node.id != node_id);
                Ok(Command::DeleteNode { parent_id, node_id })
            }
            Command::DetachInstance { node_id } => {
                let node = self
                    .find_node_mut(&node_id)
                    .ok_or_else(|| CommandError::NodeNotFound(node_id.clone()))?;
                if node.component_instance.is_none() {
                    return Err(CommandError::NodeIsNotInstance(node_id));
                }

                node.kind = NodeKind::Frame;
                node.component_instance = None;
                Ok(Command::DetachInstance { node_id })
            }
        }
    }

    fn find_node_mut(&mut self, node_id: &str) -> Option<&mut Node> {
        for page in &mut self.pages {
            for node in &mut page.children {
                if let Some(found) = find_in_node_mut(node, node_id) {
                    return Some(found);
                }
            }
        }
        None
    }

    fn find_parent_children_mut(&mut self, parent_id: &str) -> Option<&mut Vec<Node>> {
        for page in &mut self.pages {
            if page.id == parent_id {
                return Some(&mut page.children);
            }

            for node in &mut page.children {
                if let Some(found) = find_parent_in_node_mut(node, parent_id) {
                    return Some(found);
                }
            }
        }
        None
    }
}

fn find_in_node_mut<'a>(node: &'a mut Node, node_id: &str) -> Option<&'a mut Node> {
    if node.id == node_id {
        return Some(node);
    }

    for child in &mut node.children {
        if let Some(found) = find_in_node_mut(child, node_id) {
            return Some(found);
        }
    }

    None
}

fn find_parent_in_node_mut<'a>(node: &'a mut Node, parent_id: &str) -> Option<&'a mut Vec<Node>> {
    if node.id == parent_id {
        return Some(&mut node.children);
    }

    for child in &mut node.children {
        if let Some(found) = find_parent_in_node_mut(child, parent_id) {
            return Some(found);
        }
    }

    None
}

fn rename_instance_tree(node: &mut Node, instance_id: &str) {
    for child in &mut node.children {
        child.id = format!("{}__{}", instance_id, child.id);
        rename_instance_tree(child, instance_id);
    }
}
