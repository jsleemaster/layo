import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  applyAuthorizationAuditRetention,
  exportAuthorizationAuditEvents,
  type AuthorizationAuditOperatorStore
} from "./team-authorization-audit-operator.js";
import {
  createPostgresTeamAuthorizationStateStore,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";

interface Output {
  write(chunk: string): unknown;
}

export interface AuthorizationAuditCliOptions {
  env?: NodeJS.ProcessEnv;
  stdout?: Output;
  createStore?: (databaseUrl: string) => Promise<TeamAuthorizationStateStore>;
}

interface ParsedArguments {
  command: "export" | "retain";
  values: Map<string, string>;
  switches: Set<string>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command, ...rest] = argv;
  if (command !== "export" && command !== "retain") {
    throw new Error("authorization audit command must be export or retain");
  }
  const allowedValues = new Set([
    "--scope",
    "--output",
    "--limit",
    "--archived-before",
    "--keep-newest",
    "--candidate-ids"
  ]);
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index]!;
    if (allowedValues.has(option)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--") || values.has(option)) {
        throw new Error(`${option} requires one explicit value`);
      }
      values.set(option, value);
      index += 1;
      continue;
    }
    if (option === "--apply" && !switches.has(option)) {
      switches.add(option);
      continue;
    }
    throw new Error(`unknown authorization audit option ${option}`);
  }
  return { command, values, switches };
}

function requiredValue(arguments_: ParsedArguments, option: string): string {
  const value = arguments_.values.get(option)?.trim();
  if (!value) {
    throw new Error(`${option} is required`);
  }
  return value;
}

function integerValue(
  arguments_: ParsedArguments,
  option: string,
  fallback: number,
  minimum: number
): number {
  const raw = arguments_.values.get(option);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${option} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function operatorStore(store: TeamAuthorizationStateStore): AuthorizationAuditOperatorStore {
  const listUnarchivedAuditEvents =
    store.listUnarchivedAuditEvents?.bind(store);
  const markAuditEventsArchived =
    store.markAuditEventsArchived?.bind(store);
  const listArchivedAuditRetentionCandidates =
    store.listArchivedAuditRetentionCandidates?.bind(store);
  const deleteArchivedAuditEvents =
    store.deleteArchivedAuditEvents?.bind(store);
  if (
    !listUnarchivedAuditEvents
    || !markAuditEventsArchived
    || !listArchivedAuditRetentionCandidates
    || !deleteArchivedAuditEvents
  ) {
    throw new Error(
      "authorization audit operator requires PostgreSQL archive and retention support"
    );
  }
  return {
    listUnarchivedAuditEvents,
    markAuditEventsArchived,
    listArchivedAuditRetentionCandidates,
    deleteArchivedAuditEvents
  };
}

export async function runAuthorizationAuditCli(
  argv: string[],
  options: AuthorizationAuditCliOptions = {}
): Promise<void> {
  const arguments_ = parseArguments(argv);
  const databaseUrl =
    (options.env ?? process.env).LAYO_AUTHORIZATION_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("LAYO_AUTHORIZATION_DATABASE_URL is required");
  }
  const createStore = options.createStore
    ?? (async (connectionString: string) =>
      createPostgresTeamAuthorizationStateStore({ connectionString }));
  const store = await createStore(databaseUrl);
  let commandError: unknown;
  try {
    const auditStore = operatorStore(store);
    const scope = requiredValue(arguments_, "--scope");
    const limit = integerValue(arguments_, "--limit", 500, 1);
    const result = arguments_.command === "export"
      ? await exportAuthorizationAuditEvents({
          store: auditStore,
          scope,
          outputPath: requiredValue(arguments_, "--output"),
          limit
        })
      : await applyAuthorizationAuditRetention({
          store: auditStore,
          scope,
          archivedBefore: requiredValue(arguments_, "--archived-before"),
          keepNewest: integerValue(arguments_, "--keep-newest", 1000, 0),
          limit,
          apply: arguments_.switches.has("--apply"),
          ...(arguments_.values.has("--candidate-ids")
            ? {
                reviewedCandidateIds: requiredValue(
                  arguments_,
                  "--candidate-ids"
                ).split(",").map((id) => id.trim())
              }
            : {})
        });
    (options.stdout ?? process.stdout).write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    commandError = error;
    throw error;
  } finally {
    try {
      await store.close();
    } catch (closeError) {
      if (commandError === undefined) {
        throw closeError;
      }
      if (commandError instanceof Error && commandError.cause === undefined) {
        Object.defineProperty(commandError, "cause", {
          configurable: true,
          value: closeError
        });
      }
    }
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  runAuthorizationAuditCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
