# Vercel Fullstack Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the actual Layo editor to Vercel and replace the wrong `layo.vercel.app` GitHub About link with the real deployment URL.

**Architecture:** Keep the web app as a Vite static build and expose the existing Fastify HTTP server through a Vercel catch-all function. Vercel rewrites same-origin `/projects`, `/files`, `/assets`, and `/health` requests into the function so production builds do not fall back to localhost API calls.

**Tech Stack:** Vercel CLI, Vercel functions, Fastify, Vite, Node test runner.

---

## Failure Case

`https://layo.vercel.app` currently returns an unrelated portfolio page, not this repository's Layo editor. GitHub About must not point at that URL. A correct deployment must serve this repo's app and provide same-origin API routes instead of relying on local `127.0.0.1:4317` calls.

## File Map

- Modify: `scripts/check-deployment-artifacts.test.mjs`
  - Add a regression test for Vercel full-stack routing.
- Create: `vercel.json`
  - Configure Vite build output and API rewrites.
- Create: `api/[...path].ts`
  - Adapt the existing Fastify server to a Vercel function.
- Modify: `docs/deployment/collaboration.md`
  - Document the Vercel full-stack deployment shape and storage limitation.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record this deployment correction after verification.

## Acceptance Criteria

- [x] `node --test scripts/check-deployment-artifacts.test.mjs` fails before `vercel.json` and `api/[...path].ts` exist.
- [x] `vercel.json` builds `apps/web` and rewrites same-origin API routes to the function.
- [x] `api/[...path].ts` reuses `createHttpServer` and `FileStorage`.
- [x] The Vercel function stores ephemeral runtime data under `/tmp/layo` unless `LAYO_STORAGE_DIR` is set.
- [ ] Vercel production deployment produces a real Layo deployment URL.
- [ ] GitHub About points at the real deployed Layo URL, not the unrelated `layo.vercel.app` portfolio.

## Tasks

### Task 1: RED Deployment Artifact Test

**Files:**
- Modify: `scripts/check-deployment-artifacts.test.mjs`
- Create: `docs/superpowers/plans/2026-06-26-vercel-fullstack-deployment.md`

- [x] **Step 1: Add failing deployment artifact test**

Add a test that expects `vercel.json` and `api/[...path].ts` to exist and encode the full-stack routing contract.

- [x] **Step 2: Verify RED**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: FAIL with `ENOENT` for `vercel.json`.

### Task 2: Implement Vercel Routing

**Files:**
- Create: `vercel.json`
- Create: `api/[...path].ts`

- [x] **Step 1: Add Vercel config**

Create `vercel.json` with Vite build output and rewrites for `/health`, `/projects`, `/files`, and `/assets`.

- [x] **Step 2: Add Vercel server function**

Create `api/[...path].ts` that lazily creates the Fastify server, strips the `/api` rewrite prefix, and emits the Node request into Fastify.

- [x] **Step 3: Verify GREEN**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: PASS.

### Task 3: Build, Deploy, And Link

**Files:**
- Modify: `docs/deployment/collaboration.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Run verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm --filter @layo/web build
node --test scripts/check-deployment-artifacts.test.mjs
pnpm exec tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --strict --skipLibCheck --typeRoots apps/server/node_modules/@types 'api/[...path].ts'
```

`vercel build --yes` is still the CLI smoke test for environments with local Vercel credentials. In this workstation, Vercel CLI has no logged-in credentials, so production deployment should use the connected Vercel integration.

- [ ] **Step 2: Commit, push, PR, merge**

Open and merge a PR for the deployment setup.

- [ ] **Step 3: Deploy and update GitHub About**

Run production deployment with the connected Vercel integration, verify the deployment URL returns the Layo editor, and PATCH GitHub About to that URL.

- [ ] **Step 4: Cleanup**

Sync `main`, delete feature branch, prune worktrees, remove generated artifacts, stop dev servers, and verify ports `5173` and `4317` are clear.
