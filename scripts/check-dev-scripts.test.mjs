import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server dev script resolves workspace packages from source exports", async () => {
  const packageJson = JSON.parse(await readFile("apps/server/package.json", "utf8"));
  const devScript = packageJson.scripts?.dev;
  const mcpScript = packageJson.scripts?.mcp;

  assert.equal(typeof devScript, "string");
  assert.equal(typeof mcpScript, "string");
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

  assert.match(app, /useRef\(createFileOperationQueue\(\)\)/);
  assert.doesNotMatch(app, /(?:void|await)\s+persist[A-Z]/);
  assert.doesNotMatch(app, /componentVariantSaveRef/);
  assert.match(app, /enqueueDocumentPersistence\(fileId, \(\) => saveFileVersion\(fileId, message\)\)/);
  assert.match(app, /enqueueDocumentPersistence\(fileId, \(\) =>\s*restoreFileVersion\(fileId, version\.versionId\)/);
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
      new RegExp(`enqueueDocumentPersistence\\(fileId, \\(\\) =>[\\s\\S]{0,80}${operation}\\(`)
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
