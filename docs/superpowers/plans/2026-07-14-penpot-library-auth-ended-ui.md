# Penpot Library Authorization Ended UI Plan

Status: Completed by PR #302 merge gate
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

- RED Full Verification `29302534496`, job `86989099671`: the terminal
  callback remained empty and the stream issued a second fetch.
- First GREEN `29302737538`, job `86989720683`: terminal parsing, direct
  401/403 handling, Korean status, cache clearing, 254 web tests, 297 server
  tests, Rust, and 194 Playwright CLI cases passed.
- Self-review added access-generation guards after finding that an in-flight
  registry response could repopulate protected state after authorization ended.
- Final code-head GREEN `29303273081`, job `86991399196`: 254 web, 297
  server, Rust, and 194 Playwright CLI cases passed with the stale-response race.
- Product evidence:
  `docs/product/penpot-library-auth-ended-ui-delta.md`.

## Direct Playwright Interaction

The live editor test opened the file panel, published `Protected Team Kit`,
opened its review, started and held a real list refresh, delivered the terminal
SSE event, observed the Korean expiry status, released the stale list response,
verified the list and review stayed removed, then waited 1.25 seconds and
confirmed the stream request count remained one.

## Failure Learning

The initial repair cleared React state but did not invalidate already-running
registry requests. Their responses could arrive after the terminal event and
restore protected data. The access-generation ref now invalidates every prior
request on authorization end and on file/credential subscription changes. The
Playwright race keeps that ordering durable.

A memory note was not added because this was a code-path self-review finding
captured by focused transport and browser regressions, not a recurring agent
workflow miss.

## Remaining Boundary

The UI tells the member to reconnect but does not yet provide first-class token
rotation/replacement controls or server-driven dynamic identity reload.
Per-token revocation records, multi-instance identity storage, receipt
retention, and durable pub/sub remain open.
