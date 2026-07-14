# Penpot Named Token Revocation Delta

Date: 2026-07-14
PR: #305

## Benchmark Decision

Penpot personal access tokens are named, expiring credentials that can be
deleted individually. Layo adopts that team-product expectation while adapting
it to operator-owned local-first authorization files: each token has a stable
ID, display name, secret or hash material, and independent lifecycle timestamps.

References:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/user-guide/account-teams/teams/

## Exact Failed Case

Layo previously modeled secrets and overlap hashes directly on a member.
Revoking `revokedAt` therefore disabled every credential for that member, and
successful authorization could not identify which credential was used.

## Product Change

- A member may define non-empty `tokens` records with unique `id` values and
  non-empty operator-facing `name` values.
- Each record supports `token`, `tokenHash`, or overlap `tokenHashes`, plus
  independent `notBefore`, `expiresAt`, and `revokedAt`.
- Authentication accepts only an active matching token and returns secret-free
  `tokenId` and `tokenName` metadata.
- Revoking one record does not invalidate active sibling tokens.
- Watched authorization-file reload makes individual revocation effective
  without HTTP or MCP restart.
- Legacy member-level credential fields and member-wide lifecycle timestamps
  remain supported.

## Verification

RED Full Verification `29308411441`, job `87006764257`, passed maturity
gates, typecheck, and build, then failed core tests before named token records
were implemented.

Final GREEN evidence is pending.

## Remaining Boundary

Hosted token creation/deletion UI, encrypted identity storage, cross-instance
identity synchronization, retained authorization receipts, and deploy
automation remain open. Deployment remains non-gating.
