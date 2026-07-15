import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createPostgresTeamAuthorizationStateStore,
  type TeamAuthorizationStateSnapshot,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";
import {
  canonicalSharedManagedTokenState,
  canonicalTeamAuthorizationBaseFingerprint
} from "./team-authorization.js";

export { canonicalTeamAuthorizationBaseFingerprint };

const EMPTY_MANAGED_STATE = "{\"version\":2,\"members\":[]}";
const ARTIFACT_VERSION = 1;

interface CliOutput {
  write(chunk: string): unknown;
}

export interface TeamAuthorizationSharedCliOptions {
  env?: NodeJS.ProcessEnv;
  stdout?: CliOutput;
  createStore?: (databaseUrl: string) => Promise<TeamAuthorizationStateStore>;
}

interface ParsedArguments {
  command: "bootstrap" | "export" | "restore";
  values: Map<string, string>;
  switches: Set<string>;
}

interface SharedAuthorizationArtifact {
  version: 1;
  scope: string;
  generation: string;
  baseFingerprint: string;
  state: unknown;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [commandInput, ...rest] = argv;
  if (
    commandInput !== "bootstrap"
    && commandInput !== "export"
    && commandInput !== "restore"
  ) {
    throw new Error("authorization command must be bootstrap, export, or restore");
  }

  const valueOptions = new Set(["--scope", "--base", "--output", "--input"]);
  const switchOptions = new Set([
    "--empty",
    "--from-sidecar",
    "--confirm-absent-scope-restore"
  ]);
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index]!;
    if (valueOptions.has(option)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--") || values.has(option)) {
        throw new Error(`${option} requires one explicit value`);
      }
      values.set(option, value);
      index += 1;
      continue;
    }
    if (switchOptions.has(option)) {
      if (switches.has(option)) {
        throw new Error(`${option} must not be repeated`);
      }
      switches.add(option);
      continue;
    }
    throw new Error(`unknown authorization option ${option}`);
  }
  return { command: commandInput, values, switches };
}

function requiredValue(arguments_: ParsedArguments, option: string): string {
  const value = arguments_.values.get(option)?.trim();
  if (!value) {
    throw new Error(`${option} is required`);
  }
  return value;
}

function rejectOptions(
  arguments_: ParsedArguments,
  allowedValues: readonly string[],
  allowedSwitches: readonly string[]
): void {
  for (const option of arguments_.values.keys()) {
    if (!allowedValues.includes(option)) {
      throw new Error(`${option} is not valid for ${arguments_.command}`);
    }
  }
  for (const option of arguments_.switches) {
    if (!allowedSwitches.includes(option)) {
      throw new Error(`${option} is not valid for ${arguments_.command}`);
    }
  }
}

function missingScopeError(error: unknown, scope: string): boolean {
  return error instanceof Error
    && error.message === `authorization scope ${scope} does not exist`;
}

async function requireAbsentScope(
  store: TeamAuthorizationStateStore,
  scope: string
): Promise<void> {
  try {
    await store.read(scope);
  } catch (error) {
    if (missingScopeError(error, scope)) {
      return;
    }
    throw error;
  }
  throw new Error(`authorization scope ${scope} already exists`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshotsMatch(
  left: TeamAuthorizationStateSnapshot,
  right: TeamAuthorizationStateSnapshot
): boolean {
  let leftState: unknown;
  let rightState: unknown;
  try {
    leftState = JSON.parse(left.serializedState);
    rightState = JSON.parse(right.serializedState);
  } catch {
    return false;
  }
  return left.generation === right.generation
    && left.baseFingerprint === right.baseFingerprint
    && canonicalJson(leftState) === canonicalJson(rightState);
}

function parseArtifact(input: string): SharedAuthorizationArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    throw new Error("authorization restore artifact must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("authorization restore artifact must be an object");
  }
  const candidate = parsed as Record<string, unknown>;
  const supported = [
    "version",
    "scope",
    "generation",
    "baseFingerprint",
    "state"
  ];
  const unsupported = Object.keys(candidate).filter(
    (key) => !supported.includes(key)
  );
  if (
    unsupported.length > 0
    || candidate.version !== ARTIFACT_VERSION
    || typeof candidate.scope !== "string"
    || !candidate.scope.trim()
    || typeof candidate.generation !== "string"
    || !/^(0|[1-9][0-9]*)$/.test(candidate.generation)
    || typeof candidate.baseFingerprint !== "string"
    || !/^[0-9a-f]{64}$/.test(candidate.baseFingerprint)
    || !candidate.state
    || typeof candidate.state !== "object"
    || Array.isArray(candidate.state)
  ) {
    throw new Error("authorization restore artifact is invalid");
  }
  return {
    version: ARTIFACT_VERSION,
    scope: candidate.scope,
    generation: candidate.generation,
    baseFingerprint: candidate.baseFingerprint,
    state: candidate.state
  };
}

async function runBootstrap(
  arguments_: ParsedArguments,
  store: TeamAuthorizationStateStore
): Promise<void> {
  rejectOptions(arguments_, ["--scope", "--base"], ["--empty", "--from-sidecar"]);
  const scope = requiredValue(arguments_, "--scope");
  const basePath = requiredValue(arguments_, "--base");
  const empty = arguments_.switches.has("--empty");
  const fromSidecar = arguments_.switches.has("--from-sidecar");
  if (empty === fromSidecar) {
    throw new Error("bootstrap requires exactly one of --empty or --from-sidecar");
  }

  const baseInput = await readFile(basePath, "utf8");
  const serializedState = fromSidecar
    ? canonicalSharedManagedTokenState(
        baseInput,
        await readFile(`${basePath}.tokens.json`, "utf8")
      )
    : EMPTY_MANAGED_STATE;
  const requested: TeamAuthorizationStateSnapshot = {
    generation: "0",
    baseFingerprint: canonicalTeamAuthorizationBaseFingerprint(baseInput),
    serializedState
  };

  await requireAbsentScope(store, scope);
  const result = await store.initializeAbsent(scope, requested);
  if (!result.initialized && !snapshotsMatch(result.snapshot, requested)) {
    throw new Error(
      `authorization scope ${scope} was initialized with conflicting state`
    );
  }
}

async function runExport(
  arguments_: ParsedArguments,
  store: TeamAuthorizationStateStore,
  stdout: CliOutput
): Promise<void> {
  rejectOptions(arguments_, ["--scope", "--output"], []);
  const scope = requiredValue(arguments_, "--scope");
  const snapshot = await store.read(scope);
  const artifact: SharedAuthorizationArtifact = {
    version: ARTIFACT_VERSION,
    scope,
    generation: snapshot.generation,
    baseFingerprint: snapshot.baseFingerprint,
    state: JSON.parse(snapshot.serializedState) as unknown
  };
  const output = `${JSON.stringify(artifact, null, 2)}\n`;
  const outputPath = arguments_.values.get("--output");
  if (outputPath) {
    await writeFile(outputPath, output, { encoding: "utf8", mode: 0o600 });
    return;
  }
  stdout.write(output);
}

async function runRestore(
  arguments_: ParsedArguments,
  store: TeamAuthorizationStateStore
): Promise<void> {
  rejectOptions(
    arguments_,
    ["--scope", "--input"],
    ["--confirm-absent-scope-restore"]
  );
  const scope = requiredValue(arguments_, "--scope");
  const inputPath = requiredValue(arguments_, "--input");
  if (!arguments_.switches.has("--confirm-absent-scope-restore")) {
    throw new Error(
      "restore requires --confirm-absent-scope-restore"
    );
  }
  const artifact = parseArtifact(await readFile(inputPath, "utf8"));
  if (artifact.scope !== scope) {
    throw new Error("authorization restore artifact scope does not match --scope");
  }

  await requireAbsentScope(store, scope);
  const result = await store.initializeAbsent(scope, {
    generation: artifact.generation,
    baseFingerprint: artifact.baseFingerprint,
    serializedState: JSON.stringify(artifact.state)
  });
  if (!result.initialized) {
    throw new Error(`authorization scope ${scope} already exists`);
  }
}

export async function runTeamAuthorizationSharedCli(
  argv: string[],
  options: TeamAuthorizationSharedCliOptions = {}
): Promise<void> {
  const arguments_ = parseArguments(argv);
  const env = options.env ?? process.env;
  // Purpose: shared authorization operations require operator-selected database authority.
  const databaseUrl = env.LAYO_AUTHORIZATION_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("LAYO_AUTHORIZATION_DATABASE_URL is required");
  }
  const createStore = options.createStore
    ?? (async (connectionString: string) =>
      createPostgresTeamAuthorizationStateStore({ connectionString }));
  const store = await createStore(databaseUrl);
  try {
    if (arguments_.command === "bootstrap") {
      await runBootstrap(arguments_, store);
    } else if (arguments_.command === "export") {
      await runExport(arguments_, store, options.stdout ?? process.stdout);
    } else {
      await runRestore(arguments_, store);
    }
  } finally {
    await store.close();
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  runTeamAuthorizationSharedCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
