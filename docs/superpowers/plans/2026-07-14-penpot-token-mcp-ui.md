# Penpot Token MCP and UI Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make file-backed personal access tokens self-service from Layo MCP and the Korean browser team settings while preserving fail-closed authentication, one-time secret delivery, and hash-only storage.

**Architecture:** Reuse `TeamAuthorizationFileManager` as the single mutation authority. Inject it into MCP beside the authenticated principal and expose tools only when the operator selected file-backed authorization. Add a small browser API module over the existing HTTP routes, including a secret-free active-token identifier for safe self-revocation. Render account controls only in team settings; plaintext may exist only in the immediate create response, transient component memory, and an explicit user clipboard copy.

**Tech Stack:** TypeScript, Fastify, MCP SDK, React, Vitest, Playwright CLI

---

## Benchmark Decision

Official references:

- Penpot access-token lifecycle: https://help.penpot.app/technical-guide/integration/#access-tokens
- Penpot MCP authentication and scope: https://help.penpot.app/mcp/

Penpot manages personal access tokens at account level with a descriptive name,
Never/30/60/90/180-day expiry choices, one-time copy after creation, a metadata
list, and deletion. Layo **adapts** that workflow into local-first team settings,
authenticated self-only HTTP, and deterministic MCP. It deliberately keeps the
operator members file externally owned and stores managed hashes/revocation
overlays in a bound version 2 sidecar.

This slice adds evidence toward maturity gates 7 (extensibility), 8 (operations),
and 10 (failure loop). It does not claim those whole-product gates are closed.
Audit-event consumption, shared transactional multi-host identity, agent
dry-run/reviewability, and broader account recovery remain follow-up gaps.
Deployment remains a separate non-gating concern.

### Task 1: Prove fail-closed MCP administration

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Create: `apps/server/src/team-authorization-management-mcp.test.ts`
- Modify: `apps/web/e2e/mcp-stdio.spec.ts`

- [x] Add a failing in-memory MCP integration covering authenticated create/list/revoke for only the principal returned by `authenticateTeamMember`.
- [x] Require tools to be absent when the manager is missing, the principal is missing, or authorization is static/non-file-backed.
- [x] Require invalid and revoked principals to fail before mutation.
- [x] Assert exact annotations: list is read-only/non-destructive/idempotent; create is writable/non-destructive/non-idempotent; revoke is writable/destructive/idempotent.
- [x] Add a spawned stdio RED using temporary `LAYO_LIBRARY_REGISTRY_MEMBERS_FILE`, `LAYO_MCP_USER_ID`, and `LAYO_MCP_MEMBER_TOKEN`.
- [x] Through stdio create/list/revoke, inspect the file for hash-only persistence and prove another member's tokens remain unchanged.
- [x] Run focused server and stdio tests and record the missing-tool RED.
- [x] Inject `teamAuthorizationManager` into `McpServerOptions`, derive the member id only from `authenticateTeamMember`, register conditional tools, and wire the stdio file manager.
- [x] Re-run focused tests and commit GREEN.

### Task 2: Prove the HTTP and browser API contract

**Files:**
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/team-authorization-management-http.test.ts`
- Create: `apps/web/src/account-token-api.ts`
- Create: `apps/web/src/account-token-api.test.ts`

- [x] Add failing HTTP assertions that list returns only whitelisted token metadata plus secret-free `activeTokenId`.
- [x] Prove legacy credentials return no active token id and named credentials return their own id.
- [x] Add failing web API tests for exact credentialed list/create/revoke requests, metadata whitelisting, and Korean errors.
- [x] Run focused tests and record RED before implementation.
- [x] Implement the HTTP response and typed browser helpers over `/account/tokens`.
- [x] Re-run focused tests and commit GREEN.

### Task 3: Prove the real browser account workflow

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/e2e/account-token-administration.spec.ts`
- Modify: `package.json`

- [x] Add a Playwright fixture that starts an isolated file-backed server and web dev server on alternate ports.
- [x] Add a failing real-network test that creates a local team, applies a named member token, enters 팀 설정, and loads the current member's metadata.
- [x] Type a descriptive name, choose expiry, create a token, copy the one-time secret, reload the metadata list, and revoke a sibling token.
- [x] Assert real request headers, hash-only disk persistence, list/reload secret absence, and revoked credential authentication failure.
- [x] Mark the active token in Korean UI. Require explicit confirmation before current-token revocation; on success clear active credentials and show the recovery instruction without destroying the team.
- [x] Assert plaintext disappears after dismissal, another create, identity change, leaving 팀 설정, and reload.
- [x] Assert plaintext is absent from localStorage, IndexedDB, and exported team manifest; clipboard copy is the only intentional external copy.
- [x] Register the spec unconditionally in root `test:e2e`.
- [x] Run the focused Playwright CLI RED, implement compact accessible controls, then repeat the direct click/type/copy/revoke interaction pass.

## Execution Evidence

### MCP and HTTP contract

- Initial missing-tool RED Full Verification `29319326675` failed in Core;
  initial GREEN `29319506090` passed every gate.
- Security review exposed cached authentication separated from the mutation
  snapshot and unacknowledged self-revocation. RED `29321365988` failed the
  stale revoked/replaced and confirmation cases; repaired GREEN
  `29321868256` passed. The manager now authenticates and mutates one freshly
  parsed snapshot under the process lock.
- Spec re-review replaced the mocked success path with a real watched file.
  GREEN `29322921269` passed and proves stdio create/list/revoke, hash-only
  persistence, whitespace-normalized authentication, and sibling preservation.
- HTTP returns whitelisted metadata plus secret-free `activeTokenId`; the
  browser API sends exact credentialed list/create/revoke requests and Korean
  errors. Static authorization remains read-only.

### Managed sidecar failure loop

- External-writer review proved cooperative locking could still overwrite the
  operator path. Sidecar RED commit `920cbafe2` and Full
  `29327585413` retained four intended Core failures.
- Authentication freshness RED `29328497576` retained the exact create race.
  Storage/freshness GREEN commits `d2c4c36` and `4772492` moved managed token
  hashes and revocation overlays to `<members-file>.tokens.json` version 2,
  retained the process lock, and compare the authenticated base snapshot before
  sidecar replacement.
- Version 2 binds each managed member to the current operator-record fingerprint.
  Malformed/plaintext state and binding changes fail closed. Version 1 entries
  load quarantined; explicit valid root/legacy recovery reconciles them while
  preserving base-token revocations, so a revoked base token cannot recover its
  own quarantined generation.
- Full `29328787630` passed gates, typecheck, build, and 351/351 Core tests,
  then failed Playwright on a stale stdio persistence assertion. Harness
  migrations `b7f30dc`, `ca847f3`, and `c31ad5f` moved those assertions to
  the sidecar. Superseded Full `29329460338` was cancelled during Web build.

### Browser async and direct interaction loop

- Account-token async operations carry a monotonically increasing generation
  and the initiating identity. Responses are ignored after identity changes or a
  newer operation, preventing stale metadata, errors, or one-time plaintext from
  repopulating the UI.
- A declaration-order mistake in the initial async guard broke typecheck; the
  repair is `9e500aa`. The focused lifecycle then exposed incomplete reload
  setup; `d633563` added credential-state proof and `795dd88` restores a local
  team before reauthentication. `39983dc` removes an unrelated focus workaround.
- Focused web typecheck passed; web unit tests passed 34 files / 268 tests.
  Account-token Playwright passed 3/3.
- Direct headed Playwright CLI passed 1/1 across create, reveal/copy, refresh,
  sibling revoke, explicit self-revoke confirmation, and recovery. Visible
  results: copy changed to `복사됨`, the sibling row changed to `해지됨`, and
  self-revoke showed recovery guidance with an empty credential field.
- One-time plaintext is absent from the sidecar, list/revoke responses,
  localStorage, IndexedDB, and exported team manifests; dismissal, another
  create, identity change, leaving settings, reload, and self-revoke clear it.

### Same-identity collaboration-session failure loop

- P1 RED `69ea991` delayed create completion across replacement of a
  `collabSession` whose identity values were intended to remain equal.
- Implementation commits `3047`, `d342`, and `fd51` added a
  direct `collabSession` object reference to the async guard.
- Review found the first regression was a false positive because it did not
  prove the replacement retained the same token. Corrected test `bd7acd`
  refills/asserts the identical token, waits for the replacement list response,
  and then proves the delayed plaintext/status is discarded.

### Equal-identity fixture activation failure loop

- Full `29337201074` failed only in Playwright because the test assumed
  `createRelayTeam` also activated its credential in the browser.
- Fix `d7c60f` explicitly applies the replacement credential through the UI
  and waits for its authenticated replacement GET before releasing the old
  response. This separates fixture creation from active-session proof.

### Session-reference review failure loop

- Fresh review found the E2E generation increment could mask the intended
  same-identity session-reference regression.
- Deterministic RED commits `8686d0` and `032f45` isolated the predicate;
  RED Full `29339023854` failed exactly at expected true-to-be-false.
- GREEN `bc6823` / `218ddde` extracted the tested predicate and delegated
  App invalidation to it. Fresh review reported no findings.

### Relay reconnect observer failure loop

- Full `29339246720` passed every non-E2E gate, then failed the equal-session
  Playwright case because an unavailable relay produced eight reconnect socket
  attempts instead of the asserted two.
- Root cause: the test counted reconnect attempts as collaboration sessions.
  Commit `9eae96f` removed only that socket-count observer and its assertions.
  It preserved fixed equal identity, replacement-team status, the authenticated
  replacement GET, and absence of the delayed old response.
- Fresh review reported no findings.

### Watcher removal/reintroduction failure loop

- Intermittent Full `29333986663` failed Core when an older remove callback
  could quarantine a newly reintroduced member generation.
- Deterministic RED `4f75d7` pauses quarantine while the member is restored
  and a fresh create begins. Full `29334373513` executed the RED and failed
  exactly the intended `settledBeforeQuarantine` assertion with 358/359 server
  tests passing.
- GREEN `35ef` makes managers wait for the process-local watcher reload tail
  and applies quarantine only to the exact observed sidecar snapshot. Full
  `29334572132` reached Core GREEN before Playwright was superseded.
- Stress `ff7` repeats the exact race 20 times. Full `29334928481` reached
  Core GREEN before Playwright was superseded.
- Security re-review approved with no actionable blocker.
- Residual: this coordinates one process and shared in-memory config. Multi-host
  correctness still needs shared transactional identity plus one durable
  monotonic generation/version or CAS contract.

### Watcher transient-read retry failure loop

- Final docs-head Full `29335855757` failed 377/378 server tests because a
  sibling preview token stayed invalid after a transient truncated base read.
- Deterministic RED `df0c0581` reproduced the exact recovery miss; RED Full
  `29336713035` failed that intended case.
- GREEN `3c44aecf` adds retry serialized by `reloadTail`, preserves
  immediate fail-close on the first bad read, and cancels retry state on success
  or watcher close. Focused authorization passed 15/15; typecheck passed.
- Final external review found the README falsely described an exhausted retry
  budget. Implementation failures re-arm after each poll for the watcher
  lifetime while authorization remains fail-closed.
- Documentation repair `ef6929e` states the unbounded process-local behavior;
  maturity-gate regression `1731949` rejects the old exhausted-budget claim.
- Residual: this retry is process-local, not a multi-host generation or delivery
  guarantee. Persistent malformed input can continue retry logging.

### Removed-member orphan quarantine failure loop

- External review found a P1: after the operator removed one member, its
  sidecar state caused every watcher retry to throw the same binding error and
  clear all principals, indefinitely locking out surviving members.
- Deterministic RED `e4c4126` and Full `29342714708` reproduced the survivor
  timeout with 379 passing server tests and one intended failure.
- Broad-ignore hypothesis `4d6f0af` skipped every quarantined member and failed
  existing explicit recovery tests, so it was rejected.
- GREEN `1b1888f` / `914fc72` skips only a quarantined sidecar member absent
  from the operator base. Re-added members still require explicit base
  authentication and reconciliation; removed managed secrets stay invalid,
  surviving revocations stay revoked, and restart behavior is covered.
- Full `29343398679`, restore `29343394961`, and retention `29343395030`
  passed on `914fc7226c5632344d4f5e8e1f4c750006b968a2`.

### Startup, immediate recovery, and locked publication failure loop

- External re-review found startup P1 and immediate-survivor P2 gaps.
  Deterministic RED `3a0b640` / Full `29376307034` failed those two cases
  with 380/382 server tests passing.
- First GREEN `01105a9` exposed an in-flight watcher lock after close in Full
  `29376572991`. The arbitrary cleanup-retry hypothesis was rejected.
- Lifecycle and competing-publication RED `0e3d2a4` / Full `29377023368`
  failed exactly two new cases with 382/384 passing.
- `463ca6e` / `19bdc0b` add callback suppression, `settled()`, stable
  reread and publication under the sidecar process lock, and a competing manager
  ordering proof.

### Bulk removal and reintroduction failure loop

- Latest external review found only one removed sidecar member was quarantined
  per poll. RED `fad4ae2` / Full `29378304736` kept the survivor unavailable
  while 384/385 server tests passed.
- Broad all-binding quarantine `2f6f155` failed all 20 reintroduction stress
  cases in Full `29378477598`; dormant managed tokens reappeared.
- Present-base skip `c8445a1` also failed all 20 cases in Full
  `29378879310` because a queued reload accepted the unquarantined dormant
  generation.
- Final `aabff5f` quarantines every orphan from the exact observed removal
  snapshot in one lock, rechecks the current base before persistence, and
  blocks publication for reintroduced generations until explicit recovery.
- Full `29379115279`, restore `29379115246`, and retention
  `29379115265` passed. Independent security review found no actionable
  finding; all PR review threads are resolved.

### Completion evidence

- Final code head `aabff5fa59d280e5b736cc972a2f02b234667d40`
  passed Full `29379115279`, restore `29379115246`, and retention
  `29379115265`, including 385 server cases, Rust, and Playwright CLI e2e.
- Independent security review found no actionable code finding. Final
  documentation review P3 was repaired by `ef6929e` and guarded by
  `1731949`; all five review threads are resolved.
- Final documentation head `de3e88ea542c062b001dec39ea3c3397a7b5179a`
  passed Full `29380205891`, restore `29380205922`, and retention
  `29380205936`.
- PR #308 squash-merged as
  `5df21e360aff0970b009e7e911007167d6f83f96` on 2026-07-15.
- Post-merge `gh pr view` confirmed MERGED and the original remote branch was
  deleted. Local `git status`, current-branch, and worktree commands still
  exited 134 in this runtime, so no dirty local worktree was modified or deleted.

### Task 4: Verification, review, and durable evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-token-mcp-ui-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [x] Run Full Verification, Storage Restore Drill, and Storage Backup Retention.
- [x] Request external code review and feed every actionable finding into a focused RED.
- [x] Update product docs with Penpot reference, adopt/adapt decision, RED/GREEN IDs, direct browser evidence, and remaining agent-reviewability/audit/shared-storage risks.
- [x] Bring the active PR to ready-to-merge evidence with no review findings or open review threads.
- [x] Squash merge PR #308.
- [x] Run required post-merge cleanup checks and delete the remote branch.
