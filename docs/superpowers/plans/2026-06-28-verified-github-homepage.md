# Verified GitHub Homepage Sync

**Goal:** Prevent Layo from advertising a Vercel URL in GitHub About unless that exact URL first proves it serves the Layo editor and same-origin health endpoint.

**Failure source:** GitHub About can be patched manually to `https://layo.vercel.app/` even though the live smoke verifier currently rejects that host as a non-Layo Next.js shell. The production workflow has the correct high-level order, but the PATCH logic is inline and not unit-tested as a reusable safety boundary.

**Architecture:** Move GitHub About PATCH behavior into a repository-owned script. The script validates required inputs, runs `checkLiveDeployment()` against the provided Vercel deployment URL, normalizes the verified URL, then PATCHes GitHub About. If the smoke check fails, the GitHub API is never called.

**Verification plan:**

1. Add RED tests proving the homepage sync script patches only after live smoke passes.
2. Add RED tests proving a non-Layo Vercel page never reaches the GitHub PATCH call.
3. Implement the script and replace the workflow inline PATCH with the script.
4. Update deployment docs and Penpot maturity evidence so future agents distinguish About metadata from verified deployment state.
5. Run focused tests, deployment artifact tests, maturity/design gates, typecheck/build, and the explicit live failure check for the current stale host.

## RED Evidence

```bash
node --test scripts/sync-github-about-homepage.test.mjs
```

Failed with `ERR_MODULE_NOT_FOUND` for `scripts/sync-github-about-homepage.mjs`, proving the new guarded sync behavior did not exist yet.

## GREEN Evidence

```bash
node --test scripts/sync-github-about-homepage.test.mjs
node --test scripts/check-deployment-artifacts.test.mjs
node --test scripts/check-dev-scripts.test.mjs
GH_REPOSITORY_TOKEN=dummy GITHUB_REPOSITORY=jsleemaster/layo pnpm run sync:github-homepage -- --url https://layo.vercel.app/
pnpm run check:live-deployment -- --url https://layo.vercel.app/
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
cargo test -p editor-core
pnpm test
pnpm test:e2e
```

The focused script/artifact/dev-script tests passed. The guarded sync and raw live smoke both still reject `https://layo.vercel.app/` with `found Next.js shell assets`, which is the expected external deployment failure: the script exits before patching GitHub About. Repository maturity, design, typecheck, web build, Rust core, full `pnpm test`, and Playwright CLI e2e with 144 tests passed.

## Remaining External Gate

GitHub repository secrets are currently empty, so `.github/workflows/vercel-production.yml` still cannot create a real Vercel production deployment until `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `LAYO_REPOSITORY_ADMIN_TOKEN` exist. The repository now prevents a bad homepage PATCH, but actual production is not proven until the workflow deploys and the returned URL passes live smoke.
