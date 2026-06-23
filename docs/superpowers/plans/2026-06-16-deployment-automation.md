# Deployment Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build static web and team-owned relay deployment automation for Layo.

**Architecture:** Keep `apps/web` deployable as a static artifact and keep `apps/collab-relay` self-hosted by teams. Add executable artifact checks so workflow, Docker, compose, env, and docs drift is caught by `pnpm test`.

**Tech Stack:** GitHub Actions, Vite static build, Docker, Docker Compose, Node test runner, pnpm workspace.

---

### Task 1: Deployment Artifact Test

**Files:**
- Create: `scripts/check-deployment-artifacts.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a Node test that asserts deployment files and key content exist.**

Create `scripts/check-deployment-artifacts.test.mjs` with Node `test`, `assert/strict`, and `fs/promises`. Check `.github/workflows/web-static.yml`, `apps/collab-relay/Dockerfile`, `deploy/collab-relay/docker-compose.yml`, `deploy/collab-relay/.env.example`, `docs/deployment/collaboration.md`, and `README.md`.

- [ ] **Step 2: Wire the test into `pnpm test`.**

Update the root `test` script so `node --test scripts/check-deployment-artifacts.test.mjs` runs after design-rule tests and before workspace tests.

- [ ] **Step 3: Run the test and verify RED.**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: FAIL because the deployment files do not exist yet.

### Task 2: Web Static Workflow

**Files:**
- Create: `.github/workflows/web-static.yml`

- [ ] **Step 1: Add a GitHub Pages workflow.**

The workflow checks out code, sets up pnpm, installs dependencies, builds `@layo/web`, uploads `apps/web/dist`, and deploys with GitHub Pages actions.

- [ ] **Step 2: Run deployment artifact test.**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: still FAIL until Docker, compose, env, and docs updates are added.

### Task 3: Relay Docker Artifacts

**Files:**
- Create: `apps/collab-relay/Dockerfile`
- Create: `deploy/collab-relay/docker-compose.yml`
- Create: `deploy/collab-relay/.env.example`

- [ ] **Step 1: Add a relay Dockerfile.**

Use a Node 22 Alpine image, enable Corepack, install pnpm dependencies with the lockfile, copy the workspace, expose `4327`, and start `pnpm --filter @layo/collab-relay start`.

- [ ] **Step 2: Add Docker Compose for team-owned relay hosting.**

Use the built Dockerfile, map `${COLLAB_RELAY_PORT:-4327}:4327`, pass relay env vars, and add a healthcheck against `/health`.

- [ ] **Step 3: Add `.env.example`.**

Include `COLLAB_RELAY_HOST`, `COLLAB_RELAY_PORT`, `COLLAB_ALLOWED_ROOM_PREFIX`, and `COLLAB_ROOM_TOKEN`.

### Task 4: Deployment Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment/collaboration.md`

- [ ] **Step 1: Expand README deployment summary.**

State that web-only hosting is static and no default production relay is operated by maintainers.

- [ ] **Step 2: Expand collaboration deployment docs.**

Add sections for web-only deployment, local relay, cloud relay, trusted network relay, Docker Compose usage, and security limits.

### Task 5: Verification

**Files:**
- No code files unless verification exposes a bug.

- [ ] **Step 1: Run artifact test.**

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run web build.**

```bash
pnpm --filter @layo/web build
```

Expected: PASS without chunk size warning.

- [ ] **Step 3: Run Docker checks if Docker is available.**

```bash
docker build -f apps/collab-relay/Dockerfile -t layo-collab-relay .
docker compose --env-file deploy/collab-relay/.env.example -f deploy/collab-relay/docker-compose.yml config
```

Expected: PASS.

- [ ] **Step 4: Run full tests.**

```bash
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add .github/workflows/web-static.yml apps/collab-relay/Dockerfile deploy/collab-relay/.env.example deploy/collab-relay/docker-compose.yml docs/deployment/collaboration.md docs/superpowers/plans/2026-06-16-deployment-automation.md docs/superpowers/specs/2026-06-16-deployment-automation-design.md package.json README.md scripts/check-deployment-artifacts.test.mjs
git commit -m "chore: add deployment automation"
```
