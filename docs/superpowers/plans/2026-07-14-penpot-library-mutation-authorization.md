# Penpot Team Library Mutation Authorization Plan

Status: Active  
Date: 2026-07-14  
PR: #296

## Exact Failed Case

After an editor publishes a same-team library, a configured viewer can call the
registry import route, receive 200, and create target subscription/document
state. The same missing target-principal check applies to token import and both
component/token update routes in HTTP, web, and MCP.

## Benchmark Decision

- Adopt Penpot's viewer read-only and owner/editor library-management boundary.
- Adapt the merged Layo member token policy to the target file's exact team.
- Keep review/preflight routes readable by viewers.
- Keep authorization opt-in for unconfigured local-first installations.

References:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/user-guide/design-systems/libraries/

## Execution

1. RED viewer HTTP import and prove no subscription write.
2. Guard component import, token import, component update, and token update.
3. Forward activated-session credentials from web and process-local MCP.
4. Cover HTTP, web API, MCP, and direct Playwright publish/import interaction.
5. Run full verification, review, merge, and post-merge cleanup.

## Evidence

- RED `29286183142`: viewer import returned 200 instead of 403.
- GREEN: pending.

## Remaining Boundary

Principal-filtered registry reads, member credential rotation/revocation,
multi-instance transactional storage, receipt retention, durable pub/sub, and
backup automation remain later exact loops.
