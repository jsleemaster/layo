# Penpot Library Review Authorization Delta

Date: 2026-07-14  
Status: Completed in PR #298

## Product Change

When `LAYO_LIBRARY_REGISTRY_MEMBERS` is configured:

- registry component, token, and component-update reviews require a valid member
  of the exact target-file team;
- component/token subscription and update reads require the same exact-team
  viewer authorization;
- MCP review tools enforce the process-local principal;
- unscoped MCP subscription/update lists filter every record by its target
  file's authorized team;
- the web editor sends only activated-session credentials for review and update
  polling.

When hosted registry auth is not configured, local-first behavior is unchanged.

## Evidence

- HTTP RED `29293745767`: unauthenticated team-beta review returned 200
  instead of 401.
- MCP RED `29294139347`: a team-alpha principal received the complete
  team-beta review payload.
- Web contract RED `29294420834`: all seven read helpers rejected the new
  credentials argument with TS2554.
- GREEN `29294574049` passed 251 web tests, 294 server tests, the Rust
  workspace, and 193 Playwright CLI cases without retry.
- Restore `29294574061` and retention `29294574028` passed.
- Direct Playwright interaction refreshed registry updates and opened a registry
  review, verifying `Authorization` and `X-Layo-User-Id` from the activated
  team session before completing the existing import flow.

## Deliberate Remaining Gaps

Registry SSE event authorization remains a separate transport loop because
browser EventSource cannot send the current member headers. Credential
rotation/revocation, shared transactional storage, receipt retention, and
durable pub/sub remain open.
