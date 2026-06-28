import { readFile } from "node:fs/promises";
import { reviewExternalMigrationArchive, type ExternalMigrationSource } from "./external-migration.js";

type MigrationReviewCommand = "review";

interface ParsedArgs {
  command: MigrationReviewCommand;
  archive?: string;
  sourceHint?: ExternalMigrationSource;
}

const USAGE = `Usage:
  pnpm run migration:review -- review --archive <file> [--source penpot|figma|unknown]

Commands:
  review             Print a no-write Penpot/Figma migration preflight summary.
`;

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const archivePath = requireValue(args.archive, "--archive");
  const archive = await readFile(archivePath);
  printJson({
    command: args.command,
    archive: archivePath,
    review: reviewExternalMigrationArchive(archive, {
      fileName: archivePath,
      sourceHint: args.sourceHint
    })
  });
}

function parseArgs(argv: string[]): ParsedArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const command = normalizeCommand(normalizedArgv[0]);
  const tokens = command ? normalizedArgv.slice(1) : normalizedArgv;
  const parsed: ParsedArgs = { command: command ?? "review" };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--archive") {
      parsed.archive = requireValue(tokens[++index], "--archive");
      continue;
    }
    if (token === "--source") {
      parsed.sourceHint = normalizeSource(requireValue(tokens[++index], "--source"));
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

function normalizeCommand(value: string | undefined): MigrationReviewCommand | undefined {
  if (value === "review") {
    return value;
  }
  if (!value || value.startsWith("--")) {
    return undefined;
  }
  throw new Error(`unknown command: ${value}\n${USAGE}`);
}

function normalizeSource(value: string): ExternalMigrationSource {
  if (value === "penpot" || value === "figma" || value === "unknown") {
    return value;
  }
  throw new Error(`--source must be penpot, figma, or unknown`);
}

function requireValue(value: string | undefined, option: string): string {
  if (!value) {
    throw new Error(`${option} is required\n${USAGE}`);
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
