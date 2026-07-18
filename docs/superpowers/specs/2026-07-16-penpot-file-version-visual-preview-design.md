# Penpot File Version Visual Preview Design

Last checked: 2026-07-16

## Reference

Layo **adapts** Penpot's saved-version preview workflow at Penpot `develop`
commit `17c344b8f5fe785b1be7ae7a6e34945e17a118d8`:

- https://help.penpot.app/user-guide/designing/workspace-basics/#preview-a-saved-version
- https://github.com/penpot/penpot/commit/17c344b8f5fe785b1be7ae7a6e34945e17a118d8

Penpot opens a saved version as a view-only workspace, names the version in a
banner, marks the workspace read-only, and exposes explicit Exit and Restore
commands. Layo currently reads the complete saved document but only renders a
change-summary card. A reviewer cannot inspect the saved visual state on the
canvas, so the current behavior does not close the benchmark's full visual
preview gap.

## Decision

Keep the live editor document authoritative and store the saved snapshot in a
separate preview state. While preview is active:

- render the saved document on the normal canvas with the current viewport;
- show a persistent Korean banner with version name, read-only state, Exit,
  and Restore;
- make editor chrome, Inspector inputs, canvas node interaction, drop/paste,
  context menus, and mutation shortcuts inert;
- keep pan and zoom available for visual inspection;
- keep the live editor/collaboration state in memory without publishing the
  preview snapshot or writing it to storage;
- exit back to the current live document without a reload;
- restore only through the existing server restore endpoint, which first saves
  a recovery snapshot, then replace the active Yjs document in one
  `file-version-restore` transaction before permitting another local edit.

This adapts Penpot's hosted workspace behavior to Layo's local-first single-page
canvas. Page switching is not added in this slice because the current renderer
and editor expose one active page. The preview uses the complete persisted
`RendererDocument`, not a generated thumbnail or diff approximation.

## State And Interaction Contract

`FileVersionPreviewState` owns the selected `FileVersionSummary`, the saved
`RendererDocument`, and the current-file change summary. The normal `editor`
state remains untouched.

The displayed document is `preview.document` while preview is active and
`editor.document` otherwise. Selection, resize handles, path controls, grid
controls, comment bubbles, remote presence, spacing handles, and other editing
overlays are suppressed in preview. The saved document is rendered with
`renderNode(readOnly: true)`, which disables selection, direct editing, resize,
and drag behavior at the Konva node boundary.

The global keyboard handler allows viewport zoom and space-pan, handles Escape
as Exit, and rejects all document mutation shortcuts while preview is active.
Paste, drop, and context-menu entry points also return without mutation.

`fileVersionPreviewActiveRef` is the central synchronous policy read for event
and async callback boundaries. `updateEditorFromInteraction` rejects document
or selection changes during preview, while `updateViewportFromInteraction`
copies only the derived viewport and cannot commit a derived document. The
command dispatcher and persistence-bearing text/style/geometry/layout/image
entry points also reject preview-originated mutation. Preview entry cancels
active drag, resize, grid resize/reorder, area selection, path/text edit, and
context-menu state before exposing the saved document.

Preview request start also advances an editor-mutation generation. An image
upload that has not reached document persistence must still match that
generation and the current file after every upload await or it is abandoned.
If persistence was already admitted before preview started, its resulting
command is applied to the hidden live editor/Yjs document even while the saved
snapshot stays visible. This keeps server and live state convergent without
letting preview-originated work mutate either document.

Preview reads use a monotonic request id plus current file identity. A response
for an older version request or a previously active project is ignored. Reset,
refresh, exit, and restore invalidate outstanding reads.

## Failure Handling

- Snapshot read or diff failure leaves the live document visible and reports
  the existing preview error.
- A deleted/pruned selected version exits preview through the existing refresh
  and retention paths.
- Remote/live changes received during preview remain in the live editor state
  and become visible on Exit.
- Restore publishes the server-authoritative restored document through the
  active collaboration session. A later remote edit is a new edit; a stale
  pre-restore local Yjs snapshot cannot become the basis of the next command.
- Restore failure keeps preview active so the reviewer can retry or exit.
- A stale preview response after another preview or project switch is ignored.
- Preview never writes the snapshot through collaboration or document-save
  paths.

## Verification

TDD evidence must prove:

- the existing diff card still reports the saved/current difference;
- the saved version's distinct canvas color is visible during preview while the
  current version's color is absent;
- the banner names the version and exposes read-only, Exit, and Restore states;
- toolbar, Inspector, node drag/edit, paste/drop, context menu, and mutation
  shortcuts cannot change the current server document;
- pan/zoom remain usable;
- Exit reveals the unchanged current visual state;
- Restore uses the existing recovery-safe route and makes the saved visual state
  current.
- a preview request race cannot display a snapshot from another version/file;
- collaboration restore converges the local editor, active Yjs document, remote
  client, server file, and next edit;
- preview entry during drag/resize cannot commit on the later pointer-up.
- preview entry while an image upload is pending prevents that upload from
  creating a document node.

Direct Playwright CLI interaction must enter preview, inspect the visible saved
canvas, attempt a forbidden edit, pan or zoom, exit, and restore.

## Maturity Mapping

This advances benchmark gate 2 (collaboration/history/recovery), gate 3
(browser editor), gate 8 (visible product workflow), and gate 10 (failure
learning). Comment edit/delete, comment visibility preferences, multi-page
preview navigation, hosted durable event delivery, and branch/review/merge
workflows remain open.
