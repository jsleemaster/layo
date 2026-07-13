# Penpot Library Publication Authorization Delta

Date: 2026-07-14  
Status: In progress in PR #295

## Benchmark

Penpot's team model gives owners and editors library management capability,
while viewers can inspect and comment without editing team assets. Layo adopts
that write boundary for publishing and adapts it to its local-first,
team-owned deployment model.

Sources:

- https://help.penpot.app/user-guide/account-teams/teams/
- https://help.penpot.app/user-guide/design-systems/libraries/

## Product Change

When `LAYO_LIBRARY_REGISTRY_MEMBERS` is configured:

- HTTP `POST /libraries` requires a bearer member token and
  `X-Layo-User-Id`.
- The source file must be team-shared, the member must belong to that exact
  team, and the role must be owner or editor.
- Viewer, invalid-token, wrong-team, and private-file failures occur before a
  registry publication write.
- The web editor forwards the active team's current user id and runtime member
  token. It does not add the token to exported team manifests.
- MCP uses process-local `LAYO_MCP_USER_ID` and
  `LAYO_MCP_MEMBER_TOKEN` and applies the same policy before publication.
- Unconfigured local-first servers preserve the existing open local workflow.

Prefer SHA-256 `tokenHash` entries in hosted configuration. Plain `token`
entries exist for local development compatibility.

## Failure Learning Evidence

- `29283071209`: HTTP viewer publication incorrectly succeeded.
- `29283735052`: browser publication had no credential parameter.
- `29283903958`: MCP publication had no injected principal.
- `29284023373`: configuration accepted a blank member id.
- Final GREEN and direct Playwright evidence: pending.

## Deliberate Remaining Gaps

This delta does not claim complete hosted registry ownership. Authenticated
authorization still needs to cover registry import/update/token mutations and
principal-filtered reads. Multi-instance transactional metadata/object storage,
credential rotation and revocation, receipt retention, durable pub/sub, and
backup automation remain open.
