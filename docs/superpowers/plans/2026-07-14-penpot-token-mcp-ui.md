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
- GREEN `3c44aecf` adds bounded retry serialized by `reloadTail`, preserves
  immediate fail-close on the first bad read, and cancels retry state on success
  or watcher close. Focused authorization passed 15/15; typecheck passed.
- Residual: permanently malformed input remains fail-closed. Retry is bounded
  and process-local, not a multi-host generation or delivery guarantee.

### Current merge gate

- Full Verification `29335200155`: passed gates, typecheck, build, and Core, then was superseded and cancelled during Playwright by the docs push; not GREEN.
- Full `29333986663` is RED Core. Full `29334373513` is the deterministic
  358/359 RED at `settledBeforeQuarantine`. Fulls `29334572132` and
  `29334928481` are Core GREEN only
  because later commits superseded Playwright.
- Vercel passed on `bd7acd`, but deployment remains non-gating for this
  local-first MCP/UI slice.
- Full `29335855757` is RED at 377/378; `29336713035` is the deterministic
  retry RED. Focused GREEN `3c44aecf` is not a final Full.
- Tasks 1-3 are complete. Security re-review is approved. The final PR-head
  Full, including the corrected equal-session E2E and watcher retry, remains
  pending without a pinned run id. Task 4 remains in progress until that Full,
  merge, and post-merge cleanup are actually complete.

### Task 4: Verification, review, and durable evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-token-mcp-ui-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [ ] Run Full Verification, Storage Restore Drill, and Storage Backup Retention.
- [x] Request external code review and feed every actionable finding into a focused RED.
- [x] Update product docs with Penpot reference, adopt/adapt decision, RED/GREEN IDs, direct browser evidence, and remaining agent-reviewability/audit/shared-storage risks.
- [ ] Open a ready PR, resolve every review thread, and squash merge.
- [ ] Run required post-merge cleanup checks and delete the remote branch.
