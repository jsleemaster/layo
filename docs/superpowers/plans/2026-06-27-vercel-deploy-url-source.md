# Vercel Deploy URL Source

**Goal:** Prevent Layo from treating a stale hard-coded Vercel hostname as production. The production workflow must smoke-test the URL returned by `vercel deploy` and update GitHub About only after that URL proves it serves Layo.

**Failure source:** `https://layo.vercel.app` currently fails the live smoke check with a non-Layo Next.js shell, but the workflow still hard-coded that host as the post-deploy check target.

**Architecture:** Keep the existing prebuilt Vercel deployment pipeline, capture `vercel deploy --prebuilt --prod` output into `steps.deploy-production.outputs.url`, run `pnpm run check:live-deployment` against that captured URL, then PATCH the GitHub repository homepage using a repository-admin token only after smoke passes. Remove the smoke script's stale hard-coded default URL so missing deployment URLs fail before network access.

## Plan

1. Add RED artifact coverage that rejects a hard-coded `https://layo.vercel.app` smoke target and requires a deploy-output step.
2. Add RED live-smoke coverage that requires an explicit URL or `LAYO_PRODUCTION_URL`.
3. Update `.github/workflows/vercel-production.yml` to capture the Vercel deploy URL, smoke that URL, and patch GitHub About after the smoke gate.
4. Update deployment and Penpot maturity docs to keep deployment proof tied to the returned URL rather than a guessed hostname.
5. Verify deployment artifact tests, smoke tests, maturity/design gates, full tests, and live failure behavior for the currently stale hostname.

## RED Evidence

- `node --test scripts/check-deployment-artifacts.test.mjs` failed because `.github/workflows/vercel-production.yml` did not contain `id: deploy-production` and still used `pnpm run check:live-deployment -- --url https://layo.vercel.app`.
- `node --test scripts/live-deployment-smoke.test.mjs` failed because `checkLiveDeployment()` defaulted to `https://layo.vercel.app` instead of rejecting a missing URL.

## GREEN Evidence

- `node --test scripts/check-deployment-artifacts.test.mjs` passed.
- `node --test scripts/live-deployment-smoke.test.mjs` passed.
- `pnpm run check:penpot-maturity` passed.
- `pnpm run check:design-rules` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed.
- `pnpm --filter @layo/web build` passed.
- `git diff --check` passed.

## Live Guard Evidence

- `pnpm run check:live-deployment` fails with `Provide a deployment URL with --url or LAYO_PRODUCTION_URL`, proving there is no stale default host.
- `pnpm run check:live-deployment -- --url https://layo.vercel.app` still fails with `found Next.js shell assets`, proving the current public host is not treated as deployed Layo.
