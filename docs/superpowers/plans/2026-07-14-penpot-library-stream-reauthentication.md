# Penpot Team Library Stream Reauthentication Plan

Status: Completed by PR #301 merge gate
Date: 2026-07-14

## Exact Failed Case

A configured member opens `GET /libraries/events` while its credential is
valid. If that credential then reaches `expiresAt` or `revokedAt`, the
long-lived stream keeps polling with the authenticated-member snapshot captured
at connection time and does not terminate.

## Penpot Reference

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/technical-guide/developer/subsystems/authentication/
- https://github.com/penpot/penpot/blob/develop/backend/resources/app/templates/api-doc.tmpl

Penpot treats file access as current team permission and documents authenticated
Fetch-based SSE. Layo adopts the current-access boundary and adapts it to its
self-hosted registry event stream.

## Maturity Gate

Operations and team workflow: credential withdrawal must affect live access, not
only the next ordinary request.

## TDD Loop

1. Open a configured registry stream with a valid member credential.
2. Move the same configured credential into an elapsed lifecycle state.
3. Prove the current stream remains open beyond a registry poll interval.
4. Re-authenticate and re-authorize before every event-log poll.
5. Emit a stable authorization-ended event and close the stream without leaking
   credential details.
6. Preserve unconfigured local-first streaming and authorized cursor filtering.
7. Run the full TypeScript, Rust, build, and Playwright CLI gates.

## Completion Evidence

- RED Full Verification `29301331244`, job `86985535747`: the
  stream remained open for 1.25 seconds after the member credential became
  expired and failed with `expected false to be true`.
- GREEN Full Verification `29301471160`, job `86985943567`: 252 web tests,
  297 server tests, Rust workspace tests, and 193 Playwright CLI cases passed.
- The focused HTTP test proves a valid connection receives `ready`, then emits
  `library-registry-authorization-ended` without token material and reaches
  EOF after the configured credential becomes inactive.
- Product evidence:
  `docs/product/penpot-library-stream-reauthentication-delta.md`.

## Failure Learning

Root cause: the stream captured one authenticated member at connection time and
reused that snapshot for every event-log poll. The repair moves authentication
and exact-file team authorization ahead of every poll. Only 401/403 closes the
stream; storage failures preserve the existing recoverable error behavior.

A memory note was not added because this was a previously documented product
boundary rather than an agent-process miss.

## Remaining Boundary

The web fetch-SSE client currently retries after the server closes an
authorization-ended stream. Those retries cannot regain access because the
server rejects them, but terminal 401/403 retry suppression and explicit Korean
session-expired UI remain the next product loop. Dynamic configuration reload,
per-token revocation records, multi-instance identity storage, receipt
retention, and durable pub/sub also remain open.
