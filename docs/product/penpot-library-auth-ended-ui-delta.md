# Penpot Library Authorization Ended UI Delta

Date: 2026-07-14
PR: #302

## Benchmark Decision

Penpot team access is reflected in the current workspace rather than treated as
a permanent client cache. Layo adopts that visible-access boundary and adapts
its Fetch SSE client to distinguish terminal authorization from recoverable
network or storage disconnects.

References:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/technical-guide/developer/subsystems/authentication/
- https://github.com/penpot/penpot/blob/develop/backend/resources/app/templates/api-doc.tmpl

## Exact Failed Case

The browser ignored `library-registry-authorization-ended`, reached EOF, and
scheduled another fetch with the same inactive credential. RED Full Verification
`29302534496`, job `86989099671`, failed because the terminal callback was
empty and a second request occurred.

## Product Boundary

- The transport recognizes `credential_inactive` and
  `team_access_revoked` terminal SSE records.
- Direct HTTP 401 and 403 stream responses map to the same terminal codes.
- Terminal authorization fires exactly once, clears pending reconnect timers,
  aborts the active fetch, and never schedules another request.
- Ordinary EOF and recoverable errors retain cursor-based reconnect behavior.
- Credential or file dependency changes create a new subscription and may
  reconnect with new credentials.
- The editor clears registry lists, component review, token review, component
  updates, and token updates when access ends.
- Korean status distinguishes expired credentials from removed team access.
- An access-generation guard discards list/update responses started before the
  authorization-ended transition so stale data cannot reappear.

## Verification

- First GREEN `29302737538`, job `86989720683`: 254 web tests, 297 server
  tests, Rust workspace tests, and 194 Playwright CLI cases passed.
- Self-review race repair GREEN `29303273081`, job `86991399196`: the same
  254/297/Rust/194 gates passed with stale-response coverage.

## Direct Playwright CLI Evidence

The live editor test:

1. Opened the file panel.
2. Published `Protected Team Kit`.
3. Opened the protected registry review.
4. Started a list refresh and held its network response.
5. Delivered `library-registry-authorization-ended`.
6. Observed `팀 인증이 만료되었습니다. 새 멤버 토큰으로 다시 연결해 주세요.`.
7. Released the stale response and verified the protected list and review did
   not return.
8. Waited 1.25 seconds and confirmed only one stream request occurred.

## Failure Learning

Clearing visible state was insufficient while old authenticated requests were
still in flight. The repair now invalidates response ownership with a generation
counter before clearing state. The delayed-response Playwright regression proves
the ordering rather than only the final happy path.

A memory note was not added because the miss was found during code self-review
and is durably covered in transport and browser tests.

## Remaining Boundary

First-class token replacement/rotation UI, dynamic server identity reload,
per-token revocation records, multi-instance identity storage, receipt
retention, and durable pub/sub remain open. Deployment remains non-gating.
