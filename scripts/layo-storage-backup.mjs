#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// Operations: backup --storage-dir <dir> --out <archive>,
// review --archive <archive>, restore --archive <archive> --storage-dir <dir> --force,
// drill --storage-dir <dir> --work-dir <dir> --expect-project <project-id> --expect-file <file-id>,
// repository-put --storage-dir <dir> --repository-dir <dir>,
// repository-list --repository-dir <dir>,
// repository-prune --repository-dir <dir> --keep-last <count> --max-age-days <days> --dry-run.
const nodeOptions = process.env.NODE_OPTIONS?.includes("--conditions=development")
  ? process.env.NODE_OPTIONS
  : [process.env.NODE_OPTIONS, "--conditions=development"].filter(Boolean).join(" ");

const result = spawnSync(
  "pnpm",
  ["--filter", "@layo/server", "exec", "tsx", "src/storage-backup-cli.ts", ...process.argv.slice(2)],
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
