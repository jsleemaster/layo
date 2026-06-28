import { pathToFileURL } from "node:url";
import { checkLiveDeployment } from "./live-deployment-smoke.mjs";

export async function syncGithubAboutHomepage({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GH_REPOSITORY_TOKEN ?? process.env.LAYO_REPOSITORY_ADMIN_TOKEN,
  url = process.env.LAYO_DEPLOYMENT_URL,
  fetcher = fetch
} = {}) {
  if (!repository) {
    throw new Error("Provide a GitHub repository as owner/name");
  }
  if (!token) {
    throw new Error("Provide a repository admin token");
  }
  if (!url) {
    throw new Error("Provide a deployment URL");
  }

  const verified = await checkLiveDeployment({ url, fetcher });
  const response = await fetcher(`https://api.github.com/repos/${repository}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ homepage: verified.url })
  });

  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw new Error(`Could not update GitHub About homepage: ${response.status} ${JSON.stringify(payload)}`);
  }

  return {
    homepage: payload.homepage,
    verifiedUrl: verified.url,
    healthUrl: verified.healthUrl
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url") {
      args.url = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--url=")) {
      args.url = value.slice("--url=".length);
    } else if (value === "--repository") {
      args.repository = argv[index + 1];
      index += 1;
    } else if (value.startsWith("--repository=")) {
      args.repository = value.slice("--repository=".length);
    }
  }
  return args;
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function main() {
  try {
    const result = await syncGithubAboutHomepage(parseArgs(process.argv.slice(2)));
    console.log("GitHub About homepage updated");
    console.log(`homepage=${result.homepage}`);
    console.log(`verified=${result.verifiedUrl}`);
    console.log(`health=${result.healthUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("GitHub About homepage update failed");
    console.error(`error=${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
