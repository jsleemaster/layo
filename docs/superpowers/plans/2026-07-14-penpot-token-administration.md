# Penpot Token Administration Plan

Date: 2026-07-14
Status: Completed by PR #306 merge gate

## Benchmark Decision

Penpot personal access tokens are account-scoped, named, created with a bounded
or unlimited lifetime, revealed once, listed as metadata, and individually
deleted. Layo adopts that lifecycle while adapting persistence to its
self-hosted local-first architecture: an operator-owned watched JSON file is the
authority, generated secrets are stored only as SHA-256 hashes, and deletion is
represented by a durable `revokedAt` timestamp for auditability.

## Failed Case

Layo supported operator-authored named token records but an authenticated member
could not create, inspect, or revoke their own credentials. Manual JSON editing
was still required for every credential lifecycle action.

## Scope

- Add deterministic file-backed create, list, and revoke operations.
- Return a generated secret only from the creation response.
- Keep listing and persisted files free of plaintext secrets.
- Expose authenticated self-service HTTP routes deriving identity from the
  current principal.
- Keep environment-only authorization read-only.
- Prove individual revocation, sibling survival, and restart durability.
- Re-read the operator file immediately before each mutation so a watcher poll
  delay cannot resurrect stale credentials.
- Record MCP token administration and cross-process file locking as follow-up
  gaps instead of silently expanding this slice.

## Verification

- Focused file-manager tests cover one-time secret delivery, hash-only storage,
  invalid writes, individual revocation, sibling continuity, and restart.
- HTTP tests cover authenticated identity isolation and unavailable static
  configuration.
- Full Verification `29313857844`, Storage Restore Drill `29313857687`, and Storage Backup Retention `29313857689` passed.
- Deployment remains non-gating.
