import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createStorageBackupArchive,
  runStorageRestoreDrill,
  restoreStorageBackupArchive,
  reviewStorageBackupArchive
} from "./storage-backup.js";

type StorageBackupCommand = "backup" | "review" | "restore" | "drill";

interface ParsedArgs {
  command: StorageBackupCommand;
  storageDir?: string;
  archive?: string;
  out?: string;
  workDir?: string;
  expectProjectId?: string;
  expectFileId?: string;
  force: boolean;
}

const USAGE = `Usage:
  pnpm run storage:backup -- backup --storage-dir <dir> --out <archive>
  pnpm run storage:backup -- review --archive <archive>
  pnpm run storage:backup -- restore --archive <archive> --storage-dir <dir> [--force]
  pnpm run storage:backup -- drill --storage-dir <dir> --work-dir <dir> --expect-project <project-id> --expect-file <file-id>

Commands:
  backup   Create a .layo storage backup archive.
  review   Print backup manifest, directories, entries, and byte summary.
  restore  Restore a backup archive into a storage root.
  drill    Back up a storage root, restore it into a scratch directory, and verify expected content.
`;

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.command === "backup") {
    const storageDir = requirePathOption(args.storageDir, "--storage-dir");
    const out = requirePathOption(args.out, "--out");
    const archive = await createStorageBackupArchive(storageDir);
    await writeFile(out, archive);
    printJson({
      command: "backup",
      storageDir,
      archive: out,
      review: reviewStorageBackupArchive(archive)
    });
    return;
  }

  if (args.command === "review") {
    const archivePath = requirePathOption(args.archive, "--archive");
    const archive = await readFile(archivePath);
    printJson({
      command: "review",
      archive: archivePath,
      review: reviewStorageBackupArchive(archive)
    });
    return;
  }

  if (args.command === "drill") {
    const storageDir = requirePathOption(args.storageDir, "--storage-dir");
    printJson({
      command: "drill",
      storageDir,
      workDir: args.workDir,
      result: await runStorageRestoreDrill(storageDir, {
        workDir: args.workDir,
        expectProjectId: args.expectProjectId,
        expectFileId: args.expectFileId
      })
    });
    return;
  }

  const archivePath = requirePathOption(args.archive, "--archive");
  const storageDir = requirePathOption(args.storageDir, "--storage-dir");
  const archive = await readFile(archivePath);
  printJson({
    command: "restore",
    archive: archivePath,
    storageDir,
    review: await restoreStorageBackupArchive(archive, storageDir, { force: args.force })
  });
}

function parseArgs(argv: string[]): ParsedArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const command = normalizeCommand(normalizedArgv[0]);
  const tokens = command ? normalizedArgv.slice(1) : normalizedArgv;
  const parsed: ParsedArgs = { command: command ?? "backup", force: false };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--force") {
      parsed.force = true;
      continue;
    }
    if (token === "--storage-dir") {
      parsed.storageDir = resolveCliPath(tokens[++index], "--storage-dir");
      continue;
    }
    if (token === "--archive") {
      parsed.archive = resolveCliPath(tokens[++index], "--archive");
      continue;
    }
    if (token === "--out") {
      parsed.out = resolveCliPath(tokens[++index], "--out");
      continue;
    }
    if (token === "--work-dir") {
      parsed.workDir = resolveCliPath(tokens[++index], "--work-dir");
      continue;
    }
    if (token === "--expect-project") {
      parsed.expectProjectId = requireValue(tokens[++index], "--expect-project");
      continue;
    }
    if (token === "--expect-file") {
      parsed.expectFileId = requireValue(tokens[++index], "--expect-file");
      continue;
    }
    if (token === "--help" || token === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    throw new Error(`unknown argument: ${token}\n${USAGE}`);
  }

  return parsed;
}

function normalizeCommand(value: string | undefined): StorageBackupCommand | undefined {
  if (value === "backup" || value === "review" || value === "restore" || value === "drill") {
    return value;
  }
  return undefined;
}

function resolveCliPath(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  const rootCwd = process.env.INIT_CWD ?? process.cwd();
  return path.resolve(rootCwd, value);
}

function requirePathOption(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`${flag} is required\n${USAGE}`);
  }
  return value;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
