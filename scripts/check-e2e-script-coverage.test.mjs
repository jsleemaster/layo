import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const e2eDir = new URL("../apps/web/e2e/", import.meta.url);
const separateE2eScripts = new Set(["apps/web/e2e/collaboration.spec.ts"]);

test("root test:e2e script lists every non-collaboration Playwright spec", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const script = packageJson.scripts?.["test:e2e"] ?? "";
  const discoveredSpecs = (await readdir(e2eDir))
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => path.posix.join("apps/web/e2e", name))
    .filter((specPath) => !separateE2eScripts.has(specPath))
    .sort();

  const missingSpecs = discoveredSpecs.filter((specPath) => !script.includes(specPath));
  assert.deepEqual(
    missingSpecs,
    [],
    `package.json test:e2e is missing Playwright specs:\n${missingSpecs.join("\n")}`
  );
});
