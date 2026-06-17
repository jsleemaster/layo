# Multi Select Area Selection Design

## Goal

Canvas MCP Editor should support the next Figma-like selection lane: Shift-click multi-selection and drag area selection. User-facing copy stays Korean-first, so the feature is described as "영역 선택" in UI and verification notes.

## Current State

- `EditorSelection` stores one `nodeId`.
- Single-selection powers the layer panel, inspector, resize handle, drag, delete, duplicate, undo/redo presence, and remote selection overlays.
- The Figma rule matrix already lists multi-selection as the next lane before alignment, distribution, and snap guides.
- `AGENTS.md` requires Playwright CLI browser verification plus direct live UI interaction for editor behavior changes.

## Approach

Keep the existing `selection.nodeId` field as the primary selected node for backward compatibility, and add `selection.nodeIds` as the ordered selected-node list. Single-selection flows continue to work through `nodeId`; multi-selection features use `nodeIds`.

This keeps existing inspector and command behavior stable while unblocking multi-selection UI state for later align/distribute work.

## Behavior

- Plain click selects one node and replaces the selection.
- Shift-click toggles a node in the selected-node list.
- The most recently added/toggled node becomes `selection.nodeId`, the primary selection.
- Shift-clicking an already selected node removes it. If the removed node was primary, the last remaining selected node becomes primary.
- Escape and empty-canvas click clear all selected nodes.
- Dragging from empty canvas starts an area selection box after pointer movement.
- Area selection selects nodes whose full document-space bounds are inside the dragged rectangle.
- Shift + area selection adds enclosed nodes to the current selection.
- For nested nodes, area selection prefers matched children over their parent so dragging around a nested text layer does not also select the containing frame.
- Component instance internals remain protected: descendants of component instances are not directly selected by area selection.

## UI

- Layer list buttons use `is-selected` when their node id is in `selection.nodeIds`.
- Canvas nodes render selection outlines when included in `selection.nodeIds`.
- Only the primary selected node shows the resize handle and remains draggable in this slice.
- When multiple nodes are selected, the inspector shows a compact Korean message such as `2개 레이어 선택됨` and hides single-node editing controls.
- The area selection box is a DOM overlay inside the stage frame with `data-testid="area-selection-box"` so Playwright and direct UI verification can prove that the live rectangle appears while dragging.

## Non-Goals

- Multi-node drag move.
- Multi-node nudge.
- Multi-node delete or duplicate.
- Alignment and distribution commands.
- Copy/paste.
- Rotation-aware geometric containment.
- Cross-frame nested selection with Command/Ctrl marquee.

## Testing

- Vitest covers selection state helpers:
  - `setSelection` keeps `nodeId` and `nodeIds` in sync.
  - Shift-style toggle adds/removes selected nodes.
  - area selection returns enclosed nodes without selecting their containing frame.
- Playwright CLI covers live editor behavior:
  - Shift-click selects two layer buttons and shows the multi-selection inspector message.
  - Empty-canvas drag shows the area selection box and selects the enclosed layers.
- Direct Playwright CLI interaction pass repeats the visible actions against the running editor and records the clicked, dragged, typed, and visible results.
