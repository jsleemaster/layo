# Penpot Library Token Recovery Review Repair Plan

Date: 2026-07-14
Status: In progress
PR: #304

## Goal

Close the two concrete no-restart recovery gaps found by external review after
PR #303: retrying a restored browser token with the same value and rotating the
MCP principal token without restarting the process.

## Penpot Benchmark Decision

Adopt Penpot's replaceable personal-access-token lifecycle and adapt it to
Layo's local-first, operator-owned deployment boundary. Layo keeps team-owned
secret files and deterministic local runtime behavior rather than requiring a
maintainer-hosted identity service.

References:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/user-guide/account-teams/teams/

## Exact Failed Cases

1. After a terminal registry authorization event, the token apply command was
   disabled and returned early when the operator restored authorization for the
   same token value.
2. MCP watched the accepted-member file, but captured
   `LAYO_MCP_MEMBER_TOKEN` at startup, so principal rotation still required a
   restart.
3. The requested external review for PR #303 was not fetched again before
   merge, allowing both findings to arrive after the merge.

## TDD Loop

- [x] Extend Playwright coverage to require a same-token terminal recovery
  before a different-token rotation.
- [x] Add watched MCP principal token tests for live rotation and blank-file
  last-valid fallback.
- [x] Capture RED Full Verification `29306540857`, job `87000903745`, at
  typecheck before the missing watcher existed.
- [x] Add a stable mutable MCP principal token source and restart-free startup
  wiring.
- [x] Add a browser token revision that permits same-value resubscription only
  after terminal authorization.
- [ ] Pass full repository verification and direct Playwright CLI interaction.
- [ ] Complete review, merge, and post-merge cleanup.

## Product Boundary

The member-policy file and MCP principal-token file remain separate operator
controls. Each file takes precedence over its static environment fallback.
Malformed, unreadable, or blank updates preserve the last valid in-memory value.
No secret value is logged or exported.

Deployment remains non-gating.
