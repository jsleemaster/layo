import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

function sectionBetween(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  assert.notEqual(start, -1);
  const bodyStart = start + startHeading.length;
  const end = text.indexOf(endHeading, bodyStart);
  assert.notEqual(end, -1);
  return text.slice(bodyStart, end);
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

test("merged Penpot solid multi-stroke plan is not routed as active", async () => {
  const status = await readText("docs/superpowers/PLAN_STATUS.md");
  const activePlan = sectionBetween(status, "## Current Active Plan", "## Completed Plans");

  assert.doesNotMatch(activePlan, /2026-07-05-penpot-solid-multi-stroke-flattening\.md/);
  assert.match(status, /`2026-07-05-penpot-solid-multi-stroke-flattening\.md` \| Completed/);
});

test("README documents authorization watcher retries as unbounded and process-local", async () => {
  const readme = await readText("README.md");

  assert.match(readme, /Retries remain unbounded for the lifetime of the watcher/);
  assert.match(readme, /Permanently malformed configuration remains fail-closed/);
  assert.doesNotMatch(readme, /retry budget is exhausted/);
});

test("remote-merged plans archive while local cleanup exceptions remain explicit", async () => {
  const status = await readText("docs/superpowers/PLAN_STATUS.md");
  const plan = await readText("docs/superpowers/plans/2026-07-14-penpot-token-mcp-ui.md");
  const activePlan = sectionBetween(status, "## Current Active Plan", "## Completed Plans");
  const completedPlans = status.slice(status.indexOf("## Completed Plans"));

  assert.match(plan, /exited 134 even through \`\/usr\/bin\/git\`/);
  assert.match(plan, /- \[ \] Resolve the retained local cleanup exception/);
  assert.match(status, /broken local[\s\S]*Completed-plan cleanup evidence/);
  assert.ok((activePlan.match(/`[^`\n]+\.md`/g) ?? []).length <= 1);
  assert.doesNotMatch(activePlan, /penpot-token-mcp-ui|penpot-shared-authorization-generation|penpot-agent-reviewed-token-mutation/);
  assert.match(completedPlans, /2026-07-14-penpot-token-mcp-ui\.md/);
  assert.match(completedPlans, /2026-07-15-penpot-shared-authorization-generation\.md/);
  assert.match(completedPlans, /2026-07-16-penpot-agent-reviewed-token-mutation\.md/);
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
