use crate::geometry::Bounds;
use crate::model::{DesignFile, Node, NodeKind};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct DesignContext {
    pub file_id: String,
    pub file_name: String,
    pub node_count: usize,
    pub nodes: Vec<NodeSummary>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct NodeSummary {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub bounds: Bounds,
    pub child_count: usize,
}

impl DesignFile {
    pub fn design_context(&self) -> DesignContext {
        let mut nodes = Vec::new();
        for page in &self.pages {
            for node in &page.children {
                collect_node(node, &mut nodes);
            }
        }

        DesignContext {
            file_id: self.id.clone(),
            file_name: self.name.clone(),
            node_count: nodes.len(),
            nodes,
        }
    }
}

fn collect_node(node: &Node, nodes: &mut Vec<NodeSummary>) {
    nodes.push(NodeSummary {
        id: node.id.clone(),
        kind: node.kind.clone(),
        name: node.name.clone(),
        bounds: node.bounds(),
        child_count: node.children.len(),
    });

    for child in &node.children {
        collect_node(child, nodes);
    }
}
