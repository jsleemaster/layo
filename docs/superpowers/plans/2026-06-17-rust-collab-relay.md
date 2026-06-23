# Rust Collaboration Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not used in this repository unless the user explicitly authorizes them.

**Goal:** Add an experimental Rust websocket relay that supports encrypted collaboration rooms with the same auth and opaque-frame behavior as the TypeScript relay.

**Architecture:** Add a `crates/collab-relay` Rust crate with focused modules for frame encoding, configuration/auth, room broadcasting, and an Axum runtime. The Rust relay supports `e2ee=true` rooms only in this slice because plain rooms still require Yjs document protocol handling. The TypeScript relay remains the default full relay.

**Tech Stack:** Rust 2021, Tokio, Axum WebSocket, serde, serde_json, sha2, thiserror, futures-util, Cargo tests.

---

### Task 1: Rust Relay Crate And Frame Codec

**Files:**
- Modify: `Cargo.toml`
- Create: `crates/collab-relay/Cargo.toml`
- Create: `crates/collab-relay/src/lib.rs`
- Create: `crates/collab-relay/src/frame.rs`
- Create: `crates/collab-relay/src/main.rs`

**Interfaces:**
- Produces: `RelayFrameType`
- Produces: `encode_type_frame(frame_type: RelayFrameType) -> Vec<u8>`
- Produces: `encode_payload_frame(frame_type: RelayFrameType, payload: &[u8]) -> Vec<u8>`
- Produces: `decode_frame(bytes: &[u8]) -> Result<RelayFrame, FrameError>`

- [x] **Step 1: Write failing frame codec tests**

Add these tests in `crates/collab-relay/src/frame.rs` under `#[cfg(test)]`:

```rust
#[test]
fn encodes_and_decodes_encrypted_payload_frames() {
    let frame = encode_payload_frame(RelayFrameType::EncryptedSync, b"ciphertext");
    let decoded = decode_frame(&frame).expect("frame decodes");

    assert_eq!(decoded.frame_type, RelayFrameType::EncryptedSync);
    assert_eq!(decoded.payload.as_deref(), Some(&b"ciphertext"[..]));
}

#[test]
fn encodes_and_decodes_query_frames_without_payload() {
    let frame = encode_type_frame(RelayFrameType::EncryptedSyncQuery);
    let decoded = decode_frame(&frame).expect("frame decodes");

    assert_eq!(decoded.frame_type, RelayFrameType::EncryptedSyncQuery);
    assert_eq!(decoded.payload, None);
}

#[test]
fn rejects_truncated_payload_frames() {
    let mut frame = encode_payload_frame(RelayFrameType::Awareness, b"abc");
    frame.pop();

    assert!(matches!(decode_frame(&frame), Err(FrameError::TruncatedPayload)));
}
```

- [x] **Step 2: Verify frame codec RED**

Run:

```bash
cargo test -p collab-relay frame
```

Expected: FAIL because `collab-relay` and `frame` do not exist.

- [x] **Step 3: Implement frame codec**

Create `crates/collab-relay/src/frame.rs` with varuint-compatible frame encoding for message types `1`, `3`, `10`, and `11`. `decode_frame` must return `FrameError::UnknownFrameType(value)` for unsupported types and `FrameError::TruncatedPayload` when the declared payload length exceeds the byte slice.

- [x] **Step 4: Verify frame codec GREEN**

Run:

```bash
cargo test -p collab-relay frame
```

Expected: PASS.

- [x] **Step 5: Commit frame codec**

Run:

```bash
git add Cargo.toml crates/collab-relay
git commit -m "feat: add rust relay frame codec"
```

### Task 2: Relay Config And Authorization

**Files:**
- Create: `crates/collab-relay/src/config.rs`
- Modify: `crates/collab-relay/src/lib.rs`

**Interfaces:**
- Produces: `RelayConfig`
- Produces: `RelayRole`
- Produces: `AccessMode`
- Produces: `UpgradeTarget`
- Produces: `RelayConfig::from_env_vars(vars: impl IntoIterator<Item = (String, String)>) -> Result<RelayConfig, ConfigError>`
- Produces: `RelayConfig::validate_upgrade(&self, target: &UpgradeTarget) -> Result<Authorization, AuthError>`

- [x] **Step 1: Write failing config/auth tests**

Add tests in `crates/collab-relay/src/config.rs`:

```rust
#[test]
fn validates_room_prefix_and_plain_room_token() {
    let config = RelayConfig::from_env_vars([
        ("COLLAB_ALLOWED_ROOM_PREFIX".to_string(), "layo".to_string()),
        ("COLLAB_ROOM_TOKEN".to_string(), "room-secret".to_string()),
    ])
    .expect("config parses");

    let auth = config
        .validate_upgrade(&UpgradeTarget {
            room_id: "layo:team:doc".to_string(),
            token: Some("room-secret".to_string()),
            user_id: None,
            member_token: None,
            access: AccessMode::Sync,
            encrypted: true,
        })
        .expect("authorized");

    assert!(auth.can_write_document);
}

#[test]
fn rejects_plain_non_e2ee_rooms_in_rust_relay_v1() {
    let config = RelayConfig::default();

    let error = config
        .validate_upgrade(&UpgradeTarget {
            room_id: "layo:team:doc".to_string(),
            token: None,
            user_id: None,
            member_token: None,
            access: AccessMode::Sync,
            encrypted: false,
        })
        .expect_err("plain rooms are unsupported");

    assert_eq!(error, AuthError::EncryptedRoomsOnly);
}

#[test]
fn viewer_members_are_awareness_only() {
    let config = RelayConfig::from_env_vars([(
        "COLLAB_MEMBER_TOKENS".to_string(),
        r#"[{"userId":"viewer-1","token":"viewer-secret","role":"viewer"}]"#.to_string(),
    )])
    .expect("config parses");

    let auth = config
        .validate_upgrade(&UpgradeTarget {
            room_id: "layo:team:doc".to_string(),
            token: None,
            user_id: Some("viewer-1".to_string()),
            member_token: Some("viewer-secret".to_string()),
            access: AccessMode::Awareness,
            encrypted: true,
        })
        .expect("viewer can connect");

    assert!(!auth.can_write_document);
}
```

- [x] **Step 2: Verify config/auth RED**

Run:

```bash
cargo test -p collab-relay config
```

Expected: FAIL because `config.rs` does not exist.

- [x] **Step 3: Implement config/auth**

Implement env parsing, SHA-256 hex token hash checks, member role parsing, room prefix validation, encrypted-only validation, and viewer write blocking. Keep default host `127.0.0.1`, port `4327`, and prefix `layo`.

- [x] **Step 4: Verify config/auth GREEN**

Run:

```bash
cargo test -p collab-relay config
```

Expected: PASS.

- [x] **Step 5: Commit config/auth**

Run:

```bash
git add crates/collab-relay
git commit -m "feat: add rust relay authorization"
```

### Task 3: In-Memory Room Hub

**Files:**
- Create: `crates/collab-relay/src/room.rs`
- Modify: `crates/collab-relay/src/lib.rs`

**Interfaces:**
- Produces: `RelayHub`
- Produces: `RelayHub::connect(room_id: String, can_write_document: bool) -> RelayPeer`
- Produces: `RelayHub::handle_frame(peer: &RelayPeer, frame: Vec<u8>) -> Result<(), RoomError>`

- [x] **Step 1: Write failing room hub tests**

Add tests in `crates/collab-relay/src/room.rs`:

```rust
#[tokio::test]
async fn broadcasts_encrypted_sync_to_other_peers_only() {
    let hub = RelayHub::default();
    let first = hub.connect("layo:team:doc".to_string(), true).await;
    let mut second = hub.connect("layo:team:doc".to_string(), true).await;

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
    let viewer = hub.connect("layo:team:doc".to_string(), false).await;
    let mut editor = hub.connect("layo:team:doc".to_string(), true).await;

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
    let viewer = hub.connect("layo:team:doc".to_string(), false).await;
    let mut editor = hub.connect("layo:team:doc".to_string(), true).await;

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
```

- [x] **Step 2: Verify room hub RED**

Run:

```bash
cargo test -p collab-relay room
```

Expected: FAIL because `room.rs` does not exist.

- [x] **Step 3: Implement room hub**

Use `tokio::sync::mpsc` for per-peer outbound queues and an `Arc<Mutex<HashMap<String, RoomState>>>` for rooms. Broadcast to peers in the same room except the sender. Remove closed peer senders when sending fails.

- [x] **Step 4: Verify room hub GREEN**

Run:

```bash
cargo test -p collab-relay room
```

Expected: PASS.

- [x] **Step 5: Commit room hub**

Run:

```bash
git add crates/collab-relay
git commit -m "feat: add rust relay room hub"
```

### Task 4: Axum Runtime

**Files:**
- Create: `crates/collab-relay/src/server.rs`
- Modify: `crates/collab-relay/src/main.rs`
- Modify: `crates/collab-relay/src/lib.rs`

**Interfaces:**
- Produces: `build_router(config: RelayConfig, hub: RelayHub) -> axum::Router`
- Produces: `run(config: RelayConfig) -> Result<(), ServerError>`

- [x] **Step 1: Write failing runtime tests**

Add tests in `crates/collab-relay/src/server.rs`:

```rust
#[tokio::test]
async fn health_route_returns_ok() {
    let app = build_router(RelayConfig::default(), RelayHub::default());
    let response = app
        .oneshot(
            http::Request::builder()
                .uri("/health")
                .body(axum::body::Body::empty())
                .expect("request"),
        )
        .await
        .expect("response");

    assert_eq!(response.status(), http::StatusCode::OK);
}

#[test]
fn parses_upgrade_targets_from_query() {
    let target = parse_upgrade_target(
        "layo:team:doc".to_string(),
        &[
            ("e2ee".to_string(), "true".to_string()),
            ("access".to_string(), "awareness".to_string()),
            ("userId".to_string(), "viewer-1".to_string()),
            ("memberToken".to_string(), "viewer-secret".to_string()),
        ],
    )
    .expect("target parses");

    assert_eq!(target.room_id, "layo:team:doc");
    assert!(target.encrypted);
    assert_eq!(target.access, AccessMode::Awareness);
    assert_eq!(target.user_id.as_deref(), Some("viewer-1"));
}
```

- [x] **Step 2: Verify runtime RED**

Run:

```bash
cargo test -p collab-relay server
```

Expected: FAIL because `server.rs` does not exist.

- [x] **Step 3: Implement runtime**

Use Axum `Router`, `State`, `Path`, `Query`, and `WebSocketUpgrade`. `/health` returns `ok`. `/{*room_id}` validates the parsed `UpgradeTarget` before calling `ws.on_upgrade(...)`. The websocket task forwards binary frames from the socket into `RelayHub::handle_frame` and forwards hub outbound frames back to the socket.

- [x] **Step 4: Verify runtime GREEN**

Run:

```bash
cargo test -p collab-relay server
```

Expected: PASS.

- [x] **Step 5: Commit runtime**

Run:

```bash
git add crates/collab-relay
git commit -m "feat: add rust relay runtime"
```

### Task 5: Workspace Scripts And Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment/collaboration.md`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-06-17-rust-collab-relay.md`

- [x] **Step 1: Add scripts and docs**

Add a root script:

```json
"dev:collab:rust": "cargo run -p collab-relay"
```

Document that `pnpm dev:collab` remains the default TypeScript full relay, while `pnpm dev:collab:rust` starts the experimental Rust encrypted-room relay.

- [x] **Step 2: Verify final checks**

Run:

```bash
cargo test -p collab-relay
pnpm test
pnpm typecheck
git diff --check
```

Expected: all pass.

- [x] **Step 3: Commit docs and scripts**

Run:

```bash
git add README.md docs/deployment/collaboration.md package.json docs/superpowers/plans/2026-06-17-rust-collab-relay.md docs/superpowers/specs/2026-06-17-rust-collab-relay-design.md
git commit -m "docs: document rust collaboration relay"
```

### Self-Review

- Spec coverage: The plan adds Rust relay crate, encrypted-only websocket relay runtime, matching auth, health, tests, and docs.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: `RelayFrameType`, `RelayConfig`, `UpgradeTarget`, `RelayHub`, and `build_router` are named consistently across tasks.
