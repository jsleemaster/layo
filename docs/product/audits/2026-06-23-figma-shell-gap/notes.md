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

2026-06-23 context menu lock/visibility slice:

- Added node interaction metadata: `locked` and `visible` now round-trip through the renderer type, server storage type, Rust model, generated TypeScript bindings, and Yjs collaboration document.
- Added undoable `잠그기` / `잠금 해제` and `숨기기` / `표시` menu actions.
- Locked nodes remain visible but are excluded from canvas hit-testing, drag, resize, text edit, deletion, duplication, layer ordering, component conversion, layout, constraints, fill, and text mutation paths.
- Hidden nodes are not rendered or canvas-selectable, remain visible in the layer list with `숨김`, and can be restored by selecting the layer and opening the context menu on blank canvas.
- Hidden children are excluded from spacing overlays and code export recursion so invisible design layers do not create visible export or measurement artifacts.
- Verification: editor-state unit tests, Yjs concurrent metadata merge test, Rust JSON round-trip test, full `pnpm test`, `pnpm typecheck`, web build, design-rule check, full `editor-mvp` Playwright run, and headed Playwright lock/visibility interaction pass.

2026-06-23 context menu structure slice:

- Added `group` as a first-class transparent node kind across renderer types, server storage, Rust model, and generated TypeScript bindings.
- Added undoable `이름 변경`, `그룹으로 묶기`, and `그룹 해제` context-menu actions.
- Grouping currently supports selected sibling layers under one parent; it preserves visual positions by converting child transforms into group-relative coordinates and restores them on ungroup.
- Group layers render as transparent containers with selection chrome and layer-list status, not as visible filled boxes.
- Verification: editor-state rename/group/ungroup unit tests, Rust group JSON round-trip test, full `pnpm typecheck`, full `pnpm test`, web build, design-rule check, full `editor-mvp` Playwright run, and headed Playwright group/rename/ungroup interaction pass.

2026-06-23 context menu frame-selection slice:

- Added undoable `선택 영역 프레임 만들기` for selected sibling layers, matching the common Figma right-click "Frame selection" workflow.
- The new frame preserves the selected layers' visual positions by moving children into frame-relative coordinates and selecting the created frame.
- Verification started with a RED editor-state test for missing `frameSelectedNodes`, then passed focused editor-state tests, web typecheck, and focused Playwright right-click menu coverage.

2026-06-23 image context-menu original-size slice:

- Added uploaded image natural-size metadata to image node content across renderer types, server storage types, Rust model bindings, and Rust JSON round-trip coverage.
- Added undoable `원본 크기로 맞춤` for image nodes in the object context menu, so imported images can be restored from the fitted canvas size to their uploaded dimensions.
- Verification started with RED editor-state/typecheck failures for missing natural-size input and `resizeSelectedImageToNaturalSize`, then passed focused editor-state tests, Rust JSON round-trip coverage, and focused Playwright right-click image coverage.

2026-06-23 image context-menu replacement slice:

- Added undoable `이미지 바꾸기` for image nodes in the object context menu, preserving the selected layer's geometry while replacing the backing uploaded asset and its natural-size metadata.
- Browser coverage verifies the actual right-click menu, file chooser replacement, preserved fitted size, reload persistence, and follow-up `원본 크기로 맞춤` using the replacement image dimensions.
- This closes the highest-friction missing image context-menu action; crop/image-fill controls remain next in the imagery lane.

2026-06-23 image fill/fit context-menu slice:

- Added undoable image fit metadata with `이미지 채우기` and `이미지 맞춤` right-click actions for image nodes, preserving geometry while switching between cover-crop and contain rendering.
- Persisted the mode through local file storage, Rust model round-trip, and code-export structure so agent handoff can inspect the selected sizing behavior.
- Browser coverage verifies the right-click flow, server persistence, reload persistence, and returning from fit back to fill; pure rendering tests cover the cover/contain draw math.

2026-06-23 Figma-like left asset panel slice:

- Compared the referenced Figma screenshot against the live Layo shell and found the biggest first-viewport mismatch was the left panel: Figma opens a mode-specific `에셋` library/search panel, while Layo opened a project/team management surface.
- Changed the default left rail mode to `에셋`, kept project management behind the `파일` rail button, and made the active panel heading follow the selected rail mode.
- Rebuilt the asset panel around a Figma-like library search field, empty library state, team-library CTA, and compact UI kit list so the first screen reads as a design editor instead of an admin form.
- Added Playwright coverage for default asset panel visibility, hidden project controls, file-rail switching, and returning to the asset panel.
