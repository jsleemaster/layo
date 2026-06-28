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
  assert.match(runner, /name: "web"[\s\S]*command: "pnpm"[\s\S]*args: \["--filter", "@layo\/web", "dev"\]/);
  assert.match(runner, /http:\/\/127\.0\.0\.1:4317\/health/);
  assert.match(runner, /http:\/\/127\.0\.0\.1:5173\//);
  assert.match(runner, /"pnpm",\s*\["exec",\s*"playwright",\s*"test"/);
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
  assert.match(runner, /--storage-dir/);
  assert.match(runner, /--archive|--out/);
  assert.match(runner, /--work-dir/);
  assert.match(runner, /--expect-project/);
  assert.match(runner, /--expect-file/);
});
