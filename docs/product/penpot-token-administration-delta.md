# Penpot Token Administration Delta

Date: 2026-07-14
PR: #306

## Penpot Comparison

Penpot exposes account-level personal access token creation with a descriptive
name and expiry choice, reveals the generated value for copying, lists existing
tokens, and allows individual deletion. Layo adopts this member-controlled
lifecycle and deliberately adapts storage to a self-hosted file authority.

## Product Change

- File-backed team authorization can create cryptographically random named
  tokens with Never, 30, 60, 90, or 180 day expiry.
- Only the creation result contains the plaintext token.
- The operator file stores SHA-256 hashes and lifecycle metadata.
- Listing returns metadata only.
- Individual revoke retains an auditable `revokedAt` timestamp and does not
  invalidate sibling credentials.
- Restart reparses the same persisted state.
- `GET /account/tokens`, `POST /account/tokens`, and
  `DELETE /account/tokens/:tokenId` derive the member from authenticated
  headers, preventing cross-user administration.
- Static `LAYO_LIBRARY_REGISTRY_MEMBERS` configuration remains read-only and
  returns 503 for administration.

## Failure Learning

The initial revocation regression mixed an injected future management clock with
the runner's real authentication clock. Authentication correctly considered the
future revocation inactive. The test now passes the same injected clock to every
lifecycle assertion, so it proves the intended instant without depending on wall
time.

External review then identified that a member mutation could clone stale watched
memory and overwrite an operator edit made before the next poll. The focused
regression delays the watcher, writes an operator revocation plus a new member,
then creates a token. Management mutations now reparse the current file
immediately before writing, preserving both operator changes and the revocation.

## Verification

- Full Verification `29313857844` passed maturity/design gates, typecheck,
  web build, core tests, Rust workspace tests, and the full Playwright CLI suite.
- Storage Restore Drill `29313857687` passed.
- Storage Backup Retention `29313857689` passed.
- Deployment remained non-gating because Vercel exhausted the free daily
  deployment quota.

## Remaining Gaps

- MCP self-service token administration is not yet exposed.
- Multiple server processes can still race on the shared JSON file; a
  cross-process lock or transactional identity store is required.
- Account recovery, token audit events, UI management, and broader hosted
  identity storage remain below Penpot team-product maturity.
