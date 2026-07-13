# Penpot Team Library Read Authorization Plan

Status: Completed  
Date: 2026-07-14  
PR: #297

## Exact Failed Case

With hosted registry auth enabled, an authenticated team-alpha viewer can list
team-beta libraries through `GET /libraries`, while an unauthenticated request
also succeeds. File-scoped list reads trust a supplied target file id without
checking that the principal belongs to its team.

## Benchmark Decision

- Adopt Penpot's team-owned library discovery boundary.
- Adapt Layo's existing member principal to filter whole-registry lists by
  authorized team ids and authorize file-scoped reads by exact team.
- Preserve viewer access within the same team.
- Preserve unconfigured local-first list behavior.

References:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/user-guide/design-systems/libraries/

## Execution

1. RED unauthenticated 200 and cross-team list disclosure.
2. Add shared read policy and HTTP principal-team filtering.
3. Send activated-session credentials from web and process-local MCP.
4. Cover whole-list and file-scoped isolation plus direct Playwright list click.
5. Run full verification, review, merge, and cleanup.

## Evidence

- RED `29288230571`: unauthenticated hosted list returned 200.
- Contract RED `29288538333`: web list overload did not model credentials.
- First full run `29288809355` passed product checks but exposed one retry in
  the pre-existing spanned-grid header reorder E2E.
- Diagnostic run `29289606382` proved both drag endpoints were correct but
  still retried, isolating a dropped reorder event.
- Deterministic RED `29290200053` forced a React rerender during the drag and
  failed both attempts with unchanged tracks.
- GREEN `29290833407` passed 251 web tests, 292 server tests, the Rust
  workspace, and all 193 Playwright CLI cases without retry.
- Restore `29290833400` and retention `29290833356` passed.
- Direct browser proof clicked the credentialed registry refresh, verified the
  activated-session Authorization and X-Layo-User-Id headers, then completed
  publish, review, and import without cross-team disclosure.

## Remaining Boundary

Authenticated review/preflight reads, registry SSE event authorization,
credential rotation/revocation, shared transactional storage, receipt
retention, and durable pub/sub remain later exact loops.
