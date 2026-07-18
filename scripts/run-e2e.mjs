#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const readinessTimeoutMs = 45_000;
const readinessPollMs = 250;
const services = [
  {
    name: "server",
    command: "pnpm",
    args: ["--filter", "@layo/server", "dev"],
    url: "http://127.0.0.1:4317/health"
  },
  {
    name: "web",
    command: "pnpm",
    args: ["--filter", "@layo/web", "dev", "--", "--strictPort"],
    url: "http://127.0.0.1:5173/"
  }
];

const playwrightArgs = withCiRetries(normalizeArgs(process.argv.slice(2)));
const started = [];
const e2eStorageRoot = await mkdtemp(path.join(tmpdir(), "layo-e2e-"));
const e2eStorageToken = randomUUID();
await writeFile(path.join(e2eStorageRoot, ".layo-e2e-root"), e2eStorageToken, {
  encoding: "utf8",
  flag: "wx"
});
// Purpose: keep destructive browser-test state outside developer-owned local projects.
const e2eEnvironment = {
  ...process.env,
  LAYO_STORAGE_DIR: e2eStorageRoot,
  LAYO_E2E_STORAGE_DIR: e2eStorageRoot,
  LAYO_E2E_STORAGE_TOKEN: e2eStorageToken
};

try {
  for (const service of services) {
    if (await isReady(service.url)) {
      throw new Error(
        `[e2e] ${service.name} is already running at ${service.url}; stop it before starting isolated E2E`
      );
    }
    const child = spawn(service.command, service.args, {
      cwd: process.cwd(),
      env: e2eEnvironment,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const tracked = { name: service.name, child, output: [], spawnError: null };
    child.once("error", (error) => {
      tracked.spawnError = error;
    });
    collectOutput(tracked, child.stdout);
    collectOutput(tracked, child.stderr);
    started.push(tracked);
    await waitForReady(service, tracked);
  }

  const exitCode = await runPlaywright(playwrightArgs);
  process.exitCode = exitCode;
} finally {
  await stopStartedServices();
  await rm(e2eStorageRoot, { recursive: true, force: true });
}

function normalizeArgs(args) {
  return args[0] === "--" ? args.slice(1) : args;
}

function withCiRetries(args) {
  if (process.env.CI !== "true" || args.some((arg) => arg === "--retries" || arg.startsWith("--retries="))) {
    return args;
  }
  return ["--retries=1", ...args];
}

async function runPlaywright(args) {
  const child = spawn("pnpm", ["exec", "playwright", "test", ...args], {
    cwd: process.cwd(),
    env: e2eEnvironment,
    stdio: "inherit"
  });
  return await waitForExit(child);
}

async function waitForReady(service, tracked) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < readinessTimeoutMs) {
    assertServiceProcessAlive(tracked);
    if (await isReady(service.url)) {
      await sleep(readinessPollMs);
      assertServiceProcessAlive(tracked);
      if (await isReady(service.url)) {
        console.log(`[e2e] ${service.name} ready at ${service.url}`);
        return;
      }
    }
    await sleep(readinessPollMs);
  }
  throw new Error(`${service.name} was not ready after ${readinessTimeoutMs}ms at ${service.url}${formatOutput(tracked)}`);
}

function assertServiceProcessAlive(tracked) {
  if (tracked.spawnError) {
    throw new Error(`${tracked.name} failed to start: ${tracked.spawnError.message}${formatOutput(tracked)}`);
  }
  const { exitCode, signalCode } = tracked.child;
  if (exitCode !== null || signalCode !== null) {
    throw new Error(
      `${tracked.name} exited before becoming ready: ${signalCode ?? exitCode ?? 1}${formatOutput(tracked)}`
    );
  }
}

async function isReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function stopStartedServices() {
  await Promise.all(
    started
      .slice()
      .reverse()
      .map(async ({ child }) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          return;
        }
        terminate(child);
        const stopped = await Promise.race([waitForExit(child).then(() => true), sleep(5_000).then(() => false)]);
        if (!stopped) {
          terminate(child, "SIGKILL");
        }
      })
  );
}

function terminate(child, signal = "SIGTERM") {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child below.
    }
  }
  child.kill(signal);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.signalCode ? 1 : (child.exitCode ?? 0));
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(signal ? 1 : (code ?? 0));
    });
  });
}

function collectOutput(tracked, stream) {
  stream?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line) {
        continue;
      }
      tracked.output.push(line);
      if (tracked.output.length > 80) {
        tracked.output.shift();
      }
    }
  });
}

function formatOutput(tracked) {
  if (!tracked?.output.length) {
    return "";
  }
  return `\n\nLast ${tracked.name} output:\n${tracked.output.join("\n")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
