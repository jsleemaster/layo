# Page Management Plan

Last Updated: 2026-09-01

Status: Active

## Goal

Close the exact raw-document-write gap exposed by the Resume Admin audit: make
page create, rename, reorder, and delete first-class browser and agent actions
while preserving local-first persistence, collaboration, Undo/Redo, and active
page safety.

## Penpot Comparison

- **Adopt:** Pages are directly manageable in the workspace, not only
  navigable.
- **Adapt:** Layo uses compact Korean controls plus typed HTTP/MCP commands over
  the shared `pages[]` model and existing persistence/collaboration paths.
- **Diverge:** Keep at least one page; do not add Penpot separators or a hosted
  dashboard in this slice.
- **Defer:** External reviewer invite, viewer identity/permissions, layer-tree
  hierarchy, page duplication, and drag reorder remain separate work.

Primary references:

- https://help.penpot.app/user-guide/designing/workspace-basics/#pages
- https://help.penpot.app/user-guide/first-steps/the-interface/#workspace

Maturity gates: Editor completeness and Agent safety.

## Exact Failed Case

The four-page Resume Admin audit could be opened and switched after its pages
existed, but Layo had no UI or typed agent command to create that structure. A
complete document `PUT` was required. This proves a page-authoring entry-cost
gap; it does not prove that Layo lacks comment CRUD.

## Minimal-Change Decision

Reuse:

- `RendererDocument.pages[]` and existing active-page projections
- editor command history and selection scoping
- `updateEditorFromInteraction` and the per-file persistence queue
- current Yjs document transaction and collaboration reconciliation
- the existing agent-command batch, HTTP route, MCP review/apply shape, and
  document validation
- Layers panel visual tokens and isolated Playwright runner

Add only:

- reversible page commands in editor state
- compact page controls in Layers
- typed agent-command schema/application support
- focused unit, API/MCP, collaboration, and browser regressions

## Tasks

### 1. Add RED state and agent regressions

- Prove create, rename, reorder, and delete are absent or fail the desired
  contract before implementation.
- Cover duplicate IDs, blank names, missing targets, boundary reorder, and
  last-page deletion.
- Cover exact Undo/Redo restoration of page content and order.
- Prove HTTP/MCP dry-run is no-write and commit persists.

### 2. Implement shared page mutation semantics

- Add reversible insert/remove/rename/move editor commands.
- Keep no-op and invalid commands out of Undo history.
- Preserve node/page IDs and complete page subtrees.
- Reconcile selection after active-page removal and retain valid selection for
  rename, reorder, or inactive-page deletion.

### 3. Add typed agent parity

- Add `create_page`, `rename_page`, `reorder_page`, and `delete_page` to the
  server agent command union and MCP schema.
- Reuse the existing command-batch dry-run/commit path.
- Return explicit validation failures instead of falling back to raw document
  replacement.

### 4. Add Korean-first Layers controls

- Add one page-create control in the page section.
- Add rename, move up/down, and delete actions per page row.
- Disable impossible boundary actions and last-page deletion.
- Keep controls keyboard reachable, programmatically named, tokenized, and at
  least 32px in the compact tool surface.
- Block page mutations during saved-version preview and project transition.

### 5. Verify persistence and collaboration

- Create four pages through the normal product surface, rename and reorder
  them, delete one, reload, and verify names/order/content.
- Verify active and inactive page deletion behavior.
- Verify Undo/Redo and remote propagation across two collaboration clients.
- Verify agent dry-run no-write followed by committed persistence.

### 6. Update product evidence and merge gates

- Update `DESIGN.md`, the Penpot maturity benchmark, Figma migration roadmap,
  PLAN_STATUS, and the product delta.
- Run design rules, maturity checks, workspace typecheck, focused tests, root
  tests, Rust workspace tests when affected, and production web build.
- Run focused Playwright CLI with one worker and zero retries.
- Perform a direct live browser click/keyboard pass and record visible results
  plus console state.
- Require exact-head review before merge; record real CI/PR/merge evidence in
  the product delta and PLAN_STATUS only after it exists.

## Completion Gates

- The four-page audit structure can be authored through UI and typed agent
  commands without raw document `PUT`.
- UI and agent operations share the same mutation semantics.
- Last-page deletion is impossible across UI, HTTP, and MCP.
- Undo/Redo, reload, and collaboration preserve complete page data and order.
- Active page and selection never point at deleted or hidden content.
- Focused Playwright passes without retry and the direct browser console is
  clean.
- Public reviewer invite and viewer permissions remain explicitly open rather
  than being reported as solved.
