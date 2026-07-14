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
- A matching named record takes precedence over legacy fields, so a revoked
  record cannot fall through to the same legacy secret during migration.
- Authentication fails closed when multiple named records match one bearer
  secret, preventing record ordering from bypassing revocation or audit identity.
- Watched authorization-file reload makes individual revocation effective
  without HTTP or MCP restart.
- Legacy member-level credential fields and member-wide lifecycle timestamps
  remain supported.

## Verification

RED Full Verification `29308411441`, job `87006764257`, passed maturity
gates, typecheck, and build, then failed core tests before named token records
were implemented.

A first review-repair run `29308861636`, job `87008099707`, exposed that
the MCP test helper duplicated and narrowed the production authorization type;
it now consumes `TeamAuthorizationConfig` directly. Security RED
`29309012183`, job `87008553748`, then proved a revoked named token could
fall through to an identical legacy secret. Named-record precedence now blocks
that migration bypass.

GREEN Full Verification `29309298280`, job `87009441293`, passed Penpot
maturity/design gates, repository typecheck, web build, TypeScript and Rust core
tests, and the full Playwright CLI e2e suite. Storage Restore Drill
`29309298314` and Storage Backup Retention `29309298272` also passed.

## Failure Learning

The first miss was test infrastructure type drift. The second and third were
ambiguous same-secret precedence rules across legacy and named credentials.
Shared production types plus legacy and duplicate-named regressions now preserve
fail-closed revocation semantics.

A memory note was not added because these are repository-specific contracts
covered by focused regressions, this delta, and the execution plan.

## Remaining Boundary

Hosted token creation/deletion UI, encrypted identity storage, cross-instance
identity synchronization, retained authorization receipts, and deploy
automation remain open. Deployment remains non-gating.
