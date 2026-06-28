# Penpot Migration Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-write Penpot/Figma migration preflight so Layo can accept external design exports, classify them, show import blockers, and avoid pretending unsupported files were imported.

**Architecture:** Reuse the existing archive-review pattern instead of writing directly into storage. `apps/server/src/external-migration.ts` classifies ZIP/JSON/binary payloads, reports entries/assets/document candidates, and always returns `canImport: false` until a real geometry/style mapper is implemented. HTTP, CLI, web API, and the file panel expose the same review contract.

**Tech Stack:** TypeScript, Fastify inject tests, Vitest, Playwright CLI, Node test runner, existing ZIP utility.

## Global Constraints

- Browser verification must use Playwright CLI.
- No external migration review writes files, projects, documents, or assets.
- Figma `.fig` binary files are not treated as importable; users need Figma REST JSON plus exported image assets.
- Penpot ZIP files are classified and inspected, but geometry/style mapping remains blocked until a dedicated mapper lands.
- GitHub Pages is not a deployment target for Layo.

---

### Task 1: Archive Reader And Server Review Contract

**Files:**
- Modify: `apps/server/src/file-archive.ts`
- Modify: `apps/server/src/file-archive.test.ts`
- Create: `apps/server/src/external-migration.ts`
- Create: `apps/server/src/external-migration.test.ts`

**Interfaces:**
- Produces: `reviewExternalMigrationArchive(archive: Buffer, options?: { fileName?: string; sourceHint?: "penpot" | "figma" | "unknown" }): ExternalMigrationReview`
- Produces: `ExternalMigrationReview.canImport === false` with `blockedBy` and `nextSteps`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(reviewExternalMigrationArchive(penpotZip, { fileName: "team.penpot" })).toMatchObject({
  source: "penpot",
  archiveKind: "zip",
  canImport: false,
  blockedBy: expect.arrayContaining(["mapping_not_implemented"])
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @layo/server exec vitest run src/file-archive.test.ts src/external-migration.test.ts`

Expected: FAIL because `external-migration.ts` does not exist and deflated ZIP reading is unsupported.

- [ ] **Step 3: Implement the minimal reader/review code**

Add deflate support to `readZipArchive()` via `inflateRawSync`, then implement `reviewExternalMigrationArchive()` using only buffer inspection and JSON parsing.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @layo/server exec vitest run src/file-archive.test.ts src/external-migration.test.ts`

Expected: PASS.

### Task 2: HTTP, CLI, And Script Guard

**Files:**
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/http.test.ts`
- Create: `apps/server/src/external-migration-cli.ts`
- Create: `scripts/layo-migration-review.mjs`
- Modify: `package.json`
- Modify: `scripts/check-dev-scripts.test.mjs`

**Interfaces:**
- Produces: `POST /migrations/external/review` returning `{ review }`.
- Produces: `pnpm run migration:review -- review --archive <file> [--source penpot|figma]`.

- [ ] **Step 1: Write the failing tests**

```ts
const response = await server.inject({
  method: "POST",
  url: "/migrations/external/review",
  payload: { archiveBase64, fileName: "sample.penpot" }
});
expect(response.json().review.source).toBe("penpot");
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @layo/server exec vitest run src/http.test.ts` and `node --test scripts/check-dev-scripts.test.mjs`

Expected: FAIL because the route and script do not exist.

- [ ] **Step 3: Implement route, CLI, package script, and guard test target**

The route calls `reviewExternalMigrationArchive()`. The CLI reads one file and prints JSON; it never imports.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @layo/server exec vitest run src/http.test.ts` and `node --test scripts/check-dev-scripts.test.mjs`

Expected: PASS.

### Task 3: Web API And File Panel Surface

**Files:**
- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/document-api.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

**Interfaces:**
- Produces: `reviewExternalMigrationArchive(archiveBase64, { fileName, sourceHint })` in the web API.
- Produces: file-panel UI with `data-testid="external-migration-upload"` and `data-testid="external-migration-review"`.

- [ ] **Step 1: Write the failing tests**

```ts
await page.getByTestId("external-migration-upload").setInputFiles(figmaJsonPath);
await expect(page.getByTestId("external-migration-review")).toContainText("Figma");
await expect(page.getByTestId("external-migration-review")).toContainText("쓰기 없음");
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --dir apps/web exec vitest run src/document-api.test.ts` and `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "external migration" --reporter=line`

Expected: FAIL because the helper and UI are missing.

- [ ] **Step 3: Implement helper, state, upload handler, and read-only review card**

The UI exposes review details and blockers but no import button.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --dir apps/web exec vitest run src/document-api.test.ts` and `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "external migration" --reporter=line`

Expected: PASS.

### Task 4: Product Docs And Full Verification

**Files:**
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Produces: updated maturity evidence that external migration has no-write preflight but still lacks geometry/style import mapping.

- [ ] **Step 1: Update docs**

Record the landed preflight and keep the real import mapper gap visible.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/file-archive.test.ts src/external-migration.test.ts src/http.test.ts
node --test scripts/check-dev-scripts.test.mjs
pnpm --dir apps/web exec vitest run src/document-api.test.ts
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "external migration" --reporter=line
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
cargo test -p editor-core
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass before PR.
