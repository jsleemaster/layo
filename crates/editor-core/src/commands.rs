use crate::geometry::{Size, Transform};
use crate::model::{DesignFile, Node, NodeContent};
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
}

#[derive(Debug, Error, PartialEq)]
pub enum CommandError {
    #[error("node not found: {0}")]
    NodeNotFound(String),
    #[error("size must be positive")]
    InvalidSize,
    #[error("node is not text: {0}")]
    NodeIsNotText(String),
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
