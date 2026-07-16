# Penpot Agent-Reviewed Token Mutation Delta

Last checked: 2026-07-16

## Reference And Decision

Layo **adapts** Penpot's account access-token lifecycle and MCP direction at
Penpot `develop` commit
`c50ec233aefed813497266f264f0ee4896387d9b`:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/mcp/
- https://github.com/penpot/penpot/commit/c50ec233aefed813497266f264f0ee4896387d9b

Penpot documents human account-token creation, one-time copy, expiry, listing,
and deletion. Layo retains that human workflow and adds a deterministic,
agent-reviewable mutation boundary instead of copying Penpot's hosted account
architecture.

## Product Delta

When shared PostgreSQL authorization and
`LAYO_AUTHORIZATION_REVIEW_SIGNING_KEY` are configured:

- MCP create/revoke defaults to `dryRun: true`.
- Review authenticates against the locked shared snapshot and returns a
  secret-free summary.
- Changed reviews return a five-minute HMAC-SHA-256 receipt.
- The receipt binds version, scope, principal, canonical operation digest,
  exact generation, issue/expiry timestamps, and nonce.
- Commit requires `dryRun: false`, the same operation, and that receipt.
- Signature, principal, operation, expiry, and generation are checked inside
  the PostgreSQL row lock before token ID or secret generation.
- One successful changed commit advances the generation, so replay is stale.
- Already-applied revocation returns `changed: false` without a receipt and
  cannot append duplicate audit history.

Create review shows the relative `expiresInDays`; the absolute token expiry is
calculated at commit time. Filesystem MCP token mutation is intentionally
unavailable because it has no shared monotonic generation. Existing direct HTTP
and Korean browser management remain compatible.

## Failure Learning

Initial RED Full Verification `29478432655` mixed the intended missing
contract with implicit-any fixture errors. The corrected RED
`29478548306` failed only on missing review/signing/receipt types.

Independent design review then found that a bare generation could authorize a
different operation, preview-time absolute expiry could drift, and an in-memory
test could not prove row-lock behavior. The design was replaced before GREEN
with a principal/operation-bound authenticated receipt, relative expiry review,
replay handling, and a two-connection PostgreSQL concurrency test.

Full `29479346079` reached Core and exposed twelve legacy MCP tests whose
availability error preceded credential authentication. MCP now performs a
read-only current-credential check before reporting that reviewed mutation is
unavailable.

Full `29479619577` passed gates, typecheck, build, serverless imports, and all
476 Core tests, including one-winner cross-host receipt commit, then failed
Playwright 200/201 because the historical stdio e2e still expected direct
filesystem MCP mutation. That exact case now verifies refusal, unchanged base
bytes, and absent sidecar. Browser HTTP/UI mutation remains covered separately.

## Security And Operations

The signing key must contain at least 32 UTF-8 bytes and be identical across
instances sharing a scope. It is never serialized into receipts, audit rows,
exports, or responses. Rotation invalidates outstanding five-minute receipts
without changing token state.

Receipts are authenticated, not encrypted. Their payload contains only
secret-free scope, user, digest, generation, timing, and nonce metadata. Clients
must treat the receipt as opaque.

## Maturity Effect

This advances:

- gate 7: extensibility through a reviewable MCP mutation contract;
- gate 9: deterministic AI workflow with dry-run and exact commit evidence;
- gate 10: repeated failure learning with focused unit, PostgreSQL, MCP, and
  Playwright CLI regression coverage.

General account recovery, hosted identity/SSO, multi-region database
operations, and broader agent-reviewed administrative mutations remain open.
Deployment remains deferred because required Vercel/GitHub Actions secrets are
absent; it is not a gate for this local-first product slice.
