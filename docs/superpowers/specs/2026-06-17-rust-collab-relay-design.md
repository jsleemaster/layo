# Rust Collaboration Relay Design

Objective 5 adds an experimental Rust collaboration relay that can serve the encrypted collaboration protocol introduced in Objective 2.

## Scope

- Add a Rust relay crate and binary to the Cargo workspace.
- Keep the existing TypeScript relay as the default full Yjs relay.
- Support encrypted rooms with `e2ee=true`, opaque encrypted document frames, awareness frames, room auth, member auth, and `/health`.
- Reuse the same environment variable names as the TypeScript relay where possible.

## Non-Goals

- Do not implement a Rust Yjs document engine in this slice.
- Do not replace the TypeScript relay for plain unencrypted Yjs rooms.
- Do not add persistence adapters.
- Do not add account auth or billing.

## Protocol

The Rust relay handles websocket URLs with the same room path shape:

```text
ws://127.0.0.1:4327/layo:{teamId}:{documentId}?e2ee=true
```

Supported query parameters:

- `token`: optional relay gate token.
- `userId`: optional member identity.
- `memberToken`: optional member credential.
- `access`: `sync` or `awareness`; defaults to `sync`.
- `e2ee`: must be `true`.

Supported frame types:

- `1`: awareness update, broadcast to peers.
- `3`: awareness query, broadcast to peers.
- `10`: encrypted document sync payload, broadcast to peers only from write-capable connections.
- `11`: encrypted document sync query, broadcast to peers only from write-capable connections.

The Rust relay does not decrypt frame payloads and does not create a semantic document state. This matches the encrypted snapshot provider model.

## Authorization

Configuration mirrors the TypeScript relay:

- `COLLAB_RELAY_HOST`, default `127.0.0.1`
- `COLLAB_RELAY_PORT`, default `4327`
- `COLLAB_ALLOWED_ROOM_PREFIX`, default `layo`
- `COLLAB_ROOM_TOKEN`, optional plaintext local/dev token
- `COLLAB_ROOM_TOKEN_HASH`, optional SHA-256 token hash
- `COLLAB_MEMBER_TOKENS`, optional JSON array of `{ "userId": "...", "token": "...", "role": "owner|editor|viewer" }` or `{ "userId": "...", "tokenHash": "...", "role": "owner|editor|viewer" }`

Owners and editors can send encrypted document frames. Viewers can send awareness frames only.

## Runtime

Use `axum` with Tokio for `/health` and websocket upgrades. The handler validates the request before upgrade, then registers the connection in an in-memory room hub. Each connection receives a Tokio channel for outbound frames and the hub broadcasts opaque bytes to other connections in the same room.

## Testing

- Rust unit tests cover varuint frame parsing/encoding.
- Rust unit tests cover relay config parsing and member authorization.
- Rust unit tests cover room hub broadcast behavior, viewer write blocking, and encrypted-only room validation.
- Existing `pnpm test` continues to run Cargo workspace tests.

## Deployment

The Rust relay is introduced as an experimental binary:

```bash
cargo run -p collab-relay
```

The TypeScript relay remains documented as the default until the Rust relay supports plain Yjs rooms or the app defaults to encrypted-only team relay usage.
