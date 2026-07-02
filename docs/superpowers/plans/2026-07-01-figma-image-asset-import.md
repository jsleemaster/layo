# Figma Image Asset Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Figma REST JSON external migration so exported image fills packaged beside the JSON import as Layo image nodes with local stored image assets.

**Architecture:** Reuse the existing external migration preflight, `DesignNode.kind: "image"` model, and `FileStorage` asset persistence path. A Figma ZIP package may contain one Figma REST JSON document plus image asset entries; review stays no-write, import creates a fresh private project/document, maps `fills[].imageRef` to image nodes, and writes referenced asset bytes through the existing asset store.

**Tech Stack:** TypeScript, Fastify, Vitest, React, Playwright CLI, local-first `.layo` storage.

## Global Constraints

- Apply `docs/process/minimal-change-ladder.md`: reuse existing primitives before adding abstractions.
- Keep user-facing web UI Korean-first.
- Preserve local-first behavior; do not introduce a maintainer-operated backend.
- Browser debugging and visual verification must use Playwright CLI.
- For import/export maturity, update `docs/product/figma-migration-roadmap.md`, `docs/product/penpot-maturity-benchmark.md`, and `docs/superpowers/PLAN_STATUS.md`.

---

## Current Status

PR #199 review follow-up is partially complete as of 2026-07-01. The three P2 review findings are addressed through code/test commit `c09d0c0`: ZIP review importability now requires CANVAS pages, packaged FRAME image fills are preserved as leading background image nodes, and Figma package document discovery filters out asset entries before JSON parsing. Regression tests were added for all three cases and the three review threads were answered. Do not mark this plan complete or run post-merge cleanup yet: GitHub reports `mergeable_state: blocked`; after the final docs-only status updates, PR-head checks must be re-run to completion; the latest observed PR-check state has `restore-drill` and `retention` passing while `Vercel` fails with `Deployment rate limited - retry in 24 hours`; and local PR-head full verification/e2e could not be trusted because `git status --short --branch` exits `134` and the only successful local `pnpm --filter @layo/server test -- external-migration` run executed the stale local 4-test file, not the updated PR-head regression tests.

---

### Task 1: Figma Package Mapper Contract

**Files:**
- Modify: `apps/server/src/external-migration.test.ts`
- Modify: `apps/server/src/external-migration.ts`

**Interfaces:**
- Produces: `ExternalMigrationImportResult.importedAssets: Array<{ metadata: StoredAsset; data: Buffer }>` for storage persistence.
- Produces: review support for Figma ZIP packages containing one Figma REST JSON document and image asset entries.

- [x] **Step 1: Write the failing test**

Add a test named `imports Figma JSON packages with image fills as image nodes` that builds a ZIP with `figma-file.json` and `assets/figma-image-hero.png`. The Figma JSON should include a `RECTANGLE` with `fills: [{ type: "IMAGE", imageRef: "figma-image-hero", visible: true, scaleMode: "FILL" }]`. Assert review returns `source: "figma"`, `archiveKind: "zip"`, `canImport: true`, `assetCount: 1`, and no blockers. Assert import maps the node to `kind: "image"`, `content.asset_id: "figma-asset-figma-image-hero"`, `content.fit_mode: "fill"`, and returns one imported asset with PNG metadata and original bytes.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "Figma JSON packages"
```

Expected: FAIL because ZIP Figma packages are currently blocked and `importExternalMigrationArchive` only parses direct JSON.

- [x] **Step 3: Implement the minimal mapper changes**

Update `external-migration.ts` so ZIP review finds a Figma JSON document candidate and image assets. Add package parsing that builds an imageRef-to-asset map from asset filenames. Map visible Figma `IMAGE` fills to Layo image nodes when a matching packaged asset exists; otherwise keep the existing default geometry node and emit a warning.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "Figma|opaque|Penpot"
```

Expected: the new Figma image package test passes while Penpot ZIP and opaque Figma binary behavior stays unchanged.

### Task 2: Storage And HTTP Persistence

**Files:**
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/http.test.ts`

**Interfaces:**
- Consumes: `ExternalMigrationImportResult.importedAssets`.
- Produces: `ImportedExternalMigrationArchive.assetCount: number`.

- [x] **Step 1: Write the failing HTTP persistence test**

Add a test named `imports external Figma image assets into local asset storage`. Use `POST /migrations/external/import` with the same ZIP package. Assert the persisted file contains an image node, and `GET /assets/figma-asset-figma-image-hero` returns the original PNG bytes.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/http.test.ts -t "Figma image assets"
```

Expected: FAIL because imported external assets are not written to storage.

- [x] **Step 3: Implement storage persistence**

In `FileStorage.importExternalMigrationArchive()`, write `imported.importedAssets` with the existing private `writeAsset()` before or with the document import. Include `assetCount` in the returned import summary.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/external-migration.test.ts src/http.test.ts -t "Figma|external"
```

Expected: mapper and HTTP persistence tests pass.

### Task 3: Web API And Browser Flow

**Files:**
- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/document-api.test.ts`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Consumes: server `assetCount` in `ImportedExternalMigrationArchive`.
- Produces: visible file-panel proof that a Figma ZIP package imports an image layer and stores a fetchable asset.

- [x] **Step 1: Write or extend focused tests**

Extend the document API import test fixture to include `assetCount: 1`. Add a Playwright test or extend the external Figma migration test to upload a ZIP package, verify review shows `ZIP`, `에셋 1개`, click `외부 디자인 가져오기`, then verify the imported persisted document has an image node and the image asset URL returns PNG bytes.

- [x] **Step 2: Run tests to verify they fail where behavior is missing**

Run:

```bash
pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"
node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "external Figma" --workers=1 --reporter=line
```

Expected: document API may fail on missing `assetCount`; Playwright fails until ZIP import and persisted asset behavior is implemented.

- [x] **Step 3: Implement web type/UI wiring**

Add `assetCount` to the web `ImportedExternalMigrationArchive` type. Keep the existing Korean file-panel controls; no new UI is required beyond using the existing review asset rows and import status.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"
node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "external Figma" --workers=1 --reporter=line
```

Expected: web API and Playwright import flow pass.

### Task 4: Documentation And Gates

**Files:**
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Consumes: implementation and verification evidence from Tasks 1-3.
- Produces: current product docs naming image asset import as landed and keeping components, variants, effects, advanced style fidelity, and Penpot ZIP shape mapping as remaining gaps.

- [x] **Step 1: Update docs after GREEN**

Record that Figma REST JSON packages can preserve image fills when exported image assets are included beside the JSON. Keep unsupported Figma image fills without packaged assets as warnings.

- [x] **Step 2: Run repository gates**

Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
cargo test -p editor-core
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass before marking the goal complete.

### Task 5: PR Review Follow-Up Before Merge

**Files:**
- Modify: `apps/server/src/external-migration.test.ts`
- Modify: `apps/server/src/external-migration.ts`
- Modify if needed: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Produces: review importability that matches importer CANVAS-page requirements.
- Produces: explicit preservation or warning behavior for packaged FRAME image fills.
- Produces: ZIP document discovery that parses only JSON/document candidates, not binary assets.

- [x] **Step 1: Add RED tests for review comments**

Add focused tests for: a Figma ZIP document with no CANVAS pages remaining non-importable, a FRAME with a packaged IMAGE fill preserving the asset or emitting an explicit warning, and a Figma ZIP package with large/binary image assets avoiding binary JSON parsing during document discovery.

- [x] **Step 2: Implement minimal review fixes**

Apply the smallest mapper/review changes that make the RED tests pass without weakening existing rectangle image-fill import behavior.

- [ ] **Step 3: Re-run focused and broad verification**

Run focused server tests, web/API tests if touched, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `git diff --check`.

- [ ] **Step 4: Push, answer review threads, merge, and clean up**

Push the review-fix commit, reply to the three inline review threads, merge PR #199 only after checks are green, then run `docs/process/post-merge-cleanup.md`.

## Execution Evidence

- Review follow-up tests added at `c09d0c0`: `does not mark Figma ZIP packages without CANVAS pages as importable`, `preserves packaged frame image fills as background image nodes`, and `ignores asset entries while discovering Figma package documents`.
- Review follow-up implementation committed through `c09d0c0`: `reviewZipArchive` gates Figma ZIP importability on `pageCount > 0`, FRAME image fills create a leading image child with imported asset metadata, and `readFigmaPackage` filters document/manifest/metadata entries before JSON parsing.
- PR checks after docs-only follow-up: `restore-drill` and `retention` passed; `Vercel` failed with `Deployment rate limited - retry in 24 hours`, so the PR remains blocked before merge.
- Local verification caveat: `git status --short --branch` exits `134`; `pnpm --filter @layo/server test -- external-migration` passed only against the stale local 4-test file, so it is not accepted as PR-head GREEN evidence.

- Baseline GREEN: `pnpm --filter @layo/server exec vitest run src/external-migration.test.ts src/http.test.ts -t "Figma|external"` and `pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"` passed before behavior changes.
- RED mapper: `pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "Figma JSON packages"` failed because Figma ZIP packages still returned `canImport: false` with `mapping_not_implemented` and `figma_images_required`.
- RED HTTP: `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "Figma image assets"` failed because `POST /migrations/external/import` returned `400`.
- Focused GREEN: `pnpm --filter @layo/server exec vitest run src/external-migration.test.ts src/http.test.ts -t "Figma|external|Penpot"` passed with 8 tests.
- Web API GREEN: `pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"` passed with 2 tests.
- Typecheck GREEN: `pnpm --filter @layo/web typecheck` and `pnpm --filter @layo/server typecheck` passed after fixing TypeScript narrowing.
- Playwright CLI proof: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "external Figma" --workers=1 --reporter=line` passed after killing a stale non-Layo dev server that had occupied port 5173. The verified interaction uploaded a Figma ZIP package, saw `ZIP`, `에셋 1개`, and `assets/figma-image-hero.png` in review, clicked `외부 디자인 가져오기`, then verified the imported image node and fetchable PNG asset bytes.
- Repository gates GREEN: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `cargo test -p editor-core`, `pnpm test`, `pnpm test:e2e` with 145 passing tests, and `git diff --check` all passed.
