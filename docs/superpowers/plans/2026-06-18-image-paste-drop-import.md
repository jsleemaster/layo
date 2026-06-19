# Image Paste And Drop Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first image insertion by clipboard paste and drag-and-drop, backed by persisted asset storage and real canvas rendering.

**Architecture:** Store image binaries in the local Fastify server under an asset API, then create normal `image` design nodes that reference `asset_id`. The React editor uploads image files from clipboard/drop events, creates image nodes through existing editor command flow, renders those nodes with `react-konva`, and records the Figma import path as a later roadmap item.

**Tech Stack:** Fastify, Node filesystem storage, React 19, react-konva, Vitest, Playwright CLI.

## Global Constraints

- Browser debugging and visual verification must use Playwright CLI.
- Keep user-facing web UI Korean-first.
- Preserve local-first behavior; do not introduce a maintainer-operated production backend.
- Figma parity work must stay aligned with `docs/product/figma-feature-inventory.md` and `docs/product/figma-migration-roadmap.md`.
- This slice implements image paste/drop only; full Figma file import is documented as a later import/export lane.

---

### Task 1: Server Asset Storage API

**Files:**
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/http.ts`
- Test: `apps/server/src/http.test.ts`

**Interfaces:**
- Consumes: `FileStorage` local root directory.
- Produces: `FileStorage.createAsset(input)` and `FileStorage.readAsset(assetId)`.
- Produces HTTP `POST /assets` with `{ name, mimeType, dataBase64 }`.
- Produces HTTP `GET /assets/:assetId` returning the stored image bytes with the stored content type.

- [ ] **Step 1: Write the failing HTTP test**

Add a test named `stores and serves image assets` in `apps/server/src/http.test.ts`:

```ts
test("stores and serves image assets", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
  const server = createHttpServer(new FileStorage(tempRoot));

  const uploaded = await server.inject({
    method: "POST",
    url: "/assets",
    payload: {
      name: "pixel.png",
      mimeType: "image/png",
      dataBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    }
  });

  expect(uploaded.statusCode).toBe(200);
  const asset = uploaded.json().asset as { assetId: string; mimeType: string; url: string; byteLength: number };
  expect(asset.assetId).toMatch(/^asset-/);
  expect(asset.mimeType).toBe("image/png");
  expect(asset.byteLength).toBeGreaterThan(0);
  expect(asset.url).toBe(`/assets/${asset.assetId}`);

  const served = await server.inject({ method: "GET", url: asset.url });
  expect(served.statusCode).toBe(200);
  expect(served.headers["content-type"]).toContain("image/png");
  expect(served.rawPayload.length).toBe(asset.byteLength);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @canvas-mcp-editor/server test -- src/http.test.ts -t "stores and serves image assets"
```

Expected: FAIL with `404` or missing `/assets` route.

- [ ] **Step 3: Implement minimal asset storage and routes**

Add an `assetsDir`, safe generated asset ids, MIME validation for `image/png`, `image/jpeg`, `image/webp`, and `image/gif`, binary storage, metadata storage, `POST /assets`, and `GET /assets/:assetId`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @canvas-mcp-editor/server test -- src/http.test.ts -t "stores and serves image assets"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/storage.ts apps/server/src/http.ts apps/server/src/http.test.ts
git commit -m "Add local image asset storage"
```

### Task 2: Image Node Creation Helper

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

**Interfaces:**
- Consumes: uploaded asset metadata `{ assetId, width, height, x, y }`.
- Produces: `createImageNode(sequence, input)` returning a normal `RendererNode` with `kind: "image"` and `content: { type: "image", asset_id }`.

- [ ] **Step 1: Write the failing unit test**

Add a test named `creates image nodes backed by asset ids` in `apps/web/src/editor-state.test.ts`:

```ts
test("creates image nodes backed by asset ids", () => {
  const node = createImageNode(3, {
    assetId: "asset-test",
    name: "붙여넣은 이미지",
    x: 24,
    y: 36,
    width: 120,
    height: 80
  });

  expect(node).toMatchObject({
    id: "image-3",
    kind: "image",
    name: "붙여넣은 이미지",
    transform: { x: 24, y: 36, rotation: 0 },
    size: { width: 120, height: 80 },
    content: { type: "image", asset_id: "asset-test" },
    children: []
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts -t "creates image nodes backed by asset ids"
```

Expected: FAIL because `createImageNode` is missing.

- [ ] **Step 3: Implement the helper**

Implement `createImageNode(sequence, input)` in `apps/web/src/editor-state.ts` with positive width/height clamping and Korean default name.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts -t "creates image nodes backed by asset ids"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/editor-state.ts apps/web/src/editor-state.test.ts
git commit -m "Add image node creation helper"
```

### Task 3: Web Image Upload, Paste, Drop, And Rendering

**Files:**
- Create: `apps/web/src/asset-api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: browser `ClipboardEvent` and `DragEvent` image files.
- Consumes: `uploadImageAsset(file)` returning `{ assetId, url, mimeType, byteLength }`.
- Produces: image nodes inserted into the active document at the drop point or stage center.
- Produces: rendered Konva image content and selected image node in the inspector/layer list.

- [ ] **Step 1: Write the failing Playwright test**

Add a test named `inserts image files from drop and clipboard paste` in `apps/web/e2e/editor-mvp.spec.ts`. It should create a project, drop a tiny PNG file onto `stage-frame`, assert an image layer appears, assert the selected node has a size badge, dispatch a paste event with another tiny PNG, and assert two image nodes are present in the loaded document JSON.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inserts image files from drop and clipboard paste" --reporter=line
```

Expected: FAIL because no paste/drop image insertion exists.

- [ ] **Step 3: Implement upload helper and image rendering**

Create `apps/web/src/asset-api.ts` with `uploadImageAsset(file)`. In `App.tsx`, import `Image as KonvaImage`, load `image` node assets by URL, handle image file drops on `stage-frame`, handle global paste events when focus is not inside an input, and dispatch `create_node` with `createImageNode`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inserts image files from drop and clipboard paste" --reporter=line
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/asset-api.ts apps/web/src/App.tsx apps/web/e2e/editor-mvp.spec.ts apps/web/src/styles.css
git commit -m "Add image paste and drop insertion"
```

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/product/figma-feature-inventory.md`
- Modify: `docs/product/figma-migration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Consumes: implemented image paste/drop behavior.
- Produces: docs that distinguish landed image paste/drop from later full Figma file import.

- [ ] **Step 1: Update docs**

Record that image insertion via paste/drop is landed, and that full Figma file import remains under Lane 6 import/export.

- [ ] **Step 2: Run focused and full checks**

Run:

```bash
git diff --check
pnpm --filter @canvas-mcp-editor/server test -- src/http.test.ts -t "stores and serves image assets"
pnpm --filter @canvas-mcp-editor/web test -- src/editor-state.test.ts -t "creates image nodes backed by asset ids"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inserts image files from drop and clipboard paste" --reporter=line
pnpm typecheck
pnpm test
pnpm --filter @canvas-mcp-editor/web build
```

- [ ] **Step 3: Direct Playwright CLI interaction pass**

Start local server/web if needed, then use Playwright CLI against the live editor to create a project, drop an image, paste an image, select the inserted layer, and verify it visibly renders and shows size/inspector state.

- [ ] **Step 4: Commit docs and final fixes**

```bash
git add docs/product/figma-feature-inventory.md docs/product/figma-migration-roadmap.md docs/superpowers/PLAN_STATUS.md
git commit -m "Document image import workflow"
```
