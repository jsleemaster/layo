# Penpot Team Library Publication Authorization Plan

Status: Completed by PR #295 merge gate  
Date: 2026-07-14  
Benchmark: Penpot team roles and shared libraries

## Exact Failed Case

A hosted Layo server configured for team ownership accepted a viewer's
`POST /libraries` publication and wrote registry state because publication
trusted only the source file's team id. The browser and MCP paths also had no
usable member principal contract.

## Benchmark Decision

- Adopt: Penpot's owner/editor write and viewer read-only library role boundary.
- Adapt: reuse Layo's existing team member id plus token/token-hash model and
  keep credentials process-local or runtime-only.
- Diverge: authorization is opt-in so unconfigured local-first installations
  remain usable without a hosted identity service.

References:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/user-guide/design-systems/libraries/

## Execution

1. RED HTTP viewer, invalid-token, wrong-team, and no-write publication cases.
2. Share one credential parser and role policy across HTTP and MCP.
3. Send the active browser team member id/token without exporting secrets.
4. Add parser, web API, MCP, HTTP, and direct Playwright interaction coverage.
5. Run full verification, review the PR, merge, and perform post-merge cleanup.

## Evidence

- HTTP RED `29283071209`: viewer publication returned 200 instead of 403.
- Browser API RED `29283735052`: the publication helper had no credential contract.
- MCP RED `29283903958`: the MCP server had no principal options.
- Validation RED `29284023373`: blank user ids were accepted by configuration.
- GREEN `29284459320`: maturity/design gates, typecheck, build, 251 web,
  288 server, Rust workspace, and 193 Playwright CLI tests passed.
- Restore drill `29284459310` and retention `29284459291` passed.

## Completion Boundary

This plan completes authenticated publication only. Registry import, update,
token replacement, listing visibility by authenticated principal, shared
transactional storage, receipt retention, and durable pub/sub remain separate
exact gaps for the next maturity loops.
