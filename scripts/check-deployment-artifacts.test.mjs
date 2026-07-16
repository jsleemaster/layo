import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(path, "utf8");
}

test("web static GitHub Pages workflow is not installed", async () => {
  await assert.rejects(stat(".github/workflows/web-static.yml"), {
    code: "ENOENT",
  });
});

test("vercel production workflow deploys prebuilt output and verifies the live Layo site", async () => {
  const workflow = await readText(".github/workflows/vercel-production.yml");

  assert.match(workflow, /VERCEL_TOKEN/);
  assert.match(workflow, /VERCEL_ORG_ID/);
  assert.match(workflow, /VERCEL_PROJECT_ID/);
  assert.match(workflow, /vercel@56\.2\.1/);
  assert.match(workflow, /vercel pull --yes --environment=production/);
  assert.match(workflow, /vercel build --prod/);
  assert.match(workflow, /vercel deploy --prebuilt --prod/);
  assert.match(workflow, /LAYO_REPOSITORY_ADMIN_TOKEN/);
  assert.match(workflow, /id: deploy-production/);
  assert.match(workflow, /deployment_url="\$\(printf '%s\\n' "\$deployment_output"/);
  assert.match(workflow, /printf 'url=%s\\n' "\$deployment_url" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /pnpm run check:live-deployment -- --url "\$\{\{ steps\.deploy-production\.outputs\.url \}\}"/);
  assert.match(workflow, /Update GitHub About homepage/);
  assert.match(workflow, /GH_REPOSITORY_TOKEN: \$\{\{ secrets\.LAYO_REPOSITORY_ADMIN_TOKEN \}\}/);
  assert.match(workflow, /LAYO_DEPLOYMENT_URL: \$\{\{ steps\.deploy-production\.outputs\.url \}\}/);
  assert.match(workflow, /node scripts\/sync-github-about-homepage\.mjs --url "\$LAYO_DEPLOYMENT_URL"/);
  assert.doesNotMatch(workflow, /homepage: process\.env\.LAYO_DEPLOYMENT_URL/);
  assert.doesNotMatch(workflow, /pnpm run check:live-deployment -- --url https:\/\/layo\.vercel\.app/);
  assert.doesNotMatch(workflow, /github\.io|actions\/deploy-pages|pages:/i);
});

test("web deployment build keeps closed-path capability on the renderer public contract", async () => {
  const app = await readText("apps/web/src/App.tsx");
  const importBlock = (source) => {
    const suffix = `} from "${source}";`;
    const blockEnd = app.indexOf(suffix);
    assert.notEqual(blockEnd, -1, `missing import from ${source}`);
    const blockStart = app.lastIndexOf("import {", blockEnd);
    assert.notEqual(blockStart, -1, `missing import start for ${source}`);
    return app.slice(blockStart, blockEnd + suffix.length);
  };

  assert.equal(importBlock("@layo/renderer").includes("pathHasOnlyClosedSubpaths"), true);
  assert.equal(importBlock("./path-editor").includes("pathHasOnlyClosedSubpaths"), false);
});

test("renderer build emits a Node-loadable ESM entry for serverless functions", async () => {
  const rendererEntry = await readText("packages/renderer/src/index.ts");
  const packageJson = JSON.parse(await readText("package.json"));
  const fullVerification = await readText(".github/workflows/full-verification.yml");
  const productionWorkflow = await readText(".github/workflows/vercel-production.yml");

  assert.equal(rendererEntry.includes('export * from "./boolean-path.js";'), true);
  assert.equal(
    packageJson.scripts["check:serverless-runtime"],
    'node -e \'import("./packages/renderer/dist/index.js").then((renderer) => { if (typeof renderer.evaluateBooleanPath !== "function") process.exit(1); })\''
  );
  assert.equal(fullVerification.includes("pnpm run check:serverless-runtime"), true);
  assert.equal(productionWorkflow.includes("pnpm run check:serverless-runtime"), true);
});

test("storage restore drill workflow verifies backup restorability without hosted secrets", async () => {
  const workflow = await readText(".github/workflows/storage-restore-drill.yml");

  assert.match(workflow, /name: Storage Restore Drill/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /mktemp -d/);
  assert.match(workflow, /new FileStorage\(process\.env\.SOURCE_ROOT!\)/);
  assert.match(workflow, /projectId: "ci-project"/);
  assert.match(workflow, /documentId: "ci-file"/);
  assert.match(workflow, /saveFileVersion\("ci-file"/);
  assert.match(workflow, /pnpm run storage:backup -- drill/);
  assert.match(workflow, /--storage-dir "\$source_dir"/);
  assert.match(workflow, /--work-dir "\$work_dir"/);
  assert.match(workflow, /--expect-project ci-project/);
  assert.match(workflow, /--expect-file ci-file/);
  assert.doesNotMatch(workflow, /VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID|LAYO_REPOSITORY_ADMIN_TOKEN/);
});

test("storage backup retention workflow dry-runs and prunes local backup archives", async () => {
  const workflow = await readText(".github/workflows/storage-backup-retention.yml");

  assert.match(workflow, /name: Storage Backup Retention/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /writeStorageBackupToRepository/);
  assert.match(workflow, /backupId: "retention-oldest"/);
  assert.match(workflow, /backupId: "retention-middle"/);
  assert.match(workflow, /backupId: "retention-newest"/);
  assert.match(workflow, /pnpm run storage:backup -- repository-list/);
  assert.match(workflow, /pnpm run storage:backup -- repository-prune/);
  assert.match(workflow, /--keep-last 2/);
  assert.match(workflow, /--dry-run/);
  assert.match(workflow, /archive_count="\$\(find "\$backup_dir" -name '\*\.zip' \| wc -l \| tr -d ' '\)"/);
  assert.match(workflow, /test "\$archive_count" = "2"/);
  assert.doesNotMatch(workflow, /VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID|LAYO_REPOSITORY_ADMIN_TOKEN/);
});

test("full verification workflow runs PR-head gates without Vercel deployment secrets", async () => {
  const workflow = await readText(".github/workflows/full-verification.yml");

  assert.match(workflow, /name: Full Verification/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm exec playwright install --with-deps chromium/);
  assert.match(workflow, /pnpm run check:penpot-maturity/);
  assert.match(workflow, /pnpm run check:design-rules/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm --filter @layo\/web build/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /pnpm test:e2e/);
  assert.doesNotMatch(
    workflow,
    /VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID|LAYO_REPOSITORY_ADMIN_TOKEN|vercel build|vercel deploy/
  );
});

test("relay Docker artifacts expose team-owned relay configuration", async () => {
  const dockerfile = await readText("apps/collab-relay/Dockerfile");
  const compose = await readText("deploy/collab-relay/docker-compose.yml");
  const env = await readText("deploy/collab-relay/.env.example");

  assert.match(dockerfile, /@layo\/collab-relay/);
  assert.match(dockerfile, /EXPOSE 4327/);
  assert.match(compose, /COLLAB_RELAY_HOST/);
  assert.match(compose, /COLLAB_RELAY_PORT/);
  assert.match(compose, /COLLAB_MEMBER_TOKENS/);
  assert.match(compose, /\/health/);
  assert.match(env, /COLLAB_ALLOWED_ROOM_PREFIX=layo:/);
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

test("vercel deployment routes same-origin API requests to the Layo server function", async () => {
  const config = JSON.parse(await readText("vercel.json"));
  const apiFunction = await readText("api/bridge.ts");

  assert.equal(config.framework, "vite");
  assert.equal(config.outputDirectory, "apps/web/dist");
  assert.match(config.buildCommand, /pnpm --filter @layo\/web build/);
  assert.deepEqual(config.rewrites, [
    { source: "/health", destination: "/api/bridge?__layo_path=/health" },
    { source: "/projects", destination: "/api/bridge?__layo_path=/projects" },
    { source: "/projects/:path*", destination: "/api/bridge?__layo_path=/projects/:path*" },
    { source: "/files/:path*", destination: "/api/bridge?__layo_path=/files/:path*" },
    { source: "/assets", destination: "/api/bridge?__layo_path=/assets" },
    { source: "/assets/:path*", destination: "/api/bridge?__layo_path=/assets/:path*" },
    { source: "/migrations/:path*", destination: "/api/bridge?__layo_path=/migrations/:path*" },
    { source: "/libraries", destination: "/api/bridge?__layo_path=/libraries" },
    { source: "/libraries/:path*", destination: "/api/bridge?__layo_path=/libraries/:path*" },
    { source: "/comments/:path*", destination: "/api/bridge?__layo_path=/comments/:path*" },
    { source: "/account/:path*", destination: "/api/bridge?__layo_path=/account/:path*" }
  ]);

  assert.match(apiFunction, /createHttpServer/);
  assert.match(apiFunction, /new FileStorage/);
  assert.match(apiFunction, /\/tmp\/layo/);
  assert.equal(apiFunction.includes("__layo_path"), true);
  assert.equal(apiFunction.includes("request.url = routedPath"), true);
});

test("web shell includes a stable Layo deployment marker", async () => {
  const indexHtml = await readText("apps/web/index.html");

  assert.match(indexHtml, /<meta name="layo-app" content="vite-editor" \/>/);
});
