# Page Management Design

Last Updated: 2026-09-01

Status: Active design; implementation and verification evidence pending

## Problem

Layo can navigate pages already present in `RendererDocument.pages[]`, but the
browser and deterministic agent surfaces cannot create, rename, reorder, or
delete them. The four-page Resume Admin audit exposed the cost directly: the
page structure had to be written through a raw document `PUT` instead of a
normal Layo page workflow.

The earlier comparison also overstated the collaboration gap. Layo already has
substantial comment CRUD, ownership, unread, notification, and activity
behavior. The reproducible editor-authoring gap is page management, not the
existence of comment threads.

## Reference And Product Decision

Penpot's current workspace documentation says pages organize one file into
separate sections and can be added, removed, renamed, and reordered:

- https://help.penpot.app/user-guide/designing/workspace-basics/#pages
- https://help.penpot.app/user-guide/first-steps/the-interface/#workspace

Layo will **adopt** the visible page-management expectations and **adapt** them
to its local-first, deterministic architecture:

- Human and agent edits mutate the same `pages[]` document contract.
- Browser mutations use the existing editor command, Undo/Redo,
  collaboration-transaction, and per-file persistence paths.
- MCP and HTTP expose typed page commands with dry-run support instead of
  requiring complete-document replacement.
- Page reorder uses explicit keyboard-reachable controls in this bounded slice;
  drag reordering can follow only if it adds product value beyond the same
  underlying command.

Layo deliberately diverges or defers in these areas:

- A document must retain at least one page; deleting the last page is refused.
- Penpot page separators, page duplication, cross-page layer moves, and page
  thumbnails are not part of this slice.
- Hosted reviewer invite, viewer identity, permissions, and document delivery
  remain a separate security-sensitive collaboration slice. Page CRUD does not
  imply that external review is fixed.

Maturity gates: Editor completeness and Agent safety.

## Goals

1. A human can create, rename, reorder, and delete pages from Layers without a
   raw document request.
2. An agent can perform the same operations through reviewed typed commands.
3. Page mutations are undoable, persist after reload, and propagate through an
   active collaboration session by reusing existing infrastructure.
4. Active-page and selection state stay valid after every page mutation.

## Non-Goals

- Redesigning the whole Layers panel or implementing a hierarchical layer tree.
- Building a public review link, invite flow, hosted identity, or new permission
  model.
- Adding page separators, duplication, thumbnails, templates, or bulk page
  operations.
- Moving layers between pages or changing page-scoped comment semantics.
- Introducing a second page model, mutation API, or collaboration channel.

## Interaction Design

### Page section

- Keep pages at the top of the Layers surface, above the active page's layers.
- Expose a Korean-first add-page action in the page-section header.
- Each page row keeps its existing page-selection behavior and exposes rename,
  move up, move down, and delete controls.
- Controls use existing design tokens, remain visually compact, and keep at
  least the current 32px compact-tool target.
- Disabled boundary actions are explicit: the first page cannot move up, the
  last page cannot move down, and the only page cannot be deleted.
- Controls carry programmatic names that include the target page name so the
  operation is unambiguous to keyboard and assistive-technology users.

### Create

- Create appends a uniquely identified empty page with a non-empty default
  Korean name.
- The new page becomes active and selection is empty.
- Creation is one Undoable document mutation and one collaboration transaction.

### Rename

- Rename accepts a trimmed non-empty name and leaves the same page active.
- Blank input is rejected without mutating or persisting the document.
- Selection remains valid because page and node identities do not change.

### Reorder

- Move up/down changes only page order; page and node IDs remain stable.
- The same page remains active, and valid selection remains selected.
- Boundary moves are no-ops and do not create history entries.

### Delete

- Delete removes the complete target page subtree as one document mutation.
- Deleting the only page is refused in UI and command validation.
- Deleting an inactive page preserves the current page and any still-valid
  selection.
- Deleting the active page activates the nearest surviving page and clears
  selection before Inspector, presence, or shortcuts can observe stale nodes.
- Undo restores the exact page content and its prior order. Active-page session
  state may remain on the current valid page; the restored page is available in
  the page list immediately.

## Document And Command Contract

The implementation reuses `RendererDocument.pages[]`; no schema migration is
required.

Browser editor commands must support reversible page insertion, removal,
rename, and reorder. Invalid or no-op commands must return the unchanged state
without adding Undo history.

The agent command surface adds:

- `create_page { pageId, name?, index? }`
- `rename_page { pageId, name }`
- `reorder_page { pageId, toIndex }`
- `delete_page { pageId }`

Validation rules:

- Page IDs are stable and unique.
- Page names are trimmed and non-empty.
- The target page must exist for rename, reorder, and delete.
- Insertion and reorder indexes are deterministic and range-checked or safely
  clamped according to the shared command implementation.
- `delete_page` refuses to remove the last page.
- Agent dry-run returns the proposed document and validation result without a
  filesystem write; commit persists the exact reviewed command batch.

## Collaboration And Persistence

- Page mutations enter the same local interaction path used by other document
  edits, so standalone persistence, Yjs transactions, and remote propagation do
  not fork into page-specific implementations.
- Remote page removal or reorder immediately reconciles local `activePageId`
  and scopes selection to a surviving page before presence is published.
- Undo/Redo uses the existing local or collaborative history owner and persists
  both directions through the per-file queue.
- No new relay token, member token, viewer role, or sharing behavior is added.

## Failure And Safety Behavior

- Duplicate IDs, blank names, unknown targets, and last-page deletion fail
  before persistence.
- Boundary reorder commands are no-ops.
- Project transition and saved-version preview mutation barriers apply to page
  actions exactly as they do to existing editor mutations.
- A rejected operation leaves page order, active page, selection, history, and
  saved document unchanged.

## Acceptance Gates

1. Browser UI can create, rename, reorder, and delete pages without raw `PUT`.
2. The only page cannot be deleted by UI, HTTP agent commands, or MCP.
3. Create/delete/reorder/rename support Undo and Redo without page loss or
   duplicate IDs.
4. Active-page fallback and selection behavior match the interaction rules
   above, including active and inactive page deletion.
5. Reload preserves page names, order, contents, and the latest committed
   operation.
6. MCP/HTTP dry-run does not write; commit writes the reviewed typed commands.
7. Two collaboration clients observe the same page create/rename/reorder/delete
   result, and both remain on a valid page with valid selection.
8. Focused unit, server/MCP, Playwright CLI, production build, and direct live
   browser interaction checks pass without retry or console errors.
9. No claim is made that public reviewer invite or viewer permission maturity is
   fixed by this slice.
