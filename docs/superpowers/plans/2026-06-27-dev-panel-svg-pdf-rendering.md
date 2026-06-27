# Dev Panel SVG PDF Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render SVG image nodes visibly inside Dev Panel PDF artifacts while preserving the original SVG source file in the PDF attachment list.

**Architecture:** Reuse the PDF preview lane added for WEBP assets. `pdfForNode` stays synchronous and renders any supplied PNG preview as the PDF image XObject, while the browser import path falls back from `createImageBitmap` to `Image` decoding for SVG size reads and the asset loader decides which browser-decodable non-PDF-native image MIME types need a PNG preview. SVG source bytes remain embedded through `/EmbeddedFiles`.

**Tech Stack:** React, TypeScript, Vitest, Playwright CLI, browser `Image`/canvas decode, existing `fflate` PDF PNG stream support.

---

## Penpot Reference

- Penpot layer export treats SVG and PDF as first-class handoff/export formats.
- Layo adapts that expectation by keeping imported SVG source assets portable while ensuring image-bearing selected-layer PDFs are visibly useful.

## Files

- Modify: `apps/web/src/node-artifacts.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Browser-RED SVG PDF Downloads

- [x] **Step 1: Add Playwright RED coverage**

Add a `createSvgImageDataTransfer` helper that returns a `File` with `type: "image/svg+xml"`. Add a focused e2e that drops an SVG image, opens the Dev panel, downloads PDF, and asserts:

- the PDF contains `/Subtype /image#2Fsvg#2Bxml`
- the PDF contains the original `<svg` source bytes
- the PDF contains `/Subtype /Image`, `/Filter /FlateDecode`, `/ColorSpace /DeviceRGB`, and `/Im1 Do`
- the image placeholder rectangle is absent

- [x] **Step 2: Run RED Playwright CLI proof**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "svg image artifacts" --reporter=line
```

Result: FAIL before implementation. The first failure showed SVG drop could not create an image node. After size fallback was added, the failure moved to `unsupported image mime type: image/svg+xml` from server asset storage.

## Task 2: Unit-Test Generic SVG PDF Preview Rendering

- [x] **Step 1: Add SVG PDF core regression test**

Add an SVG asset fixture:

```ts
const pixelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#7c3aed"/></svg>`;
const pixelSvgBase64 = Buffer.from(pixelSvg).toString("base64");

const svgImageAsset: NodeArtifactAsset & { pdfPreviewPngBase64: string } = {
  assetId: "asset-pixel",
  mimeType: "image/svg+xml",
  dataBase64: pixelSvgBase64,
  name: "pixel.svg",
  pdfPreviewPngBase64: pixelPngBase64
};
```

Add a test that calls `pdfForNode(imageNode, { assets: { "asset-pixel": svgImageAsset } })` and asserts:

- `/Subtype /image#2Fsvg#2Bxml`
- original SVG bytes are included
- `/Subtype /Image`
- `/Filter /FlateDecode`
- `/ColorSpace /DeviceRGB`
- `/Im1 Do`
- placeholder fill rectangle commands are absent

- [x] **Step 2: Run unit regression test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: PASS because `pdfForNode` already renders supplied PNG previews for non-PNG image assets.

- [x] **Step 3: Keep artifact PDF core generic**

No new PDF encoder path should be necessary. Confirm `pdfForNode` already renders `pdfPreviewPngBase64` for non-PNG assets and only the browser asset loader needs MIME expansion.

- [x] **Step 4: Run unit test after implementation**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Result: PASS. `pnpm --filter @layo/web test -- src/node-artifacts.test.ts` passed with 15 files and 140 tests.

## Task 3: Browser-Prove SVG PDF Downloads

- [x] **Step 1: Restore SVG image size decoding**

In `apps/web/src/App.tsx`, let `readImageFileSize` fall back to the existing `Image` object URL decode when `createImageBitmap(file)` rejects. This keeps PNG/JPEG/WEBP on the fast path while allowing SVG files to import.

- [x] **Step 2: Generate PDF previews for SVG browser assets**

In `apps/web/src/App.tsx`, replace the WEBP-only condition:

```ts
const pdfPreviewPngBase64 = mimeType === "image/webp" ? await renderImageBlobToPngBase64(blob) : undefined;
```

with a helper that returns true for `image/webp` and `image/svg+xml`:

```ts
function shouldRenderPdfPreviewForImageAsset(mimeType: string) {
  return mimeType === "image/webp" || mimeType === "image/svg+xml";
}
```

- [x] **Step 3: Run GREEN Playwright CLI proof**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "svg image artifacts" --reporter=line
```

Result: PASS. `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "svg image artifacts" --reporter=line` passed with 1 test.

## Task 4: Product Docs And Verification

- [x] **Step 1: Update maturity docs**

Record that SVG image nodes now render visibly inside Dev Panel PDFs through browser-generated PNG previews. Keep broader raster/effect export fidelity, richer annotations, webhooks/API stories, and repo mappings as later gaps.

- [x] **Step 2: Run verification gates**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "svg image artifacts" --reporter=line
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass.

Verification evidence:

- RED e2e proof: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "svg image artifacts" --reporter=line` first failed because SVG drop could not create an image node. After SVG image size fallback was added, the same flow exposed server storage rejection for `image/svg+xml`.
- RED server proof: `pnpm --filter @layo/server test -- src/http.test.ts -t "stores and serves svg image assets"` failed with HTTP 500 before SVG MIME support.
- GREEN focused server: `pnpm --filter @layo/server test -- src/http.test.ts -t "stores and serves svg image assets"` passed with 7 files and 100 tests.
- GREEN focused unit: `pnpm --filter @layo/web test -- src/node-artifacts.test.ts` passed with 15 files and 140 tests.
- GREEN focused e2e: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "svg image artifacts" --reporter=line` passed with 1 test.
- Product gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, and `git diff --check` passed.
- Build/type gates: `pnpm --filter @layo/web build` and `pnpm typecheck` passed.
- Broad gates: `pnpm test` passed; `pnpm test:e2e` passed with 116 Playwright CLI tests.
