# Alignment And Distribution Design

## Goal

Layo should support the next Figma-parity precision editing slice: align and distribute multiple selected layers from the Korean-first toolbar.

## Context

The current main branch already supports ordered multi-selection through `selection.nodeIds`, with `selection.nodeId` preserved as the primary node for older single-selection commands. This makes alignment and distribution feasible without changing the public selection model again.

The relevant roadmap decision is:

- Keep Shift-click multi-selection and drag area selection green.
- Add alignment/distribute commands now that multi-selection exists.
- Keep snap guides, multi-node drag, clipboard, and nested keyboard navigation outside this slice.

## Options Considered

### Option A: React-only toolbar mutations

The toolbar could calculate geometry in `App.tsx` and dispatch one `update_node_geometry` command per selected layer.

Tradeoff: this is quick, but undo would require multiple steps and agent/MCP reuse would be harder.

### Option B: One state-level batch geometry command

Add pure helpers in `editor-state.ts`, backed by one `update_nodes_geometry` command. The toolbar only chooses the action and calls the helper.

Tradeoff: this requires a small command-model extension, but it preserves one-step undo/redo and keeps deterministic geometry behavior outside React.

### Option C: Full agent command surface now

Add HTTP/MCP align/distribute commands in the same slice.

Tradeoff: this is eventually required, but it expands the slice across server, MCP schemas, and client UI. That should follow once the state/UI behavior is green.

## Decision

Use Option B for this slice.

## Behavior

Alignment acts on the document-space bounding box of the currently selected valid layers:

- `left`: every selected layer's left edge matches the selection left edge.
- `center`: every selected layer's horizontal center matches the selection horizontal center.
- `right`: every selected layer's right edge matches the selection right edge.
- `top`: every selected layer's top edge matches the selection top edge.
- `middle`: every selected layer's vertical center matches the selection vertical center.
- `bottom`: every selected layer's bottom edge matches the selection bottom edge.

Distribution requires at least three valid selected layers:

- `horizontal`: sort by document-space left edge, keep the outer layers fixed, and distribute equal horizontal gaps between adjacent layer edges.
- `vertical`: sort by document-space top edge, keep the outer layers fixed, and distribute equal vertical gaps between adjacent layer edges.

Selected layers may live under different parents. The helper computes absolute document-space boxes, then converts target positions back into each node's parent-relative transform.

Auto-layout-managed children are not moved in this slice because the layout solver owns their positions. If fewer than two alignable layers remain for alignment, or fewer than three distributable layers remain for distribution, the command is a no-op.

## UI

Add eight Korean-first toolbar buttons after the existing component actions and before undo/redo:

- `왼쪽 정렬`
- `가로 가운데 정렬`
- `오른쪽 정렬`
- `위쪽 정렬`
- `세로 가운데 정렬`
- `아래쪽 정렬`
- `가로 분배`
- `세로 분배`

Alignment buttons are enabled when at least two layers are selected. Distribution buttons are enabled when at least three layers are selected. The multi-selection inspector remains a summary panel in this slice.

## Testing

Use TDD:

1. Add failing Vitest tests for cross-parent left alignment and horizontal distribution.
2. Add a failing Playwright test that selects multiple layers, clicks toolbar alignment/distribution buttons, and inspects resulting positions.
3. Implement the state command and toolbar wiring minimally.
4. Run full regression plus headed Playwright CLI direct interaction verification.

## Non-Goals

- Snap guide rendering.
- Multi-node drag.
- Multi-node delete/duplicate.
- HTTP/MCP agent command surface for align/distribute.
- Tidy-up grid or smart selection controls.
- Rotation-aware bounds.
