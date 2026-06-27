# Dev Panel Image Asset Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dev Panel SVG/PDF exports carry the actual image assets referenced by selected image nodes and selected frames/groups that contain images.

**Architecture:** Extend the tested `node-artifacts` module with optional artifact assets keyed by `assetId`. SVG exports render image nodes with data-URL `<image>` tags. PDF exports embed source image bytes as standard PDF embedded-file streams and render JPEG assets as image XObjects, while leaving non-JPEG visual rasterization as a later fidelity gap.

**Tech Stack:** React, TypeScript, Vitest, Playwright CLI, Vite browser downloads, local HTTP asset API.

---

## Penpot Reference

- Penpot layer export supports image-bearing layers and formats including SVG and PDF.
- Layo adapts that expectation through the Inspector Dev tab and export preset review ZIPs. The product requirement for this slice is that exported artifacts no longer lose referenced source image assets.

## Files

- Modify: `apps/web/src/node-artifacts.ts`
- Modify: `apps/web/src/node-artifacts.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Unit-Test Image Asset Artifacts

- [x] **Step 1: Write failing artifact tests**

Add tests to `apps/web/src/node-artifacts.test.ts` that create an `image` node with `content.asset_id = "asset-pixel"`, pass `{ assets: { "asset-pixel": { assetId: "asset-pixel", mimeType: "image/png", dataBase64: pixelPngBase64 } } }`, and assert:

- `svgForNode(imageNode, options)` contains `<image`, `href="data:image/png;base64,..."`, `data-image-asset-id="asset-pixel"`, and no placeholder-only `rect`.
- `pdfForNode(imageNode, options)` returns bytes whose decoded structure contains `/EmbeddedFiles`, `/Type /EmbeddedFile`, and `/Subtype /image#2Fpng`, and whose raw bytes contain the PNG signature.

- [x] **Step 2: Run RED unit test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: FAIL because `svgForNode` and `pdfForNode` ignore artifact assets.

- [x] **Step 3: Implement artifact asset options**

Add `NodeArtifactAsset`, `NodeArtifactOptions`, and `imageAssetIdsForNode`. Render SVG image nodes as data-url `<image>` elements when the matching asset exists. Embed PDF source image bytes through an EmbeddedFiles name tree, and render JPEG assets as XObjects.

- [x] **Step 4: Run GREEN unit test**

Run:

```bash
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: PASS.

## Task 2: Wire Browser Downloads To Asset Bytes

- [x] **Step 1: Fetch artifact assets before SVG/PDF downloads**

In `apps/web/src/App.tsx`, collect image asset ids from the selected/exported node tree, fetch `/assets/:assetId`, convert blobs to base64, and pass the resulting map into `svgForNode` and `pdfForNode`.

- [x] **Step 2: Run focused web checks**

Run:

```bash
pnpm --filter @layo/web typecheck
pnpm --filter @layo/web test -- src/node-artifacts.test.ts
```

Expected: PASS.

## Task 3: Browser-Prove Image Exports

- [x] **Step 1: Add Playwright download coverage**

Extend `apps/web/e2e/editor-mvp.spec.ts`: create a project, drop a generated PNG image onto the canvas, select `이미지 3`, open the Dev tab, download SVG and PDF, and assert:

- SVG contains `data:image/png;base64,`.
- PDF contains `/EmbeddedFiles`, `/Type /EmbeddedFile`, `/Subtype /image#2Fpng`, and the PNG signature bytes.

- [x] **Step 2: Run Playwright CLI proof**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "image asset bytes" --reporter=line
```

Expected after implementation: PASS.

## Task 4: Product Docs And Verification

- [x] **Step 1: Update maturity docs**

Record that source image assets now survive SVG/PDF artifacts, while deeper non-JPEG PDF visual rendering and raster/effect export fidelity remain open.

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

- RED observed before implementation: `pnpm --filter @layo/web test -- src/node-artifacts.test.ts` failed because `imageAssetIdsForNode` did not exist, SVG still emitted the placeholder rectangle path, and `pdfForNode` returned a string instead of bytes.
- GREEN focused unit/type checks:
  - `pnpm --filter @layo/web test -- src/node-artifacts.test.ts`: 15 files passed, 137 tests.
  - `pnpm --filter @layo/web typecheck`: pass.
- Playwright CLI proof:
  - `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "image asset bytes" --reporter=line`: 1 passed.
  - `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector dev panel downloads the selected layer as (svg|pdf)|nested child layers|image asset bytes" --reporter=line`: 4 passed.
- Product gates:
  - `pnpm run check:penpot-maturity`: pass.
  - `pnpm run check:design-rules`: pass.
- Broad gates:
  - `pnpm --filter @layo/web build`: pass.
  - `pnpm typecheck`: pass.
  - `pnpm test`: pass.
  - `pnpm test:e2e`: 114 passed.
  - `git diff --check`: pass.
