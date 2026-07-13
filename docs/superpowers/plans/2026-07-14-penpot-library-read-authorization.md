# Penpot Team Library Read Authorization Plan

Status: Active  
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
- GREEN: pending.

## Remaining Boundary

Authenticated review/preflight reads, registry SSE event authorization,
credential rotation/revocation, shared transactional storage, receipt
retention, and durable pub/sub remain later exact loops.
