# Penpot Library Credential Lifecycle Delta

Date: 2026-07-14
PR: #300

## Benchmark Decision

Penpot team access is not a permanent document attribute. Layo adopts the same
withdrawable-access expectation and adapts it to self-hosted member credentials
loaded from `LAYO_LIBRARY_REGISTRY_MEMBERS`. Existing plaintext `token` and
single `tokenHash` entries remain valid during migration.

## Product Boundary

- `notBefore` rejects credentials before their activation instant.
- `expiresAt` rejects credentials at and after the expiry instant.
- `revokedAt` rejects credentials at and after the revocation instant.
- Every lifecycle timestamp must parse as an ISO-compatible date.
- `expiresAt` must be later than `notBefore`.
- `tokenHashes` accepts a deduplicated list of SHA-256 hashes so operators can
  overlap old and new token material during a controlled rotation.
- HTTP and MCP library operations inherit the policy from the shared
  `authenticateTeamMember` boundary.
- Unconfigured local-first operation remains unchanged.

## Exact Failed Case

RED Full Verification `29300060591`, job `86981759517`, proved that an
already expired or revoked credential still authenticated. The focused test
failed with `expected callback to throw`, while the other authorization tests
passed.

## Verification

GREEN Full Verification `29300218356`, job `86982214512`, passed maturity
and design gates, typecheck, web build, 252 web tests, 296 server tests, Rust
workspace tests, and all 193 Playwright CLI cases.

This slice has no new UI interaction. The full Playwright CLI suite verifies
that the existing authenticated browser workflows remain compatible.

## Review Notes

The lifecycle comparison uses inclusive cutoff semantics: credentials are
invalid exactly at `expiresAt` and `revokedAt`. Token hashes are normalized
to lowercase and deduplicated before matching with timing-safe comparison.

## Remaining Boundary

The environment configuration is process-local and replacement requires a
restart, which closes existing streams. Scheduled expiry is evaluated on the
next HTTP request or MCP tool call; an already-open SSE stream is not
re-authenticated until reconnect. Per-token revocation, dynamic configuration
reload, multi-instance identity storage, receipt retention, and durable pub/sub
remain separate maturity loops. Deployment remains non-gating.
