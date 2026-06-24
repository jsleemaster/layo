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

2026-06-23 Figma-like right inspector slice:

- Compared the referenced Figma screenshot against the live Layo shell and found the next visible mismatch on the right panel: Figma has a compact action strip with preview/share/zoom controls and a long frame preset category list, while Layo showed a generic `검사기` title and only three presets.
- Added an Inspector action strip with account affordance, preview, code view, real share action wiring, and current zoom readout while keeping the design/prototype tabs underneath.
- Expanded the empty-state frame presets into Figma-like categories including presentation, watch, paper, social media, FigJam community, and archive rows.
- Added Playwright coverage for the new action strip, zoom readout, preview/share buttons, and expanded preset categories.

2026-06-23 expanded object context-menu slice:

- Reviewed the current object/image right-click menu against common Figma object workflows and found the next gap was not only missing image actions, but missing broad selection, transform, viewport, and export commands.
- Added undoable/editor-state-backed actions for `전체 선택`, `같은 종류 선택`, `가로 뒤집기`, `세로 뒤집기`, and `선택 영역 확대`, plus a real `코드로 내보내기` JSON download backed by the existing code-export HTTP route.
- Fixed the long context-menu positioning bug discovered by Playwright: menus opened near the bottom of the viewport now clamp back into view so long command lists remain scrollable and clickable.
- Verification started with RED editor-state failures for missing selection/flip/fit functions and a RED Playwright failure for missing `전체 선택`; the focused unit and e2e tests now pass.

2026-06-23 asset-library card polish slice:

- Compared the live first viewport against the Figma reference and found the left `에셋` panel still read as abstract color swatches instead of library/template cards.
- Expanded the starter kit list to six Figma-like library cards, including `visionOS 26`, richer component/template metadata, accessible preview labels, and token-based miniature thumbnails.
- Adjusted long kit names to wrap inside the card instead of truncating, so library labels remain inspectable in the dense sidebar.
- Verification started with a RED Playwright expectation for the missing `visionOS 26` card and richer thumbnail metadata; the focused e2e now passes and visual proof is stored in `/tmp/layo-asset-library-card-polish-final2.png`.

2026-06-23 context-menu style/export slice:

- Rechecked the object/image context menu against the Figma parity inventory after the broader menu expansion and found two still-missing common design-tool actions: copying/pasting visual style and exporting the selected object as an image.
- Added undoable `set_node_style` editor-state support so context-menu style paste applies fill, stroke, stroke width, and opacity through the same command/history path as other object edits.
- Added right-click menu actions for `스타일 복사`, `스타일 붙여넣기`, and `PNG로 내보내기`; PNG export crops the current Konva stage to the selected object bounds and hides selection chrome during export.
- Verification started with a RED Playwright expectation for the missing `스타일 복사` menu item; the focused e2e now passes for style paste and PNG download.

2026-06-23 context-menu scanability slice:

- The context menu had gained many actions but still rendered as one long undifferentiated list, unlike Figma-style menus that rely on thin section breaks and right-aligned shortcut hints for scanning.
- Reworked the menu into accessible grouped sections for clipboard, selection/export, edit, status, layer ordering, components, and alignment/distribution, with image-specific actions still shown only for image nodes.
- Added right-aligned shortcut hints for the core Figma-like object actions, while keeping each menu item's accessible name on the action label so existing command tests remain stable.
- Verification started with a RED Playwright expectation for missing grouped sections and shortcut hints; the focused e2e now passes for section count, section labeling, and shortcut rendering.

2026-06-23 context-menu shortcut-equivalence slice:

- Rechecked the grouped object menu and found a design-tool parity gap: several menu items displayed Figma-like shortcut hints, but the keyboard router only handled copy, paste, duplicate, delete, undo, redo, zoom, nudge, pan, and escape.
- Added keyboard paths for the visible menu hints: `⌘X` cut, `⌘A` select all, `⇧⌘A` select same kind, `⇧1` fit selection, `⌥⌘C`/`⌥⌘V` style copy/paste, `⌘R` rename, `⌘G` group, `⇧⌘G` ungroup, and `⌥A`/`⌥H`/`⌥D`/`⌥W`/`⌥V`/`⌥S` alignment.
- Verification started with RED Playwright failures for `Control+X` leaving the selected layer in place, `Control+G` not creating a group, `Alt+A` leaving the selected rectangle unaligned, `Control+Shift+A` not selecting same-kind layers, `Control+Alt+V` falling through to object paste, and `Control+R` not renaming the selected layer; the focused e2e tests now pass.

2026-06-24 generated brand-logo asset slice:

- Rechecked the Figma reference and live Layo shell for first-viewport product identity. The remaining gap was that Layo still used a text-only `L` rail mark and had no favicon, apple-touch icon, or web manifest icon.
- Generated a bitmap Layo logo mark with imagegen, then saved a processed transparent-corner project asset at `apps/web/public/assets/brand/layo-logo-mark.png` instead of referencing the default generated-image folder.
- Replaced the rail text mark with the generated logo image and wired the same asset into favicon, apple-touch icon, and `site.webmanifest`.
- Verification started with a RED Playwright failure for missing `data-testid="layo-brand-logo"`; the focused e2e now verifies the rendered image loads and the document head points at the project-bound brand asset.
