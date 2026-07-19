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
to use the server route that first saves a recovery version. When its ordered
per-file queue actually starts the request, it captures the active Yjs session
and base document, then merges response-time room edits before publishing one
`file-version-restore` transaction and persisting the final CRDT document. A
same-field conflict preserves and re-persists the current room state instead of
overwriting it. If the collaboration session changes while the response is
pending, Restore compensates the server with the replacement session document
and aborts instead of mutating a different room.

The reliability follow-up closes the write-order and collaboration gaps exposed
by independent review:

- every document-mutating browser request, library import/update, and file-version
  mutation uses one failure-tolerant queue per `fileId`;
- version Save and Restore wait for earlier writes, so neither can capture or be
  overwritten by stale delayed persistence;
- Restore captures its collaboration base only after earlier queued writes have
  completed and rejects a response whose collaboration session identity changed;
- Restore keeps the exact pre-mutation document as a temporary recovery boundary,
  so a project switch compensates the original file and a replacement team session
  cannot initialize from the transient restored document;
- every complete-snapshot write consumes the actual merged server response, merges
  independent server-only changes back into the current Yjs room, and uses that
  response as the next persistence base;
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

PR Full Verification `29654443216` then failed Core tests at 485/486 because the
authorization watcher did not observe a newly created conflicting token sidecar
before the cached credential assertion timed out. The focused case passed 30/30
locally, identifying a registration timing window rather than deterministic merge
logic. A watcher-mocked RED then suppressed every `watchFile` callback and timed
out while cached authentication remained open. The first repair scheduled an
unconditional strict reload, but independent review found that it could briefly
clear an unchanged recoverable startup sidecar and that the test polled a transient
fail-closed window. A second RED observed one unnecessary quarantine attempt. The
watcher now retains the initial base and sidecar snapshots and runs the serialized
strict reload only when post-registration snapshots actually differ. The repaired
test holds quarantine publication while asserting fail-closed state, removes the
sidecar, and proves retry recovery; a second test proves unchanged recoverable
startup state never enters quarantine. Focused GREEN passed both registration
cases and the combined authorization regression set 55/55.

The post-CI direct headed interaction pass then failed because a resize started
before Preview could finish after the asynchronous version response. The request
did not become a mutation barrier until its response arrived, and resize completion
could revive a cleared ref from stale React state; the headline changed from
`260x48` to `335x103`. The browser test now holds the version response until after
pointer movement and mouseup, making the same mutation fail deterministically in
headless mode. Preview requests now register an immediate request-owned mutation
barrier, cancel every active canvas interaction before network I/O, and never fall
back to stale resize state. Focused GREEN passed all 11 file-version browser cases,
280 web tests, and the direct headed interaction pair 2/2.

Independent follow-up review found two P2 exit boundaries in that repair. Escape
during a pending request cleared only rendered preview state, so the delayed
response reopened Preview and kept editing blocked; Restore also enabled its
barrier without explicitly cancelling an already active pointer session. The
delayed-response test reproduced the Escape reopen as RED. Escape now invalidates
the request and clears its pending barrier, while Restore invokes the same canvas
interaction cancellation before persistence. The Restore/upload regression also
holds resize mouse-down through barrier release and asserts the restored headline
remains `260x48`. Focused GREEN passed both cases 2/2.

GitHub review then found a P1 durability gap at the collaboration boundary. Restore
persisted the selected server version and applied it to Yjs, but the final document
returned by the CRDT merge was only installed in browser state. A concurrent remote
edit retained by Yjs could therefore disappear from server export or a fresh load
after relay restart. The browser regression activates a collaboration session and
requires a base-aware complete-snapshot `PUT` after Restore; it failed because no
such request occurred. The first repair serialized that second write, but independent
review found a P2 weakness because the regression never produced an actual remote
merge and would accept the unmerged server result. A two-browser relay RED now holds
the Restore response after its server write, suppresses the remote browser's HTTP
write, and delivers its text edit only through Yjs. The saved snapshot incorrectly
contained `Layo`, proving the remote edit was overwritten before persistence. The
stable-id 3-way snapshot merge is now a shared renderer contract used by both server
and browser. Restore captures the Yjs document when its queued request actually starts,
merges the restored version with the response-time Yjs document, applies that result to
the room, and persists it with the server-restored file as `baseDocument`. The same
two-browser case also drives both peers into a same-field conflict and proves that Layo
aborts Restore, compensates the server with the current room document, and retains that
document after a fresh reload. Focused GREEN proves all seven collaboration cases pass.

Re-review found two more P1 timing boundaries. First, the collaboration base was
captured when Restore was clicked, before an older queued image-fit write completed.
The exact RED restored a saved `fill` image but finished with the delayed `fit` value.
Second, a delayed Restore response could transact into a newly created team session;
the exact RED reported success instead of the expected session-change abort. The base
capture now occurs inside the dequeued operation. Response handling requires the same
session object; otherwise it re-persists the replacement session/current editor
document and reports `협업 세션이 변경되어 복원을 적용하지 않았습니다`. Both focused
browser cases passed independently and in the complete suite.

The next re-review found two final P1 windows after the first post-Restore `PUT`
started. A relay-only edit arriving while that request was held was visible through
Yjs, but the completed request and stale `setEditor` path reverted it. A team session
replaced during the same wait also escaped the earlier one-time identity check. Exact
REDs held the first `PUT`: one delivered a second remote text edit, and the other
created a replacement local team. Restore persistence now advances its base and
rechecks both the current CRDT document and session identity after every write, for a
bounded maximum of eight attempts. Same-session changes receive another base-aware
write; any session change stabilizes the latest replacement/current document and then
aborts. Both REDs are GREEN, including the second request body, both relay browsers,
server GET, fresh reload, compensation request count, and replacement-session UI.

Moving the merge contract into `@layo/renderer` first broke five server child-process
tests because they loaded a stale built package entry. Server tests now run with the
workspace development export condition, and the repository script contract enforces
that source-resolution rule. A later root run stopped at the same script contract
because its Restore queue regex only accepted the old synchronous callback shape; the
guard now proves `restoreFileVersion` is awaited inside the async per-file queue callback.
The first root rerun after adding stabilization then treated the helper name
`persistCollaborationSnapshotUntilStable` as a direct queue bypass. Renaming it to
`stabilizeCollaborationSnapshotPersistence` retained the guard unchanged and the full
root verification passed.

An intermediate full browser run passed 210/211 and exposed a separate export-preset
timing assumption. The UI had optimistically rendered both presets while the second
serialized write was still pending, so an immediate server GET sometimes observed only
the first. The test now polls the persisted file contract instead of treating render
completion as disk completion. After that repair and the two Restore timing repairs, the
complete suite passed 213/213 in one run. After the final `PUT` stabilization case was
added, the exact-head suite passed 214/214 in 5.9 minutes.

The next independent review found three remaining recovery failures. A project switch
after the Restore route had already written the selected version returned early and
left the original file at `Layo`; the final-`PUT` session-replacement test captured its
expected value from the already-restored UI and therefore accepted the same loss; and
the stabilization loop advanced from its request document instead of the server's
actual 3-way merged response. Exact REDs received `Layo` instead of both
`저장 대기 전 현재 편집` and `프로젝트 전환 전 현재 편집`, while a concurrent HTTP
geometry mutation remained `x=120` in the next PUT instead of `x=144`. Restore now
retains the pre-mutation document until completion, uses it for replacement-session
initialization and original-file compensation, parses every PUT response, merges its
server-only changes into Yjs, and advances the response as the next base. Focused GREEN
passed both browser recovery cases 2/2 and the two-browser relay case 1/1, including
both active peers, the next request body, server GET, and a fresh reload.

The first root rerun after this repair failed only because the queue contract test
limited the async Restore callback to 500 characters. The added recovery checks made
the valid queued call longer. The guard now scopes itself to
`restoreCurrentFileVersion` and checks the ordered queue/call contract without a fixed
character window; its focused suite passes 7/7.

The next re-review found that compensating a Restore was still a forward overwrite,
not a true inverse. A relay edit made after the restored snapshot could be dropped,
the old Yjs room could remain restored after project navigation, and a final-PUT
same-field conflict reported an abort while retaining an unrelated restored fill.
The exact conflict RED left `#16a34a` on the server instead of the pre-Restore
`#2563eb`. Restore recovery now records the applied boundary and reverse-merges it
into the latest room document with current-room conflict preference. Project changes
publish that inverse before deactivating the old session, compensation keeps its
recovered side when merging server-only fields, and the final editor commit rechecks
the live project and session refs instead of an earlier snapshot. The expanded
two-browser case proves the old room, server, active peers, and fresh reload retain
both the pre-Restore fill and later relay text.

The following re-review found two paths around that boundary. Create, external/file/
project import, duplicate, and delete actions could switch documents without the
project-switcher's rollback call; duplication could therefore snapshot the transient
restored server file. Its RED duplicated `Layo` instead of `복제 전 현재 편집`.
Separately, a server-only geometry edit made while the compensation PUT was held
returned as `x=288`, but both Yjs peers remained at `x=144` because the response was
discarded. All document transitions now synchronously publish rollback and await the
full compensation operation before their server mutation, with a guarded fallback in
the shared document loader. Compensation now consumes every actual PUT response,
three-way merges it with the latest room document, republishes server-only changes,
and repeats on the new base until room and server converge. Both exact REDs are GREEN.

One more review pass found that the transition barrier still treated completion as
`void`. When every compensation PUT returned 503, Restore showed an error but released
the waiting duplicate, which then copied the transient server snapshot. A second RED
held the duplicate POST first and proved a new Restore could start in the gap between
the barrier check and the eventual project load. Restore completion now reports an
explicit safe/unsafe result. Unsafe compensation retains its recovery boundary and
settled failure for the rest of the browser session, so current and later project
mutations fail closed instead of continuing. A synchronous transition token now spans
rollback preparation, create/import/duplicate/delete server mutation, and final document
load; Restore refuses to start while that token is held. Focused GREEN proves the 503
case sends zero duplicate requests and the inverse ordering sends zero Restore requests.

The first complete 218-case browser run then passed 213. One failure showed that
destroying a document-specific collaboration session also discarded the active team
credential context, disabling `현재 팀과 공유` after creating a project. Two failures
showed that session-replacement cancellation compensated safely but returned without
the established abort status. The other two showed that the exclusive transition lock
also rejected a newer pure project selection instead of preserving latest-selection
wins. Active team identity and the in-memory member credential now outlive only the
document session; private documents are not joined to a relay, but can be explicitly
linked to that retained team and continue authorized library requests. Recovery records
whether rollback came from project navigation or session replacement and reports the
stable session-change error after the latter is compensated. Transition ownership now
separates exclusive server mutation from replaceable navigation, so a newer selection
supersedes an older fetch while Restore remains blocked for the entire active transition.
The exact five REDs passed 5/5, the four prior recovery cases passed 4/4, and the
two-browser collaboration case passed 1/1. The repaired complete browser suite then
passed 218/218 in 6.0 minutes.

The final independent review found two retained-team-context leaks after that repair.
The library event stream still derived credentials from the document-specific session,
so switching documents reconnected without either authorization header even though
publish/import requests retained the team token. The top sharing label also reused the
retained team name without proving that its team ID matched the opened project's team.
The existing credential E2E now fails if the post-switch event stream omits either
header and drives a different-team project response through the UI before asserting the
external team ID. Stream credentials now come from the retained active-team context,
and a friendly team name is shown only for an exact team-ID match. The focused RED
omitted both headers; the repaired scenario passes end to end.

Re-review found that the first stream repair overcorrected: it sent that retained token
to a new private project and to a project shared with a different team. A configured
server rejects both with terminal 403, and the stream effect did not depend on sharing,
so explicitly sharing the project afterward could not reconnect. It also found that
comment and reply mention targets still read only the destroyed document session. The
shared `activeProjectTeamContext` now exists only when the current project's team ID
exactly matches the retained team. Private and mismatched projects make no credentialed
stream connection, sharing changes restart the effect, library HTTP credentials and the
friendly label use the same scope, and comment/reply mention resolution uses the retained
matching team. Exact REDs observed one private credentialed stream and an empty
`mentionTargets` request. During GREEN, a test's old `새 프로젝트 저장됨` status exposed
that it was sharing the previous project; both project-switch tests now wait for the
selected project ID to change. The corrected pair passes 2/2.

The next re-review found the same scope was not yet enforced by registry HTTP refreshes.
The polling effect depended only on document ID, and `loadProjectDocument` refreshed the
target file through the previous render's credentials. The exact RED recorded Team A's
token on all three private-target GETs: registry list, component updates, and token
updates. Refresh helpers now accept an explicit target-project credential, polling
restarts for sharing/team/token scope changes and stops on a retained-team mismatch,
and a `null` sentinel distinguishes intentional no-credential requests from a default
parameter. The E2E also proves authenticated polling after an exact share and no token
after switching the same file to another team. Its first full run passed 217/218 because
the expired-token test still expected an authenticated stream on a private file; adding
the required explicit share made that focused lifecycle scenario GREEN.

The following re-review found that stopping the event stream and polling on a team-scope
mismatch still left the previous team's registry list and open review state visible. The
exact RED kept `Credentialed Team Kit` on screen after the same document moved from the
retained team to `team-external`. Protected registry state now has one reset path for the
published list, component and token update notices, component review, and token review.
File removal, a missing exact team context, and terminal stream authorization all use that
reset after invalidating in-flight access generations. The repaired team-mismatch scenario
clears the visible list and review panels immediately and passes 1/1.

The next exact-diff review found one persistence split and two transition/test gaps. General
collaborative snapshot saves discarded the actual PUT response and stopped on a concurrent
same-field conflict, so reversed browser PUTs left both Yjs peers at frame `x=202` while the
server remained at `x=101`. A library import could also issue a newer document load while an
exclusive project creation was waiting for its target GET, leaving the created project on the
server while the UI returned to the old project. Finally, the team mismatch assertion checked
an already-null token review. General snapshot saves now use a bounded response-aware
convergence loop, read the current server snapshot after an explicit snapshot conflict, merge
the latest room document with current preference, and repeat until server and room agree.
Project mutation and navigation loads carry an owner token; every library archive, registry,
and token import/update uses the same exclusive transition and treats a cancelled load as a
failure. The registry E2E opens the token review before changing teams. Exact REDs reproduced
server `x=101` and the old selected project; the repaired scenarios pass 3/3 and a fresh
browser reads `x=202`.

The first 219-case rerun then failed the existing open-path lifecycle: Undo reached the
server's `triangle` end marker, but Redo stayed there instead of restoring `line_arrow`.
The same focused case failed 3/3. Retaining the local command stacks fixed that case, but
the next rerun exposed a second stale-response effect: a queued pre-insertion snapshot
reinstalled one grid child after `열과 객체 삭제`; that exact case also failed 3/3. Server
responses are now transacted into an active Yjs room, where every peer must converge, but
are not reinstalled into a non-collaborative editor. Its latest user document still drives
server convergence without letting an older response change local history or auto-layout
placement. The two local lifecycle cases pass 6/6 across three repetitions, and the reversed
two-browser PUT convergence remains GREEN 1/1.

Re-review then exposed two more P1 boundaries. The server's 400 snapshot conflict body uses
`error`, while the client read only `message`, so a single conflicting PUT never entered the
retry path; its exact RED left server frame `x=202` instead of local `x=101`. After parsing the
real error contract, the first retry preserved `x=101` but a later stabilization iteration
mistook an accepted server text edit for a local deletion. The loop now rebases only changes
since the previously observed local document onto its accepted convergence document. The
focused scenario keeps the independent server text through conflict retry, local Undo, and
Redo. A second RED completed a Team A token-review response on the server, changed the same
file to Team B while browser delivery was held, and reproduced the protected Team A panel
after the scope clear. Publish and both review operations now capture file, sharing/team/user,
token revision, access generation, and credentials, then discard stale success and failure
state. The conflict, delayed authorization response, and grid lifecycle pass together 3/3.

The next complete 220-case run passed 219 and failed the existing multi-stroke reload
lifecycle: the server briefly exposed the final `0.35` opacity, then an older queued
Undo/Redo snapshot restored `0.5`, so an immediate reload rendered stale data. The focused
case reproduced 3/10 before repair. Snapshot stabilization originally folded current editor
state only after its first PUT, and relying on React refs still left an older callback without
a durable final target during reload. Snapshot persistence now records one latest revision
per file, rebases an in-flight write onto that target before and after each PUT, and skips
superseded queued snapshots. The original ordered multi-stroke lifecycle, including Undo,
Redo, server persistence, and immediate reload, passes 10/10 without retries after repair.

Independent review then found that server convergence used the same tracked Yjs origin as a
user edit. The exact unit RED showed Undo leaving the local move at `x=96` while removing the
server-only headline, rather than reverting the move and preserving the headline. Collaborative
transactions now accept an explicit `undoable` policy. Server convergence, restore aborts,
compensation, and server-merge corrections use an untracked system origin, while user editor and
Restore transactions remain undoable. The Yjs regression passes 39/39 package tests, and the
two-browser reversed-PUT E2E now converges a server-only headline, undoes and redoes the user's
frame movement, and retains that headline in both peers and the persisted server document.

The next root verification stopped at the queue ownership script contract even though all
snapshot calls remained inside the per-file queue. Its broad `await persist*` expression also
matched the new bounded stabilizer's internal PUT. The contract now isolates that helper,
requires its server write and its queue-owned caller explicitly, and continues to reject every
direct persistence call outside the helper. This keeps the ownership boundary enforceable
without treating the implementation of the guarded retry loop as a violation.

The next review found that revision coalescing retained only the latest document, not the
earliest unsaved base. A deterministic RED held a version save in the per-file queue, applied
frame `x=101` and then `y=202`, and finished with server `x=120, y=202`: the first revision was
skipped, while the second revision's base already contained `x=101`, so the merge could no
longer identify that field as local work. Each file's pending snapshot target now carries the
earliest unsaved base across every superseding revision. The final writer starts from that base
and the latest target, including when an earlier in-flight writer fails or finishes after a
newer edit is queued.

The following review found that project duplication still bypassed that general persistence
queue. A deterministic RED held a version save, queued frame `x=101` and `y=202`, and observed
the duplicate POST before either snapshot could persist, allowing the copy to retain the older
server geometry. Duplication now captures its source project at click time and enqueues the
duplicate request on that source file. Earlier edits therefore finish before the server copies
the document, while later edits retain their natural position behind the copy operation. The
first focused E2E passed, but re-review found that a post-click `x=303` edit could still
supersede the file-wide A/B snapshot target. Both earlier callbacks then skipped, so the queued
duplicate still copied `x=120, y=80`. Snapshot coalescing now uses file-local queue epochs.
The first epoch repair made that case GREEN, but the next review found that a failed sealed PUT
was swallowed by the queue tail, version Save had no equivalent boundary, and advancing before
transition admission could leave Yjs without server-only convergence. Two more REDs saved the
initial `x=120, y=80` instead of click-time A/B and allowed duplication after only one failed
PUT. Save, Restore, and Duplicate now use one snapshot-barrier API after transition admission.
The barrier seals its current epoch, flushes that epoch successfully before the server operation,
retains failed targets for a barrier retry, and aborts the operation if that retry also fails.
A sealed writer reads only its epoch target, then 3-way merges independent server changes into
the newer active Yjs session without persisting post-barrier edits early. The duplicate therefore
copies `x=101, y=202`, the source's next epoch persists `x=303, y=202`, a version captures A/B
instead of later C, and a persistent snapshot failure sends zero duplicate requests. The three
focused barrier E2Es pass 3/3 and the static queue ownership contract passes 7/7.

The next re-review found that one retained failed epoch was retried only by its first barrier.
After that retry also failed, a later barrier sealed the next empty epoch and could proceed
without the older target. It also found that a Restore preflight flush failure marked the whole
session unsafe even though `restoreFileVersion` was never called. Exact REDs reproduced a second
duplicate with stale `x=120` after the 503 cleared and a Restore retry permanently stuck on the
first preflight error. Every snapshot writer and barrier now drains all retained epochs through
its boundary in ascending order, so later edits cannot bypass earlier unsaved state. Restore
separately records whether its mutating request was attempted; preflight failure clears recovery
as safe, while any possibly mutating request remains fail-closed until compensation is proven.
The recovered duplicate copies `x=101`, the same-session Restore retry succeeds, and both focused
recovery E2Es pass 2/2.

The following review expanded the same durability boundary beyond explicit Save and Duplicate.
A failed source PUT could be abandoned by project navigation and returned as `x=120`; a browser
that had only received `x=101` through Yjs saved a version with server `x=120`; and file archive
export began before a held click-time PUT. Project/document transitions now flush the source
snapshot before leaving and fail the transition when it cannot persist. Duplicate keeps its
combined operation barrier so post-click edits remain outside the copy. Every barrier also
captures the active Yjs click-time document as a synthetic target; when no local base exists it
reads the current server document before the 3-way PUT. File archive, library archive, registry
publication, and project archive operations all use the same barrier. Exact GREEN coverage proves
failed navigation preserves `x=101` after leaving and returning, a remote-only receiver saves
`x=101` while the originating PUT is held, and all four snapshot-dependent output requests wait
behind persistence. The static ownership contract continues to pass 7/7.

The first full collaboration rerun then timed out because the synthetic target was created even
when the active room document had not changed. The Restore test deliberately held the first PUT
from the mutating restore path, but the no-op preflight PUT consumed that gate before the restore
request and deadlocked the scenario. Each collaboration session now keeps a normalized persisted
baseline. A barrier compares the active room against its pending target or that session baseline,
creates a synthetic target only for a real difference, and advances the baseline only after the
matching target completes. Session replacement clears the baseline. The unchanged-room Restore
and the remote-only receiver Save both pass focused E2E, while the complete collaboration suite
passes 8/8 without the extra preflight write.

The next 227-case editor run passed 225 and exposed two assertions written for the earlier
queue behavior. The session-replacement Restore test required at least two compensation PUTs
even though the product contract is the final replacement-session and server document; that
state already converged correctly with one observed PUT. The delayed version Save test expected
project B to load before project A's held Save completed, directly contradicting the new source
flush boundary. The focused tests now assert final server/session recovery instead of an internal
request count, and prove navigation remains on A while Save is held, loads B after release, and
never leaks A's version list into B. Both corrected scenarios pass 2/2.

Exact-head re-review then found three more durability and authorization gaps. First, the
synthetic Yjs target used the current server document as its merge base instead of the room's
last persisted baseline. The RED combined relay-only frame `x=101` with an independent HTTP
headline edit and saved `Layo`, proving the server text was overwritten. Synthetic targets now
carry the same-session persisted baseline, successful writers advance that baseline from the
actual accepted server document, and Restore/compensation convergence does the same. The saved
version now contains both `x=101` and `서버 독립 편집`.

The first collaboration rerun after that repair passed 7/8 because a specialized text/style
PATCH had already made the room and server equal while the persisted baseline was older. Giving
the synthetic target a real baseline bypassed the prior null-base equality shortcut, inserted an
unnecessary PUT before Restore, and displaced the test's held final request. Synthetic targets
now verify the current server document before writing: equality advances the baseline without a
PUT, while a difference still uses the persisted baseline for the lossless 3-way merge. The
combined independent-edit Save and final-PUT Restore conflict scenarios pass together 2/2.

Second, the source barrier ended before a held target-document GET, so an Inspector edit made
after navigation admission issued one source PUT and could be abandoned. Project transitions
now cancel active interactions, invalidate asynchronous editor mutations, and reject every
document command/persistence path for the full transition lifetime. The exact RED/GREEN proves
the held navigation produces zero source PUTs and returns to unchanged `x=120`. Third, a queued
library publication captured Team A credentials before its snapshot barrier and still sent one
POST after the project changed to Team B. Protected publication, registry import, token import,
component update, and token update now validate the current file/scope/generation immediately
before each request and re-resolve credentials plus reviewed targets from refs. The stale-scope
publication sends zero POSTs, while the five focused normal/stale registry and navigation cases
pass 5/5 and the static contract passes 7/7.

The next 229-case run passed 228 and exposed one now-obsolete Duplicate expectation: it still
required a post-admission `x=303` edit to persist while the new transition lock deliberately
rejects that edit. The contract now asserts both the duplicate and source remain at the sealed
click-time `x=101, y=202`; the corrected focused case passes. Final re-review then found a direct
DTCG import path outside the command dispatcher. A delayed source response could install an A
document after navigation identified B, and the import control remained active during the held
target GET. DTCG import now rejects at transition entry, captures file ID plus mutation generation,
revalidates both before applying success or error state, and disables token mutation controls for
the transition lifetime. The delayed-response E2E proves a pre-admission import cannot publish
stale UI state, a forced second import sends no request while B is loading, and B retains an empty
token set. The focused case and static contract pass 1/1 and 7/7.

PR-head Full Verification run `29670676984` then failed one server case because the
`conflicting token id` sidecar test polled for a transient empty credential cache while
the watcher automatically quarantined and recovered that binding error in the same
reload. The cache did fail closed, but a 10 ms observer was not guaranteed to run before
recovery completed. That test now holds the managed-token quarantine hook, directly
asserts authentication failure while recovery is paused, removes the conflicting
sidecar, and then releases recovery. The exact failed case passes 1/1 and the complete
sidecar suite passes 31/31.

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
- Restore captures collaboration state after earlier queued writes and does not
  preserve an earlier delayed image-fit mutation over the selected saved version;
- a delayed Restore cannot mutate a replacement collaboration session and compensates
  its server-side write with the replacement document;
- collaborative structural Undo/Redo preserves a later remote text edit;
- relay-only independent remote edits survive Restore, while same-field conflicts
  preserve the current room document and abort Restore;
- relay-only edits arriving during the final Restore `PUT` trigger another base-aware
  write instead of being replaced by stale browser state;
- replacing the collaboration session during that final `PUT` triggers compensation
  and aborts before the old session document can be installed, while the replacement
  session starts from the exact pre-Restore edit;
- switching projects after the Restore route mutates the server compensates the
  original file without changing the newly selected project;
- project duplication waits for that compensation and snapshots the current document,
  never the transient restored server file;
- failed compensation blocks the current and later project transitions instead of
  treating an unsafe server state as completed;
- a project mutation holds one transition lock through its server request and document
  load, so a new Restore cannot start inside that interval;
- a newer pure project navigation supersedes an older pending navigation without
  entering an exclusive server-mutation transition;
- replacing a collaboration session retains its explicit abort status after safe
  compensation;
- changing documents retains active team identity and in-memory member credentials
  without joining a private target document to the old relay room;
- server-only edits merged by a held complete-snapshot PUT become the next persistence
  base and converge into both Yjs peers;
- server-only edits returned by a held compensation PUT also converge into both Yjs
  peers before the abort completes;
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

- complete Playwright CLI suite: 230/230 in 6.9 minutes;
- collaboration Playwright CLI suite: 8/8 in 33.0 seconds;
- direct headed Playwright CLI interaction: 2/2;
- web unit tests: 280/280;
- server tests: 441/441 with 47 deliberate skips;
- collaboration package: 39/39; renderer: 18/18; relay: 7/7;
- Rust workspace tests: 12 relay, 74 editor core, 7 command/context, and 24
  document-model tests;
- full workspace typecheck, web production build, design rules, Penpot maturity
  rules, and repository script contracts.

Exact PR-head check and merge evidence will be appended before completion.

## Remaining Gaps

Multi-page preview navigation, comment edit/delete and visibility preferences,
hosted durable comment delivery,
automatic conflict-resolution UI for divergent snapshot reorders, and
branch/review/merge product workflows remain open. Deployment remains non-gating.
