# Deployment-Independent Verification Plan

**Goal:** Add a GitHub Actions verification path that can prove PR-head typecheck, unit/integration tests, web build, and Playwright CLI e2e without depending on Vercel preview deployment creation.

**Penpot reference capability:** Penpot-comparable team-product maturity requires repeatable team workflows, safe review, and reliable recovery from failed verification gates. This adapts the operations and failure-loop expectations in `docs/product/penpot-maturity-benchmark.md` rather than copying Penpot infrastructure directly.

**Adopt / adapt / diverge:**

- Adopt: Mature team products need review gates that can run independently from production or preview deployment availability.
- Adapt: Layo keeps Vercel deployment as a delivery path, but core product verification must also run in GitHub Actions without Vercel secrets or deployment quota.
- Diverge: Layo's required proof remains local-first and agent-oriented: Penpot maturity checks, design rule checks, typed tests, web build, and Playwright CLI e2e.

## Failure Case

PR #199 could not be completed after review follow-up because the latest PR head was blocked by Vercel deployment rate limiting while the current local Codex runtime returned exit `134` for `git`, `pnpm`, `node`, and other core commands. The repository only had storage restore/retention workflows plus Vercel production deployment, so there was no deployment-independent full verification lane to continue trusted PR-head checks.

## Minimal Change Ladder

1. The behavior needs to exist because deployment quota should not be the only way to obtain PR-head verification evidence.
2. Existing restore/retention workflows prove storage operations only; they do not run typecheck, repository tests, web build, or Playwright CLI e2e.
3. GitHub Actions, existing `pnpm` scripts, and the existing `scripts/run-e2e.mjs` runner are sufficient. No new test framework or custom infrastructure is needed.
4. The workflow reuses current package scripts instead of creating parallel verification commands.
5. The smallest maintainable slice is one workflow plus an artifact test that guards the workflow contract.

## Implementation

- Add `.github/workflows/full-verification.yml` with manual and PR triggers.
- Install dependencies with `pnpm install --frozen-lockfile` using the repo's `pnpm@10.13.1` convention.
- Install Chromium for Playwright CLI proof.
- Run:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e`
- Add coverage in `scripts/check-deployment-artifacts.test.mjs` so the workflow cannot silently become a Vercel deployment workflow or drop the e2e gate.
- Keep the workflow off branch-push triggers to avoid duplicate full-suite runs on open PR branches.

## Verification Status

- Local verification is currently blocked in this Codex runtime: `git`, `pnpm`, `node`, `python3`, `perl`, `ruby`, `true`, and `echo` have returned exit `134` during continuation checks.
- Remote workflow execution should become the trusted evidence for this branch once GitHub Actions runs the new workflow.
- Vercel deployment remains intentionally out of scope for this verification lane.

## Done Criteria

- The new workflow exists on a reviewable PR branch.
- The workflow includes typecheck, tests, web build, and Playwright CLI e2e without Vercel secrets.
- The artifact test checks that contract.
- GitHub Actions produces a current run for the branch.
- If the workflow fails, the exact failing step becomes the next loop target before any new product maturity gap is started.
