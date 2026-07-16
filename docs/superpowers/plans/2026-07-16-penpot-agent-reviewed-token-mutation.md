# Penpot Agent-Reviewed Token Mutation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated MCP token mutation reviews and receipt-bound exact-generation commits.

**Architecture:** The shared PostgreSQL manager issues a short-lived HMAC receipt that binds principal, canonical operation, scope, and generation. Commit verifies it inside the locked state transaction before generating token material; changed commits advance generation so replay becomes stale. Filesystem MCP review remains unavailable and direct HTTP/browser management stays compatible.

**Tech Stack:** TypeScript, Node crypto, Fastify/MCP SDK, Zod, PostgreSQL transactional state store, Vitest, Playwright CLI.

---

### Task 1: Define receipt-bound manager behavior

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Modify: `apps/server/src/team-authorization-runtime.ts`
- Test: `apps/server/src/team-authorization-reviewed-mutation.test.ts`
- Test: `apps/server/src/team-authorization-runtime.test.ts`

- [x] Write the initial manager RED.
- [x] Run Full Verification `29478548306`; expect typecheck to fail only because `reviewTokenMutation` and `expectedGeneration` are absent.
- [ ] Replace the bare-generation RED with receipt binding, tamper, cross-principal, advancing-clock, replay, no-op revoke, and self-revoke cases.
- [ ] Re-run RED; expect the authenticated receipt contract to be absent.
- [ ] Add `TeamAuthorizationMutationReview`, optional `reviewTokenMutation`, receipt-bearing mutation input, signing-key runtime wiring, canonical digest, and locked verification.
- [ ] Run focused manager/runtime tests to GREEN.

Run: `pnpm --filter @layo/server test -- team-authorization-reviewed-mutation.test.ts team-authorization-runtime.test.ts`

### Task 2: Prove PostgreSQL atomicity

**Files:**
- Modify: `apps/server/src/team-authorization-shared-store.test.ts`

- [ ] Add two-connection concurrent commit coverage for one receipt.
- [ ] Verify RED catches missing locked receipt validation.
- [ ] Verify GREEN yields one successful commit, one conflict before ID/secret generation, one generation increment, and exactly one audit event.
- [ ] Add changed-false revoke proof with no receipt and no duplicate audit.

Run: `LAYO_TEST_POSTGRES_URL=postgres://... pnpm --filter @layo/server test -- team-authorization-shared-store.test.ts`

### Task 3: Adapt MCP create and revoke tools

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/team-authorization-management-mcp.test.ts`
- Verify: `apps/server/src/team-authorization-management-http.test.ts`

- [x] Write the initial MCP default-review RED.
- [ ] Update it for opaque receipt, explicit commit, tampering, missing receipt, filesystem unavailability, and secret-only-after-commit.
- [ ] Route `dryRun: true` through review and `dryRun: false` through receipt-checked management.
- [ ] Cover create and revoke, including self-revocation confirmation in both phases.
- [ ] Run focused MCP and HTTP compatibility tests to GREEN.

### Task 4: Verify product behavior

**Files:**
- Verify: `apps/web/e2e/account-token-administration.spec.ts`
- Modify only if a regression is found.

- [ ] Run authorization tests, typecheck, build, and full Core tests.
- [ ] Run the account-token Playwright CLI spec.
- [ ] Start the live editor and directly create, list, and revoke a token through the Korean UI; record visible results.
- [ ] Turn every verification failure into the next exact RED.

### Task 5: Document, review, and merge

**Files:**
- Create: `docs/product/penpot-agent-reviewed-token-mutation-delta.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [ ] Record Penpot commit, adapt decision, RED/GREEN evidence, signing-key operation, and residual risks.
- [ ] Update PR body with the exact gap, failure mode, regression coverage, live Playwright proof, deliberate divergence, memory-note decision, and remaining risks.
- [ ] Run Full Verification and applicable authorization backup/audit workflows on the exact head.
- [ ] Obtain independent code review and resolve every actionable thread.
- [ ] Merge only after exact-head checks pass.
- [ ] Run post-merge cleanup checks and retain explicit exit-134 exceptions.
- [ ] Move the plan to Completed and merge the MD cleanup PR.
