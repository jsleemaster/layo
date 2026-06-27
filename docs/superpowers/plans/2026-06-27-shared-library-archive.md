# Shared Library Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Layo shared-library archive that exports, reviews, and imports reusable components, tokens, and referenced assets between files.

**Architecture:** Adapt Penpot/Figma shared-library expectations to Layo's local-first model with an inspectable `.layo-library.zip` package. A library archive contains a source file's `components[]`, `tokens[]`, and only image assets referenced by component source nodes; imports merge into an existing target file after a server-validated no-write review. Do not add hosted registry or live library sync in this slice.

**Tech Stack:** TypeScript, Fastify, Vite React, Vitest, Playwright CLI, existing Layo filesystem storage, ZIP archive utilities, and file-panel archive UI patterns.

---

## Penpot Gap

- Reference capability: Penpot teams can publish reusable design libraries and reuse components, colors, and typography across files.
- Source URL: https://help.penpot.app/user-guide/design-systems/libraries/
- Layo decision: **Adapt.** Layo should first support package-style local/team library handoff before hosted registry, permissions, or live sync.
- Maturity gates:
  - Gate 3, **Design systems:** shared libraries, reusable components, variables, styles.
  - Gate 5, **Import/export maturity:** shared library packaging.

## File Map

- Modify `apps/server/src/storage.ts`
  - Add `LIBRARY_ARCHIVE_MIME_TYPE`, library archive types, export/review/import methods, and token/component id remapping helpers.
- Modify `apps/server/src/storage.test.ts`
  - Add RED/GREEN storage coverage for exporting a component/token library and importing into another file without overwriting existing ids.
- Modify `apps/server/src/http.ts`
  - Add `GET /files/:fileId/export/library`, `POST /files/:fileId/import/library/review`, and `POST /files/:fileId/import/library`.
- Modify `apps/server/src/http.test.ts`
  - Add route coverage for library export/review/import.
- Modify `apps/web/src/document-api.ts`
  - Add library archive helper types and fetch helpers.
- Modify `apps/web/src/document-api.test.ts`
  - Add helper coverage for review/import/export request shapes.
- Modify `apps/web/src/App.tsx`
  - Add Korean-first library archive controls to the file panel, review card, import action, and status updates.
- Modify `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for exporting a library from one file and importing it into another file.
- Modify `docs/product/penpot-maturity-benchmark.md`
  - Move package-style shared library archives into current posture; leave hosted registry/live sync as gaps.
- Modify `docs/product/team-collaboration-roadmap.md`
  - Record team library handoff flow.
- Modify `docs/superpowers/PLAN_STATUS.md`
  - Add this plan as completed after evidence exists.

## Task 1: Storage Library Archive

**Files:**
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/storage.ts`

- [x] **Step 1: Write the failing storage test**

Add a test near existing archive tests:

```ts
test("library archive exports reviews and imports components tokens and assets without overwriting ids", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const source = await storageWithDocument(path.join(tempRoot, "source"));
  const target = await storageWithDocument(path.join(tempRoot, "target"));
  const pixelPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const asset = await source.createAsset({
    name: "library.png",
    mimeType: "image/png",
    dataBase64: pixelPng
  });

  await source.applyAgentCommands("sample-file", {
    dryRun: false,
    commands: [
      {
        type: "create_token",
        token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
      },
      {
        type: "create_token",
        token: { id: "spacing-card-gap", name: "Spacing / Card Gap", type: "spacing", value: "24px" }
      },
      {
        type: "create_rectangle",
        parentId: "frame-1",
        id: "library-card",
        name: "Library Card",
        width: 160,
        height: 96,
        fill: "#ffffff"
      },
      { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
      {
        type: "create_component",
        nodeId: "library-card",
        componentId: "component-card",
        name: "Card"
      }
    ] as any
  });
  await source.createNode("sample-file", "page-1", {
    id: "library-image",
    kind: "image",
    name: "Library Image",
    transform: { x: 60, y: 80, rotation: 0 },
    size: { width: 20, height: 20 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
    content: { type: "image", asset_id: asset.assetId, natural_width: 1, natural_height: 1, fit_mode: "fit" },
    children: []
  });
  await source.applyAgentCommands("sample-file", {
    dryRun: false,
    commands: [
      { type: "create_component", nodeId: "library-image", componentId: "component-image", name: "Image Tile" }
    ] as any
  });
  await target.applyAgentCommands("sample-file", {
    dryRun: false,
    commands: [
      {
        type: "create_token",
        token: { id: "color-brand-primary", name: "Existing Brand", type: "color", value: "#111827" }
      }
    ] as any
  });

  const exported = await source.exportLibraryArchive("sample-file");
  expect(exported).toMatchObject({
    fileId: "sample-file",
    name: "테스트 문서",
    componentCount: 2,
    tokenCount: 2,
    assetCount: 1,
    mimeType: "application/vnd.layo.library-archive+zip",
    fileName: "sample-file.layo-library.zip"
  });
  expect(exported.archive.subarray(0, 2).toString("utf8")).toBe("PK");

  const review = await target.reviewLibraryArchive("sample-file", exported.archive);
  expect(review).toMatchObject({
    originalFileId: "sample-file",
    originalName: "테스트 문서",
    componentCount: 2,
    tokenCount: 2,
    assetCount: 1,
    components: [
      expect.objectContaining({ originalComponentId: "component-card", name: "Card" }),
      expect.objectContaining({ originalComponentId: "component-image", name: "Image Tile" })
    ],
    tokens: [
      expect.objectContaining({ originalTokenId: "color-brand-primary", name: "Brand / Primary", conflict: true }),
      expect.objectContaining({ originalTokenId: "spacing-card-gap", name: "Spacing / Card Gap", conflict: false })
    ]
  });
  expect((await target.readFile("sample-file")).components ?? []).toEqual([]);

  const imported = await target.importLibraryArchive("sample-file", exported.archive, {
    idPrefix: "shared"
  });
  expect(imported).toMatchObject({
    fileId: "sample-file",
    originalFileId: "sample-file",
    componentCount: 2,
    tokenCount: 2,
    assetCount: 1,
    componentIdMap: {
      "component-card": "shared-component-card",
      "component-image": "shared-component-image"
    },
    tokenIdMap: {
      "color-brand-primary": "shared-color-brand-primary",
      "spacing-card-gap": "spacing-card-gap"
    }
  });

  const targetDocument = await target.readFile("sample-file");
  expect(targetDocument.tokens?.map((token) => [token.id, token.value])).toEqual([
    ["color-brand-primary", "#111827"],
    ["shared-color-brand-primary", "#2563eb"],
    ["spacing-card-gap", "24px"]
  ]);
  expect(targetDocument.components?.map((component) => component.id)).toEqual([
    "shared-component-card",
    "shared-component-image"
  ]);
  expect(targetDocument.components?.[0].source_node.style.fill_token).toBe("shared-color-brand-primary");
  expect(targetDocument.components?.[1].source_node.content).toMatchObject({
    type: "image",
    asset_id: asset.assetId
  });
  expect((await target.readAsset(asset.assetId)).data.equals(Buffer.from(pixelPng, "base64"))).toBe(true);
});
```

- [x] **Step 2: Run the storage test to verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "library archive"
```

Expected: FAIL because `exportLibraryArchive`, `reviewLibraryArchive`, and `importLibraryArchive` do not exist.

- [x] **Step 3: Implement storage library archives**

Add these public types near existing archive types:

```ts
export const LIBRARY_ARCHIVE_MIME_TYPE = "application/vnd.layo.library-archive+zip";

export interface LibraryArchiveManifest {
  schemaVersion: 1;
  format: "layo.library.archive";
  exportedAt: string;
  fileId: string;
  name: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
}

export interface ExportedLibraryArchive {
  fileId: string;
  name: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  mimeType: typeof LIBRARY_ARCHIVE_MIME_TYPE;
  fileName: string;
  archive: Buffer;
  manifest: LibraryArchiveManifest;
}

export interface ReviewedLibraryArchive {
  originalFileId: string;
  originalName: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  components: Array<{ originalComponentId: string; name: string; nodeCount: number; conflict: boolean }>;
  tokens: Array<{ originalTokenId: string; name: string; type: DesignToken["type"]; value: string; conflict: boolean }>;
}

export interface ImportedLibraryArchive {
  fileId: string;
  originalFileId: string;
  originalName: string;
  componentCount: number;
  tokenCount: number;
  assetCount: number;
  componentIdMap: Record<string, string>;
  tokenIdMap: Record<string, string>;
}

export interface ImportLibraryArchiveOptions {
  idPrefix?: string;
}
```

Implement methods on `FileStorage`:

```ts
async exportLibraryArchive(fileId: string): Promise<ExportedLibraryArchive>;
async reviewLibraryArchive(fileId: string, archive: Buffer): Promise<ReviewedLibraryArchive>;
async importLibraryArchive(fileId: string, archive: Buffer, options?: ImportLibraryArchiveOptions): Promise<ImportedLibraryArchive>;
```

Use entries:

```text
manifest.json
library.json
assets/<assetId>.json
assets/<assetId>.bin
```

`library.json` shape:

```ts
{
  fileId: string;
  name: string;
  tokens: DesignToken[];
  components: ComponentDefinition[];
}
```

Merge rules:
- Component id conflicts always import as `${idPrefix}-${component.id}`.
- Token id conflicts import as `${idPrefix}-${token.id}` when type or value differs.
- Token id matches with same type and value reuse the existing target token id.
- Imported component source nodes rewrite `style.fill_token` and `layout.spacing_tokens` through `tokenIdMap`.
- Imported component instances rewrite `component_instance.definition_id` through `componentIdMap`.
- Review validates archive assets but must not write target file or assets.

- [x] **Step 4: Run the storage test to verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "library archive"
```

Expected: PASS.

## Task 2: HTTP Routes

**Files:**
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/http.ts`

- [x] **Step 1: Write the failing HTTP test**

Add a route test near archive route tests:

```ts
test("exports reviews and imports library archives", async () => {
  const server = await buildTestServer();
  await server.ready();

  await server.inject({
    method: "POST",
    url: "/files/sample-file/agent/commands",
    payload: {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ]
    }
  });

  const exported = await server.inject({ method: "GET", url: "/files/sample-file/export/library" });
  expect(exported.statusCode).toBe(200);
  expect(exported.headers["content-type"]).toContain("application/vnd.layo.library-archive+zip");
  expect(exported.headers["content-disposition"]).toContain("sample-file.layo-library.zip");
  const archiveBase64 = exported.rawPayload.toString("base64");

  const reviewed = await server.inject({
    method: "POST",
    url: "/files/sample-file/import/library/review",
    payload: { archiveBase64 }
  });
  expect(reviewed.statusCode).toBe(200);
  expect(reviewed.json().review).toMatchObject({
    originalFileId: "sample-file",
    componentCount: 1,
    tokenCount: 1
  });

  const imported = await server.inject({
    method: "POST",
    url: "/files/sample-file/import/library",
    payload: { archiveBase64, idPrefix: "shared" }
  });
  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported).toMatchObject({
    fileId: "sample-file",
    componentCount: 1,
    tokenCount: 1
  });
});
```

- [x] **Step 2: Run the HTTP test to verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "library archives"
```

Expected: FAIL with 404 for `/files/sample-file/export/library`.

- [x] **Step 3: Implement HTTP routes**

Add routes before dynamic file routes:

```ts
server.get<{ Params: { fileId: string } }>("/files/:fileId/export/library", async (request, reply) => {
  const exported = await storage.exportLibraryArchive(request.params.fileId);
  reply.header("Content-Type", exported.mimeType);
  reply.header("Content-Disposition", `attachment; filename="${exported.fileName}"`);
  return reply.send(exported.archive);
});
```

Add review/import POST routes with `archiveBase64` and optional `idPrefix`.

- [x] **Step 4: Run the HTTP test to verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "library archives"
```

Expected: PASS.

## Task 3: Web API and File Panel UI

**Files:**
- Modify: `apps/web/src/document-api.test.ts`
- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write the failing web API test**

Add helper coverage to `document-api.test.ts`:

```ts
test("reviews imports and exports library archives", async () => {
  const calls: Array<[string, string | undefined]> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push([url.pathname, init?.method]);
    if (url.pathname === "/files/document-1/import/library/review" && init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toEqual({ archiveBase64: "UEs=" });
      return jsonResponse({ review: { originalFileId: "source", originalName: "Source", componentCount: 1, tokenCount: 1, assetCount: 0, components: [], tokens: [] } });
    }
    if (url.pathname === "/files/document-1/import/library" && init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toEqual({ archiveBase64: "UEs=", idPrefix: "shared" });
      return jsonResponse({ imported: { fileId: "document-1", originalFileId: "source", originalName: "Source", componentCount: 1, tokenCount: 1, assetCount: 0, componentIdMap: {}, tokenIdMap: {} } });
    }
    if (url.pathname === "/files/document-1/export/library") {
      return new Response(new Blob(["zip"]), {
        headers: {
          "Content-Type": "application/vnd.layo.library-archive+zip",
          "Content-Disposition": "attachment; filename=\"document-1.layo-library.zip\""
        }
      });
    }
    throw new Error(`unexpected ${url.pathname}`);
  });

  await expect(reviewLibraryArchive("document-1", "UEs=", fetcher as any)).resolves.toMatchObject({ componentCount: 1 });
  await expect(importLibraryArchive("document-1", { archiveBase64: "UEs=", idPrefix: "shared" }, fetcher as any)).resolves.toMatchObject({ fileId: "document-1" });
  await expect(exportLibraryArchive("document-1", fetcher as any)).resolves.toMatchObject({
    fileName: "document-1.layo-library.zip",
    mimeType: "application/vnd.layo.library-archive+zip"
  });
  expect(calls).toEqual([
    ["/files/document-1/import/library/review", "POST"],
    ["/files/document-1/import/library", "POST"],
    ["/files/document-1/export/library", undefined]
  ]);
});
```

- [x] **Step 2: Run the web API test to verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "library archives"
```

Expected: FAIL because web helpers do not exist.

- [x] **Step 3: Implement web helpers and file panel controls**

Add helpers:

```ts
export async function reviewLibraryArchive(fileId: string, archiveBase64: string, fetcher: typeof fetch = fetch): Promise<LibraryArchiveReview>;
export async function importLibraryArchive(fileId: string, input: ImportLibraryArchiveInput, fetcher: typeof fetch = fetch): Promise<ImportedLibraryArchive>;
export async function exportLibraryArchive(fileId: string, fetcher: typeof fetch = fetch): Promise<ExportedLibraryArchiveDownload>;
```

Add UI controls in the existing file panel:
- Section title: `라이브러리 아카이브`
- Export button: `현재 파일 라이브러리 내보내기`
- Import picker: `라이브러리 가져오기`
- Review heading: `가져오기 전 라이브러리 검토`
- Prefix input test id: `library-archive-prefix`
- Import button: `검토한 라이브러리 가져오기`
- Status test id: `library-archive-status`

- [x] **Step 4: Write the failing Playwright CLI test**

Add a focused e2e test:

```ts
test("file panel exports a shared library archive and imports reusable components and tokens", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        { type: "create_token", token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" } },
        { type: "create_rectangle", parentId: "frame-1", id: "library-card", name: "Library Card", width: 160, height: 96, fill: "#ffffff" },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ]
    }
  });
  await page.reload();
  await openFilePanel(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 파일 라이브러리 내보내기" }).click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  if (!archivePath) throw new Error("library archive download path missing");

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await page.getByTestId("library-archive-upload").setInputFiles(archivePath);
  await expect(page.getByTestId("library-archive-review")).toContainText("가져오기 전 라이브러리 검토");
  await expect(page.getByTestId("library-archive-review")).toContainText("Card");
  await page.getByTestId("library-archive-prefix").fill("shared");
  await page.getByRole("button", { name: "검토한 라이브러리 가져오기" }).click();
  await expect(page.getByTestId("library-archive-status")).toContainText("라이브러리 가져옴");
  const targetDocumentId = await page.getByTestId("file-id").textContent();
  const response = await page.request.get(`http://127.0.0.1:4317/files/${targetDocumentId}`);
  const payload = await response.json();
  expect(payload.file.components).toHaveLength(1);
  expect(payload.file.tokens).toEqual(expect.arrayContaining([expect.objectContaining({ id: "color-brand-primary" })]));
});
```

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "shared library archive" --workers=1 --reporter=line
```

Expected: FAIL because library archive UI controls do not exist.

- [x] **Step 5: Run web API and Playwright tests to verify GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "library archives"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "shared library archive" --workers=1 --reporter=line
```

Expected: PASS.

## Task 4: Docs and Gates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/team-collaboration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update product docs**

Record:
- Layo now has package-style shared library archives for components/tokens/assets.
- Remaining gaps: hosted/team registry, library publish/subscribe, update notifications, component variants/properties, reusable typography/effect styles, and live library sync.

- [x] **Step 2: Run focused and broad gates**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts src/http.test.ts
pnpm --filter @layo/web test -- src/document-api.test.ts
pnpm run check:penpot-maturity
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "shared library archive" --workers=1 --reporter=line
pnpm test:e2e
git diff --check
```

- [x] **Step 3: Commit, push, PR, merge, cleanup**

Use the repository's no-`gh` REST flow:

```bash
git add apps/server/src/storage.ts apps/server/src/storage.test.ts apps/server/src/http.ts apps/server/src/http.test.ts apps/web/src/document-api.ts apps/web/src/document-api.test.ts apps/web/src/App.tsx apps/web/e2e/editor-mvp.spec.ts docs/product/penpot-maturity-benchmark.md docs/product/team-collaboration-roadmap.md docs/superpowers/PLAN_STATUS.md docs/superpowers/plans/2026-06-27-shared-library-archive.md
git commit -m "feat: add shared library archives"
git push -u origin codex/shared-library-archive
```

After merge, sync main, delete remote/local branch, remove worktree, and prune.
