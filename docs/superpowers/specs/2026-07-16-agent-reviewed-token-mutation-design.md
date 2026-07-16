# Agent-Reviewed Token Mutation Design

Last checked: 2026-07-16

## Reference

Layo **adapts** Penpot's account-level access-token lifecycle at Penpot
`develop` commit `c50ec233aefed813497266f264f0ee4896387d9b`:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/mcp/
- https://github.com/penpot/penpot/commit/c50ec233aefed813497266f264f0ee4896387d9b

Penpot exposes descriptive names, bounded expiry choices, one-time secret copy,
metadata listing, and deletion. Its documented account token flow is
human-operated. Layo preserves that workflow and adapts its deterministic agent
control by requiring an authenticated review receipt before MCP token mutation.

## Decision

The existing `create_account_token` and `revoke_account_token` MCP tools gain
`dryRun`, defaulting to `true`. Shared authorization can issue reviewed
mutations when the operator configures
`LAYO_AUTHORIZATION_REVIEW_SIGNING_KEY` with at least 32 UTF-8 bytes.

A preview:

- re-authenticates the principal against the locked shared snapshot,
- validates the exact canonical mutation,
- returns no plaintext token, token hash, or token identifier generated for a
  future create,
- describes the relative token lifetime instead of predicting a commit-time
  absolute expiry,
- returns the exact PostgreSQL authorization generation and a short-lived,
  HMAC-SHA-256 authenticated receipt only when `changed: true`,
- performs no authorization-state write and appends no audit event.

The receipt binds version, shared scope, authenticated user id, canonical
operation digest, generation, issued/expiry times, and a random nonce. The
client treats it as opaque. Commit supplies the same mutation and receipt.
Inside the PostgreSQL row-locked transaction Layo verifies signature, scope,
principal, operation digest, expiry, and exact generation before invoking token
ID or secret generators.

Every receipted operation changes authorization state and therefore advances
the generation. The first successful commit makes replay stale. A no-op revoke
preview returns `changed: false` with no receipt, so it cannot be committed or
produce duplicate audit history.

Filesystem authorization deliberately does not advertise reviewed mutation. It
has no shared monotonic generation. Existing HTTP and Korean human UI mutations
remain direct and unchanged.

## Contract

A review response includes:

- `type`: `create` or `revoke`;
- `expectedGeneration`: exact decimal PostgreSQL bigint string;
- `changed`: whether the operation would change state;
- `summary`: stable, secret-free mutation metadata;
- `receipt` and `receiptExpiresAt` only when `changed: true`.

Create summary contains the canonical name and `expiresInDays`, not an
absolute token expiry. Revoke summary contains the current target metadata.
The commit response remains the existing create/revoke result. Create returns a
plaintext token once only after a successful receipt-checked commit.

## Failure Handling

- Missing receipt on commit: validation error.
- Invalid signature, cross-principal use, input tampering, scope mismatch, or
  expiry: validation or authorization error with no write.
- Generation changed after preview or receipt replay: conflict before token
  material generation.
- Preview without shared PostgreSQL authorization and signing key: unavailable.
- Unauthorized principal: existing authentication error without generation or
  target disclosure.
- Already revoked target: `changed: false`, no receipt, no commit, and no
  duplicate audit event.

## Verification

TDD evidence must include:

- secret-free no-write/no-audit preview;
- mutation-input tampering and cross-principal rejection;
- advancing-clock create proof;
- stale generation and replay rejection before token material generation;
- already-revoked no-receipt behavior;
- self-revocation confirmation in preview and commit;
- two real PostgreSQL connections committing one receipt concurrently, with
  exactly one winner, one generation increment, and one audit event;
- MCP default dry-run, explicit commit, filesystem unavailability, and unchanged
  HTTP/browser flows.

Full verification and direct Playwright CLI account-token interaction are
required before merge.

## Maturity Mapping

This advances benchmark gates 7 (extensibility), 9 (AI workflow), and 10
(failure loop). It does not close general account recovery, hosted identity/SSO,
or multi-region database operations.
