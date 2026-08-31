# Editor Entry And Page Navigation Plan

Last Updated: 2026-08-31

Status: Implemented and locally verified; remote merge pending

## Goal

Make Layo's first useful action discoverable, ensure the Help rail action is real and keyboard reachable, and let users switch among pages already preserved in the document model without mixing hidden-page layers into the active workspace.

## Penpot comparison

- **Adapt explicit project entry:** Penpot creates projects/files from an explicit dashboard action. Layo remains local-first and keeps its combined editor shell, but an empty store must expose a working project-start action immediately.
- **Adapt the shortcuts panel:** Penpot opens its workspace shortcuts panel from Help or `?`. Layo should expose only shortcuts it actually implements and keep them inside the existing left rail/panel system.
- **Adapt page navigation:** Penpot exposes pages in the workspace. Layo already persists `pages[]`; the first slice adds session-level active-page switching and active-page-only Layers/canvas/Dev context.
- **Deliberate divergence:** this slice does not add a separate cloud dashboard, page create/rename/delete/reorder mutations, or preset-library installation.

Primary references:

- https://help.penpot.app/user-guide/account-teams/projects-files/
- https://help.penpot.app/user-guide/designing/workspace-basics/
- https://help.penpot.app/user-guide/first-steps/shortcuts/

Maturity gate: Editor completeness.

## Current failed cases

1. Empty storage opens the Assets panel, while project creation is hidden behind the File rail.
2. Empty-state library CTA and six kit cards look interactive but perform no action or status update.
3. Help is a focusable button with no behavior, and `?` does not open help.
4. The global canvas shortcut listener intercepts Space/Arrow/Delete while buttons, tabs, menuitems, or links have focus.
5. The visible canvas always renders `pages[0]`, while Layers flattens nodes from every page.

## Minimal-change decision

Reuse:

- `createNewProject`, `setLeftPanelMode`, `projectStatus`
- existing rail/sidebar visual system and design tokens
- `RendererDocument.pages[]` and `flattenRendererNodes`
- existing editor selection clearing and Inspector `pageName`
- existing Playwright `resetE2eStorage()` runner

New code is limited to:

- one Help panel and existing-panel navigation helpers
- honest static asset-kit markup
- interactive-focus detection for global shortcuts
- session-only `activePageId` and active-page projections

## Tasks

### 1. Add RED browser regressions

- Empty Assets state exposes a working project-start CTA.
- Help opens by button and `?`.
- Space activates a focused File rail button instead of starting canvas pan.
- Kit catalog items are not buttons.
- A two-page document switches Layers, canvas source, selection, and Inspector page context.

### 2. Repair editor entry and affordance honesty

- Keep the Assets default for returning users and existing shell continuity.
- When no project exists, show `프로젝트부터 시작하세요` and a primary `프로젝트 만들고 시작` action.
- After creation, switch to Layers and show the seeded canvas.
- Route `팀 라이브러리 탐색하기` to the Team panel.
- Render built-in kit examples as non-interactive catalog previews until installation exists.

### 3. Implement Help and shortcut safety

- Add `help` to `LeftPanelMode`.
- Open/close Help with the rail button and `?`.
- Show a Korean quick-start and only verified keyboard shortcuts.
- Expand the sidebar when a rail destination is selected.
- Preserve text entry and native control activation/navigation while keeping
  intentional layer-selection shortcuts available after layer focus.

### 4. Implement active-page switching

- Keep active page as editor-session state; do not mutate the document.
- Fall back to the first valid page after file/version changes.
- Show page buttons in Layers when the document has pages.
- Clear selection on page switch.
- Restrict visible Layers, canvas paint, comments, and Dev page exports to the active page.
- Restrict pointer hit testing, measurement, marquee selection, Select All, and
  Select Same Kind to the active page.
- Keep all-document node counts for generated ids and component relationships.

### 5. Verify and document

- Run design rule, typecheck, focused web tests, web build, and root core tests.
- Run focused Playwright CLI through `scripts/run-e2e.mjs` with one worker and zero retries.
- Perform a direct live browser click/keyboard pass and capture before/after screenshots.
- Update `DESIGN.md`, maturity benchmark, PLAN_STATUS, and the product delta.

## Completion gates

- Empty-store project creation is one visible action from the default screen.
- Every visible rail or asset control either works or is clearly non-interactive.
- Help works by click and `?` and does not interfere with focused inputs/controls.
- Button Space activation works without canvas pan interception.
- Switching to Page B hides Page A layers, paints distinct Page B pixels,
  clears stale selection, scopes hit/bulk-selection paths, and updates Inspector
  page context.
- No Figma implementation or Figma board work is included.
- Focused Playwright CLI passes without retry and browser console errors are zero.
