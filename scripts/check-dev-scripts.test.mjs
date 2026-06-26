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
