# Figma Shell Gap Audit

Date: 2026-06-23
Surface: Layo web editor
Reference: `/Users/leeo/.codex/attachments/75dbafee-ee35-4185-93df-de281b13c250/image-1.png`
Current capture: `/tmp/layo-current-2048.png`

## Why Layo Looks Different

Layo started as a local-first MVP with project storage, MCP/HTTP document control, and a stable canvas model. That made the first shell project-management heavy: a single left sidebar carries project selection, layers, and team setup; the canvas is a fixed white work area; and creation/navigation tools sit in a top toolbar.

The Figma reference is canvas-first. It separates app navigation, files/assets/layers, canvas tools, rulers, and inspector controls into distinct surfaces. The center is an infinite neutral workspace with spatial chrome, not a full-bleed white page. Object editing also exposes a rich right-click menu so common commands do not require keyboard shortcuts or side-panel hunting.

## Gaps To Adopt

1. Editor shell hierarchy
   - Add a narrow left rail for mode switching.
   - Keep the left panel for the active mode instead of mixing every project/team control at once.
   - Move create/navigation tools into a bottom floating toolbar.

2. Canvas spatial chrome
   - Add top and left rulers.
   - Keep the neutral workspace visible behind the rendered stage.
   - Preserve existing selection chrome, size badge, snap guides, and measurement overlays.

3. Inspector shape
   - Show design/prototype tabs and collapsible-looking sections even when nothing is selected.
   - Keep the existing geometry, fill, text, alignment, layout, and constraints controls for selected nodes.

4. Object context menu
   - Right-click selected or hovered objects should open a command menu.
   - Initial commands: copy, paste, duplicate, delete, create component, create instance, detach instance, and alignment/distribution actions with disabled states where required.
   - The menu should work for rectangles, text, images, frames, components, and component instances.

5. Follow-up scope
   - Full file tab management, team library browsing, comments, history, variants, prototyping, dev handoff, and complete Figma import remain separate roadmap items.
   - This PR should not invent a remote production backend or break local-first storage.

## First Implementation Slice

Ship a Figma-like shell baseline plus object context menu:

- left mode rail
- canvas rulers
- bottom floating toolbar
- right inspector section scaffold
- right-click object menu with real editing actions
- dev-start guard so the local server runs without prebuilt workspace packages

This is not the full Figma parity endpoint. It is the foundation needed before deeper object menu groups, asset libraries, file tabs, and inspector redesign can land without fighting the current layout.

## Follow-up Implementation Notes

2026-06-23 context menu expansion:

- Added real `잘라내기` behavior by copying the scoped object and deleting it through the undoable editor-state path.
- Added `여기에 붙여넣기` using the context-menu document point, so pasted objects can land at the right-click location instead of only using the default offset paste.
- Added layer stack order actions for `맨 앞으로 가져오기`, `앞으로 가져오기`, `뒤로 보내기`, and `맨 뒤로 보내기` through an undoable document command.
- Covered the behavior with editor-state unit tests and the right-click object/image Playwright flow.
