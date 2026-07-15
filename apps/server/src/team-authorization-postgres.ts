import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

const REQUIRED_DATABASE_SCHEMA_VERSION = 2;
const AUTHORIZATION_STATE_SCHEMA_VERSION = 1;
const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;
const MAX_SERIALIZED_STATE_BYTES = 1_048_576;
const MAX_SCOPE_BYTES = 512;
const EMPTY_SERIALIZED_STATE = "{\"version\":2,\"members\":[]}";
const MIGRATION_URLS = [
  new URL("../migrations/0001-team-authorization-state.sql", import.meta.url),
  new URL("../migrations/0002-team-authorization-audit.sql", import.meta.url)
];

export interface TeamAuthorizationStateSnapshot {
  generation: string;
  baseFingerprint: string;
  serializedState: string;
}

export type TeamAuthorizationAuditAction =
  | "token_created"
  | "token_revoked"
  | "scope_bootstrapped"
  | "scope_restored"
  | "base_reconciled";

export type TeamAuthorizationAuditSource = "http" | "mcp" | "operator";

export interface TeamAuthorizationAuditEventInput {
  action: TeamAuthorizationAuditAction;
  actorUserId: string;
  subjectTokenId?: string;
  subjectTokenName?: string;
  source: TeamAuthorizationAuditSource;
  requestId?: string;
  metadata: Record<string, unknown>;
}

export interface TeamAuthorizationAuditEvent
  extends TeamAuthorizationAuditEventInput {
  id: string;
  scope: string;
  generation: string;
  createdAt: string;
  archivedAt?: string;
}

export interface TeamAuthorizationStateStore {
  read(scope: string): Promise<TeamAuthorizationStateSnapshot>;
  initializeAbsent(
    scope: string,
    snapshot: TeamAuthorizationStateSnapshot
  ): Promise<{
    initialized: boolean;
    snapshot: TeamAuthorizationStateSnapshot;
  }>;
  transact?<T>(
    scope: string,
    expectedBaseFingerprint: string,
    options: { mutating: boolean },
    operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{
      baseFingerprint: string;
      serializedState: string;
      result: T;
      changed?: boolean;
      auditEvent?: TeamAuthorizationAuditEventInput;
    }>
  ): Promise<{
    generation: string;
    baseFingerprint: string;
    serializedState: string;
    result: T;
    auditEvent?: TeamAuthorizationAuditEvent;
  }>;
  listAuditEvents?(
    scope: string,
    options: { afterId: string; limit: number }
  ): Promise<TeamAuthorizationAuditEvent[]>;
  mutate<T>(
    scope: string,
    expectedBaseFingerprint: string,
    operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{
      baseFingerprint: string;
      serializedState: string;
      result: T;
      changed?: boolean;
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

interface AuthorizationAuditRow {
  id: string;
  scope: string;
  generation: string;
  action: TeamAuthorizationAuditAction;
  actor_user_id: string;
  subject_token_id: string | null;
  subject_token_name: string | null;
  source: TeamAuthorizationAuditSource;
  request_id: string | null;
  metadata: unknown;
  created_at: Date | string;
  archived_at: Date | string | null;
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

function validateAuditText(
  value: unknown,
  field: string,
  optional = false
): string | undefined {
  if (value === undefined && optional) {
    return undefined;
  }
  if (
    typeof value !== "string"
    || value !== value.trim()
    || Buffer.byteLength(value, "utf8") < 1
    || Buffer.byteLength(value, "utf8") > 512
  ) {
    throw new Error(`authorization audit ${field} is invalid`);
  }
  return value;
}

function validateAuditEventInput(
  input: TeamAuthorizationAuditEventInput
): TeamAuthorizationAuditEventInput {
  const actions: TeamAuthorizationAuditAction[] = [
    "token_created",
    "token_revoked",
    "scope_bootstrapped",
    "scope_restored",
    "base_reconciled"
  ];
  const sources: TeamAuthorizationAuditSource[] = ["http", "mcp", "operator"];
  if (!actions.includes(input.action)) {
    throw new Error("authorization audit action is invalid");
  }
  if (!sources.includes(input.source)) {
    throw new Error("authorization audit source is invalid");
  }
  if (
    !input.metadata
    || typeof input.metadata !== "object"
    || Array.isArray(input.metadata)
  ) {
    throw new Error("authorization audit metadata must be an object");
  }
  const inspectMetadata = (
    current: object,
    ancestors: WeakSet<object>
  ): void => {
    if (ancestors.has(current)) {
      throw new Error("authorization audit metadata must not contain cycles");
    }
    ancestors.add(current);
    for (const [key, value] of Object.entries(current)) {
      if (/(token|secret|hash|credential|database.?url)/i.test(key)) {
        throw new Error("authorization audit metadata contains a forbidden field");
      }
      if (value && typeof value === "object") {
        inspectMetadata(value, ancestors);
      }
    }
    ancestors.delete(current);
  };
  inspectMetadata(input.metadata, new WeakSet<object>());
  const metadata = JSON.stringify(input.metadata);
  if (Buffer.byteLength(metadata, "utf8") > 16_384) {
    throw new Error("authorization audit metadata is too large");
  }
  return {
    action: input.action,
    actorUserId: validateAuditText(input.actorUserId, "actorUserId")!,
    subjectTokenId: validateAuditText(
      input.subjectTokenId,
      "subjectTokenId",
      true
    ),
    subjectTokenName: validateAuditText(
      input.subjectTokenName,
      "subjectTokenName",
      true
    ),
    source: input.source,
    requestId: validateAuditText(input.requestId, "requestId", true),
    metadata: JSON.parse(metadata) as Record<string, unknown>
  };
}

function timestampToIso(value: Date | string, field: string): string {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`authorization audit ${field} is invalid`);
  }
  return timestamp.toISOString();
}

function auditEventFromRow(row: AuthorizationAuditRow): TeamAuthorizationAuditEvent {
  const id = validateGeneration(row.id);
  if (id === "0") {
    throw new Error("authorization audit id must be positive");
  }
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined;
  if (!metadata) {
    throw new Error("authorization audit metadata is invalid");
  }
  return {
    id,
    scope: validateScope(row.scope),
    generation: validateGeneration(row.generation),
    action: row.action,
    actorUserId: row.actor_user_id,
    subjectTokenId: row.subject_token_id ?? undefined,
    subjectTokenName: row.subject_token_name ?? undefined,
    source: row.source,
    requestId: row.request_id ?? undefined,
    metadata,
    createdAt: timestampToIso(row.created_at, "createdAt"),
    archivedAt: row.archived_at
      ? timestampToIso(row.archived_at, "archivedAt")
      : undefined
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertManagedStateKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(
      `authorization managed state ${context} contains unsupported field ${unexpected[0]}`
    );
  }
}

function validateManagedTimestamp(value: unknown, context: string): void {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`authorization managed state ${context} must be an ISO timestamp`);
  }
}

function validateManagedToken(value: unknown, memberId: string): string {
  if (!isRecord(value)) {
    throw new Error("authorization managed state token must be an object");
  }
  assertManagedStateKeys(
    value,
    [
      "id",
      "name",
      "tokenHash",
      "tokenHashes",
      "createdAt",
      "notBefore",
      "expiresAt",
      "revokedAt"
    ],
    "token"
  );
  if (
    typeof value.id !== "string"
    || !value.id.trim()
    || typeof value.name !== "string"
    || !value.name.trim()
  ) {
    throw new Error(`authorization managed state token for ${memberId} is invalid`);
  }

  const hashPattern = /^[0-9a-f]{64}$/i;
  const hasTokenHash = value.tokenHash !== undefined;
  const hasTokenHashes = value.tokenHashes !== undefined;
  if (
    hasTokenHash
    && (typeof value.tokenHash !== "string" || !hashPattern.test(value.tokenHash))
  ) {
    throw new Error("authorization managed state tokenHash must be a SHA-256 hash");
  }
  if (typeof value.tokenHash === "string") {
    value.tokenHash = value.tokenHash.toLowerCase();
  }
  if (
    hasTokenHashes
    && (
      !Array.isArray(value.tokenHashes)
      || value.tokenHashes.length === 0
      || !value.tokenHashes.every(
        (hash) => typeof hash === "string" && hashPattern.test(hash)
      )
    )
  ) {
    throw new Error("authorization managed state tokenHashes must be SHA-256 hashes");
  }
  if (Array.isArray(value.tokenHashes)) {
    value.tokenHashes = Array.from(
      new Set(value.tokenHashes.map((hash) => (hash as string).toLowerCase()))
    );
  }
  if (!hasTokenHash && !hasTokenHashes) {
    throw new Error("authorization managed state tokens must contain hashes only");
  }

  for (const key of ["createdAt", "notBefore", "expiresAt", "revokedAt"] as const) {
    if (value[key] !== undefined) {
      validateManagedTimestamp(value[key], `token ${value.id} ${key}`);
    }
  }
  if (
    typeof value.notBefore === "string"
    && typeof value.expiresAt === "string"
    && Date.parse(value.expiresAt) <= Date.parse(value.notBefore)
  ) {
    throw new Error("authorization managed state token expiresAt must follow notBefore");
  }
  return value.id.trim();
}

function validateManagedState(value: Record<string, unknown>): void {
  assertManagedStateKeys(value, ["version", "members"], "root");
  if (value.version !== 2 || !Array.isArray(value.members)) {
    throw new Error("authorization managed state must use version 2 with a members array");
  }

  const memberIds = new Set<string>();
  for (const candidate of value.members) {
    if (!isRecord(candidate)) {
      throw new Error("authorization managed state member must be an object");
    }
    assertManagedStateKeys(
      candidate,
      ["userId", "baseFingerprint", "quarantined", "tokens", "revocations"],
      "member"
    );
    if (
      typeof candidate.userId !== "string"
      || !candidate.userId.trim()
      || typeof candidate.baseFingerprint !== "string"
      || !/^[0-9a-f]{64}$/.test(candidate.baseFingerprint)
      || typeof candidate.quarantined !== "boolean"
      || !Array.isArray(candidate.tokens)
      || !Array.isArray(candidate.revocations)
    ) {
      throw new Error("authorization managed state member is invalid");
    }

    const memberId = candidate.userId.trim();
    if (memberIds.has(memberId)) {
      throw new Error("authorization managed state contains duplicate members");
    }
    memberIds.add(memberId);

    const tokenIds = candidate.tokens.map((token) =>
      validateManagedToken(token, memberId)
    );
    if (new Set(tokenIds).size !== tokenIds.length) {
      throw new Error("authorization managed state contains duplicate token ids");
    }

    const revokedTokenIds = new Set<string>();
    for (const revocation of candidate.revocations) {
      if (!isRecord(revocation)) {
        throw new Error("authorization managed state revocation must be an object");
      }
      assertManagedStateKeys(revocation, ["tokenId", "revokedAt"], "revocation");
      if (typeof revocation.tokenId !== "string" || !revocation.tokenId.trim()) {
        throw new Error("authorization managed state revocation tokenId is invalid");
      }
      validateManagedTimestamp(
        revocation.revokedAt,
        `revocation ${revocation.tokenId} revokedAt`
      );
      const tokenId = revocation.tokenId.trim();
      if (revokedTokenIds.has(tokenId)) {
        throw new Error("authorization managed state contains duplicate revocations");
      }
      revokedTokenIds.add(tokenId);
    }
  }
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
  if (!isRecord(parsed)) {
    throw new Error("authorization state must be a JSON object");
  }
  validateManagedState(parsed);
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

async function rollbackTransaction(
  client: PoolClient
): Promise<Error | undefined> {
  try {
    await client.query("ROLLBACK");
    return undefined;
  } catch (error) {
    // Purpose: discard a connection whose transaction state could not be recovered.
    return error instanceof Error ? error : new Error(String(error));
  }
}

export async function migratePostgresTeamAuthorizationState(
  options: PostgresTeamAuthorizationOptions
): Promise<void> {
  const connectionString = validateConnectionString(options.connectionString);
  const statementTimeoutMs = validateStatementTimeout(options.statementTimeoutMs);
  const pool = new Pool({ connectionString, statement_timeout: statementTimeoutMs });
  let client: PoolClient | undefined;
  let releaseError: Error | undefined;

  try {
    client = await pool.connect();
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
    if (currentVersion > REQUIRED_DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `authorization schema version ${currentVersion} is newer than supported version ${REQUIRED_DATABASE_SCHEMA_VERSION}`
      );
    }
    for (
      let version = currentVersion + 1;
      version <= REQUIRED_DATABASE_SCHEMA_VERSION;
      version += 1
    ) {
      const migrationUrl = MIGRATION_URLS[version - 1];
      if (!migrationUrl) {
        throw new Error(`authorization migration ${version} is missing`);
      }
      const migration = await readFile(migrationUrl, "utf8");
      await client.query(migration);
    }
    await client.query("COMMIT");
  } catch (error) {
    if (client) {
      releaseError = await rollbackTransaction(client);
    }
    throw error;
  } finally {
    client?.release(releaseError);
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
    if (version !== REQUIRED_DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `authorization schema version ${String(value ?? "missing")} does not match required version ${REQUIRED_DATABASE_SCHEMA_VERSION}; run authorization:migrate`
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

    async initializeAbsent(scopeInput, snapshotInput) {
      assertOpen();
      const scope = validateScope(scopeInput);
      const generation = validateGeneration(snapshotInput.generation);
      const baseFingerprint = validateFingerprint(snapshotInput.baseFingerprint);
      const state = parseSerializedState(snapshotInput.serializedState);
      // Purpose: initialize bootstrap or restore state without mutating an existing scope.
      const inserted = await pool.query<AuthorizationStateRow>(
        `INSERT INTO layo_team_authorization_state
          (scope, generation, base_fingerprint, state, schema_version)
         VALUES ($1, $2::bigint, $3, $4::jsonb, $5)
         ON CONFLICT (scope) DO NOTHING
         RETURNING generation::text AS generation, base_fingerprint, state`,
        [
          scope,
          generation,
          baseFingerprint,
          state.serializedState,
          AUTHORIZATION_STATE_SCHEMA_VERSION
        ]
      );
      if (inserted.rowCount === 1) {
        return {
          initialized: true,
          snapshot: snapshotFromRow(inserted.rows[0]!)
        };
      }

      const existing = await pool.query<AuthorizationStateRow>(
        `SELECT generation::text AS generation, base_fingerprint, state
         FROM layo_team_authorization_state
         WHERE scope = $1`,
        [scope]
      );
      if (existing.rowCount !== 1) {
        throw new Error(`authorization scope ${scope} initialization conflicted`);
      }
      return {
        initialized: false,
        snapshot: snapshotFromRow(existing.rows[0]!)
      };
    },

    async transact<T>(
      scopeInput: string,
      expectedFingerprintInput: string,
      transactionOptions: { mutating: boolean },
      operation: (
        snapshot: TeamAuthorizationStateSnapshot
      ) => Promise<{
        baseFingerprint: string;
        serializedState: string;
        result: T;
        changed?: boolean;
        auditEvent?: TeamAuthorizationAuditEventInput;
      }>
    ) {
      assertOpen();
      const scope = validateScope(scopeInput);
      const expectedBaseFingerprint = validateFingerprint(expectedFingerprintInput);
      if (typeof transactionOptions.mutating !== "boolean") {
        throw new Error("authorization transaction mutating flag is required");
      }
      const client = await pool.connect();
      let released = false;

      try {
        await client.query("BEGIN");
        await setLocalStatementTimeout(client, statementTimeoutMs);
        const locked = await client.query<AuthorizationStateRow>(
          `SELECT generation::text AS generation, base_fingerprint, state
           FROM layo_team_authorization_state
           WHERE scope = $1
           FOR UPDATE`,
          [scope]
        );
        if (locked.rowCount !== 1) {
          throw new Error(`authorization scope ${scope} does not exist`);
        }
        const snapshot = snapshotFromRow(locked.rows[0]!);
        if (snapshot.baseFingerprint !== expectedBaseFingerprint) {
          throw new Error("authorization base fingerprint does not match shared state");
        }

        const transaction = await operation(snapshot);
        const baseFingerprint = validateFingerprint(transaction.baseFingerprint);
        const state = parseSerializedState(transaction.serializedState);
        const commitsMutation =
          transactionOptions.mutating && transaction.changed !== false;
        if (!commitsMutation) {
          if (transaction.auditEvent) {
            throw new Error(
              "non-mutating authorization transaction must not append an audit event"
            );
          }
          if (
            baseFingerprint !== snapshot.baseFingerprint
            || state.serializedState !== snapshot.serializedState
          ) {
            throw new Error(
              "non-mutating authorization transaction must not change shared state"
            );
          }
          await client.query("COMMIT");
          return { ...snapshot, result: transaction.result };
        }

        const updated = await client.query<AuthorizationStateRow>(
          `UPDATE layo_team_authorization_state
           SET generation = generation + 1,
               base_fingerprint = $2,
               state = $3::jsonb,
               schema_version = $4,
               updated_at = now()
           WHERE scope = $1
           RETURNING generation::text AS generation, base_fingerprint, state`,
          [scope, baseFingerprint, state.serializedState , AUTHORIZATION_STATE_SCHEMA_VERSION]
        );
        if (updated.rowCount !== 1) {
          throw new Error(`authorization scope ${scope} was not updated`);
        }
        const committed = snapshotFromRow(updated.rows[0]!);
        let auditEvent: TeamAuthorizationAuditEvent | undefined;
        if (transaction.auditEvent) {
          const input = validateAuditEventInput(transaction.auditEvent);
          const insertedAudit = await client.query<AuthorizationAuditRow>(
            `INSERT INTO layo_authorization_audit_events
              (
                scope,
                generation,
                action,
                actor_user_id,
                subject_token_id,
                subject_token_name,
                source,
                request_id,
                metadata
              )
             VALUES ($1, $2::bigint, $3, $4, $5, $6, $7, $8, $9::jsonb)
             RETURNING
               id::text AS id,
               scope,
               generation::text AS generation,
               action,
               actor_user_id,
               subject_token_id,
               subject_token_name,
               source,
               request_id,
               metadata,
               created_at,
               archived_at`,
            [
              scope,
              committed.generation,
              input.action,
              input.actorUserId,
              input.subjectTokenId ?? null,
              input.subjectTokenName ?? null,
              input.source,
              input.requestId ?? null,
              JSON.stringify(input.metadata)
            ]
          );
          if (insertedAudit.rowCount !== 1) {
            throw new Error("authorization audit event was not appended");
          }
          auditEvent = auditEventFromRow(insertedAudit.rows[0]!);
        }
        await client.query("COMMIT");
        return {
          ...committed,
          result: transaction.result,
          auditEvent
        };
      } catch (error) {
        const releaseError = await rollbackTransaction(client);
        client.release(releaseError);
        released = true;
        throw error;
      } finally {
        if (!released) {
          client.release();
        }
      }
    },

    async listAuditEvents(
      scopeInput: string,
      options: { afterId: string; limit: number }
    ) {
      assertOpen();
      const scope = validateScope(scopeInput);
      const afterId = validateGeneration(options.afterId);
      if (
        !Number.isSafeInteger(options.limit)
        || options.limit < 1
        || options.limit > 500
      ) {
        throw new Error("authorization audit limit must be between 1 and 500");
      }
      const result = await pool.query<AuthorizationAuditRow>(
        `SELECT
           id::text AS id,
           scope,
           generation::text AS generation,
           action,
           actor_user_id,
           subject_token_id,
           subject_token_name,
           source,
           request_id,
           metadata,
           created_at,
           archived_at
         FROM layo_authorization_audit_events
         WHERE scope = $1
           AND id > $2::bigint
         ORDER BY id ASC
         LIMIT $3`,
        [scope, afterId, options.limit]
      );
      return result.rows.map(auditEventFromRow);
    },

    async mutate<T>(scopeInput: string, expectedFingerprintInput: string, operation: (
      snapshot: TeamAuthorizationStateSnapshot
    ) => Promise<{
      baseFingerprint: string;
      serializedState: string;
      result: T;
      changed?: boolean;
    }>) {
      assertOpen();
      const scope = validateScope(scopeInput);
      const expectedBaseFingerprint = validateFingerprint(expectedFingerprintInput);
      const initial = parseSerializedState(EMPTY_SERIALIZED_STATE);
      const client = await pool.connect();
      let released = false;

      try {
        await client.query("BEGIN");
        await setLocalStatementTimeout(client, statementTimeoutMs);
        await client.query(
          `INSERT INTO layo_team_authorization_state
            (scope, generation, base_fingerprint, state, schema_version)
           VALUES ($1, 0, $2, $3::jsonb, $4)
           ON CONFLICT (scope) DO NOTHING`,
          [
            scope,
            expectedBaseFingerprint,
            initial.serializedState,
            AUTHORIZATION_STATE_SCHEMA_VERSION
          ]
        );

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
        if (mutation.changed === false) {
          if (
            baseFingerprint !== snapshot.baseFingerprint
            || state.serializedState !== snapshot.serializedState
          ) {
            throw new Error(
              "unchanged authorization mutation must not change shared state"
            );
          }
          await client.query("COMMIT");
          return { ...snapshot, result: mutation.result };
        }
        const updated = await client.query<AuthorizationStateRow>(
          `UPDATE layo_team_authorization_state
           SET generation = generation + 1,
               base_fingerprint = $2,
               state = $3::jsonb,
               schema_version = $4,
               updated_at = now()
           WHERE scope = $1
           RETURNING generation::text AS generation, base_fingerprint, state`,
          [scope, baseFingerprint, state.serializedState , AUTHORIZATION_STATE_SCHEMA_VERSION]
        );
        if (updated.rowCount !== 1) {
          throw new Error(`authorization scope ${scope} was not updated`);
        }
        const committed = snapshotFromRow(updated.rows[0]!);
        await client.query("COMMIT");
        return { ...committed, result: mutation.result };
      } catch (error) {
        const releaseError = await rollbackTransaction(client);
        client.release(releaseError);
        released = true;
        throw error;
      } finally {
        if (!released) {
          client.release();
        }
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
