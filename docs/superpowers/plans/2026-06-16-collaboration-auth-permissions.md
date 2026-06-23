# Collaboration Auth Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add relay authentication and owner/editor/viewer authorization for Layo collaboration.

**Architecture:** Extend the shared team manifest with roles and relay token-hash metadata, pass runtime credentials separately from exported manifests, and enforce member authorization at the relay websocket boundary. Preserve local-only collaboration and file-backed agent command behavior.

**Tech Stack:** TypeScript, Zod, Yjs websocket relay, Vitest, Playwright CLI.

---

### Task 1: Team Manifest Roles and Auth Metadata

**Files:**
- Modify: `packages/collaboration/src/team-manifest.ts`
- Test: `packages/collaboration/src/team-manifest.test.ts`

- [x] Add failing tests for default owner role, auth metadata, and plaintext token stripping.
- [x] Add `TeamRole`, role-bearing `TeamMember`, and `auth.relay.memberTokenHashes`.
- [x] Normalize runtime `sync.token` out of persisted manifests.
- [x] Verify focused tests pass.

### Task 2: Relay Member Authorization

**Files:**
- Modify: `apps/collab-relay/src/index.ts`
- Test: `apps/collab-relay/src/index.test.ts`

- [x] Add failing tests for owner/editor/viewer authorization.
- [x] Validate `userId`, `memberToken`, and role when `memberTokens` are configured.
- [x] Reject viewer sync requests and invalid members.
- [x] Allow viewer awareness-only connections.

### Task 3: Runtime Credential Plumbing

**Files:**
- Modify: `apps/web/src/collaboration/collab-session.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/collaboration-agent.ts`
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/web/src/collaboration/collab-session.test.ts`
- Test: `apps/web/src/collaboration/team-store.test.ts`

- [x] Pass relay/member tokens as runtime session input.
- [x] Send `userId`, `memberToken`, and `access` websocket params.
- [x] Use awareness-only access for viewer sessions.
- [x] Add agent collaboration target fields for member auth.

### Task 4: Docs and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment/collaboration.md`
- Modify: `deploy/collab-relay/.env.example`
- Modify: `deploy/collab-relay/docker-compose.yml`
- Modify: `scripts/check-deployment-artifacts.test.mjs`

- [x] Document `COLLAB_MEMBER_TOKENS`.
- [x] Document viewer limitations and token-hash preference.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test:e2e:collab`.
