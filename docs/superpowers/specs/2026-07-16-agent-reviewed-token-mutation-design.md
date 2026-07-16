# Agent-Reviewed Token Mutation Design

Last checked: 2026-07-16

## Reference

Layo **adapts** Penpot's account-level access-token lifecycle at Penpot
`develop` commit `c50ec233aefed813497266f264f0ee4896387d9b`:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/mcp/
- https://github.com/penpot/penpot/commit/c50ec233aefed813497266f264f0ee4896387d9b

Penpot exposes descriptive names, bounded expiry choices, one-time secret copy,
metadata listing, and deletion. Penpot MCP can read and write the focused design
context, but its documented account token flow is human-operated. Layo preserves
that human workflow and adapts its deterministic agent-control advantage by
requiring an explicit review boundary before MCP token mutations.

## Decision

The existing `create_account_token` and `revoke_account_token` MCP tools gain
`dryRun`, defaulting to `true`. A preview:

- authenticates and authorizes the same principal as commit,
- validates the exact mutation input,
- returns no plaintext secret or hash,
- returns the current exact PostgreSQL authorization `expectedGeneration`,
- describes the projected create or revoke effect and whether it changes state,
- performs no state write and appends no audit event.

A commit requires `dryRun: false` and the preview's
`expectedGeneration`. The shared PostgreSQL manager compares that generation
inside the same locked transaction that re-authenticates and applies the
mutation. A mismatch returns a conflict before random token material is
generated or state is changed.

The filesystem manager deliberately does not advertise reviewed mutation. It
cannot prove a shared monotonic generation, so MCP preview/commit is unavailable
until shared PostgreSQL authorization is configured. Existing HTTP and Korean
human UI mutations remain direct and unchanged.

## Contract

A review response is secret-free and includes:

- `type`: `create` or `revoke`;
- `expectedGeneration`: exact decimal string;
- `changed`: whether committing the reviewed input would change state;
- `summary`: stable mutation metadata suitable for agent review.

The commit response remains the existing create/revoke result. Create returns a
plaintext token once only after successful generation-checked commit. Revoke
retains the existing self-revocation confirmation guard.

## Failure Handling

- Missing `expectedGeneration` on commit: validation error.
- Malformed or out-of-range generation: validation error.
- Generation changed after preview: conflict with no write, no secret
  generation, and no audit event.
- Preview against filesystem authorization: unavailable.
- Unauthorized principal: the same authentication/role error as direct
  management, without revealing generation or target metadata.
- Already revoked target: preview reports `changed: false`; commit remains
  idempotent and does not append a duplicate audit event.

## Verification

TDD evidence must cover preview no-write/no-secret behavior, stale-generation
conflict, exact-generation commit, self-revocation confirmation, unavailable
filesystem mode, MCP annotations and schemas, and preservation of HTTP/browser
flows. Full verification and direct Playwright CLI account-token interaction are
required before merge.

## Maturity Mapping

This advances benchmark gates 7 (extensibility), 9 (AI workflow), and 10
(failure loop). It does not close general account recovery, hosted identity/SSO,
or multi-region database operations.
