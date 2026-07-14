# Penpot Token MCP and UI Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make file-backed personal access tokens fully self-service from Layo MCP and the Korean browser team settings while preserving one-time secret and hash-only storage guarantees.

**Architecture:** Reuse `TeamAuthorizationFileManager` as the single mutation authority. Inject it into MCP beside the already-authenticated principal, and add a small browser API module that calls the existing HTTP routes with the active member identity. Render account-token controls only in the team settings mode; keep plaintext exclusively in the immediate create response and component memory.

**Tech Stack:** TypeScript, Fastify, MCP SDK, React, Vitest, Playwright CLI

---

## Benchmark Decision

Penpot manages personal access tokens at account level with a descriptive name,
Never/30/60/90/180-day expiry choices, one-time copy after creation, a metadata
list, and deletion. Layo **adapts** that account workflow into its local-first
team settings and deterministic MCP surface, backed by the operator-owned
authorization file introduced in PR #306 and serialized across processes in PR
#307.

This closes maturity gates 2 (team workflow), 7 (extensibility), 8 (operations),
and 9 (agent safety). Durable audit events and multi-host transactional identity
storage remain separate follow-up gaps.

### Task 1: Prove the MCP gap

**Files:**
- Modify: `apps/server/src/mcp.test.ts`
- Modify: `apps/server/src/mcp.ts`

- [ ] Add a failing integration test that connects an authenticated MCP principal with a file manager.
- [ ] Assert `list_account_tokens`, `create_account_token`, and `revoke_account_token` are advertised with correct annotations.
- [ ] Assert create returns plaintext once, list omits secret/hash, and revoke targets only the authenticated principal.
- [ ] Run `pnpm --filter @layo/server test -- mcp.test.ts` and record the expected missing-tool RED.
- [ ] Inject `teamAuthorizationManager` into `McpServerOptions` and register the three tools.
- [ ] Wire the stdio entrypoint to construct the manager only for `LAYO_LIBRARY_REGISTRY_MEMBERS_FILE`.
- [ ] Re-run the focused test and commit GREEN.

### Task 2: Prove the browser API contract

**Files:**
- Create: `apps/web/src/account-token-api.ts`
- Create: `apps/web/src/account-token-api.test.ts`

- [ ] Add failing tests for credentialed list/create/revoke requests and Korean error propagation.
- [ ] Run the focused web test and record the missing-module RED.
- [ ] Implement typed token metadata, expiry, and credential helpers over `/account/tokens`.
- [ ] Ensure responses never synthesize or persist plaintext outside create.
- [ ] Re-run the focused tests and commit GREEN.

### Task 3: Prove the visible account workflow

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/e2e/account-token-administration.spec.ts`
- Modify: `package.json` only if the E2E coverage guard requires explicit registration.

- [ ] Add a failing Playwright test that opens 팀 설정, loads the current member's tokens, creates a named expiring token, exposes one-time copy, and revokes it.
- [ ] Mock only the network boundary; exercise the real browser UI and request contract.
- [ ] Run the focused Playwright CLI spec and record the missing-control RED.
- [ ] Add compact Korean controls under team settings: token name, expiry select, create button, metadata list, revoke icon button with tooltip, and one-time secret copy.
- [ ] Disable management without an active user id and member token; show loading/error/status via live regions.
- [ ] Clear the one-time secret when team identity changes or the panel closes.
- [ ] Re-run the focused Playwright test and direct click/type/copy/revoke interaction pass.

### Task 4: Verification, review, and durable evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-token-mcp-ui-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [ ] Run Full Verification, Storage Restore Drill, and Storage Backup Retention.
- [ ] Request external code review and feed every actionable finding into a focused RED.
- [ ] Update product docs with Penpot reference, adopt/adapt decision, RED/GREEN run IDs, direct browser evidence, and remaining gaps.
- [ ] Open a ready PR, ensure all review threads are resolved, and squash merge.
- [ ] Run the required post-merge cleanup checks and delete the remote branch.
