# Penpot Library Token Recovery Delta

Date: 2026-07-14
PR: #303

## Benchmark Decision

Penpot personal access tokens are created with a name and expiration, treated as
passwords, and can be deleted at any time. Layo adopts the same replaceable
credential lifecycle and adapts rotation to a local-first, self-hosted runtime:
an operator-owned JSON file can change without restarting HTTP or MCP, and a
member can replace the browser token without recreating the active team.

References:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/user-guide/account-teams/teams/

## Exact Failed Case

After PR #302 stopped retrying terminal authorization failures, recovery still
required process restart or team recreation.

- RED Full Verification `29304547951`, job `86995132532`, failed because
  `watchTeamAuthorizationConfigFile` did not exist.
- Browser contract RED `29304746565`, job `86995720752`, failed because the
  stream client had no authenticated `onReady` signal.
- First GREEN attempt `29304831810`, job `86995963258`, exposed an SSE test
  helper that matched `library-registry-ready` as the prefix event
  `library-registry`.
- Second GREEN attempt `29304931210`, job `86996258338`, exposed that token
  recovery feedback existed only in the hidden file panel while the user was
  operating the team panel.

## Product Boundary

- `LAYO_LIBRARY_REGISTRY_MEMBERS_FILE` takes precedence over the static
  `LAYO_LIBRARY_REGISTRY_MEMBERS` environment value.
- HTTP and MCP retain one stable authorization object while the watched file
  atomically replaces its parsed member list.
- Malformed, empty, or unreadable updates keep the last valid credentials and
  report a reload error without exposing tokens.
- New registry SSE connections emit `library-registry-ready` only after
  initial member and exact-file team authorization succeeds.
- The team panel exposes a password input and explicit `멤버 토큰 적용`
  command in every team mode.
- Expired, reconnecting, and reconnected states remain visible in a team-panel
  `aria-live` status; applying a token does not recreate the team session.
- Static environment configuration and the open unconfigured local-first path
  remain supported.

## Verification

Code-head Full Verification `29305440761`, job `86997742164`, passed:

- Penpot maturity and design gates
- repository typecheck and web build
- 255 web tests
- 299 server tests
- Rust workspace tests
- 195 Playwright CLI tests

## Direct Playwright CLI Evidence

The live editor scenario:

1. Created a project and opened the team panel.
2. Created `디자인 팀` as a local team.
3. Applied `expired-member-token`.
4. Received terminal `credential_inactive` and observed the visible Korean
   expiry status in the active team panel.
5. Replaced it with `rotated-member-token`.
6. Verified the next SSE request carried
   `Authorization: Bearer rotated-member-token`.
7. Received `library-registry-ready`, observed `팀 인증 다시 연결됨`, and
   confirmed `디자인 팀` remained active.

## Failure Learning

The first miss was a substring event matcher in test infrastructure. SSE event
names now match exact event lines. The second miss was a hidden feedback path:
the token action and its status now share the active team panel.

A memory note was not added because both misses are product-specific and are
covered by focused server, transport, and Playwright regressions plus this delta.

## Remaining Boundary

Named per-token records and individual revocation, multi-instance identity
storage, hosted durable pub/sub, receipt retention, and deploy automation remain
open. Deployment remains non-gating.
