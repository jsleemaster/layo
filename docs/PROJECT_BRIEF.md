# Project Brief

Layo is an open-source, local-first design editor built for both human editing and AI-agent control.

The project exists to answer one product question: can a Figma-like editor expose its design document in a deterministic way so an AI agent can inspect the canvas, edit it, validate the result, export component-ready code, and verify the rendered UI without relying on fragile screen-click automation?

## Product Scope

Layo is not trying to match every Figma feature. The current scope is an MVP design editor with:

- A Rust-owned document model for pages, frames, rectangles, text nodes, components, geometry, and editor commands.
- A React browser editor for selection, canvas operations, inspector panels, component actions, and collaboration controls.
- A local Fastify server for file storage, HTTP APIs, MCP tools, agent command execution, and code export.
- A structured export format that separates root elements, component definitions, component instances, token candidates, implementation hints, HTML, and CSS.
- Optional real-time collaboration through a team-owned websocket relay.
- Optional encrypted document updates for relay teams.

## Why MCP Matters Here

The MCP surface is the agent control plane. Agents should use it to:

- List and inspect design files.
- Read a compact design context.
- Find nodes by id, type, text, name, or component metadata.
- Apply deterministic edit commands.
- Validate document structure.
- Generate change summaries.
- Export design elements as code-ready structures.

The browser UI is still important, but primarily for human editing and visual verification. An agent should not need to infer the design from pixels first.

## Current Capabilities

- Canvas editor shell with node creation, selection, geometry changes, color/text edits, undo/redo, and viewport controls.
- Design tokens and UI rules enforced by repo scripts.
- Component definitions, instances, and detach behavior.
- HTTP and MCP agent-control endpoints.
- Code export with structured `implementationSpec`.
- Team manifests for collaboration setup and sharing.
- Remote cursor and remote selection display.
- Relay authorization with owner/editor/viewer roles.
- Passphrase-based encrypted collaboration snapshots.
- Static web deployment path with team-owned relay hosting.
- Experimental Rust relay for encrypted rooms.

## Runtime Model

Static web hosting and collaboration relay hosting are deliberately separate:

- `apps/web` can be built and shared as static files.
- Teams that need live collaboration run their own relay.
- The maintainers do not operate a default production relay.
- Team manifests configure relay URLs and metadata.
- E2EE protects document snapshots from the relay, but presence, cursor, selection, room ids, and auth metadata are visible to the relay in the current version.

## Agent Handoff Summary

When another AI enters this repo, tell it this:

> This is a local-first Figma-like design editor where Rust owns the design document model, React renders the editor, Fastify exposes HTTP and MCP tools, and collaboration is optional through team-owned relays. The important feature is not only drawing UI; it is that agents can inspect, edit, validate, collaborate, and export the canvas through structured APIs. Start with `AGENTS.md`, then `README.md`, then the relevant plan/spec under `docs/superpowers`.

## Non-Goals For Now

- Full Figma parity.
- A maintainer-operated production collaboration backend.
- Multi-tenant SaaS account infrastructure.
- Cloud-only document storage.
- Treating generated HTML/CSS strings as the only code-export contract.
