# Penpot Page Management Delta

Last checked: 2026-09-01

Status: Active implementation; verification and merge evidence pending

## 2026-09-08 Verification Follow-up

- Local and relay page operations now use the same nearest-surviving-page rule,
  including delete, Undo, select the restored page, and Redo.
- Browser regressions read server page order immediately after both Undo and
  Redo. Remote selection and cursor removal is checked within 1500ms, before
  the 4000ms presence expiry can conceal a missing update.
- Invalid page commands return HTTP 400, including last-page deletion.
- Inactive-page actions preserve active selection; rename errors are visible
  and focus returns after save, cancel, or delete. Rename drafts reset across
  document changes.
- Focused Playwright: 2/2 passed with one worker and zero retries. Running the
  two files with multiple workers shares their resettable storage and is invalid;
  use `--workers=1` for this combined verification.
- Fullstack build, workspace typecheck, and root `pnpm test` passed on 2026-09-08.
  The full collaboration Playwright suite passed 12/12 with one worker and zero retries.
  GitHub review and merge remain pending until the PR gate completes.

## Comparison Correction

The broad statement that Figma/Penpot was easier because Layo lacked review or
comment capability was imprecise. Layo already has substantial node comment
CRUD, replies, ownership, resolution, mentions, unread state, notifications,
and activity evidence.

The reproducible difference in the Resume Admin audit was structural authoring:
Layo could switch among existing pages but could not create, rename, reorder, or
delete them through the editor or deterministic agent commands. Building the
four-page audit therefore required a raw complete-document `PUT`. This delta
targets that exact entry-cost failure.

## Penpot Reference

Penpot documents pages as separate organizational sections within a file and
exposes add, remove, rename, and reorder operations in the workspace:

- https://help.penpot.app/user-guide/designing/workspace-basics/#pages
- https://help.penpot.app/user-guide/first-steps/the-interface/#workspace

## Adopt, Adapt, Diverge

### Adopt

- Page management is visible beside page navigation in the Layers surface.
- Users can create, rename, reorder, and delete pages without replacing the
  whole document.
- Page operations are predictable, keyboard reachable, and Undoable.

### Adapt

- Layo keeps its local-first `RendererDocument.pages[]` model.
- Browser operations reuse existing editor history, Yjs transactions, and
  ordered persistence rather than introducing page-specific state storage.
- Typed `create_page`, `rename_page`, `reorder_page`, and `delete_page` agent
  commands provide HTTP/MCP parity and dry-run review.
- The first UI slice uses explicit move controls over the same reorder command;
  drag reorder is not required to close the authoring gap.

### Deliberate Divergence And Deferral

- Layo refuses deletion of the final page so a design document always has one
  valid workspace root.
- Penpot `---` separators, duplication, thumbnails, bulk page operations, and
  cross-page layer movement are deferred.
- Public reviewer invite, viewer identity, read/write permission enforcement,
  and initial document delivery remain a separate security-sensitive slice.
  This page delta must not be cited as reviewer-mode completion.

## Intended Product Contract

| Operation | Browser behavior | Agent behavior | Safety invariant |
| --- | --- | --- | --- |
| Create | Add a named empty page and activate it | `create_page` with stable id, optional name/index | Duplicate id is rejected; selection is empty |
| Rename | Commit a trimmed non-empty name | `rename_page` | Blank name and unknown page are rejected |
| Reorder | Move the same page up/down | `reorder_page` to deterministic index | Page/node ids and valid selection remain stable |
| Delete | Remove the target subtree; fall back when active | `delete_page` | Last page and unknown page are rejected |

## Existing Primitives Reused

- `RendererDocument.pages[]` and active-page scoping
- reversible editor command/history path
- `updateEditorFromInteraction` and ordered file persistence
- Yjs document transactions and active-page reconciliation
- agent command batch dry-run/commit, validation, HTTP, and MCP plumbing
- Layers panel tokens and repository-owned Playwright CLI runner

## Acceptance Evidence Required

This delta remains incomplete until all of the following are recorded:

1. Unit proof for create/rename/reorder/delete, invalid inputs, and Undo/Redo.
2. Server/MCP proof that dry-run is no-write, commit persists, and last-page
   deletion is rejected.
3. Playwright proof that a user can author, rename, reorder, delete, and reload
   a multi-page document from Layers.
4. Collaboration proof that two clients converge and retain valid active page
   and selection state.
5. Direct live browser interaction proof with zero console errors.
6. Exact-head CI, review, PR, merge, and post-merge cleanup evidence.

Until those gates pass, the correct status is **active implementation**, not
completed page-management parity.

## Remaining Gaps

1. External reviewer invite, viewer authorization, and initial document sync.
2. Hierarchical, searchable, collapsible layer-tree navigation.
3. Page drag reorder, separators, duplication, thumbnails, and bulk actions.
4. Cross-page layer movement and richer page-level Dev/review workflows.
