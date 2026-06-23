# Rust Design Editor MVP Design

## Status

Approved direction, awaiting written-spec review before implementation planning.

## Context

The project is a personal design editor inspired by Figma's product shape, but scoped for a small open-source MVP. The goal is to prove the core architecture: a stable design document model, a usable canvas editing surface, local persistence, and a read-only MCP interface that lets AI tools inspect design files.

The first version is intentionally not a multiplayer product. Realtime collaboration, hosted accounts, billing, component libraries, plugin execution, and production-grade WebGPU rendering are outside the initial scope.

## Product Scope

The MVP supports a local user creating and editing small design files. A file contains pages, frames, and basic nodes. The editor can render the document, select nodes, move and resize them, edit basic properties, save and reload the file, and expose document context through MCP.

The first editable node types are:

- `frame`
- `rectangle`
- `text`
- `image`

The first editing capabilities are:

- pan and zoom canvas navigation
- create frame, rectangle, text, and image nodes
- select one or more nodes
- move selected nodes
- resize selected nodes through handles
- edit fill, stroke, position, size, and text content
- layer ordering
- undo and redo
- save and reload local files

## Non-Goals

- No browser-hosted multi-user collaboration in the first milestone.
- No account system or cloud project dashboard.
- No plugin sandbox.
- No full Figma import/export compatibility.
- No custom WebGPU renderer in the first milestone.
- No advanced auto-layout or component instance system in the first milestone.

## Architecture

The system uses a Vite React TypeScript UI shell, a Node.js/Fastify local server, and a Rust editor core. The TypeScript side owns application chrome, panels, keyboard binding, routing, and renderer integration. The Rust side owns document state, commands, validation, geometry, selection calculations, and undo/redo.

```text
apps/web
  Vite React editor UI
  toolbar, layer panel, inspector, keyboard shortcuts

apps/server
  Node.js/Fastify local HTTP API
  document JSON storage
  asset storage
  read-only MCP server

crates/editor-core
  Rust document model
  command system
  geometry and hit testing
  selection bounds
  undo/redo history
  design-context generation

crates/editor-wasm
  wasm-bindgen wrapper
  TypeScript bindings

packages/renderer
  renderer interface
  Konva renderer adapter

packages/shared
  shared schemas
  generated TypeScript types
```

The repository uses a pnpm workspace for JavaScript packages and a Cargo workspace for Rust crates.

## Dependency Direction

The document model is the center of the system. UI, renderer, storage, and MCP depend on the document contracts; the document contracts do not depend on React, Konva, HTTP, filesystem APIs, or MCP transport details.

The renderer receives a scene description and input events. It does not own authoritative document state. The server persists documents and assets, but it does not bypass core validation when applying document changes.

## Document Model

A design file is represented as a tree.

```text
DesignFile
  id
  name
  version
  pages[]

Page
  id
  name
  children[]

Node
  id
  type
  name
  parent_id
  children[]
  transform
  size
  style
  content
```

Node IDs are stable. The document model supports deterministic serialization to JSON so saved files are reviewable in git and readable by MCP tools.

## Command System

All mutations flow through commands. Commands validate their inputs, produce a new document state, and emit an inverse operation or history record for undo/redo.

Initial commands:

- `create_node`
- `delete_node`
- `move_node`
- `resize_node`
- `update_style`
- `update_text`
- `reorder_node`
- `set_selection`

This keeps UI, keyboard shortcuts, and future MCP write tools from inventing separate mutation paths.

## Renderer Strategy

The MVP starts with a renderer interface and a Konva adapter. This is not because Konva is the long-term engine, but because it shortens the path to a usable editor while Rust owns the core model.

The renderer adapter must be replaceable. Future work can add a Rust `wgpu` renderer without rewriting document semantics, MCP context generation, or command history.

## Local Server

The local server provides:

- document file listing
- create/open/save document
- asset upload and retrieval
- MCP server endpoint

The initial storage format is filesystem-backed:

```text
.layo/
  files/
    <file-id>.json
  assets/
    <asset-id>
```

This avoids a database dependency while preserving a clean boundary for a future PostgreSQL or SQLite adapter.

## MCP Interface

The first MCP server is read-only. It helps AI tools understand design files without allowing autonomous edits.

Initial MCP tools:

- `list_files`: list known local design files.
- `get_file_metadata`: return file pages, frame counts, node counts, and modified time.
- `get_node_tree`: return a compact node tree for a file or page.
- `get_design_context`: return selected nodes or requested nodes in code-generation-friendly JSON.
- `get_variables`: return color, typography, and spacing tokens known to the file.
- `get_node_snapshot`: return a node or frame snapshot reference when rendering support exists.

MCP output is structured JSON first, with short human-readable summaries only where helpful.

## Error Handling

The editor should fail locally and explicitly. Invalid commands return typed errors. Save failures preserve the in-memory document and surface retryable messages. MCP tools return structured error responses instead of throwing raw stack traces.

## Testing

The first test layer focuses on Rust core behavior:

- document serialization round trip
- command validation
- undo/redo reversibility
- geometry bounds
- hit testing
- selection bounds
- design-context generation

The web layer gets focused tests around renderer adapter mapping and panel behavior. Browser verification uses Playwright CLI for rendered editor flows, following the workspace instruction.

## Risks

The main risk is splitting ownership incorrectly between Rust and TypeScript. The mitigation is to keep document state and commands in Rust, while TypeScript manages UI shell state only.

Another risk is over-investing in rendering before the document model is stable. The mitigation is to use Konva as an adapter for the MVP and keep the renderer contract explicit.

The MCP risk is exposing too many tools too early. The mitigation is to start read-only and add write tools only after command history, validation, and user confirmation flows are solid.

## Acceptance Criteria

The MVP architecture is considered validated when:

- a file can be created, edited, saved, reopened, and rendered
- core mutations go through Rust commands
- undo/redo works for initial node commands
- the renderer can be replaced behind an interface
- MCP can list files and return accurate node/design context
- the documented architecture is still accurate after implementation
