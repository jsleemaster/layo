# Penpot Pinned File Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pinned saved-version controls so important Layo recovery checkpoints stay visible and protected in the file history panel.

**Architecture:** Extend the existing `.layo/history/<fileId>/<versionId>.json` version sidecar with a `pinned` boolean that defaults to `false` for legacy snapshots. Add storage, HTTP, MCP, web API, and file-panel controls to pin or unpin one version without rewriting the saved document snapshot. Sort pinned versions before unpinned versions, then by newest first.

**Tech Stack:** TypeScript, Fastify, MCP, React, Playwright CLI, Vitest.

---

## Penpot Comparison

Reference capability: Penpot workspace file history versions. Layo already has manual and automatic snapshots, restore, and preview diff. This slice adopts the pinned/checkpoint part of that workflow while keeping retention/delete policy as a later operations gap.

## Files

- Modify: `apps/server/src/storage.ts`
  - Add `pinned: boolean` to `StoredFileVersionSummary` and `StoredFileVersion`.
  - Parse legacy versions with `pinned: false`.
  - Sort pinned versions first in `listFileVersions`.
  - Add `setFileVersionPinned(fileId, versionId, pinned)`.
- Modify: `apps/server/src/storage.test.ts`
  - Add RED/GREEN coverage for pinning a version, sorting it first, and reading it back.
- Modify: `apps/server/src/http.ts`
  - Add `PATCH /files/:fileId/versions/:versionId/pin`.
- Modify: `apps/server/src/http.test.ts`
  - Add HTTP coverage for pin/unpin.
- Modify: `apps/server/src/mcp.ts`
  - Add `pin_file_version`.
- Modify: `apps/server/src/mcp.test.ts`
  - Add MCP coverage proving the tool returns a pinned version and `list_file_versions` sees it.
- Modify: `apps/web/src/document-api.ts`
  - Add `pinned` to `FileVersionSummary` and export `setFileVersionPinned`.
- Modify: `apps/web/src/document-api.test.ts`
  - Add web API coverage for the PATCH call.
- Modify: `apps/web/src/App.tsx`
  - Show a `고정됨` badge and a `고정`/`고정 해제` action in the version list.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage for pinning and unpinning a saved version from the file panel.
- Modify docs:
  - `docs/product/penpot-maturity-benchmark.md`
  - `docs/product/figma-feature-inventory.md`
  - `docs/product/team-collaboration-roadmap.md`
  - `docs/superpowers/PLAN_STATUS.md`

## Tasks

### Task 1: Storage And HTTP Pinning

- [x] **Step 1: Write failing storage test**

Add `pins file versions and sorts pinned checkpoints first` to `apps/server/src/storage.test.ts`:

```ts
const first = await storage.saveFileVersion("sample-file", { message: "검토 전" });
await storage.writeFile("sample-file", {
  ...(await storage.readFile("sample-file")),
  name: "변경된 파일"
});
const second = await storage.saveFileVersion("sample-file", { message: "릴리즈 전" });

await expect(storage.setFileVersionPinned("sample-file", first.versionId, true)).resolves.toMatchObject({
  versionId: first.versionId,
  pinned: true
});

const versions = await storage.listFileVersions("sample-file");
expect(versions[0]).toMatchObject({ versionId: first.versionId, pinned: true });
expect(versions.find((version) => version.versionId === second.versionId)).toMatchObject({ pinned: false });
await expect(storage.readFileVersion("sample-file", first.versionId)).resolves.toMatchObject({ pinned: true });
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "pins file versions"
```

Expected: FAIL because `setFileVersionPinned` does not exist and version summaries have no `pinned`.

- [x] **Step 3: Implement storage pinning**

In `apps/server/src/storage.ts`:

```ts
export interface StoredFileVersionSummary {
  ...
  pinned: boolean;
}

export interface StoredFileVersion extends StoredFileVersionSummary {
  document: DesignFile;
}
```

Update `parseStoredFileVersion` to return `pinned: Boolean(candidate.pinned)`, update `writeFileVersion` to write `pinned: false`, and update `listFileVersions` sorting:

```ts
return versions.sort(
  (a, b) =>
    Number(b.pinned) - Number(a.pinned) ||
    b.createdAt.localeCompare(a.createdAt) ||
    b.versionId.localeCompare(a.versionId)
);
```

Add:

```ts
async setFileVersionPinned(
  fileId: string,
  versionId: string,
  pinned: boolean
): Promise<StoredFileVersionSummary> {
  await this.adoptPriorDefaultStoreIfNeeded();
  const version = await this.readFileVersion(fileId, versionId);
  const updated: StoredFileVersion = { ...version, pinned };
  await writeFile(this.fileVersionPathFor(fileId, versionId), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return summarizeStoredFileVersion(updated);
}
```

- [x] **Step 4: Add failing HTTP test**

Add `pins and unpins a file version through HTTP` to `apps/server/src/http.test.ts`. It saves a version, PATCHes `/files/sample-file/versions/:versionId/pin` with `{ pinned: true }`, expects `version.pinned === true`, lists versions and expects the pinned flag, PATCHes `{ pinned: false }`, and expects `version.pinned === false`.

- [x] **Step 5: Implement HTTP route and verify GREEN**

Add:

```ts
server.patch<{
  Params: { fileId: string; versionId: string };
  Body: { pinned?: boolean };
}>("/files/:fileId/versions/:versionId/pin", async (request) => {
  return {
    version: await storage.setFileVersionPinned(
      request.params.fileId,
      request.params.versionId,
      request.body.pinned !== false
    )
  };
});
```

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "pins file versions"
pnpm --filter @layo/server test -- src/http.test.ts -t "pins and unpins"
```

Expected: PASS.

### Task 2: MCP And Web API

- [x] **Step 1: Add RED MCP and web API tests**

In `apps/server/src/mcp.test.ts`, extend file-version coverage or add `lets an MCP client pin a file version` that calls `pin_file_version` with `{ fileId, versionId, pinned: true }` and expects `version.pinned === true`.

In `apps/web/src/document-api.test.ts`, call:

```ts
await setFileVersionPinned("sample-file", "version-1", true, fetcher as typeof fetch)
```

and assert the URL is `/files/sample-file/versions/version-1/pin`, method is `PATCH`, and body is `{ pinned: true }`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/mcp.test.ts -t "pin a file version"
pnpm --filter @layo/web test -- src/document-api.test.ts -t "pins a file version"
```

Expected: FAIL because `pin_file_version` and `setFileVersionPinned` do not exist.

- [x] **Step 3: Implement MCP and web API**

Add `pin_file_version` to `apps/server/src/mcp.ts` with `fileId`, `versionId`, and optional `pinned` boolean. Add `setFileVersionPinned` to `apps/web/src/document-api.ts`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/mcp.test.ts -t "pin a file version"
pnpm --filter @layo/web test -- src/document-api.test.ts -t "pins a file version"
```

Expected: PASS.

### Task 3: File Panel Controls And Docs

- [x] **Step 1: Add RED Playwright coverage**

Add `file version history pins and unpins recovery checkpoints` to `apps/web/e2e/editor-mvp.spec.ts`. It creates a project, opens the file panel, saves a version named `릴리즈 검토`, clicks its `고정` action, expects `고정됨`, clicks `고정 해제`, and expects the badge to disappear.

- [x] **Step 2: Implement UI controls**

In `apps/web/src/App.tsx`, import `setFileVersionPinned`, add:

```ts
const toggleFileVersionPinned = async (version: FileVersionSummary) => {
  if (!currentProject) {
    setFileVersionStatus("프로젝트 없음");
    return;
  }
  const updated = await setFileVersionPinned(
    currentProject.currentDocumentId,
    version.versionId,
    !version.pinned
  );
  await refreshFileVersions(
    currentProject.currentDocumentId,
    updated.pinned ? `${updated.message} 고정됨` : `${updated.message} 고정 해제됨`
  );
};
```

Render `version.pinned ? <span className="file-version-pin-badge">고정됨</span> : null` and a button with text `고정` or `고정 해제`.

- [x] **Step 3: Update docs**

Record that pinned file-version controls exist. Keep retention/delete policy, branch/review/merge, full visual diff, and cross-machine backup as open gaps.

- [x] **Step 4: Full verification**

Run:

```bash
git diff --check
pnpm run check:design-rules
pnpm run check:penpot-maturity
pnpm --filter @layo/server test -- src/storage.test.ts -t "pins file versions"
pnpm --filter @layo/server test -- src/http.test.ts -t "pins and unpins"
pnpm --filter @layo/server test -- src/mcp.test.ts -t "pin a file version"
pnpm --filter @layo/web test -- src/document-api.test.ts -t "pins a file version"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "pins and unpins" --workers=1 --reporter=line
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
```

Expected: PASS.

Verification evidence from this implementation:

- RED focused storage/HTTP/MCP/web API tests failed for missing `setFileVersionPinned`, missing HTTP route, missing MCP tool, and missing web helper.
- RED Playwright CLI failed waiting for `릴리즈 검토 고정` before the UI control existed.
- GREEN focused checks passed:
  - `pnpm exec vitest run src/storage.test.ts -t "pins file versions"`
  - `pnpm exec vitest run src/http.test.ts -t "pins and unpins"`
  - `pnpm exec vitest run src/mcp.test.ts -t "pin a file version"`
  - `pnpm exec vitest run src/document-api.test.ts -t "lists, saves, reads, and restores file versions"`
  - `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "file version history pins and unpins recovery checkpoints" --workers=1 --reporter=line`
- Full gates passed:
  - `git diff --check`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm test`
  - `pnpm test:e2e`

- [ ] **Step 5: Publish and cleanup**

Commit, push, create PR through GitHub REST API, merge after verification, then sync `main`, remove the feature worktree and branches, stop dev servers, and verify ports `4317` and `5173` are clear.
