# Penpot File Version Visual Preview Delta

Last checked: 2026-07-18

## Reference And Decision

Layo **adapts** Penpot's saved-version preview workflow at Penpot `develop`
commit `17c344b8f5fe785b1be7ae7a6e34945e17a118d8`:

- https://help.penpot.app/user-guide/designing/workspace-basics/#preview-a-saved-version
- https://github.com/penpot/penpot/commit/17c344b8f5fe785b1be7ae7a6e34945e17a118d8

Penpot opens a saved version in a view-only workspace with a named banner,
Exit, and Restore. Layo preserves its local-first file-version API and adapts
that workflow to the existing single-page canvas instead of introducing a
hosted history viewer.

## Product Delta

Selecting a saved version now:

- reads the complete persisted `RendererDocument` and retains the existing
  current-file change summary;
- renders that saved document on the normal canvas while preserving the live
  editor document separately;
- shows a Korean read-only banner with version identity, Exit, and Restore;
- keeps wheel pan and Control/Command-wheel zoom available;
- makes the rail, file panel, toolbar, and Inspector inert;
- suppresses selection, resize, path/text, grid, spacing, presence, and comment
  editing overlays;
- rejects keyboard mutation, paste, image drop/replacement, context menus,
  Konva drag/edit, and persistence-bearing editor commands;
- cancels in-progress interaction refs and listeners before exposing preview;
- invalidates pending image-upload mutation generations before document
  persistence while completing already admitted server writes into the hidden
  live editor state;
- ignores late preview responses when another version or file has become
  current.

Exit reveals the latest live editor state without a reload. Restore continues
to use the server route that first saves a recovery version, then publishes the
restored document through the active Yjs session in one
`file-version-restore` transaction. The next local collaborative edit therefore
starts from the restored document instead of a stale pre-restore snapshot.

The reliability follow-up closes the write-order and collaboration gaps exposed
by independent review:

- every document-mutating browser request, library import/update, and file-version
  mutation uses one failure-tolerant queue per `fileId`;
- version Save and Restore wait for earlier writes, so neither can capture or be
  overwritten by stale delayed persistence;
- complete document snapshots persist through `PUT /files/:fileId`, including
  tokens, token sets, token themes, reusable styles, components, and code mappings;
- stale complete snapshots include their base document and use a recursive
  three-way merge; independent fields and stable-ID additions merge, while
  divergent concurrent reorders or same-leaf edits return an explicit conflict
  instead of silently discarding one browser's work;
- every accepted editor command either uses its existing granular persistence
  route or queues a complete snapshot, so create, fill, constraints, component,
  geometry, and grid actions cannot remain browser-only;
- Yjs maps every `RendererDocument` top-level design-system field and document
  version; design-system collections use per-ID maps plus ordered IDs, and
  concurrent insertion of the same ID produces one public item;
- collaborative Undo/Redo uses a Yjs `UndoManager` that tracks only local
  transactions and preserves later remote edits;
- cancelled image uploads call a reference-aware cleanup route; assets used by a
  current document, component, or saved version are never deleted;
- component variant source trees participate in asset reference scans, and one
  storage-root reference lock serializes cleanup with document/version writes;
- Restore is a synchronous mutation-generation barrier, while project-document
  and version-list request generations prevent late responses from replacing the
  last selected project;
- every E2E process shares a marker-owned temporary storage root, including MCP
  stdio, and no spec deletes a developer `.layo` directory; MCP subprocesses
  receive an explicit environment allowlist instead of the entire parent process
  environment.

## Failure Learning

The first browser RED was invalid because the legacy color Inspector changed
local editor state without persisting the server snapshot. The fixture was
corrected to use deterministic HTTP agent commands and reload before saving.
The corrected RED passed the existing diff card and failed only because the
read-only canvas banner did not exist.

The first GREEN attempt passed saved pixels, the banner, and Delete protection,
then failed because the test treated a normal wheel pan as zoom. The regression
now uses Control-wheel for zoom and keeps ordinary wheel behavior unchanged.

The Penpot maturity gate then exposed a stale process assertion that required
`Current Active Plan` to remain `None` after PR #314. The guard now permits at
most one active plan while continuing to reject reactivation of the three
merged authorization plans.

Independent design review found three P1 risks before final verification:
restore did not update the active collaboration document, mutation and viewport
updates shared one sink, and Stage/in-progress interactions were not fully
cancelled. It also found a stale preview-response race. The implementation and
E2E coverage were expanded around those exact cases before PR review.

The re-review then found that upload awaits could cross the preview boundary
and that component persistence could continue after a rejected command. A
delayed asset-upload RED proved that one image node was written after preview
entry. Mutation generations, admitted-persistence completion, boolean command
acceptance, and a third focused Playwright case now cover that failure.

The first complete repository run also exposed an authorization watcher
deadlock outside the editor slice: a removed/reintroduced member was quarantined
correctly, but quarantine recovery re-read that state through the normal merge
path and retried forever. Both recovery merge boundaries now explicitly use the
existing quarantined-recovery mode. The pre-existing 20-iteration no-resurrection
regression passes all 20 iterations after the repair.

The first complete Playwright run then passed 200 of 203 cases. Two failures
came from specs deleting the live server storage directly while a late writer or
lock still existed; the third showed a real rapid undo/redo persistence race.
All 26 storage-backed specs now use one cleanup helper that retries removal and
requires two stable absence checks. Undo/redo now reads and synchronously advances
`editorRef`, updates React state once, and schedules persistence outside the state
updater. The stroke regression also waits for the final server document before
reload, proving that a late undo write cannot overwrite the redo result.

Independent exact-diff review then found seven follow-up risks: unsafe E2E
storage cleanup, omitted Yjs design-system fields, structural collaboration undo
overwriting a later remote edit, partial persistence queues, version Save/Restore
queue bypass, runner command ownership gaps, and orphaned cancelled uploads.
Each finding received a focused regression before repair. The collaborative RED
proved Undo restored `Layo` over a later remote text edit; the queue RED proved a
version POST started while an earlier text write was blocked; and the asset RED
proved a cancelled upload still returned HTTP 200 from `/assets/:assetId`.

The next full E2E run passed 203 of 204 cases and exposed one environment split:
the HTTP server used its marker-owned temporary storage while MCP stdio silently
fell back to the developer storage root. The MCP process now receives
`LAYO_STORAGE_DIR`, and the stdio transport explicitly forwards the filtered
environment. Its focused case and the later complete suite pass.

The first collaboration rerun passed five of six cases but exposed a UI boundary
regression: the member credential field and apply command were rendered in the
local-only team tab. Both controls are now limited to realtime collaboration and
team settings, and the tab-boundary E2E asserts both visibility and absence.

The next independent exact-diff review found nine additional correctness gaps:
browser-only dispatches, stale complete-snapshot overwrite, a non-atomic Restore
barrier, atomic Yjs design-system arrays, missing variant asset references, an
asset-cleanup TOCTOU window, omitted Yjs document version, inherited MCP process
environment, and a stale file-version list after project switching. Each received
a focused RED before repair. In particular, the stale snapshot RED lost a remote
text edit, the cleanup RED completed while a document reference mutation was
paused, and the Restore RED retained an uploaded orphan asset.

The first reference-lock repair then deadlocked a nested library update because
the same async operation reacquired its storage-root lock. The focused migration
test timed out. The lock now uses `AsyncLocalStorage` ownership for same-operation
re-entry while retaining exclusion across independent requests and processes.

The first complete 209-case browser run passed 208. Its only failure was an old
token-rotation scenario that still looked for member credentials in the local
tab. The regression now proves local absence first, selects Team Settings, and
keeps the original token-expiry/reconnect assertions. The corrected run passed
209/209.

Re-review found three remaining races. Divergent concurrent stable-ID reorders
returned success while losing the local order, two Yjs clients adding the same ID
returned it twice, and a delayed project-document GET could replace the last
selected project. Their exact REDs failed on successful silent overwrite,
duplicate `token-primary`, and the switcher reverting from project B to A. The
server now rejects divergent order conflicts, Yjs deduplicates ordered IDs, and
initial/manual project loads apply only the latest request generation.

A further focused review found three P2 races in those repairs. Given base order
`[A, B, C]`, current `[A, X, B, C]`, and stale local `[B, A, C]`, the first merge
returned `[B, A, X, C]` and silently lost the current insertion's `X -> B`
placement. A project A IndexedDB write that had already started could also finish
after project B, and a rejected stale project A fetch could still replace B's
status with `Failed to fetch`. Exact REDs reproduced all three. Snapshot merge now
rejects a result that cannot preserve adjacency involving a concurrent insertion;
a project-load coordinator serializes current-project persistence and rechecks the
request generation when dequeued; and stale success and rejection paths both exit
without applying UI state.

Final exact-head review found one more P2 in the persistence correction: if A's
IndexedDB write was already in flight and the newer B request failed before it
could persist, A remained stored even though the UI stayed on the previously
accepted project. The focused RED ended with `[current, A]` instead of
`[current, A, current]`. The coordinator now remembers the last accepted project
and restores it inside the same persistence queue whenever an in-flight write
becomes stale. Focused GREEN passed 2/2, and independent re-review reported no
P0-P2 findings.

The user-reported Vercel deployment `dpl_6qaTjzmQHPus1bM4Ga1jXjAMBj45` was a
historical PR #279 build at commit `c3d54b0`. It failed because `App.tsx` imported
`pathHasOnlyClosedSubpaths` from `path-editor` before that module exported it.
The current code imports the renderer public contract, the repository keeps a
static deployment regression for that export, and the current production build
passes locally. Newer authenticated project deployments are `READY`; deploying
this branch remains a non-gating follow-up.

## Verification

Focused Playwright CLI coverage proves:

- a green saved frame replaces the blue current frame during preview;
- banner/read-only/inert state is visible;
- Delete cannot change the current server document;
- Control-wheel zoom remains available;
- Exit reveals the blue current frame;
- Restore makes the green frame current;
- a subsequent text edit through an active local Yjs session retains the green
  restored frame in browser and server state;
- a delayed older preview response cannot replace a newer selected preview;
- a delayed image upload cannot create a node or retain an orphan asset after
  preview entry;
- delayed document writes complete before version Save/Restore;
- collaborative structural Undo/Redo preserves a later remote text edit;
- local team mode does not expose unused member credentials;
- an immediate create is present in the next saved version;
- stale complete snapshots preserve independent remote edits and reject
  divergent concurrent ordering;
- Restore prevents an earlier upload from attaching a node or retaining an
  orphan asset;
- a delayed project document or version response cannot replace the last selected
  project;
- a rejected stale project request cannot replace the active project's status or
  persisted project ID;
- a stale reorder cannot silently move a concurrent insertion across its adjacent
  neighbor;
- same-ID concurrent Yjs collection insertion returns one item.

The direct Playwright CLI interaction pass selected the saved version, started a
resize drag before preview entry, moved and released the pointer after entry,
pressed Delete, used Control-wheel zoom, clicked Exit, re-entered preview, clicked
Restore, and typed a subsequent collaborative text edit. The visible saved/current
pixel colors, hidden handles, inert chrome, zoom change, restored canvas, and
persisted server document were asserted after those actions.

Latest local verification passed:

- complete Playwright CLI suite: 211/211 in 5.7 minutes;
- collaboration Playwright CLI suite: 6/6;
- direct headed Playwright CLI interaction: 2/2;
- web unit tests: 280/280;
- server tests: 439/439 with 47 deliberate skips;
- collaboration package: 38/38; renderer: 14/14; relay: 7/7;
- Rust workspace tests: 12 relay, 74 editor core, 7 command/context, and 24
  document-model tests;
- full workspace typecheck, web production build, design rules, Penpot maturity
  rules, and repository script contracts.

Exact PR-head check and merge evidence will be appended before completion.

## Remaining Gaps

Multi-page preview navigation, remote two-browser restore conflict policy,
comment edit/delete and visibility preferences, hosted durable comment delivery,
automatic conflict-resolution UI for divergent snapshot reorders, and
branch/review/merge product workflows remain open. Deployment remains non-gating.
