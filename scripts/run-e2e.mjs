#!/usr/bin/env node
import { spawn } from "node:child_process";

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
    args: ["--filter", "@layo/web", "dev"],
    url: "http://127.0.0.1:5173/"
  }
];

const playwrightArgs = normalizeArgs(process.argv.slice(2));
const started = [];

try {
  for (const service of services) {
    if (await isReady(service.url)) {
      console.log(`[e2e] ${service.name} already ready at ${service.url}`);
      continue;
    }
    const child = spawn(service.command, service.args, {
      cwd: process.cwd(),
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const tracked = { name: service.name, child, output: [] };
    collectOutput(tracked, child.stdout);
    collectOutput(tracked, child.stderr);
    started.push(tracked);
    await waitForReady(service);
  }

  const exitCode = await runPlaywright(playwrightArgs);
  process.exitCode = exitCode;
} finally {
  await stopStartedServices();
}

function normalizeArgs(args) {
  return args[0] === "--" ? args.slice(1) : args;
}

async function runPlaywright(args) {
  const child = spawn("pnpm", ["exec", "playwright", "test", ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  return await waitForExit(child);
}

async function waitForReady(service) {
  const startedAt = Date.now();
  let exitCode = null;
  const tracked = started.find((candidate) => candidate.name === service.name);
  tracked?.child.once("exit", (code, signal) => {
    exitCode = signal ?? code ?? 1;
  });

  while (Date.now() - startedAt < readinessTimeoutMs) {
    if (await isReady(service.url)) {
      console.log(`[e2e] ${service.name} ready at ${service.url}`);
      return;
    }
    if (exitCode !== null) {
      throw new Error(`${service.name} exited before becoming ready: ${exitCode}${formatOutput(tracked)}`);
    }
    await sleep(readinessPollMs);
  }
  throw new Error(`${service.name} was not ready after ${readinessTimeoutMs}ms at ${service.url}${formatOutput(tracked)}`);
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
