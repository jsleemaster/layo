# Penpot Token MCP and UI Delta

Last checked: 2026-07-14
Status: PR #308 active and ready to merge; final verification/review complete; not merged

## Retrieval Summary

- Decision: **Adapt** Penpot personal access-token administration.
- Human surface: compact Korean controls in team settings.
- Agent surface: authenticated self-only MCP create/list/revoke with explicit
  tool annotations; HTTP remains the browser contract.
- Storage owner: Layo manages `<members-file>.tokens.json` version 2; the
  operator members file remains external and is never replaced.
- Secret rule: plaintext is one-time response/component state; persistence is
  SHA-256 only and clipboard copy is the only intentional external copy.
- Current gate: final code head
  `9eae96fe2e11992768636211da3868a9e93142a5` passed Full Verification
  `29340078192`, restore `29340078406`, and retention `29340078359`.
  Implementation, verification, failure-learning evidence, and review are
  complete. PR #308 is ready to merge but is not merged; gates 7/8/10 remain
  whole-product maturity targets, not completed gates.

## Penpot Reference And Decision

Official references:

- https://help.penpot.app/technical-guide/integration/#access-tokens
- https://help.penpot.app/mcp/

Penpot provides account-level descriptive token names, Never/30/60/90/180-day
expiry choices, one-time copy after creation, metadata listing, deletion, and
personal-token authentication for integrations/MCP. Layo adapts that workflow
because its identity boundary is local-first and operator-owned:

| Capability | Penpot reference | Layo PR #308 adaptation |
| --- | --- | --- |
| Ownership | Hosted/self-hosted account profile | Operator members file plus Layo-owned managed sidecar |
| Human administration | Account access-token settings | Korean team settings for the active member |
| Agent administration | Personal token authenticates integrations/MCP | Deterministic self-only MCP create/list/revoke |
| Secret lifecycle | Copy after creation | One-time response/component state; hash-only persistence |
| Revocation | Delete token | Durable `revokedAt` overlay and explicit current-token confirmation |

This contributes evidence to maturity gates 7, 8, and 10. It does not close any
whole-product gate.

## Product Scope

### MCP

The tools are registered only when file-backed authorization and an
authenticated principal are available. Static/environment authorization exposes
no mutation tools. The manager, not caller input, derives the member identity.
List is read-only/non-destructive/idempotent; create is
writable/non-destructive/non-idempotent; revoke is
writable/destructive/idempotent. Invalid, member-revoked, named-token-revoked,
stale-replaced, and stale-revoked credentials fail before mutation.
Self-revocation requires `confirmSelfRevoke: true`.

### HTTP And Korean UI

HTTP list returns whitelisted token metadata and secret-free `activeTokenId`.
The browser API performs credentialed list/create/revoke requests and maps
failures to Korean errors. Team settings support descriptive name, expiry,
one-time reveal/copy, refresh, sibling revocation, and confirmed self-revocation.
Self-revocation clears the credential but preserves the local team so a valid
root credential can be applied without team recreation.

## Managed Sidecar V2

The operator members file is authoritative identity input. Account
administration never rewrites it. Layo owns the deterministic
`<members-file>.tokens.json` sidecar:

- Version 2 stores per-member base fingerprints, quarantine state, managed token
  metadata/hashes, and revocation overlays.
- Plaintext-bearing, malformed, duplicate, removed-member, conflicting-id, and
  binding-mismatched state fails closed.
- Writes retain resource-keyed process locking, file and directory sync, source
  snapshot comparison, and operator-base freshness comparison before rename.
- A changed base returns 409 and removes the temporary sidecar without replacing
  operator data.
- A base change after the final comparison can still race with sidecar rename.
  The base is not overwritten, but closing identity freshness across hosts needs
  transactional shared storage or an external version/CAS contract.

### V1 Quarantine And Recovery

Version 1 has no binding fingerprint, so every loaded v1 member is quarantined.
A quarantined or fingerprint-mismatched generation cannot authenticate managed
tokens or mutate itself. Recovery is explicit: a currently valid root/legacy
credential may reconcile that member to the current operator record. The
reconciliation drops untrusted managed generations, establishes a v2 binding,
and preserves recorded revocations for base token IDs. Therefore a base token
revoked in v1 or before a fingerprint change remains invalid and cannot recover
its quarantined generation.

## One-Time Secret And Async Safety

Create returns plaintext once. Only SHA-256 persists. Plaintext is absent from
the sidecar, list/revoke responses, localStorage, IndexedDB, and exported team
manifests. Dismissal, another create, identity change, leaving team settings,
reload, and successful self-revocation clear component state.

Each account-token request captures an operation generation, identity key, and
direct `collabSession` object reference. Only the current operation for the
same identity and same `collabSession` instance may update metadata, errors, or
one-time secret state. Delayed list/create/revoke responses cannot cross a
session replacement even when the replacement has the same team id, member id,
and token.

### Same-identity collaboration-session P1

RED `69ea991` targeted a delayed create response released after replacement of
an equal-identity collaboration session. Implementation commits `3047`,
`d342`, and `fd51` introduced direct `collabSession` reference invalidation and reset/reload
ordering. Test review found the initial regression was a false positive: the
replacement path did not prove it retained the same token, so an ordinary
identity change could explain the discarded response. Corrected test `bd7acd`
refills and asserts the same token, confirms the apply control remains disabled,
waits for the replacement token-list response, and then proves the delayed
create plaintext/status is still discarded.

## Equal-Identity Fixture Activation Loop

Full `29337201074` failed only in Playwright because the regression test
assumed `createRelayTeam` activated the created credential in the browser.
Fix `d7c60f` explicitly applies the credential through the UI and waits for
the authenticated replacement GET before releasing the delayed old response.

## Session-Reference Review Loop

Fresh review found the E2E generation increment masked the session-reference
regression it was meant to prove. Deterministic RED commits `8686d0` and
`032f45` isolated the predicate; RED Full `29339023854` failed exactly at
expected true-to-be-false. GREEN `bc6823` / `218ddde` extracted the tested
predicate and delegated App invalidation to it. Fresh review reported no
findings.

## Relay Reconnect Observer Loop

Full `29339246720` failed only the equal-session E2E because an unavailable
relay caused eight reconnect socket attempts rather than the asserted two. The
test had measured reconnect attempts as session count. Commit `9eae96f`
removed only the socket-count observer/assertions while preserving fixed equal
identity, replacement-team status, the authenticated replacement GET, and
absence of the delayed old response. Fresh review reported no findings.

## Watcher Removal And Reintroduction Loop

Intermittent Full `29333986663` failed in Core when a watched operator member
was removed and quickly reintroduced. An older watcher callback could enter
quarantine, then race a fresh token mutation and quarantine the new sidecar
generation.

Deterministic RED `4f75d7` pauses the watcher immediately before quarantine,
restores the original member, starts a fresh managed-token create, and proves
the create must not settle until quarantine resolution. Full `29334373513`
executed that RED and failed exactly the intended
`settledBeforeQuarantine` assertion with 358/359 server tests passing.

GREEN `35ef` records the watcher reload tail on the shared in-memory config,
makes managers wait for that tail before entering the sidecar process lock, and
allows quarantine only when the current sidecar bytes still equal the snapshot
that produced the binding error. Full `29334572132` passed gates, typecheck,
build, and Core before being superseded during Playwright. Stress commit `ff7`
runs the remove/reintroduce case 20 times; Full `29334928481` again reached
Core GREEN before Playwright was superseded. Security re-review approved the
repair with no actionable blocker.

This ordering is process-local. It coordinates watchers and managers sharing
one `TeamAuthorizationConfig` object and filesystem lock. It does not establish
one monotonic authorization generation across multiple hosts. Shared
transactional identity storage with a durable version/CAS boundary remains
required to order watcher, authentication, quarantine, and mutation decisions
globally.

## Watcher Transient-read Retry Loop

Final docs-head Full `29335855757` failed with 377/378 server tests passing:
after a transient truncated operator-base read failed closed, the sibling
preview token stayed invalid instead of recovering on a later valid read.
Deterministic RED `df0c0581` made that recovery failure repeatable, and RED
Full `29336713035` failed the exact intended case.

GREEN `3c44aecf` schedules a bounded retry through the existing process-local
`reloadTail`. The initial malformed/truncated read still clears authorization
immediately. A later successful reload cancels retry state; closing the watcher
also cancels pending retry work. Focused authorization tests passed 15/15 and
typecheck passed.

The retry budget does not weaken fail-close behavior: permanently malformed
input remains unauthorized after retries are exhausted. It is bounded and
process-local, not a shared multi-host generation or delivery guarantee.

## Failure And Verification Ledger

| Evidence | Result | What it proved or exposed |
| --- | --- | --- |
| Full `29319326675` | RED Core | MCP management tools/contract absent |
| Full `29319506090` | GREEN | Initial fail-closed MCP administration |
| Full `29321365988` | RED Core | Cached auth could diverge from current disk; self-revoke lacked acknowledgement |
| Full `29321868256` | GREEN | One locked fresh auth/mutation snapshot; explicit self-revoke |
| Full `29322921269` | GREEN | Real watched-file stdio create/list/revoke, hash-only persistence, sibling preservation |
| Full `29327585413` | RED Core | Operator-path ownership was unsafe; four intended sidecar cases failed |
| Full `29328497576` | RED Core | Create could cross the base freshness window |
| Full `29328787630` | Partial | Gates/typecheck/build and 351/351 Core passed; stale stdio sidecar assertion failed in Playwright |
| Full `29329460338` | Cancelled | Superseded during Web build; not GREEN |
| Focused account-token e2e | 3/3 passed | Real-network create/copy/refresh/revoke/recovery and secret absence |
| Direct headed CLI | 1/1 passed | `복사됨`, sibling `해지됨`, empty credential after self-revoke |
| Full `29332908276` | Cancelled | Gates/typecheck/build/Core passed; docs push superseded it during Playwright, so it is not GREEN |
| Restore `29332908281` | Passed | Current-head restore drill |
| Retention `29332908332` | Passed | Implementation-head backup retention |
| Full `29333986663` | RED Core | Intermittent watcher removal/reintroduction race |
| Commit `4f75d7` | Deterministic RED | Paused quarantine reproduced the fresh-generation race |
| Full `29334373513` | Deterministic RED | Executed the intended `settledBeforeQuarantine` failure; 358/359 server tests passed |
| Full `29334572132` | Core GREEN | Watcher-tail/snapshot fix passed Core; superseded during Playwright |
| Full `29334928481` | Core GREEN | 20x stress passed Core; superseded during Playwright |
| Security re-review | Approved | No actionable blocker in the watcher repair |
| Vercel on `bd7acd` | Passed, non-gating | Preview deployment is separate from the product merge gate |
| Full `29335200155` | Cancelled, not GREEN | Passed gates/typecheck/build/Core; docs push superseded it during Playwright |
| Full `29335855757` | RED server 377/378 | Sibling preview token stayed invalid after a transient truncated base read |
| Commit `df0c0581` | Deterministic RED | Reproduced the exact transient-read recovery failure |
| Full `29336713035` | RED | Executed and failed the intended retry-recovery case |
| Commit `3c44aecf` | Focused GREEN | Bounded `reloadTail` retry; auth 15/15 and typecheck passed |
| Full `29337201074` | RED Playwright | Fixture created a relay team but did not activate its credential; `d7c60f` added explicit UI apply plus authenticated replacement GET |
| Commits `8686d0` / `032f45` | Deterministic RED | Isolated session-reference predicate without generation masking |
| Full `29339023854` | RED Playwright | Failed exactly expected true-to-be-false |
| GREEN `bc6823` / `218ddde` | Focused GREEN | Extracted tested predicate and App delegation; review found no findings |
| Full `29339246720` | RED Playwright only | Unavailable relay reconnects produced socket count 8, exposing a test-observer error rather than eight sessions |
| Commit `9eae96f` | Test repair | Removed only socket-count observation; retained identity/status/authenticated replacement/old-response proofs |
| Full `29340078192` | Final GREEN, 8m9s | On `9eae96fe2e11992768636211da3868a9e93142a5`; gates, typecheck, build, Core, and Playwright all passed |
| Restore `29340078406` | Passed | Final-head storage restore drill |
| Retention `29340078359` | Passed | Final-head backup retention |

The initial browser async guard also failed typecheck because its identity ref was
declared after first use. After `9e500aa`, the focused lifecycle revealed that
reload reauthentication lacked a restored local team; `d633563` and
`795dd88` added the state assertion and correct setup. `39983dc` removed an
unrelated focus workaround. Superseded Full runs `29332319714`,
`29332832876`, and `29332894061` were cancelled and are not GREEN evidence.

## Residual Gaps

- Durable audit events exist only as lifecycle metadata today; searchable,
  retained event consumption and operational review remain open.
- Shared transactional multi-host identity and revocation storage remains open.
  Filesystem locking, watcher-tail waits, and freshness checks are process-local
  or same-storage evidence only. The bounded transient-read retry is also
  process-local. Multiple hosts need one durable monotonic authorization
  generation or CAS contract. Permanently malformed input remains fail-closed.
- MCP mutations do not yet provide agent dry-run, review, apply, summary, or
  reversible transaction semantics comparable to saved design edits.
- Root-token recovery is explicit and preserves teams/revocations, but broader
  account recovery policy and UX remain open.
- Deployment is deliberately non-gating for this slice. Vercel passed on
  `bd7acd`, but preview availability does not prove the local-first MCP/UI
  contract.
- PR #308 is ready to merge after final verification and review with no findings.
  Squash merge and post-merge cleanup remain Task 4 work.
