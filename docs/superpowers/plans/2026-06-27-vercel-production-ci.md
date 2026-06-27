# Vercel Production CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-owned GitHub Actions path that deploys Layo to Vercel production and refuses to treat production as healthy unless the live Layo smoke check passes.

**Architecture:** Keep Vercel deployment as a custom CI pipeline using `vercel pull`, `vercel build --prod`, and `vercel deploy --prebuilt --prod` with pinned Vercel CLI. Add artifact tests that prove the workflow has required secrets, runs repository gates before deploy, avoids GitHub Pages, and checks `https://layo.vercel.app` after deployment.

**Tech Stack:** GitHub Actions, Vercel CLI, pnpm, Node test runner, live deployment smoke verifier.

---

## Penpot Maturity Reference

Penpot-grade team product maturity requires deployment confidence, not just a local app and a public link. Layo adapts that product expectation by making production deployment repeatable in CI and by making the public Vercel URL prove it serves this repository's app.

## Files

- Modify: `scripts/check-deployment-artifacts.test.mjs`
- Create: `.github/workflows/vercel-production.yml`
- Modify: `docs/deployment/collaboration.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Create: `docs/superpowers/plans/2026-06-27-vercel-production-ci.md`

## Task 1: Lock The CI Contract With A Failing Test

**Files:**
- Modify: `scripts/check-deployment-artifacts.test.mjs`

- [x] **Step 1: Add the workflow artifact test**

Add a test that reads `.github/workflows/vercel-production.yml` and asserts the deployment contract:

```js
test("vercel production workflow deploys prebuilt output and verifies the live Layo site", async () => {
  const workflow = await readText(".github/workflows/vercel-production.yml");

  assert.match(workflow, /VERCEL_TOKEN/);
  assert.match(workflow, /VERCEL_ORG_ID/);
  assert.match(workflow, /VERCEL_PROJECT_ID/);
  assert.match(workflow, /vercel@50\.9\.6/);
  assert.match(workflow, /vercel pull --yes --environment=production/);
  assert.match(workflow, /vercel build --prod/);
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
  assert.match(workflow, /pnpm run check:live-deployment -- --url https:\/\/layo\.vercel\.app/);
  assert.doesNotMatch(workflow, /github\.io|actions\/deploy-pages|pages:/i);
});
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: FAIL with `ENOENT` for `.github/workflows/vercel-production.yml`.

Observed: FAIL with `ENOENT: no such file or directory, open '.github/workflows/vercel-production.yml'`.

## Task 2: Add The Vercel Production Workflow

**Files:**
- Create: `.github/workflows/vercel-production.yml`

- [x] **Step 1: Create the workflow**

Create `.github/workflows/vercel-production.yml` with:

```yaml
name: Vercel Production

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: vercel-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Verify Vercel secrets
        shell: bash
        run: |
          missing=()
          for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
            if [ -z "${!name}" ]; then
              missing+=("$name")
            fi
          done
          if [ "${#missing[@]}" -gt 0 ]; then
            printf 'Missing required Vercel secrets: %s\n' "${missing[*]}" >&2
            exit 1
          fi

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.13.1

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run deployment artifact tests
        run: node --test scripts/check-deployment-artifacts.test.mjs

      - name: Run Penpot maturity gate
        run: pnpm run check:penpot-maturity

      - name: Run design rules gate
        run: pnpm run check:design-rules

      - name: Install Vercel CLI
        run: npm install -g vercel@50.9.6

      - name: Pull Vercel production environment
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build Vercel production output
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy prebuilt production output
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Verify live Layo production URL
        run: pnpm run check:live-deployment -- --url https://layo.vercel.app
```

- [x] **Step 2: Run the artifact test and verify GREEN**

Run:

```bash
node --test scripts/check-deployment-artifacts.test.mjs
```

Expected: PASS.

Observed: PASS, 6 deployment artifact tests.

## Task 3: Document The Production Deploy Gate

**Files:**
- Modify: `docs/deployment/collaboration.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update deployment docs**

Add a section that names the required GitHub secrets and states that the workflow deploys with prebuilt Vercel output, then runs the live smoke check against `https://layo.vercel.app`.

- [x] **Step 2: Update the maturity benchmark**

Record that Layo now has a repository-owned production deploy workflow, while actual production is only proven after the workflow has valid Vercel secrets and the live smoke check passes.

- [x] **Step 3: Update plan status**

Add a row for `2026-06-27-vercel-production-ci.md` once tests pass.

## Task 4: Verification And Release

**Files:**
- No production file changes beyond the workflow, docs, and tests above.

- [x] **Step 1: Run focused tests**

```bash
node --test scripts/check-deployment-artifacts.test.mjs
node --test scripts/live-deployment-smoke.test.mjs
pnpm run check:penpot-maturity
pnpm run check:design-rules
```

- [x] **Step 2: Run full test suite**

```bash
pnpm test
```

- [x] **Step 3: Run live deployment smoke as external-state evidence**

```bash
pnpm run check:live-deployment -- --url https://layo.vercel.app
```

Expected current result if production has not been redeployed: FAIL with a non-Layo shell error. That failure proves the verifier is catching the live deployment gap and should be reported separately from repository tests.

Observed: FAIL with `https://layo.vercel.app/ is not the Layo Vite editor: found Next.js shell assets`. This confirms the repository now has a CI path to fix deployment, but the public Vercel site is still not verified as Layo until the workflow runs with valid Vercel secrets and passes the live smoke gate.

- [ ] **Step 4: Commit, push, open PR, merge, and clean worktree**

Use Git push plus GitHub REST API, not `gh`, because this repository has had session conflicts with `gh` in parallel agent runs.
