use crate::frame::{decode_frame, RelayFrameType};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
use thiserror::Error;
use tokio::sync::{mpsc, Mutex};

#[derive(Clone, Debug, Default)]
pub struct RelayHub {
    rooms: Arc<Mutex<HashMap<String, RoomState>>>,
    next_peer_id: Arc<AtomicU64>,
}

#[derive(Debug, Default)]
struct RoomState {
    peers: HashMap<u64, mpsc::UnboundedSender<Vec<u8>>>,
}

#[derive(Debug)]
pub struct RelayPeer {
    id: u64,
    room_id: String,
    pub can_write_document: bool,
    receiver: mpsc::UnboundedReceiver<Vec<u8>>,
}

#[derive(Debug, Error)]
pub enum RoomError {
    #[error(transparent)]
    Frame(#[from] crate::frame::FrameError),
}

impl RelayHub {
    pub async fn connect(&self, room_id: String, can_write_document: bool) -> RelayPeer {
        let id = self.next_peer_id.fetch_add(1, Ordering::Relaxed) + 1;
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut rooms = self.rooms.lock().await;
        rooms
            .entry(room_id.clone())
            .or_default()
            .peers
            .insert(id, sender);

        RelayPeer {
            id,
            room_id,
            can_write_document,
            receiver,
        }
    }

    pub async fn handle_frame(&self, peer: &RelayPeer, frame: Vec<u8>) -> Result<(), RoomError> {
        let decoded = decode_frame(&frame)?;
        match decoded.frame_type {
            RelayFrameType::Awareness | RelayFrameType::QueryAwareness => {
                self.broadcast(peer, frame).await;
            }
            RelayFrameType::EncryptedSync | RelayFrameType::EncryptedSyncQuery => {
                if peer.can_write_document {
                    self.broadcast(peer, frame).await;
                }
            }
        }
        Ok(())
    }

    async fn broadcast(&self, peer: &RelayPeer, frame: Vec<u8>) {
        let mut rooms = self.rooms.lock().await;
        let Some(room) = rooms.get_mut(&peer.room_id) else {
            return;
        };

        let mut closed_peers = Vec::new();
        for (peer_id, sender) in &room.peers {
            if *peer_id == peer.id {
                continue;
            }
            if sender.send(frame.clone()).is_err() {
                closed_peers.push(*peer_id);
            }
        }
        for peer_id in closed_peers {
            room.peers.remove(&peer_id);
        }
    }
}

impl RelayPeer {
    pub async fn recv(&mut self) -> Option<Vec<u8>> {
        self.receiver.recv().await
    }

    pub fn try_recv(&mut self) -> Option<Vec<u8>> {
        self.receiver.try_recv().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::{encode_payload_frame, RelayFrameType};

    #[tokio::test]
    async fn broadcasts_encrypted_sync_to_other_peers_only() {
        let hub = RelayHub::default();
        let mut first = hub
            .connect("canvas-mcp-editor:team:doc".to_string(), true)
            .await;
        let mut second = hub
            .connect("canvas-mcp-editor:team:doc".to_string(), true)
            .await;

        hub.handle_frame(
            &first,
            encode_payload_frame(RelayFrameType::EncryptedSync, b"secret"),
        )
        .await
        .expect("frame accepted");

        assert_eq!(
            second.recv().await.expect("broadcast"),
            encode_payload_frame(RelayFrameType::EncryptedSync, b"secret")
        );
        assert!(first.try_recv().is_none());
    }

    #[tokio::test]
    async fn drops_encrypted_sync_from_viewers() {
        let hub = RelayHub::default();
        let viewer = hub
            .connect("canvas-mcp-editor:team:doc".to_string(), false)
            .await;
        let mut editor = hub
            .connect("canvas-mcp-editor:team:doc".to_string(), true)
            .await;

        hub.handle_frame(
            &viewer,
            encode_payload_frame(RelayFrameType::EncryptedSync, b"secret"),
        )
        .await
        .expect("viewer frame is ignored");

        assert!(editor.try_recv().is_none());
    }

    #[tokio::test]
    async fn broadcasts_awareness_from_viewers() {
        let hub = RelayHub::default();
        let viewer = hub
            .connect("canvas-mcp-editor:team:doc".to_string(), false)
            .await;
        let mut editor = hub
            .connect("canvas-mcp-editor:team:doc".to_string(), true)
            .await;

        hub.handle_frame(
            &viewer,
            encode_payload_frame(RelayFrameType::Awareness, b"presence"),
        )
        .await
        .expect("awareness accepted");

        assert_eq!(
            editor.recv().await.expect("broadcast"),
            encode_payload_frame(RelayFrameType::Awareness, b"presence")
        );
    }
}
