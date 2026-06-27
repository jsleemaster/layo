# Vercel Production Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Layo from treating a live Vercel URL as deployed unless that URL serves this repository's Vite editor shell and same-origin API.

**Architecture:** Add a static deployment marker to the Vite HTML shell and a Node-based live smoke verifier that fetches the production URL, rejects unrelated Next.js or portfolio pages, checks the Layo marker, and checks `/health`. Keep the live network verifier outside `pnpm test` because it depends on external Vercel state, but add mock-driven unit tests to lock the verifier behavior.

**Tech Stack:** Node test runner, TypeScript/Vite HTML shell, Vercel, HTTPS fetch.

---

## Penpot / Team-Product Comparison

Reference capability: Penpot-style product operations require deploy, configuration, and upgrade confidence before a team can trust the product surface. Layo adapts this as a production smoke gate that proves the public URL is the Layo app, not merely any Vercel page.

Maturity gate: Operations in `docs/product/penpot-maturity-benchmark.md`.

## Files

- Modify: `apps/web/index.html`
  - Add a stable deployment marker meta tag.
- Create: `scripts/live-deployment-smoke.mjs`
  - Export `checkLiveDeployment`.
  - Run as a CLI with `--url`.
  - Fail clearly when the URL is not Layo, is a Next.js shell, or lacks same-origin `/health`.
- Create: `scripts/live-deployment-smoke.test.mjs`
  - Mock fetch responses for a valid Layo deployment and the current wrong Next.js deployment shape.
- Modify: `package.json`
  - Add `check:live-deployment`.
- Modify: `docs/deployment/collaboration.md`
  - Document the production smoke command and the current external credential limitation.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record that the repo now has a smoke gate while the actual production deployment still needs valid Vercel credentials/project ownership.

## Tasks

### Task 1: Deployment Marker

- [x] **Step 1: Write failing marker test**

Add to `scripts/check-deployment-artifacts.test.mjs`:

```js
test("web shell includes a stable Layo deployment marker", async () => {
  const indexHtml = await readText("apps/web/index.html");
  assert.match(indexHtml, /<meta name="layo-app" content="vite-editor" \/>/);
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: FAIL because `apps/web/index.html` has no marker.

- [x] **Step 3: Add marker**

Add this inside the `<head>`:

```html
<meta name="layo-app" content="vite-editor" />
```

- [x] **Step 4: Verify GREEN**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: PASS.

### Task 2: Live Deployment Smoke Verifier

- [x] **Step 1: Write failing verifier tests**

Create `scripts/live-deployment-smoke.test.mjs` with tests that import `checkLiveDeployment` from `scripts/live-deployment-smoke.mjs`.

Required cases:

- A valid HTML response with the marker and a `/health` JSON response passes.
- A Next.js HTML response without the marker fails with a message containing `not the Layo Vite editor`.
- A valid marker with a failing `/health` response fails with a message containing `/health`.

- [x] **Step 2: Verify RED**

Run:

```bash
node --test scripts/live-deployment-smoke.test.mjs
```

Expected: FAIL because `scripts/live-deployment-smoke.mjs` does not exist.

- [x] **Step 3: Implement verifier**

Create `scripts/live-deployment-smoke.mjs`:

- Parse `--url` or use `LAYO_PRODUCTION_URL`.
- Fetch the base URL and require HTTP 200.
- Reject HTML containing `/_next/`.
- Require `<meta name="layo-app" content="vite-editor"`.
- Fetch `/health` and require HTTP 200 plus JSON `{ ok: true }` or `{ status: "ok" }`.
- Print a compact success block for valid deployments.

- [x] **Step 4: Verify GREEN**

Run:

```bash
node --test scripts/live-deployment-smoke.test.mjs
```

Expected: PASS.

### Task 3: Docs, Scripts, And Live Failure Evidence

- [x] **Step 1: Add package script**

Add:

```json
"check:live-deployment": "node scripts/live-deployment-smoke.mjs"
```

- [x] **Step 2: Document usage**

In `docs/deployment/collaboration.md`, add:

```bash
pnpm run check:live-deployment -- --url https://layo.vercel.app
```

State that this command must pass before saying the Vercel production site is actually serving Layo.

- [x] **Step 3: Run local gates**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
node --test scripts/live-deployment-smoke.test.mjs
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm --filter @layo/web build
pnpm test
```

Expected: PASS.

Observed PASS:

- `node --test scripts/check-deployment-artifacts.test.mjs`
- `node --test scripts/live-deployment-smoke.test.mjs`
- `pnpm run check:penpot-maturity`
- `pnpm run check:design-rules`
- `pnpm --filter @layo/web build`
- `rg -n 'name="layo-app" content="vite-editor"' apps/web/dist/index.html`
- `pnpm test`
- `git diff --check`
- `pnpm test:e2e` after starting `pnpm dev`; the first attempt failed with `ERR_CONNECTION_REFUSED` because the dev server was not running, then the same command passed with 98/98 tests.

- [x] **Step 4: Run live deployment check**

Run:

```bash
pnpm run check:live-deployment -- --url https://layo.vercel.app
```

Expected today: FAIL because the live site currently serves a Next.js shell without the Layo marker. Record this as external deployment state, not as a repository test failure.

Observed:

```text
Live deployment smoke failed
error=https://layo.vercel.app/ is not the Layo Vite editor: found Next.js shell assets
```

- [ ] **Step 5: Publish and cleanup**

Commit, push, create PR through GitHub REST API, merge after verification, sync `main`, remove the feature worktree and branches, stop dev servers, and verify ports `4317` and `5173` are clear.
