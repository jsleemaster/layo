# Penpot Library Read Authorization Delta

Date: 2026-07-14  
Status: In progress in PR #297

## Product Change

When `LAYO_LIBRARY_REGISTRY_MEMBERS` is configured:

- `GET /libraries` requires a valid member principal;
- unscoped lists include only libraries with a team id assigned to one of the
  member's authorized teams;
- file-scoped lists require membership in the exact target file team;
- viewers retain same-team list access;
- the web editor sends only activated-session credentials;
- MCP filters with its process-local principal.

When auth is not configured, local-first list behavior is unchanged.

## Evidence

- RED `29288230571`: unauthenticated hosted list returned 200 before the
  cross-team assertion could run.
- Contract RED `29288538333`: the first web API overload could not represent
  both fetch injection and member credentials.
- GREEN and direct Playwright evidence: pending.

## Deliberate Remaining Gaps

Review/preflight routes and registry SSE events still need authenticated
principal filtering. Credential rotation/revocation, shared transactional
storage, receipt retention, durable pub/sub, and backup automation remain open.
