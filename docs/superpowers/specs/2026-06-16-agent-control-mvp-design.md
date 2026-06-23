# Agent Control MVP Design

## Context

Layo already exposes basic MCP and HTTP write tools for node creation, geometry, fill, text, and component operations. That is enough for isolated edits, but it is not enough for an agent to work reliably across a design task. An agent needs to inspect a compact canvas summary, find target nodes, apply multiple changes atomically enough for a local JSON file, validate the result, and report what changed.

## Direction

Use a dual-path agent workflow:

- MCP and HTTP are the deterministic edit path.
- Playwright CLI is the visual verification path.

The agent should not depend on clicking editor UI controls for primary mutations. Browser automation is reserved for proving that the local editor renders the edited document correctly.

## Agent Tools

Add a focused agent-control layer on top of the existing storage API:

- `inspect_canvas`: return file metadata, pages, node summaries, component summaries, and validation status.
- `find_nodes`: search by id, name, kind, text, or component metadata and return compact node summaries.
- `apply_agent_commands`: apply a batch of edit commands with optional `dryRun`. Supported commands initially cover geometry, fill, text, rectangle creation, text creation, component creation, component instance creation, and detach.
- `validate_document`: return structural validation issues without modifying the file.
- `get_change_summary`: compare two document snapshots and return created, updated, removed, and unchanged counts plus changed node ids.

Expose these through HTTP routes and MCP tools with the same semantics.

## Data Flow

1. Agent calls `inspect_canvas` or `find_nodes` to identify targets.
2. Agent calls `apply_agent_commands` with `dryRun: true` for preview.
3. Agent calls `apply_agent_commands` with `dryRun: false` to persist the changes.
4. Agent calls `validate_document` and `get_change_summary`.
5. Agent runs Playwright CLI against the local web app to verify that the rendered result is visible.

## Validation Rules

The MVP validates only document safety invariants:

- every page id and node id must be unique
- node width and height must be positive
- opacity must be between `0` and `1`
- text nodes must contain text content
- image nodes must contain image content
- component instances must reference an existing component definition
- component definitions must have unique ids and source nodes

Validation returns structured issues. It does not attempt visual quality scoring.

## Batch Semantics

`apply_agent_commands` works on a cloned document first. If any command fails, no file is written. `dryRun: true` returns the preview document, validation result, and change summary without persisting. `dryRun: false` writes only after all commands succeed.

This is intentionally local-file atomic rather than distributed transactional. It is enough for the current filesystem-backed MVP.

## Audit Trail

Each applied batch returns an `audit` object:

- file id
- dry-run flag
- command count
- applied command types
- before and after validation issue counts
- changed node ids
- timestamp

The MVP returns this audit in responses. Durable audit log files can be added later after the editing API stabilizes.

## UI

No new visible editor controls are required for this slice. The existing web editor should render the document after MCP/HTTP changes. Playwright e2e will verify that an agent-created text node appears in the browser.

## Testing

Use TDD at the storage/API level first:

- storage tests for inspect, search, validation, dry-run batch, persisted batch, and change summary
- HTTP tests for the agent-control routes
- MCP typecheck coverage for tool schemas
- Playwright CLI e2e extension that creates a node through HTTP and verifies it in the browser

## Non-Goals

- collaborative multiplayer editing
- user approval prompts inside the app
- durable audit database
- freeform natural-language command parsing
- pixel-perfect design evaluation
- using Playwright as the primary mutation path
