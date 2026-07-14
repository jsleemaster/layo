# Penpot Library Authorization Ended UI Plan

Status: Active
Date: 2026-07-14

## Exact Failed Case

The server now emits `library-registry-authorization-ended` and closes an
inactive member stream. The browser parser ignores that event, treats EOF as a
recoverable disconnect, and reconnects forever with the same terminal
credential. The editor also keeps protected registry lists and gives no Korean
reauthentication status.

## Benchmark Decision

- Adopt Penpot's current team-access boundary in visible client state.
- Adapt Layo's Fetch SSE transport to distinguish terminal authorization from
  recoverable network/storage disconnects.
- Clear protected registry cache and review state when access ends.
- Preserve ordinary EOF/error cursor reconnect and credential-change
  resubscription.

## TDD Loop

1. Prove a terminal SSE event is ignored and causes a second fetch.
2. Parse stable terminal codes and suppress reconnect for the subscription.
3. Treat direct 401/403 fetch responses as the same terminal state.
4. Clear protected library data and show Korean credential/team-access guidance.
5. Prove the visible state and single-request behavior with Playwright CLI.
6. Run full TypeScript, Rust, build, and browser gates.

## Completion Evidence

Pending RED, GREEN, direct interaction, review, and merge evidence.
