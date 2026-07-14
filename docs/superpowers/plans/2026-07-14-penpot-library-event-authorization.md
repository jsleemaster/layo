# Penpot Team Library Event Authorization Plan

Status: Completed by PR #299 merge gate  
Date: 2026-07-14  
PR: #299

## Exact Failed Case

With hosted registry auth enabled, `GET /libraries/events` opened a registry
event stream without authenticating the member or checking the requested file's
team. Native EventSource could not send the existing Authorization and
X-Layo-User-Id headers.

## Benchmark Decision

- Adopt Penpot's team-owned live library update boundary.
- Adapt Layo's browser transport to header-capable fetch streaming with cursor
  resume and abort cleanup.
- Do not place bearer tokens or derived secrets in URLs.
- Preserve unconfigured local-first SSE behavior.

## Delivered

1. Missing credentials return 401 before response hijack.
2. Wrong-team file streams return 403; same-team viewers can subscribe.
3. Unscoped streams filter every event to the member's authorized teams.
4. Browser fetch streaming sends credentials, parses incremental SSE, resumes
   from the latest sequence, and aborts on cleanup.
5. Polling-suppressed Playwright coverage proves live UI refresh.
6. Background event refresh preserves explicit user-operation status.
7. E2E storage cleanup and asynchronous persistence checks are deterministic.

## Evidence

- HTTP RED: `29296041799`, expected 401 but received 200.
- Web RED: `29296184944`, missing credentials contract.
- Interaction failure: `29296449241`, request listener registered after the
  durable stream opened.
- Status and verification failures: `29297507361`, `29298061859`, and
  `29298472132`.
- GREEN: `29298859382`, job `86978192513`; 252 web, 294 server, Rust,
  and 193 Playwright CLI cases passed without retry.

## Product Evidence

See `docs/product/penpot-library-event-authorization-delta.md`.

## Remaining Boundary

Credential rotation/revocation, shared transactional storage, receipt
retention, and durable pub/sub remain later exact loops.
