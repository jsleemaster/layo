import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

test("product docs target Penpot-comparable team-product maturity", async () => {
  const benchmark = await readText("docs/product/penpot-maturity-benchmark.md");

  assert.match(benchmark, /professional team-product maturity/);
  assert.match(benchmark, /Penpot Reference Sources/);
  assert.match(benchmark, /Maturity Dimensions/);
  assert.match(benchmark, /Maturity Gates/);
  assert.match(benchmark, /Gap Review Cadence/);
  assert.match(benchmark, /Failure loop/);
});

test("agent guide points future workers at the Penpot maturity loop", async () => {
  const guide = await readText("AGENTS.md");

  assert.match(guide, /docs\/product\/penpot-maturity-benchmark\.md/);
  assert.match(guide, /docs\/process\/penpot-maturity-loop\.md/);
  assert.match(guide, /Penpot-comparable team-product maturity/);
});

test("plan status keeps one canonical markdown document", async () => {
  const status = await readText("docs/superpowers/PLAN_STATUS.md");

  assert.equal(status.startsWith("# Superpowers Plan Status\n\n"), true);
  assert.equal(status.match(/^# Superpowers Plan Status$/gm)?.length ?? 0, 1);
  assert.equal(status.match(/^## Current Active Plan$/gm)?.length ?? 0, 1);
  assert.equal(status.match(/^## Completed Plans$/gm)?.length ?? 0, 1);
  assert.ok(status.indexOf("## Current Active Plan") < status.indexOf("## Completed Plans"));
  assert.doesNotMatch(status, /\| .* \|# Superpowers Plan Status/m);
});

test("active top-level docs no longer frame Layo as a small personal editor", async () => {
  const docs = {
    "README.md": await readText("README.md"),
    "AGENTS.md": await readText("AGENTS.md"),
    "docs/PROJECT_BRIEF.md": await readText("docs/PROJECT_BRIEF.md"),
    "docs/product/figma-migration-roadmap.md": await readText("docs/product/figma-migration-roadmap.md")
  };

  const disallowed = [
    /small personal design editor/i,
    /small personal editor/i,
    /small design editor/i,
    /small editor/i,
    /MVP foundation, not a finished professional design suite/i,
    /current scope is an MVP design editor/i
  ];

  const offenders = [];
  for (const [path, text] of Object.entries(docs)) {
    for (const pattern of disallowed) {
      if (pattern.test(text)) {
        offenders.push(`${path}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
