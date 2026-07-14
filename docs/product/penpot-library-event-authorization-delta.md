# Penpot Library Event Authorization Delta

Date: 2026-07-14  
PR: #299

## Benchmark Decision

Penpot treats shared libraries as team-owned design-system resources. Layo adopts
that ownership boundary for live registry updates, adapts delivery to its
local-first shared-filesystem event log, and deliberately keeps unconfigured
single-user streaming available.

Native EventSource was not retained because it cannot send Layo's existing
member Authorization and X-Layo-User-Id headers. The browser now uses a fetch
SSE reader. Bearer credentials never enter the URL.

## Product Boundary

- Configured streams authenticate before Fastify hijacks the response.
- File-scoped streams require read access to the exact target-file team.
- Unscoped streams filter every event to the authenticated member's teams.
- Private legacy events and other-team events do not enter hosted streams.
- Browser requests send the activated member headers.
- Incremental SSE parsing ignores malformed records, tracks the last sequence,
  resumes a closed stream with the updated after cursor, and aborts on cleanup.
- Unconfigured local-first streams preserve the previous behavior.

## Exact Failed Cases

- HTTP RED `29296041799`: an unauthenticated configured stream returned 200
  instead of 401.
- Web contract RED `29296184944`: the subscription API could not represent
  member credentials or a fetch transport.
- Browser run `29296449241`: the credential assertion registered after the
  long-lived stream had already opened and timed out on both attempts.
- Browser run `29297507361`: live refresh overwrote the explicit publication
  status, and pre-existing tests read asynchronous persisted state too early.
- Verification runs also exposed an ENOTEMPTY storage-cleanup race and several
  one-shot persistence assertions. Cleanup now uses bounded Node rm retries and
  affected mutation checks poll the server's persisted state.

## Verification

- Code-head Full Verification `29298859382`, job `86978192513`:
  252 web tests, 294 server tests, Rust workspace tests, and 193 Playwright CLI
  cases passed with no retry or flaky case.
- Direct Playwright interaction activated a member token, observed
  Authorization and X-Layo-User-Id on the fetch stream, suppressed polling,
  republished a shared library, and observed the update-available UI through
  the stream.
- The shared-storage HTTP test proves 401 missing credentials, 403 wrong-team
  file access, same-team event delivery, and unscoped member-team filtering.

## Failure Learning

The first browser assertion assumed a future request even though the session
activation had already opened a durable connection. The listener now starts
before activation. Event refresh also used a generic status update that could
erase an explicit user-operation result; background refresh now updates data
without replacing that result.

A memory note was not added because memory writes require an explicit user
request. The durable process evidence is this delta, the updated E2E harness,
and the focused HTTP and browser regressions.

## Remaining Boundary

Credential rotation and revocation, multi-instance transactional registry
storage, receipt retention, and durable pub/sub fanout beyond a shared
filesystem remain separate Penpot maturity loops. Deployment remains
non-gating.
