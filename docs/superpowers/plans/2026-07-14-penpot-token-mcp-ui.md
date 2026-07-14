# Penpot Token MCP and UI Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make file-backed personal access tokens self-service from Layo MCP and the Korean browser team settings while preserving fail-closed authentication, one-time secret delivery, and hash-only storage.

**Architecture:** Reuse `TeamAuthorizationFileManager` as the single mutation authority. Inject it into MCP beside the authenticated principal and expose tools only when the operator selected file-backed authorization. Add a small browser API module over the existing HTTP routes, including a secret-free active-token identifier for safe self-revocation. Render account controls only in team settings; plaintext may exist only in the immediate create response, transient component memory, and an explicit user clipboard copy.

**Tech Stack:** TypeScript, Fastify, MCP SDK, React, Vitest, Playwright CLI

---

## Benchmark Decision

Penpot manages personal access tokens at account level with a descriptive name,
Never/30/60/90/180-day expiry choices, one-time copy after creation, a metadata
list, and deletion. Layo **adapts** that workflow into its local-first team
settings and deterministic MCP surface, backed by the operator-owned
authorization file introduced in PR #306 and serialized across processes in PR
#307.

This slice adds evidence toward maturity gates 7 (extensibility) and 8
(operations). It does not claim those whole-product gates are closed. Audit
events, multi-host transactional identity storage, richer self-revocation
recovery, and agent dry-run/reviewability remain follow-up gaps.

### Task 1: Prove fail-closed MCP administration

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Create: `apps/server/src/team-authorization-management-mcp.test.ts`
- Modify: `apps/web/e2e/mcp-stdio.spec.ts`

- [ ] Add a failing in-memory MCP integration covering authenticated create/list/revoke for only the principal returned by `authenticateTeamMember`.
- [ ] Require tools to be absent when the manager is missing, the principal is missing, or authorization is static/non-file-backed.
- [ ] Require invalid and revoked principals to fail before mutation.
- [ ] Assert exact annotations: list is read-only/non-destructive/idempotent; create is writable/non-destructive/non-idempotent; revoke is writable/destructive/idempotent.
- [ ] Add a spawned stdio RED using temporary `LAYO_LIBRARY_REGISTRY_MEMBERS_FILE`, `LAYO_MCP_USER_ID`, and `LAYO_MCP_MEMBER_TOKEN`.
- [ ] Through stdio create/list/revoke, inspect the file for hash-only persistence and prove another member's tokens remain unchanged.
- [ ] Run focused server and stdio tests and record the missing-tool RED.
- [ ] Inject `teamAuthorizationManager` into `McpServerOptions`, derive the member id only from `authenticateTeamMember`, register conditional tools, and wire the stdio file manager.
- [ ] Re-run focused tests and commit GREEN.

### Task 2: Prove the HTTP and browser API contract

**Files:**
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/team-authorization-management-http.test.ts`
- Create: `apps/web/src/account-token-api.ts`
- Create: `apps/web/src/account-token-api.test.ts`

- [ ] Add failing HTTP assertions that list returns only whitelisted token metadata plus secret-free `activeTokenId`.
- [ ] Prove legacy credentials return no active token id and named credentials return their own id.
- [ ] Add failing web API tests for exact credentialed list/create/revoke requests, metadata whitelisting, and Korean errors.
- [ ] Run focused tests and record RED before implementation.
- [ ] Implement the HTTP response and typed browser helpers over `/account/tokens`.
- [ ] Re-run focused tests and commit GREEN.

### Task 3: Prove the real browser account workflow

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/e2e/account-token-administration.spec.ts`
- Modify: `package.json`

- [ ] Add a Playwright fixture that starts an isolated file-backed server and web dev server on alternate ports.
- [ ] Add a failing real-network test that creates a local team, applies a named member token, enters 팀 설정, and loads the current member's metadata.
- [ ] Type a descriptive name, choose expiry, create a token, copy the one-time secret, reload the metadata list, and revoke a sibling token.
- [ ] Assert real request headers, hash-only disk persistence, list/reload secret absence, and revoked credential authentication failure.
- [ ] Mark the active token in Korean UI. Require explicit confirmation before current-token revocation; on success clear active credentials and show the recovery instruction without destroying the team.
- [ ] Assert plaintext disappears after dismissal, another create, identity change, leaving 팀 설정, and reload.
- [ ] Assert plaintext is absent from localStorage, IndexedDB, and exported team manifest; clipboard copy is the only intentional external copy.
- [ ] Register the spec unconditionally in root `test:e2e`.
- [ ] Run the focused Playwright CLI RED, implement compact accessible controls, then repeat the direct click/type/copy/revoke interaction pass.

### Task 4: Verification, review, and durable evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Create: `docs/product/penpot-token-mcp-ui-delta.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: this plan

- [ ] Run Full Verification, Storage Restore Drill, and Storage Backup Retention.
- [ ] Request external code review and feed every actionable finding into a focused RED.
- [ ] Update product docs with Penpot reference, adopt/adapt decision, RED/GREEN IDs, direct browser evidence, and remaining agent-reviewability/audit/shared-storage risks.
- [ ] Open a ready PR, resolve every review thread, and squash merge.
- [ ] Run required post-merge cleanup checks and delete the remote branch.
