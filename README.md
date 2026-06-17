# Canvas MCP Editor

Canvas MCP Editor is an open-source, local-first design editor experiment built around a Rust document engine, a TypeScript editor shell, and a Model Context Protocol interface for AI tools.

The project goal is not to clone Figma feature-for-feature. The first milestone is a small personal design editor with a stable document model that AI agents can inspect and edit through deterministic MCP and HTTP tools.

For AI-agent handoff, read `AGENTS.md` first. For a concise product overview, read `docs/PROJECT_BRIEF.md`. For historical plan completion state, read `docs/superpowers/PLAN_STATUS.md`.

## Planned MVP

- Rust-owned document model, commands, geometry, selection, and undo/redo.
- React/TypeScript editor UI for panels, tools, keyboard shortcuts, and app state.
- Replaceable renderer adapter, starting with a TypeScript/Konva implementation.
- Local server for document JSON and asset storage.
- MCP and HTTP tools for file metadata, node trees, design context, components, deterministic edits, validation, change summaries, and code export.

## Architecture Direction

```text
apps/web
  Vite React editor shell

apps/server
  Node.js/Fastify document, asset, and MCP server

apps/collab-relay
  Optional team-owned websocket relay for Yjs collaboration

crates/editor-core
  Rust document model, commands, geometry, selection, undo/redo

crates/editor-wasm
  wasm-bindgen bridge between Rust core and TypeScript UI

packages/renderer
  Renderer interface and first Konva adapter

packages/collaboration
  Team manifests, room ids, Yjs document adapter, and awareness helpers

packages/shared
  Shared schemas and generated bindings
```

See `docs/superpowers/specs/2026-06-16-rust-design-editor-mvp-design.md` for the current design.

## License

MIT

## Development

Design rules live in `DESIGN.md`. App UI styles must use the executable tokens in `apps/web/src/design-tokens.css` and runtime canvas constants from `apps/web/src/design-tokens.ts`.

The web app is Korean-first for user-facing labels, status text, error messages, and sample document content. Keep API names, MCP tools, protocol fields, and generated code identifiers stable in English where they are developer-facing contracts.

Install dependencies:

```bash
pnpm install
```

Run the local server:

```bash
pnpm --filter @canvas-mcp-editor/server dev
```

Run the web editor:

```bash
pnpm --filter @canvas-mcp-editor/web dev
```

Run the optional team collaboration relay:

```bash
pnpm dev:collab
```

Run the experimental Rust encrypted-room relay:

```bash
pnpm dev:collab:rust
```

Run checks:

```bash
pnpm typecheck
pnpm run check:design-rules
cargo test --workspace
```

Run the MCP server over stdio:

```bash
pnpm --filter @canvas-mcp-editor/server mcp
```

## Code Export

Design files can be exported into generated code artifacts:

- Full-canvas CSS under `.canvas-export-root`
- Full-canvas HTML with stable `data-node-id` attributes
- Per-root-element artifacts with `id`, `name`, `className`, `html`, `css`, `structure`, `implementation`, and an importable `.mjs` module body
- A codegen-ready `implementationSpec` with element structures, component definitions, component instance references, implementation hints, and token candidates
- An `indexModule` that imports each element module from a configurable `moduleBasePath`

The structured export is intended for agent-driven implementation work. `structure` is a recursive node tree with geometry, style, text content, and `componentRef` metadata. `implementation` provides a suggested component name, text prop candidates, CSS class names, and source node ids so an agent can implement the element without reverse-engineering HTML strings.

HTTP:

```bash
curl "http://127.0.0.1:4317/files/sample-file/export/code?moduleBasePath=./elements"
```

MCP:

```text
export_code({ "fileId": "sample-file", "moduleBasePath": "./elements" })
```

## Agent Control Workflow

Agents should use MCP or HTTP for deterministic document edits, then use Playwright CLI for visual verification in the local web editor.

Recommended sequence:

1. Inspect the canvas: `inspect_canvas` or `GET /files/:fileId/agent/inspect`
2. Find target nodes: `find_nodes` or `POST /files/:fileId/agent/find`
3. Preview edits: `apply_agent_commands` or `POST /files/:fileId/agent/commands` with `dryRun: true`
4. Persist edits: `apply_agent_commands` or `POST /files/:fileId/agent/commands` with `dryRun: false`
5. Validate structure: `validate_document` or `GET /files/:fileId/agent/validate`
6. Summarize changes: `get_change_summary` or `POST /files/:fileId/agent/change-summary`
7. Verify in browser with Playwright CLI against `http://127.0.0.1:5173/`

The first agent command batch supports:

- `update_geometry`
- `set_fill`
- `update_text`
- `create_rectangle`
- `create_text`
- `create_component`
- `set_layout`
- `set_constraints`
- `create_component_instance`
- `detach_instance`

`set_layout` accepts Figma-like layout metadata:

```json
{
  "type": "set_layout",
  "nodeId": "frame-1",
  "layout": {
    "mode": "auto",
    "direction": "vertical",
    "gap": 12,
    "padding": { "top": 20, "right": 24, "bottom": 20, "left": 24 }
  }
}
```

`set_constraints` accepts horizontal values `left`, `right`, `left_right`, `center`, or `scale`, and vertical values `top`, `bottom`, `top_bottom`, `center`, or `scale`.

For an active team-owned relay room, `apply_agent_commands` also accepts:

```json
{
  "dryRun": false,
  "collaboration": {
    "teamId": "team-id-from-manifest",
    "documentId": "sample-file",
    "relayUrl": "ws://127.0.0.1:4327"
  },
  "commands": []
}
```

When `collaboration` is present, the server connects to the relay room, applies the deterministic command batch to the Yjs-backed `DesignFile`, updates the local file copy, and connected browsers receive the same update.

## Team Collaboration

The web app can be shared as a static build. Real-time collaboration is optional and team-owned:

- The browser stores team manifests and local document state in IndexedDB.
- `packages/collaboration` stores document state in a Yjs map and uses awareness for presence and selected-node state.
- `apps/collab-relay` relays Yjs sync and awareness messages for rooms named `canvas-mcp-editor:{teamId}:{documentId}`.
- Relay teams can enable passphrase-based E2EE for document updates. The exported team manifest stores only encryption metadata, never the passphrase or derived key. Encrypted v1 sync sends whole-document snapshots for editor document changes.
- The project does not require a maintainer-operated production collaboration server.

## Deployment

Canvas MCP Editor keeps static web hosting separate from real-time relay hosting. The static web app can be deployed from `apps/web/dist` with GitHub Pages or another static host, while each team runs its own team-owned relay only when it needs live collaboration.

The maintainers do not operate a default production relay. For self-hosting, use the Docker Compose template in `deploy/collab-relay/docker-compose.yml` with `deploy/collab-relay/.env.example`, or run `pnpm dev:collab` for local development.

Relay environment variables:

```bash
COLLAB_RELAY_HOST=127.0.0.1
COLLAB_RELAY_PORT=4327
COLLAB_ALLOWED_ROOM_PREFIX=canvas-mcp-editor:
COLLAB_ROOM_TOKEN=
COLLAB_MEMBER_TOKENS=[]
```

The MVP relay gate token is not account authentication. For member authorization, the relay can also validate `COLLAB_MEMBER_TOKENS` entries with `owner`, `editor`, or `viewer` roles. Viewers are limited to awareness-only connections; document sync/write access is reserved for owners and editors. E2EE encrypts document snapshots through the relay, but presence, cursor, selection, room ids, and auth metadata remain visible to the relay in this v1.
