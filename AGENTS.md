# Canvas MCP Editor Agent Guide

Read this first when working in this repository.

## What This App Is

Canvas MCP Editor is a local-first, AI-operable design editor. It is not a full Figma clone. The current goal is a small design editor with a stable document model that humans can edit in a browser and AI agents can inspect, mutate, validate, and export through deterministic MCP and HTTP tools.

The app supports these core workflows:

- Browser-based canvas editing in `apps/web`.
- Local document and asset storage through `apps/server`.
- MCP and HTTP tools for AI-driven document inspection, edits, validation, change summaries, components, and code export.
- Figma-like component primitives: component definitions, instances, detach, and structured code-export metadata.
- Optional team-owned realtime collaboration through Yjs-compatible websocket relay infrastructure.
- Optional passphrase-based E2EE for relay document updates.
- Experimental Rust relay support for encrypted collaboration rooms.

## Architecture Map

- `crates/editor-core`: Rust document model, commands, geometry, undo/redo, and agent design context.
- `crates/editor-wasm`: wasm-bindgen bridge from Rust core to TypeScript.
- `crates/collab-relay`: experimental Rust websocket relay for encrypted collaboration rooms.
- `apps/server`: Fastify HTTP API, filesystem storage, MCP stdio server, agent-command routes, and code export.
- `apps/web`: Vite React editor shell, canvas UI, design panels, collaboration UI, and Playwright e2e tests.
- `apps/collab-relay`: TypeScript websocket relay for full Yjs collaboration.
- `packages/renderer`: renderer-facing document and component types.
- `packages/collaboration`: team manifests, Yjs document mapping, room ids, and awareness helpers.
- `packages/shared`: shared generated TypeScript bindings and schemas.

## Agent Operating Rules

- Prefer MCP or HTTP for deterministic document edits. Do not rely on clicking the UI for primary mutations.
- Use browser automation only to verify that the local web editor renders the result correctly.
- Browser debugging and visual verification must use Playwright CLI.
- Keep design UI changes aligned with `DESIGN.md`, `apps/web/src/design-tokens.css`, and `apps/web/src/design-tokens.ts`.
- Preserve local-first behavior. Do not introduce a maintainer-operated production backend as a requirement.
- Collaboration must remain team-owned: static web hosting is separate from relay hosting.
- Treat the Rust relay as experimental and encrypted-room-only unless plain Yjs support is explicitly added.
- Do not store relay passphrases or derived encryption keys in exported team manifests.
- Treat `docs/superpowers/PLAN_STATUS.md` as the source of truth for historical plan completion. Individual plan files may contain stale unchecked boxes from earlier execution.

## Common Commands

Install dependencies:

```bash
pnpm install
```

Run the local API server:

```bash
pnpm --filter @canvas-mcp-editor/server dev
```

Run the web editor:

```bash
pnpm --filter @canvas-mcp-editor/web dev
```

Run the TypeScript collaboration relay:

```bash
pnpm dev:collab
```

Run the experimental Rust encrypted-room relay:

```bash
pnpm dev:collab:rust
```

Run the MCP server over stdio:

```bash
pnpm --filter @canvas-mcp-editor/server mcp
```

Run core verification:

```bash
pnpm typecheck
pnpm test
cargo test --workspace
pnpm --filter @canvas-mcp-editor/web build
```

Run collaboration e2e against the TypeScript relay:

```bash
pnpm test:e2e:collab
```

Run the encrypted collaboration e2e against the Rust relay by starting `apps/server`, `apps/web`, and `pnpm dev:collab:rust`, then:

```bash
pnpm exec playwright test apps/web/e2e/collaboration.spec.ts --grep "encrypted relay team syncs document edits without exporting the passphrase" --reporter=line
```

## AI Editing Workflow

For a document task, use this order:

1. Inspect the canvas with `inspect_canvas` or `GET /files/:fileId/agent/inspect`.
2. Find target nodes with `find_nodes` or `POST /files/:fileId/agent/find`.
3. Preview mutations with `apply_agent_commands` using `dryRun: true`.
4. Persist mutations with `apply_agent_commands` using `dryRun: false`.
5. Validate with `validate_document` or `GET /files/:fileId/agent/validate`.
6. Summarize with `get_change_summary` or `POST /files/:fileId/agent/change-summary`.
7. Verify rendering through Playwright CLI at `http://127.0.0.1:5173/`.

For code generation tasks, use `export_code` or `GET /files/:fileId/export/code`. The structured `implementationSpec` is the primary agent-readable output; the generated HTML and CSS are secondary artifacts.

## Current Product Position

This project is currently an MVP foundation, not a finished professional design suite. Before adding large features, check whether the request belongs to one of these lanes:

- Editor UX and canvas manipulation.
- Component system behavior.
- Agent-control MCP/HTTP surfaces.
- Structured code export.
- Team-owned collaboration.
- E2EE and relay authorization.
- Deployment for static web plus self-hosted relay.
- Rust core or Rust relay maturation.

If a request does not fit one of these lanes, document the product tradeoff before expanding scope.

## Plan Status

Use `docs/superpowers/PLAN_STATUS.md` before resuming any file under `docs/superpowers/plans`. The plan directory is mostly historical implementation evidence now; new product work should start from a new plan unless `PLAN_STATUS.md` explicitly marks an existing plan active.
