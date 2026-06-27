# Project Archive Import Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Layo project archive that exports, reviews, and imports a whole project with all project documents and referenced image assets.

**Architecture:** Adopt Penpot's import/export expectation that users can move more than one design file at once, but adapt it to Layo's local-first model by packaging one `ProjectManifest`, each referenced `DesignFile`, and assets into a single `.layo-project.zip`. Reuse the existing ZIP helper, project storage boundary, HTTP route style, and file-panel archive review UI instead of creating a parallel import subsystem. Project imports always create a fresh local project and fresh document ids so a shared archive cannot overwrite existing work or preserve stale team sharing.

**Tech Stack:** TypeScript, Fastify, Vite React, Vitest, Playwright CLI, existing Layo filesystem storage and ZIP archive utilities.

---

## Penpot Gap

- Reference capability: Penpot file import/export lets users export and import multiple files from a project-level context.
- Source URL: https://help.penpot.app/user-guide/export-import/export-import-files/
- Layo decision: **Adapt.** Layo should not copy Penpot's binary format yet. It should close the current import/export maturity gap with a native `.layo-project.zip` that keeps Layo's deterministic `ProjectManifest`, `DesignFile`, and asset records inspectable.
- Maturity gate: `docs/product/penpot-maturity-benchmark.md` gate 5, **Import/export maturity**.

## File Map

- Modify `apps/server/src/storage.ts`
  - Add project archive types.
  - Add `exportProjectArchive`, `reviewProjectArchive`, and `importProjectArchive`.
  - Reuse `createZipArchive`, `readZipArchive`, `readFileArchiveAssets`, `collectImageAssetIds`, `writeFile`, and `writeProject`.
- Modify `apps/server/src/storage.test.ts`
  - Add RED/GREEN coverage for exporting, reviewing, and importing a project archive with two documents and a referenced image asset.
- Modify `apps/server/src/http.ts`
  - Add `GET /projects/:projectId/export/archive`, `POST /projects/import/archive/review`, and `POST /projects/import/archive`.
- Modify `apps/server/src/http.test.ts`
  - Add RED/GREEN route coverage for project archive review/import/export.
- Modify `apps/web/src/project-api.ts`
  - Add project archive helper types and fetch helpers.
- Modify `apps/web/src/project-api.test.ts`
  - Add RED/GREEN client helper coverage.
- Modify `apps/web/src/App.tsx`
  - Add Korean-first project archive controls to the existing file panel.
  - Show a review card before import.
  - Load the imported project after successful import.
- Modify `apps/web/src/styles.css`
  - Reuse existing archive panel styles if possible; add only project-specific layout hooks if the current class names do not cover the review rows.
- Modify `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for project archive export, review, and import with two documents.
- Modify `docs/product/penpot-maturity-benchmark.md`
  - Move multi-file project archives from remaining gap into current posture and keep shared library/backups/migration as remaining gaps.
- Modify `docs/product/team-collaboration-roadmap.md`
  - Record the user flow for archiving/restoring a project package.
- Modify `docs/superpowers/PLAN_STATUS.md`
  - Add this plan as completed after implementation evidence exists.

## Task 1: Storage Project Archive

**Files:**
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/storage.ts`

- [x] **Step 1: Write the failing storage test**

Add a test near the existing file archive tests:

```ts
test("project archive export reviews and imports all documents with referenced assets", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const source = await storageWithDocument(path.join(tempRoot, "source"));
  const pixelPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const asset = await source.createAsset({
    name: "pixel.png",
    mimeType: "image/png",
    dataBase64: pixelPng
  });
  await source.createNode("sample-file", "page-1", {
    id: "project-archive-image",
    kind: "image",
    name: "프로젝트 이미지",
    transform: { x: 80, y: 120, rotation: 0 },
    size: { width: 120, height: 90 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
    content: {
      type: "image",
      asset_id: asset.assetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fit"
    },
    children: []
  });
  await source.createProjectDocument("test-project", {
    documentId: "second-file",
    name: "두 번째 문서"
  });

  const exported = await source.exportProjectArchive("test-project");
  expect(exported).toMatchObject({
    projectId: "test-project",
    name: "테스트 프로젝트",
    documentCount: 2,
    assetCount: 1,
    mimeType: "application/vnd.layo.project-archive+zip"
  });
  expect(exported.archive.subarray(0, 2).toString("utf8")).toBe("PK");

  const target = new FileStorage(path.join(tempRoot, "target"));
  const review = await target.reviewProjectArchive(exported.archive);
  expect(review).toMatchObject({
    originalProjectId: "test-project",
    originalName: "테스트 프로젝트",
    suggestedName: "테스트 프로젝트",
    documentCount: 2,
    assetCount: 1,
    documents: [
      expect.objectContaining({ originalFileId: "sample-file", originalName: "테스트 문서" }),
      expect.objectContaining({ originalFileId: "second-file", originalName: "두 번째 문서" })
    ]
  });
  await expect(target.readProject("test-project")).rejects.toThrow();

  const imported = await target.importProjectArchive(exported.archive, {
    projectId: "imported-project",
    name: "복원 프로젝트",
    documentIdPrefix: "restored"
  });
  expect(imported).toMatchObject({
    originalProjectId: "test-project",
    originalName: "테스트 프로젝트",
    documentCount: 2,
    assetCount: 1
  });
  expect(imported.project).toMatchObject({
    projectId: "imported-project",
    name: "복원 프로젝트",
    currentDocumentId: "restored-second-file",
    sharing: { mode: "private" }
  });
  expect(imported.documentIdMap).toEqual({
    "sample-file": "restored-sample-file",
    "second-file": "restored-second-file"
  });
  expect((await target.readProject("imported-project")).documents.map((item) => item.documentId)).toEqual([
    "restored-sample-file",
    "restored-second-file"
  ]);
  expect((await target.readFile("restored-sample-file")).id).toBe("restored-sample-file");
  expect(findImageNode(await target.readFile("restored-sample-file"), "project-archive-image")?.content).toMatchObject({
    type: "image",
    asset_id: asset.assetId
  });
  expect((await target.readAsset(asset.assetId)).data.equals(Buffer.from(pixelPng, "base64"))).toBe(true);
});
```

- [x] **Step 2: Run the storage test to verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "project archive"
```

Expected: FAIL because `FileStorage.exportProjectArchive`, `reviewProjectArchive`, and `importProjectArchive` do not exist.

- [x] **Step 3: Implement storage project archives**

Add these public types and methods:

```ts
export const PROJECT_ARCHIVE_MIME_TYPE = "application/vnd.layo.project-archive+zip";

export interface ProjectArchiveManifest {
  schemaVersion: 1;
  format: "layo.project.archive";
  exportedAt: string;
  projectId: string;
  name: string;
  currentDocumentId: string;
  documentCount: number;
  assetCount: number;
}

export interface ExportedProjectArchive {
  projectId: string;
  name: string;
  documentCount: number;
  assetCount: number;
  archive: Buffer;
  mimeType: typeof PROJECT_ARCHIVE_MIME_TYPE;
  manifest: ProjectArchiveManifest;
}

export interface ReviewedProjectArchiveDocument {
  originalFileId: string;
  originalName: string;
  pageCount: number;
  nodeCount: number;
}

export interface ReviewedProjectArchive {
  originalProjectId: string;
  originalName: string;
  suggestedName: string;
  documentCount: number;
  assetCount: number;
  documents: ReviewedProjectArchiveDocument[];
}

export interface ImportedProjectArchive {
  project: ProjectManifest;
  originalProjectId: string;
  originalName: string;
  documentCount: number;
  assetCount: number;
  documentIdMap: Record<string, string>;
}

export interface ImportProjectArchiveOptions {
  projectId?: string;
  name?: string;
  documentIdPrefix?: string;
}
```

Storage behavior:

- `exportProjectArchive(projectId)` reads the project, reads each project document, collects unique image asset ids, validates asset records, and writes `manifest.json`, `project.json`, `documents/<documentId>.json`, and `assets/<assetId>.json|bin`.
- `reviewProjectArchive(archive)` parses and validates the same entries, returns counts and per-document summaries, and performs no filesystem writes.
- `importProjectArchive(archive, options)` creates a new project id and new document ids, rewrites each `DesignFile.id`, preserves asset ids, resets sharing to `{ mode: "private" }`, writes files, writes the new project, and returns `documentIdMap`.

- [x] **Step 4: Run the storage test to verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "project archive"
```

Expected: PASS.

## Task 2: HTTP Project Archive Routes

**Files:**
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/http.ts`

- [x] **Step 1: Write the failing HTTP route test**

Add a test near the file archive HTTP tests:

```ts
test("exports reviews and imports project archives", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const sourceServer = createHttpServer(new FileStorage(path.join(tempRoot, "source")));
  await sourceServer.inject({
    method: "POST",
    url: "/projects",
    payload: {
      projectId: "archive-project",
      name: "프로젝트 묶음",
      documentId: "archive-file",
      documentName: "첫 문서"
    }
  });
  await sourceServer.inject({
    method: "POST",
    url: "/projects/archive-project/documents",
    payload: { documentId: "archive-file-2", name: "두 번째 문서" }
  });

  const exported = await sourceServer.inject({
    method: "GET",
    url: "/projects/archive-project/export/archive"
  });
  expect(exported.statusCode).toBe(200);
  expect(exported.headers["content-type"]).toContain("application/vnd.layo.project-archive+zip");
  expect(exported.headers["content-disposition"]).toContain("archive-project.layo-project.zip");
  expect(exported.rawPayload.subarray(0, 2).toString("utf8")).toBe("PK");

  const targetServer = createHttpServer(new FileStorage(path.join(tempRoot, "target")));
  const review = await targetServer.inject({
    method: "POST",
    url: "/projects/import/archive/review",
    payload: { archiveBase64: exported.rawPayload.toString("base64") }
  });
  expect(review.statusCode).toBe(200);
  expect(review.json().review).toMatchObject({
    originalProjectId: "archive-project",
    documentCount: 2,
    documents: [
      expect.objectContaining({ originalFileId: "archive-file", originalName: "첫 문서" }),
      expect.objectContaining({ originalFileId: "archive-file-2", originalName: "두 번째 문서" })
    ]
  });

  const imported = await targetServer.inject({
    method: "POST",
    url: "/projects/import/archive",
    payload: {
      archiveBase64: exported.rawPayload.toString("base64"),
      projectId: "restored-project",
      name: "복원 묶음",
      documentIdPrefix: "restored"
    }
  });
  expect(imported.statusCode).toBe(200);
  expect(imported.json().imported.project).toMatchObject({
    projectId: "restored-project",
    name: "복원 묶음",
    currentDocumentId: "restored-archive-file-2"
  });
});
```

- [x] **Step 2: Run the HTTP test to verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "project archives"
```

Expected: FAIL because the project archive routes do not exist.

- [x] **Step 3: Implement HTTP routes**

Add routes before broad dynamic project routes where practical:

```ts
server.post<{ Body: { archiveBase64: string } }>("/projects/import/archive/review", async (request) => ({
  review: await storage.reviewProjectArchive(Buffer.from(request.body.archiveBase64, "base64"))
}));

server.post<{
  Body: { archiveBase64: string; projectId?: string; name?: string; documentIdPrefix?: string };
}>("/projects/import/archive", async (request) => ({
  imported: await storage.importProjectArchive(Buffer.from(request.body.archiveBase64, "base64"), {
    projectId: request.body.projectId,
    name: request.body.name,
    documentIdPrefix: request.body.documentIdPrefix
  })
}));

server.get<{ Params: { projectId: string } }>("/projects/:projectId/export/archive", async (request, reply) => {
  const exported = await storage.exportProjectArchive(request.params.projectId);
  return reply
    .header("Content-Type", exported.mimeType)
    .header("Content-Disposition", `attachment; filename="${exported.projectId}.layo-project.zip"`)
    .send(exported.archive);
});
```

- [x] **Step 4: Run the HTTP test to verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "project archives"
```

Expected: PASS.

## Task 3: Web Project API Helpers

**Files:**
- Modify: `apps/web/src/project-api.test.ts`
- Modify: `apps/web/src/project-api.ts`

- [x] **Step 1: Write the failing web API test**

Add a test to `project-api.test.ts` that imports the new helpers:

```ts
test("reviews imports and exports project archives", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const pathname = new URL(String(url), "http://127.0.0.1:4317").pathname;
    if (pathname === "/projects/import/archive/review") {
      return new Response(JSON.stringify({
        review: {
          originalProjectId: "project-web",
          originalName: "웹 프로젝트",
          suggestedName: "웹 프로젝트",
          documentCount: 2,
          assetCount: 1,
          documents: [{ originalFileId: "document-web", originalName: "웹 문서", pageCount: 1, nodeCount: 4 }]
        }
      }), { status: 200 });
    }
    if (pathname === "/projects/import/archive") {
      return new Response(JSON.stringify({
        imported: {
          project,
          originalProjectId: "project-web",
          originalName: "웹 프로젝트",
          documentCount: 2,
          assetCount: 1,
          documentIdMap: { "document-web": "restored-document-web" }
        }
      }), { status: 200 });
    }
    if (pathname === "/projects/project-web/export/archive") {
      return new Response(new Blob([new Uint8Array([0x50, 0x4b])]), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.layo.project-archive+zip",
          "Content-Disposition": 'attachment; filename="project-web.layo-project.zip"'
        }
      });
    }
    return new Response("not found", { status: 404 });
  };

  await expect(reviewProjectArchive("UEs=", fetcher as typeof fetch)).resolves.toMatchObject({
    originalProjectId: "project-web",
    documentCount: 2
  });
  await expect(importProjectArchive({ archiveBase64: "UEs=", name: "복원 프로젝트" }, fetcher as typeof fetch))
    .resolves.toMatchObject({ originalProjectId: "project-web", project });
  await expect(exportProjectArchive("project-web", fetcher as typeof fetch)).resolves.toMatchObject({
    fileName: "project-web.layo-project.zip",
    mimeType: "application/vnd.layo.project-archive+zip"
  });
});
```

- [x] **Step 2: Run the web API test to verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/project-api.test.ts -t "project archives"
```

Expected: FAIL because the helpers do not exist.

- [x] **Step 3: Implement project API helpers**

Add `ReviewedProjectArchive`, `ImportedProjectArchive`, `ImportProjectArchiveInput`, `ExportedProjectArchiveDownload`, `reviewProjectArchive`, `importProjectArchive`, and `exportProjectArchive` to `project-api.ts`.

- [x] **Step 4: Run the web API test to verify GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/project-api.test.ts -t "project archives"
```

Expected: PASS.

## Task 4: Web File Panel Project Archive UX

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Write the failing Playwright CLI test**

Add a test near the existing file archive Playwright test:

```ts
test("file panel exports a project archive and reviews every document before import", async ({ page }) => {
  const { projectId } = await createProjectFromEmptyState(page);
  const secondDocument = await page.request.post(`http://127.0.0.1:4317/projects/${projectId}/documents`, {
    data: { documentId: "project-archive-second", name: "검토 문서" }
  });
  expect(secondDocument.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(projectId);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 프로젝트 아카이브 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${projectId}.layo-project.zip`);
  const archivePath = await download.path();
  if (!archivePath) {
    throw new Error("project archive download path missing");
  }

  await page.getByTestId("project-archive-upload").setInputFiles(archivePath);
  const review = page.getByTestId("project-archive-review");
  await expect(review).toContainText("가져오기 전 프로젝트 검토");
  await expect(review).toContainText("문서 2개");
  await expect(review).toContainText("새 문서");
  await expect(review).toContainText("검토 문서");

  await page.getByTestId("project-archive-import-name").fill("프로젝트 복원본");
  await page.getByRole("button", { name: "검토한 프로젝트 아카이브 가져오기" }).click();
  await expect(page.getByTestId("project-archive-status")).toContainText("프로젝트 복원본 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("프로젝트 복원본");
  const restoredProjectId = await page.getByTestId("project-switcher").inputValue();
  const restoredResponse = await page.request.get(`http://127.0.0.1:4317/projects/${restoredProjectId}`);
  expect(restoredResponse.ok()).toBeTruthy();
  expect((await restoredResponse.json()).project.documents).toHaveLength(2);
});
```

- [x] **Step 2: Run the Playwright test to verify RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "project archive" --workers=1 --reporter=line
```

Expected: FAIL because the project archive UI controls do not exist.

- [x] **Step 3: Implement the project archive UI**

Add state and handlers in `App.tsx`:

- `projectArchiveReview`
- `projectArchiveImportName`
- `projectArchiveStatus`
- `projectArchiveInputRef`
- `exportCurrentProjectArchive`
- `reviewSelectedProjectArchive`
- `cancelProjectArchiveImport`
- `importReviewedProjectArchive`

Add controls in the file panel:

- Button text: `현재 프로젝트 아카이브 내보내기`
- Upload button text: `프로젝트 아카이브 가져오기`
- Hidden input test id: `project-archive-upload`
- Status test id: `project-archive-status`
- Review card test id: `project-archive-review`
- Name input test id: `project-archive-import-name`
- Import button text: `검토한 프로젝트 아카이브 가져오기`

After import, update the project list, load the imported project, clear the review state, and show `${name} 가져옴`.

- [x] **Step 4: Run the Playwright test to verify GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "project archive" --workers=1 --reporter=line
```

Expected: PASS.

## Task 5: Documentation and Gates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/team-collaboration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update product docs**

Update the import/export row in `penpot-maturity-benchmark.md` so current posture includes:

```md
project-level `.layo-project.zip` archives that package `ProjectManifest`, all member `DesignFile` documents, and referenced assets with a no-write review step before import
```

Keep shared library packaging, backup/restore runbooks, and Penpot/Figma migration as remaining gaps.

- [x] **Step 2: Update roadmap**

Add a short roadmap entry that explains:

```md
Project archives let a team member export the current project, send one file, review document counts before import, and restore the project as a fresh private local project.
```

- [x] **Step 3: Update plan status**

Add a completed row to `docs/superpowers/PLAN_STATUS.md` only after tests pass:

```md
| `2026-06-27-project-archive-import-export.md` | Completed | Added Layo project-level ZIP archive export/review/import for `ProjectManifest`, all project documents, and referenced image assets through storage, HTTP, web API helpers, and Korean file-panel controls. Imports create fresh private projects and fresh document ids to avoid overwriting existing work or preserving stale sharing state. Verified with RED/GREEN storage, HTTP, web API, and Playwright CLI coverage plus maturity gates. |
```

- [x] **Step 4: Run full focused gates**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts src/http.test.ts
pnpm --filter @layo/web test -- src/project-api.test.ts src/document-api.test.ts
pnpm run check:penpot-maturity
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "project archive" --workers=1 --reporter=line
pnpm typecheck
pnpm --filter @layo/web build
git diff --check
```

Expected: all pass.

## Task 6: Commit, PR, Merge, Cleanup

**Files:**
- Repository metadata only.

- [ ] **Step 1: Commit**

Run:

```bash
git status --short
git add apps/server/src/storage.ts apps/server/src/storage.test.ts apps/server/src/http.ts apps/server/src/http.test.ts apps/web/src/project-api.ts apps/web/src/project-api.test.ts apps/web/src/App.tsx apps/web/src/styles.css apps/web/e2e/editor-mvp.spec.ts docs/product/penpot-maturity-benchmark.md docs/product/team-collaboration-roadmap.md docs/superpowers/PLAN_STATUS.md docs/superpowers/plans/2026-06-27-project-archive-import-export.md
git commit -m "feat: add project archive import export"
```

- [ ] **Step 2: Push and create PR without `gh`**

Run:

```bash
git push origin codex/project-archive-import-export
```

Use GitHub REST with `git credential fill` to create the PR. The PR body must include Penpot reference, minimal-change ladder decision, RED/GREEN evidence, Playwright CLI proof, and remaining import/export gaps.

- [ ] **Step 3: Merge and cleanup**

After PR checks/review state are acceptable, merge through GitHub REST without adding `evar-leeo` as reviewer. Then follow `docs/process/post-merge-cleanup.md`: sync main, delete remote/local feature branch, remove the worktree, prune stale worktrees, and report any cleanup exceptions.
