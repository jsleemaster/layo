# Dev Panel PNG PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render PNG image nodes visibly inside Dev Panel PDF artifacts instead of drawing only a placeholder rectangle while still embedding the original source image file.

**Architecture:** Add a small PNG decoder for non-interlaced 8-bit PNG assets used by browser image paste/drop. Convert decoded pixels to PDF Image XObjects with `/Filter /FlateDecode`, `/ColorSpace /DeviceRGB`, and optional soft-mask XObjects for alpha. Keep the original image bytes in `/EmbeddedFiles` so the source asset remains recoverable.

**Tech Stack:** TypeScript, Vitest, Playwright CLI, PDF image XObjects, PNG chunk parsing, `fflate` for browser-compatible sync zlib inflate/deflate, and direct PNG filter decoding.

---

## Penpot Reference

- Penpot layer export supports SVG/PDF export of selected layers.
- Layo adapts this through the Inspector Dev tab. The previous slice preserved PNG source bytes, but PDF visual rendering still showed a placeholder. This slice closes that visible gap for standard PNG assets.

## Files

- Modify: `apps/web/src/node-artifacts.ts`
- Modify: `apps/web/src/node-artifacts.test.ts`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Unit-Test PNG PDF Image XObjects

- [x] **Step 1: Write failing PNG PDF test**

Add a test to `apps/web/src/node-artifacts.test.ts` using the existing `imageNode` and `imageAsset`.

Assert that `pdfForNode(imageNode, { assets: { "asset-pixel": imageAsset } })` contains:

- `/Subtype /Image`
- `/Filter /FlateDecode`
- `/ColorSpace /DeviceRGB`
- `/SMask`
- `/Im1 Do`

Also assert that the PDF no longer uses the placeholder fill color command for the image body.

- [x] **Step 2: Run RED unit test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: FAIL because PNG image assets are embedded as source files but not rendered as PDF Image XObjects.

- [x] **Step 3: Implement PNG XObject rendering**

Add a minimal PNG parser in `apps/web/src/node-artifacts.ts` that:

- verifies the PNG signature,
- reads `IHDR`, `IDAT`, and `IEND`,
- supports non-interlaced 8-bit truecolor and truecolor-alpha PNGs,
- inflates concatenated `IDAT`,
- applies PNG filters 0-4,
- emits RGB bytes as the image XObject stream,
- emits grayscale alpha bytes as a soft-mask XObject when alpha is present.

- [x] **Step 4: Run GREEN unit test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: PASS.

## Task 2: Browser-Prove PNG PDF Downloads

- [x] **Step 1: Extend Playwright PDF image test**

Update `apps/web/e2e/editor-mvp.spec.ts` image asset PDF assertions to also check `/Subtype /Image`, `/Filter /FlateDecode`, `/ColorSpace /DeviceRGB`, `/SMask`, and `/Im1 Do`.

- [x] **Step 2: Run Playwright CLI proof**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "image asset bytes" --reporter=line
```

Expected: PASS with the downloaded PDF containing a rendered PNG image XObject.

## Task 3: Product Docs And Verification

- [x] **Step 1: Update maturity docs**

Record that PNG image nodes now render visibly inside Dev Panel PDFs. Keep broader raster/effect fidelity, WEBP PDF visual rendering, richer annotations, webhooks/API stories, and repo mappings as later gaps.

- [x] **Step 2: Run verification gates**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "image asset bytes" --reporter=line
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass.

## Verification Evidence

- RED observed before implementation: `pnpm --filter @layo/web test -- src/node-artifacts.test.ts` failed because the selected PNG PDF contained only `/EmbeddedFiles` and placeholder rectangle commands, not `/Subtype /Image`.
- GREEN focused checks:
  - `pnpm --filter @layo/web test -- src/node-artifacts.test.ts`: 15 files passed, 138 tests.
  - `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "image asset bytes" --reporter=line`: 1 passed.
- Product gates:
  - `pnpm run check:penpot-maturity`: pass.
  - `pnpm run check:design-rules`: pass.
- Broad gates:
  - `pnpm --filter @layo/web typecheck`: pass.
  - `pnpm --filter @layo/web build`: pass.
  - `pnpm typecheck`: pass.
  - `pnpm test`: pass.
  - `pnpm test:e2e`: 114 passed.
  - `git diff --check`: pass.
