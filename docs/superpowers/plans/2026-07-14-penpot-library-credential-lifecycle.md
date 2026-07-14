# Penpot Team Library Credential Lifecycle Plan

Status: Active
Date: 2026-07-14

## Exact Failed Case

Configured team member credentials only compare user id and token material. A token
with an already elapsed expiry or an explicit revocation timestamp still
authenticates every protected HTTP, SSE, and MCP library operation.

## Benchmark Decision

- Adopt Penpot's expectation that team access can be withdrawn without changing a document.
- Adapt the boundary to Layo's self-hosted environment configuration.
- Preserve existing plaintext and SHA-256 token configuration during migration.
- Keep deployment non-gating.

## TDD Loop

1. Prove expired and revoked credentials currently authenticate.
2. Parse and validate optional credential lifecycle timestamps.
3. Reject credentials before activation, at expiry, or after revocation.
4. Add overlap support for controlled token rotation without downtime.
5. Verify HTTP and MCP surfaces inherit the shared authenticator behavior.
6. Run the full TypeScript, Rust, build, and Playwright CLI gates.

## Completion Evidence

Pending RED, GREEN, review, and merge evidence.
