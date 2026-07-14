# Penpot Team Library Stream Reauthentication Plan

Status: Active
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

Pending RED, GREEN, review, and merge evidence.
