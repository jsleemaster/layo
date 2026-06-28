#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// Operations: backup --storage-dir <dir> --out <archive>,
// review --archive <archive>, restore --archive <archive> --storage-dir <dir> --force,
// drill --storage-dir <dir> --work-dir <dir> --expect-project <project-id> --expect-file <file-id>.
const result = spawnSync(
  "pnpm",
  ["--filter", "@layo/server", "exec", "tsx", "src/storage-backup-cli.ts", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      INIT_CWD: process.cwd()
    }
  }
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
