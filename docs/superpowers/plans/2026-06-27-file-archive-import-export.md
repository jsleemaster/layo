# File Archive Import Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Layo file archive format that exports a saved design file with referenced image assets and imports the archive into another local store without breaking image references.

**Architecture:** Adapt Penpot's import/export capability as a standard ZIP archive with readable `manifest.json`, readable `document.json`, and binary asset entries. Keep the first slice server/agent-owned: storage builds and imports archives, HTTP exposes download/upload routes, and MCP exposes base64 archive tools. UI import/export buttons remain a following slice.

**Tech Stack:** TypeScript, Node Buffer APIs, Fastify, MCP SDK, Vitest.

---

## Penpot Maturity Reference

Reference capability: Penpot lets users export/import files from the dashboard/workspace, import `.penpot` or `.zip`, review import items before import, and its current format is a ZIP archive containing binary assets and a readable JSON structure.

Layo decision: **adapt**. Layo will not claim Penpot file compatibility in this slice. It will use a Layo-specific ZIP contract that preserves local-first `DesignFile` JSON and image assets so teams and agents can move files across stores and machines.

Maturity gate: `Import/export maturity` in `docs/product/penpot-maturity-benchmark.md`.

## Files

- Create: `apps/server/src/file-archive.ts`
- Create: `apps/server/src/file-archive.test.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/mcp.test.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/team-collaboration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Create: `docs/superpowers/plans/2026-06-27-file-archive-import-export.md`

## Archive Contract

`application/vnd.layo.file-archive+zip`

Entries:

- `manifest.json`

```json
{
  "schemaVersion": 1,
  "format": "layo.file.archive",
  "exportedAt": "2026-06-27T00:00:00.000Z",
  "fileId": "sample-file",
  "name": "테스트 문서",
  "assetCount": 1
}
```

- `document.json`: the complete `DesignFile` JSON.
- `assets/<assetId>.json`: stored asset metadata.
- `assets/<assetId>.bin`: stored asset bytes.

## Task 1: ZIP Utility Contract

**Files:**
- Create: `apps/server/src/file-archive.test.ts`
- Create: `apps/server/src/file-archive.ts`

- [x] **Step 1: Write failing ZIP round-trip tests**

Create `apps/server/src/file-archive.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createZipArchive, readZipArchive } from "./file-archive";

describe("file archive zip utilities", () => {
  test("round-trips readable json and binary entries as a standard zip", () => {
    const archive = createZipArchive([
      { path: "manifest.json", data: Buffer.from("{\"schemaVersion\":1}", "utf8") },
      { path: "assets/asset-1.bin", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
    ]);

    expect(archive.subarray(0, 2).toString("utf8")).toBe("PK");
    const entries = readZipArchive(archive);

    expect(entries.get("manifest.json")?.toString("utf8")).toBe("{\"schemaVersion\":1}");
    expect([...entries.get("assets/asset-1.bin") ?? []]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/file-archive.test.ts
```

Expected: FAIL because `./file-archive` does not exist.

- [x] **Step 3: Implement stored-entry ZIP create/read**

Implement `createZipArchive(entries)` and `readZipArchive(buffer)` with ZIP store method `0`, CRC32, local headers, central directory, and path traversal guards.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/file-archive.test.ts
```

Expected: PASS.

## Task 2: Storage Archive Export/Import

**Files:**
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/server/src/storage.ts`

- [x] **Step 1: Write failing storage test**

Add a test that creates an image asset, inserts an image node referencing that asset, exports an archive, imports it into a second `FileStorage`, and proves the imported document references the same asset id and the imported asset bytes are readable.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "file archive"
```

Expected: FAIL because `exportFileArchive` and `importFileArchive` do not exist.

- [x] **Step 3: Implement storage methods**

Add:

```ts
async exportFileArchive(fileId: string): Promise<ExportedFileArchive>
async importFileArchive(archive: Buffer, options?: { fileId?: string; name?: string }): Promise<ImportedFileArchive>
```

The import method must preserve asset ids, optionally override document id/name, write all asset metadata and bytes, write the document, and return a summary with file id, name, and asset count.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "file archive"
```

Expected: PASS.

## Task 3: HTTP Archive Routes

**Files:**
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/http.ts`

- [x] **Step 1: Write failing HTTP test**

Add a test for:

- `GET /files/:fileId/export/archive` returns a ZIP content type and attachment filename.
- `POST /files/import/archive` accepts `{ archiveBase64, fileId, name }`.
- The imported file can be read and its image asset can be fetched.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "file archive"
```

Expected: FAIL because the routes do not exist.

- [x] **Step 3: Implement HTTP routes**

Add the export route near code export and the import route near file listing routes.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "file archive"
```

Expected: PASS.

## Task 4: MCP Archive Tools

**Files:**
- Modify: `apps/server/src/mcp.test.ts`
- Modify: `apps/server/src/mcp.ts`

- [x] **Step 1: Write failing MCP tests**

Add tests for `export_file_archive` returning base64 archive metadata and `import_file_archive` restoring the file into a second store.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/mcp.test.ts -t "file archive"
```

Expected: FAIL because the tools do not exist.

- [x] **Step 3: Implement MCP tools**

Register:

- `export_file_archive` with `fileId`.
- `import_file_archive` with `archiveBase64`, optional `fileId`, optional `name`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/mcp.test.ts -t "file archive"
```

Expected: PASS.

## Task 5: Documentation And Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/team-collaboration-roadmap.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update docs**

Record the archive contract and remaining gaps: multi-file project archive, import review UI, Penpot/Figma migration, shared library export choices, and visible web controls.

- [x] **Step 2: Run focused verification**

```bash
pnpm --filter @layo/server test -- src/file-archive.test.ts src/storage.test.ts src/http.test.ts src/mcp.test.ts
pnpm --filter @layo/server typecheck
pnpm run check:penpot-maturity
git diff --check
```

- [x] **Step 3: Run broad verification**

```bash
pnpm test
```

UI controls are not part of this slice, so Playwright CLI proof is deferred to the next UI slice.

## Verification Log

- RED: `pnpm --filter @layo/server test -- src/file-archive.test.ts` failed because `./file-archive` did not exist.
- GREEN: `pnpm --filter @layo/server test -- src/file-archive.test.ts`.
- RED: `pnpm --filter @layo/server test -- src/storage.test.ts -t "file archive"` failed because `source.exportFileArchive` did not exist.
- GREEN: `pnpm --filter @layo/server test -- src/storage.test.ts -t "file archive"`.
- RED: `pnpm --filter @layo/server test -- src/http.test.ts -t "file archive"` failed with `GET /files/archive-file/export/archive` returning 404.
- GREEN: `pnpm --filter @layo/server test -- src/http.test.ts -t "file archive"`.
- RED: `pnpm --filter @layo/server test -- src/mcp.test.ts -t "file archive"` failed because `export_file_archive` was not registered and returned MCP error text.
- GREEN: `pnpm --filter @layo/server test -- src/mcp.test.ts -t "file archive"`.
- Focused verification passed: `pnpm --filter @layo/server test -- src/file-archive.test.ts src/storage.test.ts src/http.test.ts src/mcp.test.ts`.
- Focused verification passed: `pnpm --filter @layo/server typecheck`.
- Focused verification passed: `pnpm run check:penpot-maturity`.
- Focused verification passed: `git diff --check`.
- Broad verification passed: `pnpm test`.
