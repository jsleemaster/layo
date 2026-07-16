# Penpot Agent-Reviewed Token Mutation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secret-free MCP token mutation previews and exact-generation commits so agents cannot silently mutate stale shared authorization state.

**Architecture:** Extend only the optional shared PostgreSQL authorization manager with a read-only review operation and exact-generation commit precondition. Keep HTTP/browser direct management compatible, and adapt the existing MCP create/revoke tools to default to dry-run review.

**Tech Stack:** TypeScript, Fastify/MCP SDK, Zod, PostgreSQL transactional state store, Vitest, Playwright CLI.

---

### Task 1: Establish the reviewed-mutation contract

**Files:**
- Modify: `apps/server/src/team-authorization.ts`
- Test: `apps/server/src/team-authorization-shared-store.test.ts`

- [ ] Write focused tests for secret-free no-write preview, exact generation, unauthorized access, stale conflict, and exact-generation commit.
- [ ] Run the focused test and record the expected RED caused by the absent review contract.
- [ ] Add review result types, optional manager method, and exact-generation validation.
- [ ] Re-run the focused test to GREEN and commit.

### Task 2: Adapt MCP create and revoke tools

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/src/team-authorization-management-mcp.test.ts`

- [ ] Write focused MCP tests proving `dryRun` defaults to preview, commit requires an exact generation, stale conflicts surface, and secrets appear only after commit.
- [ ] Run the focused test and record the expected RED.
- [ ] Route preview through the shared review method and commit through generation-checked management.
- [ ] Keep annotations conservative and make unavailable filesystem review explicit.
- [ ] Re-run focused MCP and HTTP compatibility tests to GREEN and commit.

### Task 3: Verify product behavior

**Files:**
- Test: `apps/web/e2e/account-token-administration.spec.ts`
- Modify only if a regression is found.

- [ ] Run server authorization tests, typecheck, and build.
- [ ] Run the existing account-token Playwright CLI spec.
- [ ] Start the live editor and directly create, list, and revoke a token through the Korean UI; record the visible result.
- [ ] If any case fails, make that exact failure the next RED and repeat.

### Task 4: Document and review

**Files:**
- Create: `docs/product/penpot-agent-reviewed-token-mutation-delta.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: `docs/superpowers/plans/2026-07-16-penpot-agent-reviewed-token-mutation.md`

- [ ] Record Penpot commit `c50ec233aefed813497266f264f0ee4896387d9b`, adapt decision, RED/GREEN evidence, and remaining gaps.
- [ ] Run Full Verification plus applicable authorization backup/audit workflows on the exact head.
- [ ] Obtain independent code review and resolve every actionable thread.
- [ ] Open and merge the PR only after exact-head checks pass.
- [ ] Run the required post-merge cleanup checks; retain explicit exit-134 exceptions.
- [ ] Move the plan to Completed and merge the MD cleanup PR.
