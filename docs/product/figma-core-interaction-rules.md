# Figma Core Interaction Rules

Last checked: 2026-06-17

This document records the Figma Design interaction rules that Canvas MCP Editor should adopt for core editing. It is intentionally scoped to direct manipulation behavior, not every Figma product surface. User-facing Canvas MCP Editor UI remains Korean-first.

## Source Set

- Select layers and objects: https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- Access design tools from the toolbar: https://help.figma.com/hc/en-us/articles/360041064174-Access-design-tools-from-the-toolbar
- Adjust alignment, rotation, position, and dimensions: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- Copy and paste objects: https://help.figma.com/hc/en-us/articles/4409078832791-Copy-and-paste-objects
- Arrange layers with Smart selection: https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection
- Add guides to the canvas or frames: https://help.figma.com/hc/en-us/articles/360040449713-Add-guides-to-the-canvas-or-frames
- Apply constraints to define how layers resize: https://help.figma.com/hc/en-us/articles/360039957734-Apply-constraints-to-define-how-layers-resize
- Horizontal and vertical auto layout flows: https://help.figma.com/hc/en-us/articles/31289464393751-Use-the-horizontal-and-vertical-flows-in-auto-layout
- Use Figma products with a keyboard: https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard

## Rule Matrix

| Area | Figma Rule | Canvas State | Decision |
| --- | --- | --- | --- |
| Default tool | Move is the default tool; Hand pans without selecting or moving objects; holding Space temporarily activates Hand. | Move/select exists; Space-drag pan landed in PR #20. | Adopted for Space hand mode. Keep explicit hand tool for later. |
| Single selection | Click selects a canvas layer. Nested children inside frames/groups are selected one level down with double-click or Enter. | Click selects rendered node; nested component instances defer to parent. No double-click/Enter drill-down yet. | Adopt. Add explicit nested-selection navigation after multi-select. |
| Multi-selection | Shift-click adds/removes canvas objects. Marquee selects objects in an area. Cmd/Ctrl marquee can select nested layers. | Single `nodeId` selection only. | Adopt next lane. Requires selection model change to `nodeIds`. |
| Parent selection | Selecting a parent object also selects child content for movement. | Parent drag moves its rendered group. | Mostly adopted. Preserve when adding multi-selection. |
| Keyboard selection navigation | Enter selects child, Shift+Enter selects parent, Tab/Shift+Tab moves across siblings. | Not implemented. | Adopt after multi-selection model is stable. |
| View navigation | Plain wheel pans; modifier-wheel zooms; keyboard zoom/reset use platform command modifiers. | Adopted in PR #20. | Keep covered by Playwright. |
| Nudge | Arrow keys nudge selected layers by small nudge; Shift uses big nudge. Figma defaults are 1 and 10. | Adopted in PR #20 with 1/10. | Add configurable values later. |
| Delete | Selected canvas layer can be removed with Delete or Backspace. In auto layout, siblings close the gap. Instances should not delete nested instance internals. | `delete_node` command exists; no keyboard shortcut. | Adopt now for selected node deletion. Instance nested delete can stay blocked by current parent-selection behavior. |
| Duplicate | Cmd/Ctrl+D duplicates selection. Top-level frames appear to the right; other objects are placed on top of the original. Option/Alt-drag duplicates while moving. | No keyboard duplicate helper. | Adopt now for selected node duplication. Start with non-top-level object duplicate in place. |
| Copy/paste | Cmd/Ctrl+C copies selected object; Cmd/Ctrl+V pastes to page/frame; paste here uses pointer location. | Not implemented. | Adopt after duplicate. Needs clipboard/session buffer and target parent rules. |
| Drag move | Move tool drags selected objects. Option/Alt-drag duplicates while dragging. Auto layout children reorder instead of free-moving inside layout flow. | Drag move exists. Auto layout relayout can override direct child position. No Alt-drag duplicate/reorder. | Adopt in stages. First add duplicate/delete shortcuts; then reorder and drag preview. |
| Resize | Objects resize through handles; Shift preserves aspect ratio; constraints can be ignored while resizing with platform command modifier. | Bottom-right resize only. | Adopt in precision canvas lane. |
| Alignment/distribution | Align controls align selected layers; distribute requires multiple selected layers and keeps outer objects fixed; tidy up adds stricter row/column/grid logic. | Not implemented. | Adopt after multi-selection. |
| Snap/guides | Snap settings help align centers and bounds; rulers are required before creating guides; guides can be canvas-level or frame-level. | Not implemented. | Adopt after live drag preview. Needs overlay guide rendering and snap metadata. |
| Constraints | Constraints apply only to layers inside frames, not outside frames or inside auto layout frames. | Constraints implemented broadly in inspector. | Adjust later: disable/ignore constraints controls for auto-layout children. |
| Auto layout | Vertical and horizontal auto layout objects follow y-axis or x-axis when added, removed, or reordered. | Basic vertical/horizontal auto layout landed. | Continue. Delete should trigger relayout through existing command pipeline. |

## Immediate Adoption Order

1. Keep PR #20 behavior as the navigation baseline: wheel pan, modifier zoom, 1/10 nudge, Space hand pan.
2. Add selected-layer Delete/Backspace and Cmd/Ctrl+D duplicate because these are basic editing expectations and map to existing command architecture.
3. Change selection to support `nodeIds` for Shift-click and marquee.
4. Add alignment/distribute commands after multi-selection exists.
5. Add live snap guides after drag preview and multi-selection bounds are stable.
6. Add copy/paste and paste-here after duplicate helper establishes clone/id/parent behavior.

## Non-Goals For The Current Slice

- Multi-selection data-model migration.
- Clipboard integration.
- Snap guide rendering.
- All resize handles, rotate, flip, and aspect-ratio resize.
- Nested layer keyboard navigation.

