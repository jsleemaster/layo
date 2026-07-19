import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server dev script resolves workspace packages from source exports", async () => {
  const packageJson = JSON.parse(await readFile("apps/server/package.json", "utf8"));
  const devScript = packageJson.scripts?.dev;
  const mcpScript = packageJson.scripts?.mcp;
  const testScript = packageJson.scripts?.test;

  assert.equal(typeof devScript, "string");
  assert.equal(typeof mcpScript, "string");
  assert.equal(typeof testScript, "string");
  assert.match(
    devScript,
    /--conditions=development|@layo\/collaboration build/,
    "server dev must not require prebuilt package dist files"
  );
  assert.match(
    mcpScript,
    /--conditions=development|@layo\/collaboration build/,
    "server mcp must not require prebuilt package dist files"
  );
  assert.match(
    testScript,
    /--conditions=development|@layo\/renderer build/,
    "server tests and child processes must not require prebuilt package dist files"
  );
});

test("e2e script starts required local services before Playwright", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const e2eScript = packageJson.scripts?.["test:e2e"];
  const runner = await readFile("scripts/run-e2e.mjs", "utf8");

  assert.equal(typeof e2eScript, "string");
  assert.match(e2eScript, /^node scripts\/run-e2e\.mjs -- /);
  assert.match(runner, /name: "server"[\s\S]*command: "pnpm"[\s\S]*args: \["--filter", "@layo\/server", "dev"\]/);
  assert.match(
    runner,
    /name: "web"[\s\S]*command: "pnpm"[\s\S]*args: \["--filter", "@layo\/web", "dev", "--", "--strictPort"\]/
  );
  assert.match(runner, /http:\/\/127\.0\.0\.1:4317\/health/);
  assert.match(runner, /http:\/\/127\.0\.0\.1:5173\//);
  assert.match(runner, /"pnpm",\s*\["exec",\s*"playwright",\s*"test"/);
  assert.match(runner, /mkdtemp/);
  assert.match(runner, /LAYO_E2E_STORAGE_DIR/);
  assert.match(runner, /LAYO_E2E_STORAGE_TOKEN/);
  assert.match(runner, /randomUUID/);
  assert.match(runner, /writeFile/);
  assert.match(runner, /--strictPort/);
  assert.match(runner, /assertServiceProcessAlive/);
  assert.match(runner, /already running/);
  assert.match(runner, /rm\(e2eStorageRoot/);

  const storageHelper = await readFile("apps/web/e2e/test-storage.ts", "utf8");
  assert.match(storageHelper, /process\.env\.LAYO_E2E_STORAGE_DIR/);
  assert.match(storageHelper, /process\.env\.LAYO_E2E_STORAGE_TOKEN/);
  assert.match(storageHelper, /realpath/);
  assert.match(storageHelper, /tmpdir/);
  assert.doesNotMatch(storageHelper, /apps\/server\/\.layo/);

  for (const specPath of [
    "apps/web/e2e/editor-mvp.spec.ts",
    "apps/web/e2e/collaboration.spec.ts"
  ]) {
    const spec = await readFile(specPath, "utf8");
    assert.doesNotMatch(spec, /rm\(["'](?:apps\/server\/)?\.layo/);
  }

  assert.match(packageJson.scripts["test:e2e:collab"], /scripts\/run-e2e\.mjs/);

  const activePlan = await readFile(
    "docs/superpowers/plans/2026-07-16-penpot-file-version-visual-preview.md",
    "utf8"
  );
  assert.doesNotMatch(activePlan, /pnpm exec playwright test/);
});

test("document writes and file-version mutations share the per-file operation queue", async () => {
  const app = await readFile("apps/web/src/App.tsx", "utf8");
  const snapshotStabilizerStart = app.indexOf("const stabilizeDocumentSnapshotPersistence = async");
  const snapshotStabilizerEnd = app.indexOf(
    "const enqueueDocumentSnapshotPersistence =",
    snapshotStabilizerStart
  );
  const restoreHandlerStart = app.indexOf("const restoreCurrentFileVersion = async");
  const restoreHandlerEnd = app.indexOf("const toggleFileVersionPinned = async", restoreHandlerStart);
  assert.ok(snapshotStabilizerStart >= 0 && snapshotStabilizerEnd > snapshotStabilizerStart);
  assert.ok(restoreHandlerStart >= 0 && restoreHandlerEnd > restoreHandlerStart);
  const snapshotStabilizer = app.slice(snapshotStabilizerStart, snapshotStabilizerEnd);
  const appOutsideSnapshotStabilizer =
    app.slice(0, snapshotStabilizerStart) + app.slice(snapshotStabilizerEnd);
  const restoreHandler = app.slice(restoreHandlerStart, restoreHandlerEnd);

  assert.match(app, /useRef\(createFileOperationQueue\(\)\)/);
  assert.match(snapshotStabilizer, /actualServerDocument = await persistDocumentSnapshot\(/);
  assert.doesNotMatch(appOutsideSnapshotStabilizer, /(?:void|await)\s+persist[A-Z]/);
  assert.match(
    app,
    /enqueueDocumentPersistence\(fileId, async \(\) => \{[\s\S]{0,200}await flushDocumentSnapshotEpochsThrough\(/
  );
  assert.match(
    snapshotStabilizer,
    /const flushDocumentSnapshotEpoch = async[\s\S]*await stabilizeDocumentSnapshotPersistence\(/
  );
  assert.match(
    snapshotStabilizer,
    /const flushDocumentSnapshotEpochsThrough = async[\s\S]*await flushDocumentSnapshotEpoch\(/
  );
  assert.match(
    snapshotStabilizer,
    /const enqueueDocumentSnapshotBarrier =[\s\S]*advanceDocumentSnapshotEpoch\(fileId\)[\s\S]*await flushDocumentSnapshotEpochsThrough\(/
  );
  assert.match(
    snapshotStabilizer,
    /const captureActiveCollaborationSnapshotForBarrier =[\s\S]*activeSession\.getDocument\(\)/
  );
  assert.match(
    snapshotStabilizer,
    /const referenceDocument = pendingSnapshot\?\.document[\s\S]*baseline\?\.session === activeSession[\s\S]*rendererDocumentsEqual\(referenceDocument, document\)/
  );
  assert.match(
    app,
    /const completeLatestDocumentSnapshot =[\s\S]*updateCollaborationSnapshotBaseline\(snapshot\.collaborationSession, persistedDocument\)/
  );
  assert.match(
    snapshotStabilizer,
    /baseDocument: pendingSnapshot\?\.baseDocument[\s\S]*baseline\?\.session === activeSession[\s\S]*baseline\.document/
  );
  assert.match(
    snapshotStabilizer,
    /latestSnapshot\.verifyServerDocument[\s\S]*readPersistedDocumentSnapshot\(fileId\)[\s\S]*baseDocument = latestSnapshot\.baseDocument \?\? verifiedServerDocument/
  );
  assert.match(
    app,
    /const prepareForProjectDocumentTransition = async[\s\S]{0,1200}enqueueDocumentSnapshotBarrier\(sourceFileId/
  );
  assert.match(
    app,
    /const isEditorDocumentMutationBlocked =[\s\S]{0,160}projectDocumentTransitionRef\.current !== null/
  );
  assert.match(
    app,
    /const dispatch =[^]*?if \(isEditorDocumentMutationBlocked\(\)\)/
  );
  assert.match(
    app,
    /const importCurrentDocumentTokensDtcg = async[\s\S]{0,1600}isEditorDocumentMutationBlocked\(\)[\s\S]{0,1600}mutationGeneration === editorMutationGenerationRef\.current[\s\S]{0,1600}if \(!isCurrentTokenImport\(\)\)/
  );
  assert.match(
    app,
    /canEditTokens=\{Boolean\(currentProject && editor && !projectDocumentTransitionActive\)\}/
  );
  assert.doesNotMatch(app, /componentVariantSaveRef/);
  assert.match(app, /enqueueDocumentSnapshotBarrier\(fileId, \(\) =>[\s\S]{0,80}saveFileVersion\(fileId, message\)/);
  assert.match(
    app,
    /enqueueDocumentSnapshotBarrier\([\s\S]{0,80}sourceProject\.currentDocumentId,[\s\S]{0,120}duplicateProject\(/
  );
  assert.match(
    restoreHandler,
    /const restoreOperation = await enqueueDocumentSnapshotBarrier\(fileId, async \(\) => \{[\s\S]*const result = await restoreFileVersion\(fileId, version\.versionId\)/
  );
  for (const operation of [
    "exportFileArchive",
    "exportLibraryArchive",
    "publishLibraryToRegistry",
    "exportProjectArchive"
  ]) {
    assert.match(
      app,
      new RegExp(`enqueueDocumentSnapshotBarrier\\([\\s\\S]{0,120}${operation}\\(`)
    );
  }
  for (const operation of [
    "importLibraryArchive",
    "importLibraryRegistryItem",
    "importLibraryRegistryTokens",
    "updateLibraryRegistryTokens",
    "updateLibraryRegistryItem",
    "importDesignTokensDtcg"
  ]) {
    assert.match(
      app,
      new RegExp(`enqueueDocumentPersistence\\(fileId, \\(\\) =>[\\s\\S]{0,500}${operation}\\(`)
    );
  }
  for (const operation of [
    "publishLibraryToRegistry",
    "importLibraryRegistryItem",
    "importLibraryRegistryTokens",
    "updateLibraryRegistryTokens",
    "updateLibraryRegistryItem"
  ]) {
    assert.match(
      app,
      new RegExp(`${operation}\\([\\s\\S]{0,500}requireCurrentLibraryRegistryAccess\\(`)
    );
  }
});

test("MCP browser tests pass only an explicit subprocess environment allowlist", async () => {
  const spec = await readFile("apps/web/e2e/mcp-stdio.spec.ts", "utf8");

  assert.match(spec, /MCP_STDIO_ENV_ALLOWLIST/);
  assert.doesNotMatch(spec, /\.\.\.process\.env/);
  assert.doesNotMatch(spec, /Object\.entries\(process\.env\)/);
  assert.match(spec, /LAYO_STORAGE_DIR/);
  assert.match(spec, /LAYO_LIBRARY_REGISTRY_MEMBERS_FILE/);
});

test("storage backup script exposes backup review and restore operations", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const backupScript = packageJson.scripts?.["storage:backup"];
  const runner = await readFile("scripts/layo-storage-backup.mjs", "utf8");

  assert.equal(backupScript, "node scripts/layo-storage-backup.mjs");
  assert.match(runner, /backup/);
  assert.match(runner, /review/);
  assert.match(runner, /restore/);
  assert.match(runner, /drill/);
  assert.match(runner, /repository-put/);
  assert.match(runner, /repository-list/);
  assert.match(runner, /repository-prune/);
  assert.match(runner, /--storage-dir/);
  assert.match(runner, /--repository-dir/);
  assert.match(runner, /--keep-last/);
  assert.match(runner, /--max-age-days/);
  assert.match(runner, /--dry-run/);
  assert.match(runner, /--archive|--out/);
  assert.match(runner, /--work-dir/);
  assert.match(runner, /--expect-project/);
  assert.match(runner, /--expect-file/);
  assert.match(runner, /NODE_OPTIONS/);
  assert.match(runner, /--conditions=development/);
});

test("external migration review script is exposed and stays no-write", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const migrationScript = packageJson.scripts?.["migration:review"];
  const runner = await readFile("scripts/layo-migration-review.mjs", "utf8");

  assert.equal(migrationScript, "node scripts/layo-migration-review.mjs");
  assert.match(runner, /external-migration-cli/);
  assert.match(runner, /--conditions=development/);
  assert.match(runner, /--archive/);
  assert.match(runner, /--source/);
  assert.doesNotMatch(runner, /importProjectArchive|importFileArchive|restoreStorageBackupArchive/);
});

test("GitHub homepage sync script is exposed and verifies deployment before patching", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const syncScript = packageJson.scripts?.["sync:github-homepage"];
  const runner = await readFile("scripts/sync-github-about-homepage.mjs", "utf8");

  assert.equal(syncScript, "node scripts/sync-github-about-homepage.mjs");
  assert.match(runner, /checkLiveDeployment/);
  assert.match(runner, /https:\/\/api\.github\.com\/repos\/\$\{repository\}/);
  assert.match(runner, /homepage: verified\.url/);
  assert.doesNotMatch(runner, /homepage: process\.env\.LAYO_DEPLOYMENT_URL/);
});
