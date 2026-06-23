import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

test("agent guide requires failure learning loop for missed UI details", async () => {
  const guide = await readText("AGENTS.md");

  assert.match(guide, /Failure Learning Loop/);
  assert.match(guide, /docs\/process\/failure-learning-loop\.md/);
  assert.match(guide, /memory note/i);
  assert.match(guide, /focused e2e/i);
  assert.match(guide, /Playwright CLI/i);
});

test("failure learning loop documents durable memory and regression-test requirements", async () => {
  const docs = await readText("docs/process/failure-learning-loop.md");

  assert.match(docs, /Treat the correction as a process failure/);
  assert.match(docs, /Write or update a focused failing test/);
  assert.match(docs, /Add or update a memory note/);
  assert.match(docs, /run a direct Playwright CLI interaction pass/i);
  assert.match(docs, /PR body/);
});
