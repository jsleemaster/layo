# Canvas MCP Editor

Canvas MCP Editor is an open-source, local-first design editor experiment built around a Rust document engine, a TypeScript editor shell, and a read-only Model Context Protocol interface for AI tools.

The project goal is not to clone Figma feature-for-feature. The first milestone is a small personal design editor with a stable document model that AI agents can inspect through MCP.

## Planned MVP

- Rust-owned document model, commands, geometry, selection, and undo/redo.
- React/TypeScript editor UI for panels, tools, keyboard shortcuts, and app state.
- Replaceable renderer adapter, starting with a TypeScript/Konva implementation.
- Local server for document JSON and asset storage.
- Read-only MCP tools for file metadata, node trees, design context, variables, and snapshots.

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
