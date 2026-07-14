# Penpot Team Library Event Authorization Plan

Status: Active  
Date: 2026-07-14  
PR: pending

## Exact Failed Case

With hosted registry auth enabled, `GET /libraries/events` opens a registry
event stream without authenticating the member or checking the requested file's
team. Browser EventSource cannot send the existing Authorization and
X-Layo-User-Id headers.

## Benchmark Decision

- Adopt Penpot's team-owned live library update boundary.
- Adapt Layo's browser transport from native EventSource to header-capable fetch
  streaming with cursor resume and abort cleanup.
- Do not place bearer tokens or derived secrets in URLs.
- Preserve unconfigured local-first SSE behavior.

## Execution

1. RED missing and wrong-team stream access.
2. Authenticate the stream before hijacking and filter unscoped events by
   principal teams.
3. Add header-capable browser stream parsing, abort, and cursor resume.
4. Verify direct browser request headers and live refresh.
5. Run full verification, review, merge, documentation, and cleanup.

## Evidence

- RED: pending.
- GREEN: pending.

## Remaining Boundary

Credential rotation/revocation, shared transactional storage, receipt
retention, and durable pub/sub remain later exact loops.
