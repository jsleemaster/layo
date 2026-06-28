#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// No-write external migration review:
// review --archive <file> --source penpot|figma|unknown.
const nodeOptions = process.env.NODE_OPTIONS?.includes("--conditions=development")
  ? process.env.NODE_OPTIONS
  : [process.env.NODE_OPTIONS, "--conditions=development"].filter(Boolean).join(" ");

const result = spawnSync(
  "pnpm",
  ["--filter", "@layo/server", "exec", "tsx", "src/external-migration-cli.ts", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      INIT_CWD: process.cwd(),
      NODE_OPTIONS: nodeOptions
    }
  }
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
