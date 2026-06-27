# Dev Panel WEBP PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render WEBP image nodes visibly inside Dev Panel PDF artifacts while preserving the original WEBP source file in the PDF attachment list.

**Architecture:** Keep `pdfForNode` synchronous and deterministic by accepting an optional PNG preview for image assets. The browser asset loader will fetch stored WEBP bytes, create an offscreen canvas PNG preview through native image decoding, pass the preview to `pdfForNode`, and still embed the original WEBP bytes through `/EmbeddedFiles`.

**Tech Stack:** React, TypeScript, Vitest, Playwright CLI, browser `Image`/canvas decode, existing `fflate` PDF PNG stream support.

---

## Penpot Reference

- Penpot layer export supports WEBP as an image export format and PDF as a layer export format.
- Layo adapts that expectation by preserving source image assets and making image-bearing selected-layer PDFs visibly render, not just attach the original file.

## Files

- Modify: `apps/web/src/node-artifacts.ts`
- Modify: `apps/web/src/node-artifacts.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Unit-Test WEBP PDF Preview Rendering

- [x] **Step 1: Write failing WEBP PDF test**

Add a `webpImageAsset` test fixture whose `mimeType` is `image/webp`, whose `dataBase64` is a small WEBP byte string, and whose `pdfPreviewPngBase64` is the existing 1x1 PNG fixture.

Assert that `pdfForNode(imageNode, { assets: { "asset-pixel": webpImageAsset } })` contains:

- `/Subtype /image#2Fwebp`
- `/Subtype /Image`
- `/Filter /FlateDecode`
- `/ColorSpace /DeviceRGB`
- `/Im1 Do`

Also assert the placeholder rectangle commands are absent.

- [x] **Step 2: Run RED unit test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: FAIL because `NodeArtifactAsset` does not yet accept/use a PDF preview.

- [x] **Step 3: Implement artifact preview support**

Add optional `pdfPreviewPngBase64?: string` to `NodeArtifactAsset`. In `pdfForNode`, if the source asset is not PNG/JPEG but a preview PNG exists, decode that preview with the existing PNG path and render it as the image XObject while preserving the original source embedded file.

- [x] **Step 4: Run GREEN unit test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: PASS.

## Task 2: Browser-Prove WEBP PDF Downloads

- [x] **Step 1: Generate PDF previews while loading browser assets**

In `apps/web/src/App.tsx`, when `loadArtifactAssetsForNode` fetches an `image/webp` asset, create an object URL, load it into an `Image`, draw it to a canvas, export a PNG blob, and attach `pdfPreviewPngBase64`.

- [x] **Step 2: Add Playwright coverage**

Extend `createImageDataTransfer` to accept a MIME type. Add a focused e2e that drops a WEBP image, opens the Dev panel, downloads PDF, and asserts:

- original source bytes are embedded as `/Subtype /image#2Fwebp`;
- the PDF contains `/Subtype /Image`, `/Filter /FlateDecode`, `/ColorSpace /DeviceRGB`, and `/Im1 Do`;
- placeholder fill rectangle commands are absent.

- [x] **Step 3: Run Playwright CLI proof**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "webp image artifacts" --reporter=line
```

Expected: PASS.

## Task 3: Product Docs And Verification

- [x] **Step 1: Update maturity docs**

Record that WEBP image nodes now render visibly inside Dev Panel PDFs through browser-generated PNG previews. Keep broader raster/effect fidelity, richer annotations, webhooks/API stories, and repo mappings as later gaps.

- [x] **Step 2: Run verification gates**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "webp image artifacts" --reporter=line
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

Verification evidence:

- RED unit proof: `pnpm --filter @layo/web test -- src/node-artifacts.test.ts` failed before preview support because WEBP PDF artifacts only embedded the source file and still drew the placeholder rectangle.
- RED e2e proof: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "webp image artifacts" --reporter=line` failed before browser preview generation because the downloaded PDF had `/Subtype /image#2Fwebp` but no `/Subtype /Image`.
- GREEN focused unit: `pnpm --filter @layo/web test -- src/node-artifacts.test.ts` passed with 15 files and 139 tests.
- GREEN focused e2e: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "webp image artifacts" --reporter=line` passed with 1 test.
- Product gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, and `git diff --check` passed.
- Build/type gates: `pnpm --filter @layo/web build` and `pnpm typecheck` passed.
- Broad gates: `pnpm test` passed; `pnpm test:e2e` passed with 115 Playwright CLI tests.
