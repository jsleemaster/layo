# Penpot Team Library Review Authorization Plan

Status: Active  
Date: 2026-07-14  
PR: pending

## Exact Failed Case

With hosted registry auth enabled, library review/preflight and
subscription/update reads do not authenticate a member principal. A team-alpha
viewer can inspect a team-beta target file's registry review and update state,
and missing credentials also succeed.

## Benchmark Decision

- Adopt Penpot's team-owned library review boundary.
- Adapt Layo's existing member principal and same-team viewer read policy to
  registry review, subscription, and update surfaces.
- Preserve unconfigured local-first behavior.
- Keep registry event-stream authorization as the next separate architecture
  loop because browser EventSource cannot send the existing custom headers.

References:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/user-guide/design-systems/libraries/

## Execution

1. RED missing and wrong-team HTTP review authorization.
2. Add one shared exact-target-team read guard to HTTP and MCP review/preflight
   and subscription/update paths.
3. Send activated-session credentials from all web registry read helpers.
4. Cover no-credential, wrong-team, same-team viewer, MCP, and direct browser
   interaction.
5. Run full verification, review, merge, documentation cleanup, and post-merge
   cleanup.

## Evidence

- RED: pending.
- GREEN: pending.

## Remaining Boundary

Registry SSE event authorization, credential rotation/revocation, shared
transactional storage, receipt retention, and durable pub/sub remain later
exact loops.
