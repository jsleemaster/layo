# Penpot Library Stream Reauthentication Delta

Date: 2026-07-14
PR: #301

## Benchmark Decision

Penpot evaluates project and file access from current team membership and
documents authenticated Fetch-based SSE for API streams. Layo adopts the
continued-access boundary and adapts it to the shared-filesystem library event
log.

References:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/technical-guide/developer/subsystems/authentication/
- https://github.com/penpot/penpot/blob/develop/backend/resources/app/templates/api-doc.tmpl

## Exact Failed Case

A member opened `GET /libraries/events` with a valid credential. The test then
moved the same configured credential to an elapsed `expiresAt`. RED Full
Verification `29301331244`, job `86985535747`, proved the stream remained
open beyond five 250ms event polls and failed with `expected false to be true`.

## Product Boundary

- Every configured registry event poll authenticates the current request
  headers again before reading event storage.
- File-scoped streams re-authorize the current member against the exact current
  file team before each poll.
- A 401 emits `library-registry-authorization-ended` with
  `credential_inactive`, clears stream timers, and ends the response.
- A 403 uses `team_access_revoked` and follows the same close path.
- Authorization-ended payloads never include token material or internal error
  messages.
- Non-authorization storage errors continue to emit
  `library-registry-error` without closing the stream.
- Unconfigured local-first streams preserve their existing behavior.
- Cursor filtering still advances across all fetched events before emitting
  only currently authorized team events.

## Verification

GREEN Full Verification `29301471160`, job `86985943567`, passed maturity
and design gates, typecheck, web build, 252 web tests, 297 server tests, Rust
workspace tests, and all 193 Playwright CLI cases.

This slice changes a server security boundary without adding UI. The focused
real HTTP streaming test verifies headers, live lifecycle transition, stable
termination event, secret absence, and EOF; the full Playwright CLI suite proves
existing browser workflows remain compatible.

## Failure Learning

The prior implementation treated connection-time authentication as sufficient
for a long-lived response. Long-lived authorization must instead be evaluated
at the operation boundary that can disclose new data, which is each event-log
poll. The regression test preserves that invariant.

A memory note was not added because the gap was already explicitly routed from
PR #300 and did not reflect a new agent-process failure.

## Remaining Boundary

The browser fetch-SSE client cannot regain access with an inactive credential,
but currently retries terminal 401/403 responses. Retry suppression and explicit
Korean session-expired UI are the next exact loop. Dynamic configuration reload,
per-token revocation records, multi-instance identity storage, receipt
retention, and durable pub/sub remain open. Deployment remains non-gating.
