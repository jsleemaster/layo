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
  assert.match(workflow, /vercel@50\.9\.6/);
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
  const apiFunction = await readText("api/[...path].ts");

  assert.equal(config.framework, "vite");
  assert.equal(config.outputDirectory, "apps/web/dist");
  assert.match(config.buildCommand, /pnpm --filter @layo\/web build/);
  assert.deepEqual(config.rewrites, [
    { source: "/health", destination: "/api/health" },
    { source: "/projects/:path*", destination: "/api/projects/:path*" },
    { source: "/files/:path*", destination: "/api/files/:path*" },
    { source: "/assets/:path*", destination: "/api/assets/:path*" }
  ]);

  assert.match(apiFunction, /createHttpServer/);
  assert.match(apiFunction, /new FileStorage/);
  assert.match(apiFunction, /\/tmp\/layo/);
  assert.match(apiFunction, /originalUrl\.slice\(4\)/);
});

test("web shell includes a stable Layo deployment marker", async () => {
  const indexHtml = await readText("apps/web/index.html");

  assert.match(indexHtml, /<meta name="layo-app" content="vite-editor" \/>/);
});
