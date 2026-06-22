import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

test("web static GitHub Pages workflow deploys the web artifact", async () => {
  const workflow = await readText(".github/workflows/deploy-pages.yml");

  assert.match(workflow, /push:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pnpm --filter @canvas-mcp-editor\/web typecheck/);
  assert.match(
    workflow,
    /pnpm --dir apps\/web exec vite build --base=\/canvas-mcp-editor\//,
  );
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /path: apps\/web\/dist/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test("relay Docker artifacts expose team-owned relay configuration", async () => {
  const dockerfile = await readText("apps/collab-relay/Dockerfile");
  const compose = await readText("deploy/collab-relay/docker-compose.yml");
  const env = await readText("deploy/collab-relay/.env.example");

  assert.match(dockerfile, /@canvas-mcp-editor\/collab-relay/);
  assert.match(dockerfile, /EXPOSE 4327/);
  assert.match(compose, /COLLAB_RELAY_HOST/);
  assert.match(compose, /COLLAB_RELAY_PORT/);
  assert.match(compose, /COLLAB_MEMBER_TOKENS/);
  assert.match(compose, /\/health/);
  assert.match(env, /COLLAB_ALLOWED_ROOM_PREFIX=canvas-mcp-editor:/);
  assert.match(env, /COLLAB_ROOM_TOKEN=/);
  assert.match(env, /COLLAB_MEMBER_TOKENS=\[\]/);
});

test("deployment docs keep web hosting and relay hosting separate", async () => {
  const readme = await readText("README.md");
  const docs = await readText("docs/deployment/collaboration.md");

  assert.match(readme, /static web/i);
  assert.match(readme, /team-owned relay/i);
  assert.match(readme, /maintainers do not operate/i);
  assert.match(docs, /Web-only deployment/i);
  assert.match(docs, /Local relay/i);
  assert.match(docs, /Cloud relay/i);
  assert.match(docs, /Trusted network relay/i);
  assert.match(docs, /docker compose/i);
});
