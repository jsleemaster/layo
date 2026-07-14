# Penpot Team Library Credential Lifecycle Plan

Status: Completed by PR #300 merge gate
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

- RED Full Verification `29300060591`, job `86981759517`: the new
  lifecycle test failed with `expected callback to throw`; the other four
  authorization tests passed.
- GREEN Full Verification `29300218356`, job `86982214512`: 252 web tests,
  296 server tests, Rust workspace tests, and 193 Playwright CLI cases passed.
- Existing HTTP and MCP authorization suites passed unchanged because both
  surfaces call the shared authenticator on every request or tool invocation.
- Product evidence: `docs/product/penpot-library-credential-lifecycle-delta.md`.

## Remaining Boundary

Runtime configuration replacement still requires a process restart, which closes
existing streams. A future scheduled expiry is checked on the next HTTP request
or MCP invocation, but an already-open SSE stream does not re-authenticate while
it remains connected. Per-token revocation records, dynamic config reload, and
durable multi-instance identity storage remain later exact loops.
