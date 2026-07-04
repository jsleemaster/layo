# 2026-07-05 E2E Script Coverage Guard

## Goal

Close the verification failure discovered after PR #224: newly added Playwright spec files can sit outside the root `pnpm test:e2e` script because that script manually enumerates specs. PR #224 recorded Playwright CLI proof for `external-migration-penpot-assets.spec.ts`, but the root e2e script did not include that file.

## Root Cause

The root `package.json` `test:e2e` command manually lists individual spec files. That list drifted from `apps/web/e2e/*.spec.ts` and omitted external migration and layout-item specs. Because no guard compared the script against the directory, Full Verification could pass while the new spec was not exercised.

A second visible symptom is that `apps/web/e2e/external-migration-penpot-assets.spec.ts` has a missing test close before the frame-background test. That should have been caught by the full e2e lane but was not because the file was absent from the root script.

## RED Case

Add `scripts/check-e2e-script-coverage.test.mjs` and run it inside root `pnpm test`. The guard discovers every `apps/web/e2e/*.spec.ts` file except `collaboration.spec.ts`, which is intentionally covered by `pnpm test:e2e:collab`, and fails if `package.json` `test:e2e` omits any discovered spec.

Expected RED failure on main-derived branch:

- `apps/web/e2e/external-migration-penpot.spec.ts` missing from `test:e2e`
- `apps/web/e2e/external-migration-penpot-assets.spec.ts` missing from `test:e2e`
- `apps/web/e2e/layout-item-z-index.spec.ts` missing from `test:e2e`

## GREEN Implementation Target

- Add the missing non-collaboration specs to root `test:e2e`.
- Fix the external migration asset spec structure so rectangle fill-image and frame background tests are independent top-level tests.
- Keep `collaboration.spec.ts` on the separate collaboration relay command.
- Verify with RED/GREEN Full Verification and direct Playwright CLI e2e evidence.

## Failure Learning Evidence

- Process failure: a PR body said Playwright CLI proof existed, but the root e2e command did not execute the new spec file.
- Durable guard: root `pnpm test` now fails if a future non-collaboration Playwright spec is added but not wired into `test:e2e`.
- Memory note: not added in this loop because the durable repository guard directly prevents this repo-specific agent miss from recurring.

## Verification Log

- RED Full Verification `#28718600049` failed as expected in Core tests with missing root `test:e2e` entries for `external-migration-penpot-assets.spec.ts`, `external-migration-penpot.spec.ts`, and `layout-item-z-index.spec.ts`.
- GREEN Full Verification `#28718647800` passed in 7m24s with Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- Direct Playwright CLI e2e proof passed through root `pnpm test:e2e`, which now includes the external migration asset, external migration, and layout-item z-index specs.
- Storage Backup Retention `#28718647806` passed.
- Storage Restore Drill `#28718647933` passed.
