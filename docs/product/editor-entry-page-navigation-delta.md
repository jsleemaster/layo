# Editor Entry And Page Navigation Delta

Last checked: 2026-08-31

Status: Completed by PR #322 merge gate; focused Playwright and local full
verification GREEN.

## Reference And Decision

Layo **adapts** three workspace behaviors from Penpot's explicit project entry,
shortcut help, and page navigation:

- https://help.penpot.app/user-guide/account-teams/projects-files/
- https://help.penpot.app/user-guide/designing/workspace-basics/
- https://help.penpot.app/user-guide/first-steps/shortcuts/

Figma remains a secondary behavior baseline for familiar editor navigation. It
is not the implementation owner for this slice. No Figma board, Figma file, or
migration artifact is created by this delta.

Layo keeps one local-first editor shell rather than copying a hosted dashboard.
The slice reuses the existing project, rail, document-page, selection,
Inspector, and Playwright primitives instead of introducing a parallel editor
or document model.

## Implemented Scope

### Empty Entry

- The default Assets surface remains, but an empty local store now exposes one
  working `프로젝트 만들고 시작` primary action.
- Successful creation reuses the existing project transition and opens the
  Layers surface with the seeded document ready to edit.
- The library CTA routes to the existing Team surface.
- Built-in kit examples are static catalog previews rather than buttons, and
  their copy states that they are examples until installation exists.

### Help And Shortcut Safety

- Help is a real left-rail destination with Korean quick-start steps and only
  shortcuts already implemented by the editor.
- The rail button and `?` toggle the same Help surface and expand a collapsed
  sidebar.
- Global canvas shortcuts now preserve text entry plus native control
  activation/navigation. Layer rows still forward intentional selection
  shortcuts such as Arrow, Delete, and command-modified actions after a user
  selects a layer.

### Active Page Navigation

- Existing `RendererDocument.pages[]` entries are exposed in the Layers
  surface through session-only `activePageId` state.
- Switching pages clears stale selection and scopes the visible layer list,
  canvas paint, comment overlays, Inspector page identity, and page-level Dev
  export review to the active page.
- Remote collaboration cursors, selection bounds, and editing claims are also
  scoped to the active page. Legacy presence without a page id is treated as
  first-page presence so rolling upgrades preserve the old single-page
  behavior without leaking overlays onto later pages.
- Older receivers cannot interpret the new opaque page id; collaborators must
  refresh to the upgraded client before cross-version overlay isolation is
  guaranteed.
- Incoming collaborative node moves, deletes, and bounds changes reconcile the
  local page-scoped selection and republish presence in the same subscription
  callback. Saved-version preview preserves the live selection internally but
  keeps its selection, cursor, and editing presence hidden through incoming
  live document updates, then republishes on preview exit.
- Pointer hit testing, measurement targets, marquee selection, Select All, and
  Select Same Kind are also constrained to the active page, so overlapping
  coordinates cannot select or mutate a hidden page.
- Keyboard/context paste resolves its parent inside the active page. A nested
  copy snapshots its source-parent origin at copy time, then reanchors to the
  active page root even if that source parent later moves or is deleted;
  same-page nested paste retains the original parent.
- Async image insert and replacement revalidate their captured page after image
  decoding, upload, and again at the persistence queue boundary. A pre-commit
  page switch cancels the operation and removes the unreferenced uploaded asset.
- Once the document write starts, confirmed insert/replacement reconciliation
  completes inside the same per-file queue operation. A later page switch keeps
  the current page selection while the source-page commit remains in both the
  server and local document, preventing a stale snapshot from reverting it.
- Queue-start snapshots are the merge base for confirmed writes. This preserves
  mid-flight lock changes, makes the last queued replacement win in both server
  and editor state, and avoids lock-policy rejection during reconciliation.
- Concurrent image drops reserve distinct IDs before their first async boundary.
  Previous replacement assets remain available to Undo; cleanup is deliberately
  deferred to a separate history-aware GC policy rather than deleting them
  immediately and restoring a broken asset reference.
- A newly uploaded asset whose confirmed delta is fully discarded by a newer
  delete is different: its reference-safe cleanup is queued after pending file
  writes, once the server can authoritatively determine that it is orphaned.
- Drag snapping receives the active-page projection only, and the editor now
  applies the calculated snap delta rather than displaying cosmetic guides
  while committing the raw pointer delta.
- New rectangles, text, images, and component instances target the active page
  while all-document node counts and component relationships remain intact.
- Active-page switching does not mutate the document and falls back to the
  first valid page after file or saved-version changes.

## Existing Primitives Reused

- `createNewProject`, project transition barriers, and `projectStatus`
- `LeftPanelMode`, the existing rail/sidebar shell, and editor design tokens
- `RendererDocument.pages[]`, `flattenRendererNodes`, and selection clearing
- active-page `pageName`, page export review, comment overlay, and canvas render
  paths
- the repository-owned isolated Playwright CLI runner and storage reset helper

## Deliberate Exclusions

- No separate project dashboard or hosted workspace is added.
- No page create, rename, delete, or reorder mutation is implied by the page
  switcher.
- No Figma board, Figma implementation artifact, or migration output is part of
  the editor-entry work.

## Remaining Product Gaps

1. Page CRUD, page reorder, persistence APIs, undo/redo, and deterministic
   HTTP/MCP commands remain open beyond session-only page switching.
2. The File surface still combines project management, archives, migration,
   libraries, comments, versions, Layers, and Team content in one dense scroll.
3. The declared 1024px comfortable viewport still needs a verified responsive
   or collapse strategy; the current fixed sidebar/Inspector contract remains.
4. Focus return after panel/page transitions and persistent
   server/save/async status presentation still need a dedicated product pass.

## Verification State

Focused Playwright coverage for empty entry, Help/shortcut behavior, and
active-page switching lives in `apps/web/e2e/editor-mvp.spec.ts`.

The repository-owned isolated wrapper passed the three initial cases 3/3 with
no retry, then repeated them five times for 15/15 with no retry. After review
expanded page coverage to canvas pixels, active-page hit testing, and scoped
selection, five focused editor/keyboard cases passed 5/5 without retry; the
editor-state regression passed 115/115. An earlier overlapping
run coincided with `cargo test --workspace` regenerating `ts-rs` bindings and
restarting the watched development server; after serializing Cargo and E2E, the
same browser command stayed green. Keep those two verification lanes sequential.

The first root test run also exposed a wall-clock-dependent authorization test:
its fixture token had expired relative to the current date because authentication
used the real clock. The regression now injects a fixed time inside the token's
validity window. The final local gate passed workspace typecheck, root
`pnpm test` (including 522 passed/47 skipped server tests and 287 web tests),
Rust workspace tests, design rules, the Penpot maturity check, and the production
web build. The build retains the existing large-chunk warning.

The exact-head Codex review on `bd24847` then found two additional active-page
leaks: cross-page paste retained the hidden source parent, and drag snapping
collected hidden-page targets. The repair added cross-page parent/coordinate
coverage, active-only snap-guide browser proof, and corrected actual snap delta
application. Focused editor-state tests now pass 117/117 and the two affected
Playwright cases pass 2/2 without retry. A fresh exact-head remote review is
required before merge.

The final combined editor/keyboard Playwright selection passes 6/6 without
retry, including both active-page repairs and the existing snap interaction.

The superseded `bd24847` Full Verification also exposed that the first
interactive-focus repair still treated layer rows like ordinary buttons: Space
drag moved the selected layer instead of panning, and Enter could not open path
editing. Layer rows now explicitly remain in the editor shortcut surface while
rail and other controls keep native activation. Both exact failed CI cases pass
2/2 locally without retry on the repaired code.

The next exact-head review on `0e3daee` found the remaining async and snapshot
boundaries: delayed image insertion could finish on the hidden source page, and
cross-page paste read the source parent origin at paste time. The repair adds a
synchronous active-page ref with queue-boundary revalidation and a copy-time
clipboard origin snapshot. The two focused browser regressions pass 2/2 and the
editor-state suite remains 117/117.

Independent re-review then extended the race proof through the document-write
commit boundary. Delayed node create and image replacement responses now
reconcile before the persistence queue advances and preserve a Page B selection;
a subsequent Page B edit proves the hidden Page A image commit survives later
snapshot persistence. The three focused image race cases pass 3/3 without retry.

Final local race coverage also holds parent/image locks across committed writes,
proves queued replacement A/B order converges on B, and reserves unique IDs for
overlapping drops. Fully discarded confirmed deltas keep the current history, so
the first Undo restores a concurrently deleted parent instead of consuming a
phantom image command. Replacement Undo keeps every referenced asset readable.
The six focused image cases pass 6/6 without retry.

The next exact-head review found that applied confirmed image reconciliation was
marked as a system-only Yjs transaction, leaving collaboration UndoManager
history empty after the local history reset. Applied insertions and replacements
now use one undoable collaboration transaction, while discarded deltas and
server-only convergence remain outside user history. The focused browser proof
covers insert Undo/Redo, replacement Undo/Redo, REST persistence in both
directions, retained source/replacement assets, and reload fidelity.

Another exact-head review found a narrower ownership race: a collaborator could
move the selected parent frame to another page while an asset upload waited,
without changing the uploader's active page or local mutation generation. Image
insertion now revalidates that the captured page root or nested parent still
belongs to the target page at every async boundary and queue entry; replacement
does the same for its target image node. A relay-backed regression holds an
earlier file-version save in A's per-file queue, completes the asset upload, then
uses B's Restore to move the live frame off Page 1 before releasing the queue.
It proves node POST count 0, page image counts `[0, 0]`, retained frame ownership
on Page 2, and uploaded asset cleanup to 404.

The final exact-head review then found that collaboration overlays still used
document-space coordinates without carrying page identity. Presence now
publishes `activePageId`, clears cursor and editing claims on page changes, and
filters only the overlay layer while leaving the Team member list intact. For
collaboration specs, the repository E2E wrapper now starts the TypeScript relay
it previously omitted, or reuses a healthy externally started Rust relay. Full
Verification runs the focused two-browser active-page regression explicitly.
That browser case also proves remote deletion removes a selection ghost and an
incoming live edit cannot revive selection or cursor overlays during a saved
version preview.

The final no-retry collaboration suite passed 10/10. Its Restore case now waits
for the visible Restore completion status before reopening Layers, preventing
late reconciliation from racing the post-Restore Inspector assertion.

A later exact-head review found that the displayed preview fallback still wrote
into the live `activePageId`. Live and preview page state are now separate: an
older Page-1-only snapshot may display its own fallback while the live Page 2,
selection, and page-scoped presence stay intact. Normal exit, Escape, refresh,
preview deletion, and failed preview discard only preview state; Restore may
reconcile the live page only when the restored document actually removes it.
Focused browser coverage proves local Page 2 selection and remote presence both
return after a Page-1-only preview, while applying that version as a real
Restore legitimately removes Page 2, selects Page 1, and clears the deleted
selection. Multi-page navigation inside the inert saved-version preview remains
a separate maturity gap.

The final combined image/preview browser matrix passes 9/9 without retry, and
the complete collaboration suite passes 10/10. The latter now intercepts only
base-aware snapshot PUTs in its reverse-order test and polls the persisted Redo
result before opening a fresh client, avoiding bootstrap-write and queue-timing
false failures.

The focused command is:

```bash
node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts \
  --grep "empty editor exposes|help works|switches existing document pages" \
  --workers=1 --retries=0 --reporter=line
```

Implementation plan:
`docs/superpowers/plans/2026-08-31-editor-entry-page-navigation.md`.
