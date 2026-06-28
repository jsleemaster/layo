# Figma JSON Basic Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a Figma REST file JSON export containing pages, frames, rectangles, and text into a fresh Layo project/document instead of stopping at no-write preflight.

**Architecture:** Keep preflight as the no-write gate, then add a separate mapper that accepts Figma REST JSON and produces a Layo `DesignFile`. `FileStorage` owns the write path by creating a fresh private project and saving the mapped document; HTTP, web API helpers, and the file panel call that storage import route. Unsupported Figma node types remain skipped with warnings so this slice improves real migration maturity without pretending full Penpot/Figma parity.

**Tech Stack:** TypeScript, Fastify, Vitest, React, Playwright CLI, local-first `.layo` storage.

---

### Task 1: Mapper Contract

**Files:**
- Modify: `apps/server/src/external-migration.test.ts`
- Modify: `apps/server/src/external-migration.ts`

- [x] **Step 1: Write the failing test**

Add a test that imports a Figma REST JSON buffer and expects a Layo `DesignFile` with one page, a frame, a rectangle, and a text node. The test must assert geometry, solid fill conversion, text content, `canImport: true` on review, and an unsupported-node warning.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "imports basic Figma REST JSON"
```

Expected: fail because `importExternalMigrationArchive` does not exist and review still returns `canImport: false`.

- [x] **Step 3: Write minimal implementation**

Export `importExternalMigrationArchive(archive, options)` from `external-migration.ts`. It should parse only Figma REST JSON, map `CANVAS` to pages, `FRAME` to frame nodes, `RECTANGLE` to rectangle nodes, `TEXT` to text nodes, convert visible solid RGB fills to hex, preserve basic bounds, skip unsupported nodes, and throw a validation error for non-importable inputs.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "Figma|opaque|Penpot"
```

Expected: mapper test passes, Penpot ZIP remains no-write, opaque Figma binary remains blocked.

### Task 2: Storage And HTTP Import Route

**Files:**
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/http.test.ts`

- [x] **Step 1: Write the failing test**

Add an HTTP test for `POST /migrations/external/import` with a Figma JSON payload. The response must contain the created project, mapped file, `source: "figma"`, and `mappedNodeCount`; `FileStorage.listProjects()` and `readFile()` must prove a persisted project/document exists.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/http.test.ts -t "imports external Figma"
```

Expected: fail with 404 for `/migrations/external/import`.

- [x] **Step 3: Write minimal implementation**

Add `FileStorage.importExternalMigrationArchive()` and `POST /migrations/external/import`. The route accepts `{ archiveBase64, fileName, sourceHint, projectId, documentId, name }`, creates a fresh private project, writes the mapped document, and returns `{ imported }`.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/external-migration.test.ts src/http.test.ts -t "Figma|external"
```

Expected: external import tests pass and existing no-write review tests stay green.

### Task 3: Web API And File Panel Import

**Files:**
- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/document-api.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write the failing tests**

Add a web API test for `importExternalMigrationArchive()` posting to `/migrations/external/import`. Update the Playwright file-panel test so a Figma JSON upload shows `가져오기 가능`, exposes `외부 디자인 가져오기`, clicks it, then verifies the imported project and canvas/layer text.

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "external migration" --workers=1 --reporter=line
```

Expected: fail because the web API helper and import button are missing.

- [x] **Step 3: Write minimal implementation**

Add `importExternalMigrationArchive()` to `document-api.ts`. Store `archiveBase64` in `ExternalMigrationReviewState`, render the import button when `review.canImport` is true, call the new helper, add the returned project to the project list, load the returned document, and show an import status.

- [x] **Step 4: Run focused GREEN**

Run:

```bash
pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "external migration" --workers=1 --reporter=line
```

Expected: web helper and Playwright import flow pass.

### Task 4: Documentation And Gates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update docs after GREEN**

Record that Figma REST JSON now has a first write-enabled mapper for frames, rectangles, and text; keep image assets, components, effects, variants, and Penpot ZIP mapping listed as remaining gaps.

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

Expected: all pass before PR creation.

## Execution Evidence

- RED server mapper: `pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "imports basic Figma REST JSON|Figma REST file JSON"` failed because review still returned `canImport: false` and `importExternalMigrationArchive` did not exist.
- RED HTTP route: `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "imports external Figma"` failed with `404` for `/migrations/external/import`.
- RED web helper: `pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"` failed because `importExternalMigrationArchive` did not exist.
- Playwright setup failure recorded: direct `pnpm exec playwright test ... --grep "external Figma"` failed with `ERR_CONNECTION_REFUSED`, so browser verification used the repository `scripts/run-e2e.mjs` runner.
- Focused GREEN server/web: `pnpm --filter @layo/server exec vitest run src/external-migration.test.ts -t "Figma|opaque|Penpot"`, `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "external Figma|external Penpot"`, and `pnpm --dir apps/web exec vitest run src/document-api.test.ts -t "external migration"` passed.
- Focused Playwright CLI GREEN: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "external Figma" --workers=1 --reporter=line` passed.
- Broad verification GREEN: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `cargo test -p editor-core`, `pnpm test`, `pnpm test:e2e` with 145 passing tests, and `git diff --check`.
