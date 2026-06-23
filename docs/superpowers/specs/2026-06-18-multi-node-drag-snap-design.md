# Multi-Node Drag And Snap Guides Design

Date: 2026-06-18

## Goal

Bring the next Figma-like direct manipulation slice into Layo:

- Dragging any selected layer moves the whole selected layer set as one group.
- The selected layer set keeps its selection after the drag.
- The drag commit is one undo/redo step.
- Near-aligned bounds and centers show live snap guides and adjust the final position.
- User-facing UI remains Korean-first. Snap guides are visual and do not need text.

## Figma Behavior To Adopt

This follows `docs/product/figma-core-interaction-rules.md`:

- Move tool drags selected objects.
- Snap settings help align centers and bounds.
- Snap guides come after live drag preview and multi-selection bounds are stable.

## Implementation Shape

- Keep document mutations in `apps/web/src/editor-state.ts` so browser behavior and tests share one deterministic path.
- Reuse the existing `update_nodes_geometry` command for grouped drag commits.
- Add pure helpers for selected-node geometry, group translation, and snap calculation.
- During a drag, record original selected geometries, compute the delta from the drag start, snap the selection bounds against unselected nodes, and render transient guide overlays in React.
- Commit geometry on drag end. Do not persist snap guides in the document.

## Non-Goals

- Rulers and manual guide creation.
- Configurable snap settings.
- Alt-drag duplicate.
- Auto-layout child reordering.
- Rotation-aware snapping.

## Verification

- Unit tests for grouped movement, undo/redo, and snap delta calculation.
- Playwright e2e for Shift-selected layers moving together and showing a vertical snap guide during drag.
- Direct headed Playwright CLI interaction pass on the live editor with click, Shift-click, drag, and visible guide confirmation.
