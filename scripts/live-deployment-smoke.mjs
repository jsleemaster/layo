import { pathToFileURL } from "node:url";

const LAYO_DEPLOYMENT_MARKER = '<meta name="layo-app" content="vite-editor"';

export async function checkLiveDeployment({ url, fetcher = fetch } = {}) {
  const baseUrl = normalizeDeploymentUrl(url ?? process.env.LAYO_PRODUCTION_URL);
  const htmlResponse = await fetcher(baseUrl.href);
  if (!htmlResponse.ok) {
    throw new Error(`Expected ${baseUrl.href} to return 200, got ${htmlResponse.status}`);
  }

  const html = await htmlResponse.text();
  if (html.includes("/_next/") || html.includes('id="__next"') || html.includes("id='__next'")) {
    throw new Error(`${baseUrl.href} is not the Layo Vite editor: found Next.js shell assets`);
  }
  if (!html.includes(LAYO_DEPLOYMENT_MARKER)) {
    throw new Error(`${baseUrl.href} is not the Layo Vite editor: missing Layo deployment marker`);
  }

  const healthUrl = new URL("/health", baseUrl);
  const healthResponse = await fetcher(healthUrl.href);
  if (!healthResponse.ok) {
    throw new Error(`Expected ${healthUrl.href} to return 200, got ${healthResponse.status}`);
  }

  const health = await readHealthJson(healthResponse, healthUrl.href);
  if (health?.ok !== true && health?.status !== "ok") {
    throw new Error(`Expected ${healthUrl.href} to return { ok: true } or { status: "ok" }`);
  }

  return {
    url: baseUrl.href,
    healthUrl: healthUrl.href,
    marker: "vite-editor"
  };
}

function normalizeDeploymentUrl(value) {
  if (!value || typeof value !== "string") {
    throw new Error("Provide a deployment URL with --url or LAYO_PRODUCTION_URL");
  }
  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

async function readHealthJson(response, url) {
  try {
    return await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Expected ${url} to return JSON health payload: ${detail}`);
  }
}

function parseArgs(argv) {
  const args = { url: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url") {
      args.url = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--url=")) {
      args.url = value.slice("--url=".length);
    }
  }
  return args;
}

async function main() {
  try {
    const result = await checkLiveDeployment(parseArgs(process.argv.slice(2)));
    console.log("Live deployment smoke passed");
    console.log(`url=${result.url}`);
    console.log(`health=${result.healthUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Live deployment smoke failed");
    console.error(`error=${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
