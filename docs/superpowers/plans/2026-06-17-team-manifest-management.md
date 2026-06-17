# Team Manifest Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not used because the repository instructions only allow them when explicitly authorized.

**Goal:** Move team manifest management beyond textarea copy/paste by adding migration, validation feedback, file import/export, and read-only URL import.

**Architecture:** Keep the static-web, team-owned model intact. Shared collaboration code owns schema versioning, migration, validation, and secret redaction. The web app owns user-facing import/export affordances and surfaces validation errors without crashing the editor.

**Tech Stack:** TypeScript, React, Vite, IndexedDB, Vitest, Playwright CLI.

## Global Constraints

- The public web app must remain static-hostable.
- Maintainers must not operate a central relay or manifest server.
- Plain runtime credentials must not be exported in team manifests.
- Browser debugging and rendered-route verification use Playwright CLI.
- Subagents are not used unless explicitly authorized by the user.

---

### Task 1: Shared Manifest Migration And Validation

**Files:**
- Modify: `packages/collaboration/src/team-manifest.ts`
- Modify: `packages/collaboration/src/team-manifest.test.ts`

**Interfaces:**
- Produces: `TEAM_MANIFEST_SCHEMA_VERSION`, `migrateTeamManifest(input: unknown): unknown`, `validateTeamManifest(input: unknown): { ok: true; team: TeamManifest } | { ok: false; message: string; issues: string[] }`
- Existing consumers continue using `parseTeamManifest(input: unknown): TeamManifest`.

- [x] **Step 1: Write failing tests**

Cover:
- schema v0 or missing-version manifest migrates to schema v1
- missing `permissions` and `auth` are filled safely
- unknown future schema is rejected with a clear message
- plaintext `token`, `memberToken`, and relay credential aliases are stripped

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @canvas-mcp-editor/collaboration test -- src/team-manifest.test.ts`
Expected: FAIL because migration/validation helpers do not exist yet.

- [x] **Step 3: Implement migration/validation**

Implement migration as a pure function in `packages/collaboration/src/team-manifest.ts`. `parseTeamManifest` should call migration before schema validation.

- [x] **Step 4: Verify GREEN**

Run: `pnpm --filter @canvas-mcp-editor/collaboration test -- src/team-manifest.test.ts`
Expected: PASS.

### Task 2: Web Manifest I/O Helpers

**Files:**
- Modify: `apps/web/src/collaboration/team-store.ts`
- Modify: `apps/web/src/collaboration/team-store.test.ts`

**Interfaces:**
- Produces: `createTeamManifestDownload(team: TeamManifest): { filename: string; contents: string; mimeType: string }`
- Produces: `readTeamManifestFile(file: Pick<File, "text" | "name">): Promise<TeamManifest>`
- Produces: `fetchTeamManifestFromUrl(url: string, fetcher?: typeof fetch): Promise<TeamManifest>`
- Consumes: `parseTeamManifest`, `exportTeamManifest`.

- [x] **Step 1: Write failing tests**

Cover:
- download filename is stable and `.json`
- file text import parses migrated manifest
- invalid file import returns a validation error
- URL import only accepts `https://raw.githubusercontent.com/...`, `https://gist.githubusercontent.com/...`, or localhost dev URLs
- URL import parses manifest and rejects non-OK responses

- [x] **Step 2: Verify RED**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/team-store.test.ts`
Expected: FAIL because helper functions do not exist.

- [x] **Step 3: Implement helpers**

Keep helpers framework-independent and use `parseTeamManifest` so secret stripping and migration stay centralized.

- [x] **Step 4: Verify GREEN**

Run: `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/team-store.test.ts`
Expected: PASS.

### Task 3: Web UI Import/Export Flow

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `createTeamManifestDownload`, `readTeamManifestFile`, `fetchTeamManifestFromUrl`, `importTeamManifest`.

- [x] **Step 1: Add UI state and handlers**

Add manifest error/status state, manifest URL state, hidden file input, file download handler, file upload handler, URL import handler, and safe textarea import handling.

- [x] **Step 2: Render controls**

Add controls in the existing Team panel:
- file download
- file upload
- URL input
- URL import
- validation error/status region with `data-testid="team-manifest-status"`

- [x] **Step 3: Preserve layout rules**

Use existing design tokens and avoid raw CSS colors/spacing.

### Task 4: End-To-End Coverage

**Files:**
- Modify: `apps/web/e2e/collaboration.spec.ts`

**Interfaces:**
- Consumes the rendered UI from Task 3.

- [x] **Step 1: Add e2e assertions**

Cover:
- invalid manifest import displays an error and does not crash
- downloaded manifest can be uploaded into a second browser context
- imported file activates the team

- [x] **Step 2: Run target checks**

Run:
- `pnpm --filter @canvas-mcp-editor/collaboration test -- src/team-manifest.test.ts`
- `pnpm --filter @canvas-mcp-editor/web test -- src/collaboration/team-store.test.ts`
- `pnpm test`
- `pnpm typecheck`
- `pnpm --filter @canvas-mcp-editor/web build`
- `pnpm test:e2e:collab`
- `git diff --check`

Expected: all pass.

Verified on 2026-06-17: all commands above passed.

### Self-Review

- Spec coverage: Covers schema versioning, migration, import validation errors, file download/upload, GitHub raw/gist URL import, safe metadata handling, and e2e coverage.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Uses `TeamManifest`, `parseTeamManifest`, `validateTeamManifest`, and web helper signatures consistently.
