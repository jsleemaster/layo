# Canvas MCP Editor

Canvas MCP Editor is an open-source, local-first design editor experiment built around a Rust document engine, a TypeScript editor shell, and a Model Context Protocol interface for AI tools.

The project goal is not to clone Figma feature-for-feature. The first milestone is a small personal design editor with a stable document model that AI agents can inspect and edit through deterministic MCP and HTTP tools.

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

crates/editor-core
  Rust document model, commands, geometry, selection, undo/redo

crates/editor-wasm
  wasm-bindgen bridge between Rust core and TypeScript UI

packages/renderer
  Renderer interface and first Konva adapter

packages/shared
  Shared schemas and generated bindings
```

See `docs/superpowers/specs/2026-06-16-rust-design-editor-mvp-design.md` for the current design.

## License

MIT

## Development

Design rules live in `DESIGN.md`. App UI styles must use the executable tokens in `apps/web/src/design-tokens.css` and runtime canvas constants from `apps/web/src/design-tokens.ts`.

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
- Per-root-element artifacts with `id`, `name`, `className`, `html`, `css`, and an importable `.mjs` module body
- An `indexModule` that imports each element module from a configurable `moduleBasePath`

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
- `create_component_instance`
- `detach_instance`
