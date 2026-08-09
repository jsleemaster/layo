# Penpot Comment Management Delta

Last checked: 2026-08-10

## Reference And Decision

Layo **adapts** Penpot's current comment workflow at Penpot `develop`
commit `b5bec4f983b5540a3ed7969121badf08a14f384e`:

- https://help.penpot.app/user-guide/designing/workspace-basics/#comments
- https://github.com/penpot/penpot/commit/b5bec4f983b5540a3ed7969121badf08a14f384e

Penpot keeps comment bubbles visible on the canvas, allows replies and thread
management outside comment mode, supports edit and delete, marks threads read,
and surfaces unread file feedback in the dashboard. Layo keeps its local-first,
selected-node sidecar model and deterministic HTTP/MCP control instead of
copying Penpot's hosted database and free-coordinate comment storage.

This slice advances maturity gates 2 (collaboration), 8 (operations), 9 (agent
safety), and 10 (failure loop). It does not close the whole maturity benchmark.

## Product Delta

### Ownership And Conflict Safety

- Threads and replies persist stable `authorId`, trusted display name,
  `modifiedAt`, and durable edit/delete activity.
- Only the owning actor can edit or delete a thread or reply. Team viewers may
  still create, reply, resolve, and manage feedback they own, matching Penpot's
  feedback-participation role rather than treating viewer as read-only.
- Every edit/delete accepts `expectedModifiedAt`. A stale mutation returns an
  explicit conflict and does not write.
- Browser stale-edit recovery retains the user's draft, shows the latest server
  body, supports retry against the latest version, and preserves drafts when a
  remote actor deletes the original thread or reply.
- Late mutation completion cannot erase newer thread/reply drafts, close a newer
  inline editor, or overwrite feedback owned by a newer operation.
- Delete activity keeps a content-free tombstone, so audit history remains
  useful without retaining deleted comment text.

### Legacy Ownership Recovery

- A missing or blank historical `authorId` is retained as
  `legacyOwnership: true`; the display-name fallback remains presentation data,
  not an inferred stable identity.
- Comment sidecar schema `v2` is the stable-owner provenance boundary. A `v1`
  sidecar may already contain a display name synthesized into `authorId` by the
  previous parser, so every unmarked `v1` thread/reply is conservatively treated
  as unresolved legacy ownership. The next write persists `v2` plus that marker;
  new `v2` records remain modern without requiring migration.
- Legacy threads and replies reject edit/delete until an explicit assignment
  succeeds against their current `modifiedAt` version.
- A team owner can assign a legacy item to a stable team member through HTTP,
  review-first MCP, or Korean browser controls. A private file exposes the same
  explicit operation to its local operator so local-first projects are not
  stranded by the team-only migration path.
- Assignment advances the monotonic version, emits durable activity and live
  events, and changes `legacyOwnership` to `false`. That value means explicitly
  migrated and remains owner-reassignable so an incorrect target cannot strand
  the record; `undefined` identifies a modern record that is not a migration
  target. Thread assignment preserves every existing `readBy` receipt and adds
  the new owner without duplication, preventing false unread notifications.
  Later thread/reply edits refresh only prior content-snapshot activity bodies;
  ownership-assignment and deletion audit messages remain immutable.
  Owner selector drafts bind to the thread/reply `modifiedAt` observed when the
  user selected a member. A remote owner/version change invalidates that draft
  before both rendering and submission, so stale local intent cannot silently
  revert another owner's assignment.
  The browser hides dead edit/delete controls before assignment and reveals
  them only for the assigned actor afterward.

### Team Authorization And Delivery

- HTTP, MCP, sidecar reads/writes, activity feeds, notification feeds, and SSE
  replay carry an exact project sharing boundary into the storage operation.
- Team credentials determine the stable actor identity for ordinary comment
  mutations. The separate legacy migration route is owner-only and names its
  target explicitly instead of treating a payload display name as proof.
- Mixed-project feeds authorize and scope projects before applying `limit`, so
  hidden projects cannot consume the visible result budget or leak metadata.
- Comment SSE re-authenticates and re-authorizes the file during replay. A
  terminal authorization event stops browser fallback polling and retains a
  Korean recovery state.
- Process-shared sidecar events remain replayable through sequence cursors, and
  edit/delete events update open browser state without page reload.

### Agent Review Surface

- MCP exposes review-first thread/reply edit and delete operations with explicit
  `dryRun` and commit behavior.
- `assign_legacy_comment_owner` reviews thread/reply target, legacy provenance,
  requested stable owner, and expected version; dry-run remains the default.
- Thread/reply edit and delete review returns `legacy_owner_unassigned` while
  legacy ownership is unresolved, matching the commit path instead of approving
  a mutation that storage will reject.
- Review validates actor, target, body, and expected version before returning an
  approval surface. Blank or malformed mutation reviews fail without storage
  writes.
- Private and team-visible feeds retain their original authorization boundary
  through review and commit instead of widening to every local project.

### Storage And Recovery Boundary

- Canonical comment sidecar paths are locked across `FileStorage` instances and
  processes. Versions advance beyond persisted sidecar clocks, preventing lost
  updates and same-timestamp reuse.
- Comment reads and mutations recheck project authorization at the locked
  sidecar boundary, closing sharing-change and case-folded alias races.
- Deleting the last project reference to a document removes its canonical and
  legacy comment sidecars in the same crash-recoverable transaction. Reusing the
  document ID in another team cannot reveal the deleted team's comments.
- A document still referenced by another project keeps both the design file and
  its comment sidecar.
- Project deletion journals capture project, owned files, comment sidecars, and
  registry subscriptions. Hard-exit seams before and after subscription writes
  prove restart rollback and idempotent retry.
- The transaction coordinator remains held through the project lock and project
  mutation, so interrupted recovery cannot overwrite a newly committed project.
- Cold same-instance operations replace an externally queued startup-recovery
  promise with a preflight-only recovery promise and cache it for nested prepare
  calls. Active imports do not wait on their own queued recovery work.
- Cold library updates acquire the transaction coordinator before the target
  lock, preserving one cross-process lock order.
- Archive, project, external-migration, library, and comment case-folded IDs use
  canonical reservation and explicit idempotency keys. Response-loss retry and
  crash recovery do not duplicate or partially replace product state.

## Failure Learning

Each missed boundary became a focused RED before repair. The durable failure
catalog is:

1. authorization could change between HTTP/MCP checks and a sidecar read/write;
2. stale or remotely deleted thread/reply drafts could be discarded;
3. process clocks, case-folded paths, and mixed-visibility feeds could corrupt or
   expose comment state;
4. archive, project, external-import, and library transactions could roll back
   concurrent writes or lose response-retry identity;
5. cold project mutations skipped generic recovery, library updates inverted
   coordinator/target lock order, and project deletion retained comment secrets;
6. releasing the transaction coordinator before the project lock handoff let an
   interrupted journal overwrite a newly committed project mutation;
7. the first handoff repair exposed a same-instance cold startup-promise cycle,
   while direct nested recovery made an active import wait on itself; the final
   boundary uses a cached preflight-only promise;
8. comment polling could replace explicit mutation feedback before users saw it;
9. component-variant writes could report an older save, and one global revision
   let unrelated instance, definition, and area writes suppress each other;
10. stale background success, transient refresh failure, and direct foreground
    errors shared one status epoch and could lose drafts or feedback;
11. a preserve-status poll could prevent an initial comment summary from being
    applied;
12. old-file completion could leak threads into a new file or clear its draft;
13. an older foreground list could overwrite a newer poll or event-stream list;
14. partial component success followed by a newer failure could leave stale Dev
    export output;
15. delayed same-file comment/reply completion could erase newer drafts, while an
    older failed operation could replace newer success feedback;
16. a stale initial refresh failure could overwrite a newer successful poll
    summary;
17. an unrelated newer read mutation could suppress delayed successful create or
    edit reconciliation;
18. a pending preserve-status poll could leave an older initial or successful
    mutation refresh error permanently visible;
19. an older inline-edit success could close newer text in the same editor or a
    different thread editor; and
20. the first regression assumed exactly two initial GETs. StrictMode and access
    scope initialization produced two or three, creating a retry-only CI pass;
    the final test separates the initial request burst from the two-second poll;
21. configured review began only after ready and reported the missing legacy
    ownership path after PR #319 had already merged, so review is now pending
    from ready until a result or bounded timeout;
22. the first team-owner repair marked private legacy comments ambiguous but
    exposed no local assignment control, leaving local-first files stranded;
    private local-operator assignment and pre-assignment control hiding close
    that regression; and
23. a full-suite boolean-path poll dereferenced one transient non-success file
    response. The reader now returns an empty sample so `expect.poll` retries
    instead of terminating the entire browser suite;
24. the first assignment API accepted an arbitrary target and then rejected a
    correction because the legacy marker had been cleared, allowing a typo or
    stale member ID to orphan the record permanently. Explicitly migrated
    legacy records now remain owner-reassignable while modern records stay
    ineligible; and
25. MCP edit/delete dry-run checked actor and version but not unresolved legacy
    ownership, so it could return `canApply: true` before the commit failed.
    All four thread/reply edit/delete reviews now return the same
    `legacy_owner_unassigned` reason enforced by storage;
26. the next exact-head review found that PR #319 could parse a missing ID into
    `authorName` and a later read mutation could persist that synthetic value.
    A non-empty ID alone could no longer prove modern ownership. Sidecar `v2`
    now establishes provenance and conservatively routes every unmarked `v1`
    record through explicit recovery; and
27. reconnecting after assignment cleared the browser draft and selected the
    first team member instead of the stored current owner. Thread and reply
    selectors now resolve `draft -> current authorId -> first target`, with
    reload and team-manifest reimport coverage; and
28. configured final-head review found that thread owner assignment replaced
    the entire `readBy` list while reply assignment already preserved it. This
    made prior readers falsely unread after migration. Thread assignment now
    appends the owner through the same unique-reader contract, with focused
    storage and browser notification regressions; and
29. the following exact-head review found that later edits rewrote every
    activity event for the same thread/reply, including `ownership_assigned`.
    The activity feed therefore mislabeled edited content as the original
    ownership audit. Content refresh now uses an explicit activity-type
    allowlist, while storage and browser regressions preserve thread and reply
    assignment messages after both items are edited; and
30. the next exact-head review found owner selector drafts survived remote
    reassignment. The UI showed stale member A while using remote member B's new
    `modifiedAt`, so clicking Change silently reassigned the item back to A
    instead of conflicting. Thread/reply drafts now carry the version observed
    at selection and are ignored when persisted state advances. A real SSE E2E
    reassigns both items to `준호` while stale `팀 소유자` drafts are open,
    then proves the selectors and follow-up requests use `준호` plus the remote
    versions; and
31. the final independent review found no P0-P2, but identified that the remote
    reassignment E2E could pass through the 2-second polling fallback and that
    owner-specific cross-instance serialization lacked direct coverage. The
    browser regression now disables that poll and waits for the file-scoped
    event stream before both remote assignments. A storage race starts the same
    legacy assignment from two `FileStorage` instances and proves exactly one
    succeeds, one receives `409`, and one ownership event persists.

No personal memory note was added: the new misses are captured as product and
repository-process regressions in focused E2E, this durable delta, the review
timing rule, and the PR body. Headed pre/post screenshots verified that owner
selectors, status labels, and edit/delete controls remain visible without overlap.
The final receipt-focused headed pass also showed the unread badge disappear
before assignment and stay absent after the owner changed to `민지`. The final
audit-focused headed pass showed edited bodies under `수정` while the separate
`소유자 지정` rows retained the exact team-owner and `민지` assignment messages.
The version-bound draft headed pass visibly changed both stale thread/reply
selectors to `준호` after the external assignments. Its final form suppresses
fallback polling, so those visible updates require the live event stream.

## Verification Evidence

### Storage And Recovery Runs

| Run | Evidence |
| --- | --- |
| `31297080928` | RED: seven intended storage failures; 552 server tests still passed. |
| `31298182373` | First storage GREEN: 560 server and 234 Playwright cases. |
| `31300137844` / `31300566459` | Project recovery handoff RED at 1/560, then GREEN at 561 server tests. |
| `31301395913` / `31302169627` | Cold recovery promise-cycle RED at 1/561, then implementation GREEN at 562 server tests; the latter still exposed four browser flakes. |

### Browser Ordering Runs

| Run | Evidence |
| --- | --- |
| `31303085592` / `31304047169` | Separate comment-feedback and variant-status RED runs against 233 existing Playwright cases. |
| `31304676569` | Clean 234/234 baseline after both first repairs; server remained 562. |
| `31306074381` / `31306743012` | Three cross-scope RED cases, followed by a 236-case repair head with one existing mention failure. |
| `31307888313` / `31308574488` | Four final feedback-ordering RED cases, then 240/240 GREEN. |
| `31309924313` / `31310653490` | Three cross-file feedback RED cases, then 243/243 GREEN. |
| `31311649156` / `31312393347` | Three same-scope intent RED cases, then 246/246 GREEN. |
| `31313294712` | Three reconciliation RED cases; 245 passed and one unrelated case recovered on retry. |
| `31314680948` | Intermediate repair run cancelled when the next RED was pushed. |
| `31315334688` | Two stale inline-editor RED cases; 249 existing cases passed. |
| `31316640082` | Consolidated RED: exactly four intended failures and 249 passed. |
| `31317448727` | Implementation GREEN but not accepted as final: 252 passed and the initial-refresh regression was flaky on retry. |
| `31318544219` | Final code/test GREEN at `a3551a84b7e2d61bda88eb3713ccea68a61f8005`: 253/253 Playwright with no retry or flaky case. |
| `31319646399` | Final documentation-head GREEN at `8e8bcd4463d732d40b36abcfabd2663edc44796b`: 253/253 Playwright with no retry or flaky case. |

### Legacy Ownership Repair Runs

| Run | Evidence |
| --- | --- |
| `31323183601` | PR #320 RED at `b6e174028116a0891f4c248417ccfbd9701a2063`: storage provenance, HTTP assignment, MCP assignment, and browser owner markers were intentionally absent. |
| `31324584270` | Implementation GREEN at `2c2954e9f9252d3bb968df50875b529af0daaf83`: 284 web, 566 server, 18 renderer, 39 collaboration, seven relay, 117 Rust, and 254/254 Playwright; backup, restore, and retention drills also passed. |
| `31328690712` | Superseded head `06fce31df5d3af751b4a2016f7cf367625a2b4b3` passed Full Verification and all three drills, but exact-head review correctly rejected it for the resaved synthetic-owner and reconnect-selection gaps. |
| `31331290743` | Superseded head `7eccbaae9362a035dcc51848c0901bce35d9c765` passed Full Verification and all three drills; independent review was clean, but configured exact-head review correctly found lost read receipts during thread assignment. |
| `31333603394` | Superseded head `83e6c3a0fcf49dbd8d921cb39d34b21e0133fb48` passed Full Verification and all three drills, but independent exact-head review reproduced ownership audit messages being overwritten by later edits. |
| `31334871380` | Superseded head `26042fe2d4839c6e707946fd386b7aaac962bbf2` passed Full Verification and all three drills, but independent exact-head review reproduced stale owner drafts silently reverting remote thread/reply assignments. |
| `31336227992` | Superseded head `e934249302f1d0780f99329104fc04d5a12f1fd5` passed Full Verification and all three drills. Independent exact-head review found no P0-P2, but its residual SSE and cross-instance race risks drove the final test-only proof. |
| Local latest | 522 server tests passed with 47 skipped, and 284/284 web tests passed. Focused storage/MCP/browser regressions cover raw and resaved legacy IDs, all four rejected MCP commits, reply reassignment, modern reply blocking, reconnect selection, editor control absence, read-receipt preservation, immutable ownership-audit messages after edits, and version-bound owner drafts after remote SSE reassignment. Private claim, team reconnect, receipt preservation, audit preservation, and remote draft synchronization each passed headed 1/1 with visual inspection; workspace typecheck, production build, maturity 7/7, design rules, and full Playwright 255/255 passed without retry. |

Final documentation-head Full Verification also passed 283 web, 562 server, 18 renderer, 39
collaboration, seven TypeScript relay, and 117 Rust tests. Local Playwright CLI
evidence includes 30/30 comment product flows, 21/21 mixed ordering repetitions,
10/10 repetitions of the stabilized initial-refresh case, headed 7/7 for the
latest interaction set, and headed 1/1 for the stabilized case. Web typecheck,
283/283 unit tests, and the production build passed; the build retains only the
existing chunk-size warning.

Independent pre-merge review found no P0-P2 issues and confirmed the earlier
cross-file state leak, delayed editor closure, and sticky mutation-refresh error
were resolved. A configured review started only after the draft became ready
and posted a P1 after merge: sidecars created before stable `authorId` ownership
fall back to `authorName`, so authenticated team members cannot edit or delete
their actual legacy threads or replies.

PR #320 reopens this slice from that exact failed case. Its repair preserves
missing-author provenance and requires a team owner or private local operator to
assign each legacy thread or reply explicitly; Layo does not infer or auto-claim
ownership from a non-unique display name. Storage, HTTP, review-first MCP,
Korean browser, focused repetition, full E2E, and headed local proof are green.
An independent review found and drove the reversible-assignment P1 and MCP
review/commit-parity P2 fixes. The next exact-head review then found the
reserialized `v1` provenance P1 and reconnect selector P2; sidecar `v2`,
conservative `v1` recovery, and current-owner selector defaults close both
locally. Configured review then found the thread read-receipt P2; matching
storage/browser RED now passes after preserving existing readers. The final
independent review then found ownership audit messages overwritten by later
edits even though `83e6c3a` CI was green. An activity-type allowlist plus exact
storage/browser RED and headed activity-feed proof now preserves those audits.
The next independent review found stale owner drafts could still revert remote
reassignments even though `26042fe` CI was green. Drafts now bind to selection-
time versions, and exact thread/reply SSE RED plus headed selector proof close
that race locally.
The final local server, web, typecheck, build, maturity, design, full E2E, and
headed checks are green. Another exact-head re-review, final CI, configured
review, merge, PR #319 thread resolution, and closeout remain.

## Merge And Cleanup Evidence

PR #319 squash-merged as
`e87fe7e0e980ba7375a734ac08767b6af2a51e14` on 2026-08-09 and closed issue
#318. Storage Restore `31319646390`, Authorization Backup `31319646418`, and
Retention `31319646398` passed on the final documentation head. The remote
feature branch was deleted after merge-state verification.

The first `gh pr merge --admin --squash --delete-branch` invocation returned a
local error because `main` was checked out in another worktree, although GitHub
had already completed the remote merge. Cleanup therefore re-read the PR and
issue state before deleting only the confirmed merged remote feature ref. The
repository post-merge process now records this multi-worktree failure mode so a
nonzero cleanup exit cannot cause an unsafe duplicate merge attempt.

Remote branch deletion is not sufficient evidence for local worktree removal.
Cleanup must also prove the clean worktree's HEAD is the confirmed PR head or
that its branch tip is integrated into the merged base, with explicit handling
for squash merges.

Required status, current-branch, worktree, and remote-ref checks ran after the
merge. Active and user-owned worktrees remain explicit cleanup exceptions until
the closeout PR finishes; no unknown local state was deleted.

The first local closeout `pnpm check:penpot-maturity` run failed one of seven
checks because two historical plan filenames were placed above the canonical
`Completed Plans` boundary. Moving prior evidence below that boundary restored
the one-plan routing contract, and the focused gate then passed 7/7.

## Deliberate Divergence And Remaining Gaps

Layo deliberately keeps comments in team-owned local sidecars and binds them to
stable design nodes. It does not require a maintainer-operated central comment
database.

The next comment maturity gaps are:

- a first-class canvas comment tool with arbitrary coordinate placement instead
  of selected-node-only creation;
- user-level hide/show comment preference and full dashboard-level navigation;
- full CRDT-backed live comment editing rather than durable sidecar events;
- hosted durable pub/sub and external notification channels beyond a shared
  filesystem event log; and
- branch, review, and merge workflows that connect comment resolution to a
  formal design review lifecycle.

Deployment remains a separate, deliberately non-gating concern for this
local-first product slice.
