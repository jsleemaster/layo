# Penpot Named Token Revocation Plan

Date: 2026-07-14
Status: Verification pending
PR: #305

## Goal

Close the next identity-lifecycle gap after PR #304 by supporting named,
individually revocable member token records without breaking legacy
member-level credentials.

## Penpot Benchmark Decision

Penpot personal access tokens have operator-visible names, expiration, and
individual deletion. Layo adopts stable token identity and per-token lifecycle
controls, and adapts deletion to a retained `revokedAt` record so self-hosted
operators keep deterministic audit context.

References:

- https://help.penpot.app/technical-guide/integration/
- https://help.penpot.app/user-guide/account-teams/teams/

## Exact Failed Case

The existing member credential model could overlap hashes and revoke or expire
the entire member, but it could not identify, expire, or revoke one named token
while preserving another token for the same member.

## TDD Loop

- [x] Add focused named-token identity, sibling isolation, duplicate-id, and
  watched individual-revocation tests.
- [x] Capture RED Full Verification `29308411441`, job `87006764257`, in
  core tests.
- [x] Add backward-compatible `tokens` records with stable `id`, `name`,
  secret/hash fields, and independent lifecycle timestamps.
- [x] Return secret-free `tokenId` and `tokenName` authentication metadata.
- [x] Cover HTTP and MCP registry authorization with named token records.
- [ ] Pass final full verification, review, merge, and cleanup.

## Product Boundary

Legacy member-level credentials remain valid. Token records are operator-owned
configuration, token IDs must be unique per member, and token names need not be
globally unique. This slice does not add a hosted token-administration UI,
database identity store, or retained authorization receipts.

Deployment remains non-gating.
