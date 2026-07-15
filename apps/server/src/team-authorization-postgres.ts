import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

const REQUIRED_SCHEMA_VERSION = 1;
const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;
const MAX_SERIALIZED_STATE_BYTES = 1_048_576;
const MAX_SCOPE_BYTES = 512;
const EMPTY_SERIALIZED_STATE = "{\"version\":2,\"members\":[]}";
const MIGRATION_URL = new URL(
  "../migrations/0001-team-authorization-state.sql",
  import.meta.url
);

export interface TeamAuthorizationStateSnapshot {
  generation: string;
  baseFingerprint: string;
  serializedState: string;
}

export interface TeamAuthorizationStateStore {
  read(scope: string): Promise<TeamAuthorizationStateSnapshot>;
  mutate<T>(
    scope: string,
    expectedBaseFingerprint: string,
    operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{
      baseFingerprint: string;
      serializedState: string;
      result: T;
    }>
  ): Promise<{
    generation: string;
    baseFingerprint: string;
    serializedState: string;
    result: T;
  }>;
  close(): Promise<void>;
}

export interface PostgresTeamAuthorizationOptions {
  connectionString: string;
  statementTimeoutMs?: number;
}

interface AuthorizationStateRow {
  generation: string;
  base_fingerprint: string;
  state: unknown;
}

function validateConnectionString(connectionString: string): string {
  const normalized = connectionString.trim();
  if (!normalized) {
    throw new Error("authorization PostgreSQL connection string must not be blank");
  }
  return normalized;
}

function validateStatementTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
    throw new Error("authorization PostgreSQL statement timeout must be a positive integer");
  }
  return timeout;
}

function validateScope(scope: string): string {
  if (
    scope !== scope.trim()
    || Buffer.byteLength(scope, "utf8") > MAX_SCOPE_BYTES
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(scope)
  ) {
    throw new Error("authorization scope is invalid");
  }
  return scope;
}

function validateFingerprint(fingerprint: string): string {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new Error("authorization base fingerprint must be 64 lowercase hex characters");
  }
  return fingerprint;
}

function validateGeneration(generation: unknown): string {
  if (typeof generation !== "string" || !/^(0|[1-9][0-9]*)$/.test(generation)) {
    throw new Error("authorization generation must be an exact nonnegative decimal string");
  }
  return generation;
}

function orderedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((left, right) => {
    if (left === "version") {
      return right === "version" ? 0 : -1;
    }
    if (right === "version") {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of orderedKeys(source)) {
      result[key] = canonicalizeJson(source[key]);
    }
    return result;
  }
  return value;
}

function parseSerializedState(serializedState: string): {
  serializedState: string;
  value: Record<string, unknown>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedState) as unknown;
  } catch {
    throw new Error("authorization state must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("authorization state must be a JSON object");
  }
  const value = canonicalizeJson(parsed) as Record<string, unknown>;
  const canonical = JSON.stringify(value);
  if (Buffer.byteLength(canonical, "utf8") > MAX_SERIALIZED_STATE_BYTES) {
    throw new Error("authorization state exceeds the encoded size limit");
  }
  return { serializedState: canonical, value };
}

function snapshotFromRow(row: AuthorizationStateRow): TeamAuthorizationStateSnapshot {
  const state = typeof row.state === "string" ? row.state : JSON.stringify(row.state);
  return {
    generation: validateGeneration(row.generation),
    baseFingerprint: validateFingerprint(row.base_fingerprint),
    serializedState: parseSerializedState(state).serializedState
  };
}

async function setLocalStatementTimeout(
  client: PoolClient,
  statementTimeoutMs: number
): Promise<void> {
  await client.query(
    "SELECT set_config('statement_timeout', $1, true)",
    [String(statementTimeoutMs)]
  );
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The original transaction error is the actionable failure.
  }
}

export async function migratePostgresTeamAuthorizationState(
  options: PostgresTeamAuthorizationOptions
): Promise<void> {
  const connectionString = validateConnectionString(options.connectionString);
  const statementTimeoutMs = validateStatementTimeout(options.statementTimeoutMs);
  const pool = new Pool({ connectionString, statement_timeout: statementTimeoutMs });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await setLocalStatementTimeout(client, statementTimeoutMs);
    // Purpose: serialize every authorization migrator on one stable database lock.
    await client.query("SELECT pg_advisory_xact_lock(1818326383, 1635087464)");
    // Purpose: bootstrap the migration ledger before version inspection.
    await client.query(`
      CREATE TABLE IF NOT EXISTS layo_authorization_schema_migrations (
        version integer PRIMARY KEY CHECK (version > 0),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const current = await client.query<{ version: number | string | null }>(
      "SELECT max(version) AS version FROM layo_authorization_schema_migrations"
    );
    const versionValue = current.rows[0]?.version;
    const currentVersion =
      versionValue === null || versionValue === undefined
        ? 0
        : Number(versionValue);
    if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
      throw new Error("authorization schema version is invalid");
    }
    if (currentVersion > REQUIRED_SCHEMA_VERSION) {
      throw new Error(
        `authorization schema version ${currentVersion} is newer than supported version ${REQUIRED_SCHEMA_VERSION}`
      );
    }
    if (currentVersion < REQUIRED_SCHEMA_VERSION) {
      const migration = await readFile(MIGRATION_URL, "utf8");
      await client.query(migration);
    }
    await client.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function createPostgresTeamAuthorizationStateStore(
  options: PostgresTeamAuthorizationOptions
): Promise<TeamAuthorizationStateStore> {
  const connectionString = validateConnectionString(options.connectionString);
  const statementTimeoutMs = validateStatementTimeout(options.statementTimeoutMs);
  const pool = new Pool({ connectionString, statement_timeout: statementTimeoutMs });
  let closed = false;
  let closePromise: Promise<void> | undefined;

  try {
    const schema = await pool.query<{ version: number | string | null }>(
      "SELECT max(version) AS version FROM layo_authorization_schema_migrations"
    );
    const value = schema.rows[0]?.version;
    const version = value === null || value === undefined ? 0 : Number(value);
    if (version !== REQUIRED_SCHEMA_VERSION) {
      throw new Error(
        `authorization schema version ${String(value ?? "missing")} does not match required version ${REQUIRED_SCHEMA_VERSION}; run authorization:migrate`
      );
    }
  } catch (error) {
    await pool.end();
    if (
      error instanceof Error
      && error.message.includes("authorization schema version")
    ) {
      throw error;
    }
    throw new Error(
      "authorization schema is missing or unreadable; run authorization:migrate",
      { cause: error }
    );
  }

  function assertOpen(): void {
    if (closed) {
      throw new Error("authorization PostgreSQL store is closed");
    }
  }

  async function seedAfterRollback(
    scope: string,
    fingerprint: string
  ): Promise<void> {
    const initial = parseSerializedState(EMPTY_SERIALIZED_STATE);
    await pool.query(
      `INSERT INTO layo_team_authorization_state
        (scope, generation, base_fingerprint, state, schema_version)
       VALUES ($1, 0, $2, $3::jsonb, $4)
       ON CONFLICT (scope) DO NOTHING`,
      [scope, fingerprint, initial.serializedState, REQUIRED_SCHEMA_VERSION]
    );
  }

  return {
    async read(scopeInput) {
      assertOpen();
      const scope = validateScope(scopeInput);
      const result = await pool.query<AuthorizationStateRow>(
        `SELECT generation::text AS generation, base_fingerprint, state
         FROM layo_team_authorization_state
         WHERE scope = $1`,
        [scope]
      );
      if (result.rowCount !== 1) {
        throw new Error(`authorization scope ${scope} does not exist`);
      }
      return snapshotFromRow(result.rows[0]!);
    },

    async mutate<T>(scopeInput: string, expectedFingerprintInput: string, operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{
      baseFingerprint: string;
      serializedState: string;
      result: T;
    }>) {
      assertOpen();
      const scope = validateScope(scopeInput);
      const expectedBaseFingerprint = validateFingerprint(expectedFingerprintInput);
      const initial = parseSerializedState(EMPTY_SERIALIZED_STATE);
      const client = await pool.connect();
      let seeded = false;

      try {
        await client.query("BEGIN");
        await setLocalStatementTimeout(client, statementTimeoutMs);
        const inserted = await client.query(
          `INSERT INTO layo_team_authorization_state
            (scope, generation, base_fingerprint, state, schema_version)
           VALUES ($1, 0, $2, $3::jsonb, $4)
           ON CONFLICT (scope) DO NOTHING`,
          [
            scope,
            expectedBaseFingerprint,
            initial.serializedState,
            REQUIRED_SCHEMA_VERSION
          ]
        );
        seeded = inserted.rowCount === 1;

        const locked = await client.query<AuthorizationStateRow>(
          `SELECT generation::text AS generation, base_fingerprint, state
           FROM layo_team_authorization_state
           WHERE scope = $1
           FOR UPDATE`,
          [scope]
        );
        if (locked.rowCount !== 1) {
          throw new Error(`authorization scope ${scope} could not be locked`);
        }
        const snapshot = snapshotFromRow(locked.rows[0]!);
        if (snapshot.baseFingerprint !== expectedBaseFingerprint) {
          throw new Error("authorization base fingerprint does not match shared state");
        }

        const mutation = await operation(snapshot);
        const baseFingerprint = validateFingerprint(mutation.baseFingerprint);
        const state = parseSerializedState(mutation.serializedState);
        const updated = await client.query<AuthorizationStateRow>(
          `UPDATE layo_team_authorization_state
           SET generation = generation + 1,
               base_fingerprint = $2,
               state = $3::jsonb,
               schema_version = $4,
               updated_at = now()
           WHERE scope = $1
           RETURNING generation::text AS generation, base_fingerprint, state`,
          [scope, baseFingerprint, state.serializedState, REQUIRED_SCHEMA_VERSION]
        );
        if (updated.rowCount !== 1) {
          throw new Error(`authorization scope ${scope} was not updated`);
        }
        const committed = snapshotFromRow(updated.rows[0]!);
        await client.query("COMMIT");
        return { ...committed, result: mutation.result };
      } catch (error) {
        await rollbackQuietly(client);
        if (seeded && !closed) {
          await seedAfterRollback(scope, expectedBaseFingerprint);
        }
        throw error;
      } finally {
        client.release();
      }
    },

    close() {
      if (!closePromise) {
        closed = true;
        closePromise = pool.end();
      }
      return closePromise;
    }
  };
}

async function runMigrationCli(): Promise<void> {
  const connectionString = process.env.LAYO_AUTHORIZATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error("LAYO_AUTHORIZATION_DATABASE_URL is required");
  }
  await migratePostgresTeamAuthorizationState({ connectionString });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  runMigrationCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
