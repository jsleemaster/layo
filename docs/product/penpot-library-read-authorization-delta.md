# Penpot Library Read Authorization Delta

Date: 2026-07-14  
Status: Completed in PR #297

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
- First full run `29288809355` exposed a retry in the spanned-grid
  reorder interaction. Diagnostic run `29289606382` confirmed the browser
  reached the intended drag target but the reorder event could still be lost.
- Failure-learning RED `29290200053` forced a rerender between mousedown and
  mouseup and failed both attempts, proving the drag listener lifecycle race.
- The grid reorder listener now remains mounted across renders and invokes the
  latest dispatch through a ref; the focused E2E preserves the active drag
  through a viewport rerender.
- GREEN `29290833407` passed 251 web tests, 292 server tests, the Rust
  workspace, and 193 Playwright CLI cases with no retry. Restore
  `29290833400` and retention `29290833356` passed.
- External review found that storage's file-scoped compatibility filter includes
  unscoped entries. Review RED `29292379607` returned `private-kit` through
  both HTTP and MCP despite a valid team principal.
- The shared authorization filter now removes unscoped and non-member-team
  entries after every hosted list read. Review GREEN `29292539822` passed 251
  web, 292 server, Rust, and 193 Playwright cases without retry; restore
  `29292539819` and retention `29292539837` passed.
- Direct Playwright interaction clicked the credentialed registry refresh,
  checked activated-session Authorization and X-Layo-User-Id headers, and
  completed publish, review, and import.

## Deliberate Remaining Gaps

Review/preflight routes and registry SSE events still need authenticated
principal filtering. Credential rotation/revocation, shared transactional
storage, receipt retention, durable pub/sub, and backup automation remain open.
