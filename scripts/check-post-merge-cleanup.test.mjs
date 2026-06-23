import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

test("agent guide requires post-merge cleanup after every merged PR", async () => {
  const guide = await readText("AGENTS.md");

  assert.match(guide, /Post-Merge Cleanup/);
  assert.match(guide, /docs\/process\/post-merge-cleanup\.md/);
  assert.match(guide, /git worktree list/);
  assert.match(guide, /git status --short --branch/);
  assert.match(guide, /Do not delete dirty worktrees/i);
});

test("post-merge cleanup guide documents mandatory verification and cleanup evidence", async () => {
  const docs = await readText("docs/process/post-merge-cleanup.md");

  assert.match(docs, /must run after every successful PR merge/i);
  assert.match(docs, /Verify the PR is merged/);
  assert.match(docs, /Synchronize the working branch/);
  assert.match(docs, /Remove only safe stale worktrees/);
  assert.match(docs, /Final response must include cleanup status/);
});
