import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { unwatchFile, watchFile, type StatsListener } from "node:fs";
import { open, readFile, rename, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { withFileProcessMutationLock } from "./file-process-lock.js";
import type {
  TeamAuthorizationAuditEvent,
  TeamAuthorizationAuditEventInput,
  TeamAuthorizationAuditSource,
  TeamAuthorizationStateSnapshot,
  TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";

export type TeamAuthorizationRole = "owner" | "editor" | "viewer";

export interface TeamMemberTokenCredential {
  id: string;
  name: string;
  token?: string;
  tokenHash?: string;
  tokenHashes?: string[];
  createdAt?: string;
  notBefore?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface TeamMemberCredential {
  userId: string;
  role: TeamAuthorizationRole;
  teamIds: string[];
  token?: string;
  tokenHash?: string;
  tokenHashes?: string[];
  tokens?: TeamMemberTokenCredential[];
  notBefore?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface TeamAuthorizationConfig {
  members: TeamMemberCredential[];
}

const teamAuthorizationConfigGenerations = new WeakMap<TeamAuthorizationConfig, number>();
const teamAuthorizationConfigReloads = new WeakMap<
  TeamAuthorizationConfig,
  () => Promise<void>
>();
const sharedAuthorizationPublishedGenerations = new WeakMap<
  TeamAuthorizationConfig,
  string
>();
const sharedAuthorizationPublicationTails = new WeakMap<
  TeamAuthorizationConfig,
  Promise<void>
>();

function teamAuthorizationConfigGeneration(config: TeamAuthorizationConfig): number {
  return teamAuthorizationConfigGenerations.get(config) ?? 0;
}

function replaceTeamAuthorizationMembers(
  config: TeamAuthorizationConfig,
  members: TeamMemberCredential[]
): void {
  teamAuthorizationConfigGenerations.set(
    config,
    teamAuthorizationConfigGeneration(config) + 1
  );
  config.members = members;
}

async function waitForTeamAuthorizationConfigReload(
  config: TeamAuthorizationConfig
): Promise<void> {
  const currentReload = teamAuthorizationConfigReloads.get(config);
  if (!currentReload) {
    return;
  }
  while (true) {
    const pending = currentReload();
    await pending;
    if (pending === currentReload()) {
      return;
    }
  }
}

export interface AuthenticatedTeamMember {
  userId: string;
  role: TeamAuthorizationRole;
  teamIds: string[];
  tokenId?: string;
  tokenName?: string;
}


export interface TeamAuthorizationConfigSource {
  config: TeamAuthorizationConfig;
  close: () => void;
  settled: () => Promise<void>;
}

export interface TeamAuthorizationPrincipal {
  userId?: string;
  memberToken?: string;
}

export interface TeamAuthorizationProvider {
  authenticate: (
    principal: TeamAuthorizationPrincipal,
    now?: Date
  ) => AuthenticatedTeamMember | Promise<AuthenticatedTeamMember>;
}

export interface SharedTeamAuthorizationProviderOptions {
  maxStableReadAttempts?: number;
  publishSharedConfig?: (
    config: TeamAuthorizationConfig
  ) => void | Promise<void>;
}

export interface WatchTeamAuthorizationConfigFileOptions {
  pollIntervalMs?: number;
  onError?: (error: Error) => void;
  beforeManagedTokenQuarantine?: () => Promise<void>;
  beforeManagedTokenRecoveryPublish?: () => Promise<void>;
}

export type TeamAccessTokenExpiryDays = 30 | 60 | 90 | 180 | null;

export interface TeamAccessTokenMetadata {
  id: string;
  name: string;
  createdAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface CreateTeamAccessTokenInput {
  name: string;
  expiresInDays: TeamAccessTokenExpiryDays;
}

export interface CreatedTeamAccessToken {
  token: string;
  metadata: TeamAccessTokenMetadata;
}

export interface TeamAuthorizationManagementPrincipal {
  userId: string;
  memberToken: string;
  audit?: {
    source: TeamAuthorizationAuditSource;
    requestId?: string;
  };
}

export type TeamAuthorizationMutationOperation =
  | { type: "create"; input: CreateTeamAccessTokenInput }
  | { type: "revoke"; tokenId: string; confirmSelfRevoke?: boolean };

export type TeamAuthorizationManagementOperation =
  | { type: "list" }
  | (TeamAuthorizationMutationOperation & { reviewReceipt?: string });

export type TeamAuthorizationMutationReview =
  | {
      type: "create";
      expectedGeneration: string;
      changed: boolean;
      summary: {
        name: string;
        expiresInDays: TeamAccessTokenExpiryDays;
      };
      receipt?: string;
      receiptExpiresAt?: string;
    }
  | {
      type: "revoke";
      expectedGeneration: string;
      changed: boolean;
      summary: {
        metadata: TeamAccessTokenMetadata;
      };
      receipt?: string;
      receiptExpiresAt?: string;
    };

export type TeamAuthorizationManagementResult =
  | { type: "list"; tokens: TeamAccessTokenMetadata[]; activeTokenId?: string }
  | { type: "create"; created: CreatedTeamAccessToken }
  | { type: "revoke"; metadata: TeamAccessTokenMetadata };

export interface TeamAuthorizationAuditListOptions {
  afterId: string;
  limit: number;
}

export interface TeamAuthorizationAuditPage {
  events: TeamAuthorizationAuditEvent[];
  nextAfterId?: string;
}

export interface TeamAuthorizationFileManager {
  manageTokens: (
    principal: TeamAuthorizationManagementPrincipal,
    operation: TeamAuthorizationManagementOperation
  ) => Promise<TeamAuthorizationManagementResult>;
  reviewTokenMutation?: (
    principal: TeamAuthorizationManagementPrincipal,
    operation: TeamAuthorizationMutationOperation
  ) => Promise<TeamAuthorizationMutationReview>;
  listTokens: (
    userId: string
  ) => TeamAccessTokenMetadata[] | Promise<TeamAccessTokenMetadata[]>;
  createToken: (
    userId: string,
    input: CreateTeamAccessTokenInput
  ) => Promise<CreatedTeamAccessToken>;
  revokeToken: (
    userId: string,
    tokenId: string
  ) => Promise<TeamAccessTokenMetadata>;
  listAuditEvents?: (
    principal: TeamAuthorizationManagementPrincipal,
    options: TeamAuthorizationAuditListOptions
  ) => Promise<TeamAuthorizationAuditPage>;
}

export interface TeamAuthorizationFileManagerOptions {
  now?: () => Date;
  generateId?: () => string;
  generateSecret?: () => string;
  reviewSigningKey?: string;
  beforeSidecarRename?: () => Promise<void>;
  syncFile?: (handle: FileHandle) => Promise<void>;
  syncDirectory?: (directoryPath: string) => Promise<void>;
  stateStore?: TeamAuthorizationStateStore;
  sharedScope?: string;
  publishSharedConfig?: (
    config: TeamAuthorizationConfig
  ) => void | Promise<void>;
  scheduleSharedRefresh?: (
    refresh: () => Promise<void>
  ) => void;
}

export interface TeamMemberTokenSource {
  token: { value: string };
  close: () => void;
}

export async function watchTeamMemberTokenFile(
  filePath: string,
  options: WatchTeamAuthorizationConfigFileOptions = {}
): Promise<TeamMemberTokenSource> {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    throw new Error("LAYO_MCP_MEMBER_TOKEN_FILE must not be blank");
  }
  const token = { value: parseRequiredTeamMemberToken(await readFile(normalizedPath, "utf8")) };
  let closed = false;
  let reloadTail = Promise.resolve();

  const reload = () => {
    reloadTail = reloadTail.then(async () => {
      if (closed) {
        return;
      }
      try {
        const nextToken = parseRequiredTeamMemberToken(
          await readFile(normalizedPath, "utf8")
        );
        token.value = nextToken;
      } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };
  const listener: StatsListener = () => reload();
  watchFile(
    normalizedPath,
    {
      interval: Math.max(10, Math.floor(options.pollIntervalMs ?? 1_000)),
      persistent: false
    },
    listener
  );

  return {
    token,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      unwatchFile(normalizedPath, listener);
    }
  };
}

function parseRequiredTeamMemberToken(input: string): string {
  const token = input.trim();
  if (!token) {
    throw new Error("MCP member token file must not be blank");
  }
  return token;
}

export function createTeamAuthorizationFileManager(
  filePath: string,
  config: TeamAuthorizationConfig,
  options: TeamAuthorizationFileManagerOptions = {}
): TeamAuthorizationFileManager {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    throw new Error("LAYO_LIBRARY_REGISTRY_MEMBERS_FILE must not be blank");
  }
  const hasSharedStore = options.stateStore !== undefined;
  const hasSharedScope = options.sharedScope !== undefined;
  if (hasSharedStore !== hasSharedScope) {
    throw new Error(
      "team authorization stateStore and sharedScope must be configured together"
    );
  }
  if (options.stateStore && options.sharedScope !== undefined) {
    const sharedScope = options.sharedScope.trim();
    if (!sharedScope) {
      throw new Error("team authorization sharedScope must not be blank");
    }
    return createSharedTeamAuthorizationFileManager(
      normalizedPath,
      config,
      options.stateStore,
      sharedScope,
      options
    );
  }
  const sidecarPath = managedTokenSidecarPath(normalizedPath);
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? (() => randomUUID());
  const generateSecret =
    options.generateSecret
    ?? (() => `layo_pat_${randomBytes(32).toString("base64url")}`);
  const persistence: ManagedTokenPersistence = {
    syncFile: options.syncFile ?? ((handle) => handle.sync()),
    syncDirectory: options.syncDirectory ?? syncDirectory,
    beforeRename: options.beforeSidecarRename
  };
  const listTokens = (userId: string): TeamAccessTokenMetadata[] => {
    const member = findManagedMember(config, userId);
    return (member.tokens ?? []).map(toTeamAccessTokenMetadata);
  };

  const mutate = async <T>(operation: () => Promise<T>): Promise<T> => {
    await waitForTeamAuthorizationConfigReload(config);
    return withFileProcessMutationLock(sidecarPath, operation);
  };

  const persist = async (
    baseSnapshot: string,
    sourceSnapshot: string | undefined,
    state: ManagedTokenState,
    userId: string
  ): Promise<void> => {
    await persistManagedTokenState(
      normalizedPath,
      sidecarPath,
      sourceSnapshot,
      state,
      persistence,
      baseSnapshot
    );

    const currentBaseSnapshot = await readFile(normalizedPath, "utf8");
    if (currentBaseSnapshot !== baseSnapshot) {
      await quarantinePersistedManagedTokenState(
        normalizedPath,
        sidecarPath,
        state,
        userId,
        persistence
      );
      replaceTeamAuthorizationMembers(config, []);
      throw managementError(
        "team authorization file changed during token management",
        409
      );
    }

    try {
      const currentConfig = await readMergedTeamAuthorizationConfig(normalizedPath);
      replaceTeamAuthorizationMembers(config, currentConfig.members);
    } catch (error) {
      if (error instanceof ManagedTokenBindingError) {
        await quarantinePersistedManagedTokenState(
          normalizedPath,
          sidecarPath,
          state,
          error.userId,
          persistence
        );
        replaceTeamAuthorizationMembers(config, []);
        throw managementError(error.message, 409);
      }
      throw error;
    }
  };

  const executeOperation = (
    identity:
      | { userId: string }
      | { principal: TeamAuthorizationManagementPrincipal },
    operation: TeamAuthorizationManagementOperation
  ): Promise<TeamAuthorizationManagementResult> =>
    mutate(async () => {
      const baseSnapshot = await readFile(normalizedPath, "utf8");
      const baseConfig = parseRequiredTeamAuthorizationConfig(baseSnapshot);
      const sidecarSnapshot = await readOptionalFile(sidecarPath);
      const state = parseManagedTokenState(sidecarSnapshot);
      const operationNow = now();
      let nextConfig: TeamAuthorizationConfig;
      let authenticatedMember: AuthenticatedTeamMember | undefined;
      let userId: string;

      try {
        nextConfig = mergeManagedTokenState(baseConfig, state);
      } catch (error) {
        if (
          !(error instanceof ManagedTokenBindingError)
          || !("principal" in identity)
          || operation.type === "list"
        ) {
          throw error;
        }
        authenticatedMember = authenticateTeamMember(
          mergeManagedRevocationsForRecovery(baseConfig, state),
          identity.principal.userId,
          identity.principal.memberToken,
          operationNow
        );
        userId = authenticatedMember.userId;
        if (error.userId !== userId) {
          throw error;
        }
        const baseMember = findManagedMember(baseConfig, userId);
        reconcileManagedTokenStateMember(state, baseMember);
        nextConfig = mergeManagedTokenState(baseConfig, state);
      }

      if ("principal" in identity) {
        authenticatedMember ??= authenticateTeamMember(
          nextConfig,
          identity.principal.userId,
          identity.principal.memberToken,
          operationNow
        );
        userId = authenticatedMember.userId;
      } else {
        userId = identity.userId;
      }
      const member = findManagedMember(nextConfig, userId);

      if (operation.type === "list") {
        return {
          type: "list",
          tokens: (member.tokens ?? []).map(toTeamAccessTokenMetadata),
          ...(authenticatedMember?.tokenId
            ? { activeTokenId: authenticatedMember.tokenId }
            : {})
        };
      }

      if (operation.type === "create") {
        const name = validateTeamAccessTokenName(operation.input?.name);
        const expiresInDays = operation.input?.expiresInDays;
        if (!isTeamAccessTokenExpiryDays(expiresInDays)) {
          throw managementError("invalid team authorization token expiration", 400);
        }
        const id = generateId().trim();
        if (!id) {
          throw new Error("generated team authorization token id must not be blank");
        }
        if (member.tokens?.some((credential) => credential.id === id)) {
          throw managementError("team authorization token id already exists", 409);
        }
        const secret = generateSecret();
        if (!secret) {
          throw new Error("generated team authorization token must not be blank");
        }
        const createdAt = validManagementNow(operationNow);
        const expiresAt =
          expiresInDays === null
            ? undefined
            : new Date(
                Date.parse(createdAt) + expiresInDays * 24 * 60 * 60 * 1_000
              ).toISOString();
        const credential: TeamMemberTokenCredential = {
          id,
          name,
          tokenHash: hashToken(secret),
          createdAt,
          ...(expiresAt ? { expiresAt } : {})
        };
        const baseMember = findManagedMember(baseConfig, userId);
        managedTokenStateMember(state, baseMember).tokens.push(credential);
        await persist(baseSnapshot, sidecarSnapshot, state, userId);
        return {
          type: "create",
          created: {
            token: secret,
            metadata: toTeamAccessTokenMetadata(credential)
          }
        };
      }

      const normalizedTokenId = operation.tokenId.trim();
      if (!normalizedTokenId) {
        throw managementError("team authorization token id is required", 400);
      }
      if (
        authenticatedMember?.tokenId === normalizedTokenId
        && operation.confirmSelfRevoke !== true
      ) {
        throw managementError(
          "confirmSelfRevoke must be true to revoke the active MCP principal token",
          400
        );
      }
      const credential = member.tokens?.find(
        (candidate) => candidate.id === normalizedTokenId
      );
      if (!credential) {
        throw managementError("team authorization token was not found", 404);
      }
      if (!credential.revokedAt) {
        const revokedAt = validManagementNow(operationNow);
        const baseMember = findManagedMember(baseConfig, userId);
        managedTokenStateMember(state, baseMember).revocations.push({
          tokenId: normalizedTokenId,
          revokedAt
        });
        credential.revokedAt = revokedAt;
        await persist(baseSnapshot, sidecarSnapshot, state, userId);
      }
      return {
        type: "revoke",
        metadata: toTeamAccessTokenMetadata(credential)
      };
    });

  const manageTokens = (
    principal: TeamAuthorizationManagementPrincipal,
    operation: TeamAuthorizationManagementOperation
  ) => executeOperation({ principal }, operation);

  return {
    manageTokens,
    listTokens,
    createToken: async (userId, input) => {
      const result = await executeOperation(
        { userId },
        { type: "create", input }
      );
      if (result.type !== "create") {
        throw new Error("unexpected team authorization create result");
      }
      return result.created;
    },
    revokeToken: async (userId, tokenId) => {
      const result = await executeOperation(
        { userId },
        { type: "revoke", tokenId }
      );
      if (result.type !== "revoke") {
        throw new Error("unexpected team authorization revoke result");
      }
      return result.metadata;
    }
  };
}

type SharedManagementIdentity =
  | { userId: string }
  | { principal: TeamAuthorizationManagementPrincipal };

interface SharedOperationResult {
  result: TeamAuthorizationManagementResult;
  changed: boolean;
  actorUserId: string;
}

function sharedManagementError(error: unknown): Error {
  if (
    error instanceof ManagedTokenBindingError
    || (
      error instanceof Error
      && error.message === "authorization base fingerprint does not match shared state"
    )
  ) {
    return managementError(error.message, 409);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function validateAuditListOptions(
  options: TeamAuthorizationAuditListOptions
): TeamAuthorizationAuditListOptions {
  const afterId = options.afterId.trim();
  if (
    !/^(0|[1-9][0-9]*)$/.test(afterId)
    || BigInt(afterId) > MAX_POSTGRES_BIGINT
  ) {
    throw managementError(
      "authorization audit afterId must be an exact decimal string",
      400
    );
  }
  if (
    !Number.isSafeInteger(options.limit)
    || options.limit < 1
    || options.limit > 100
  ) {
    throw managementError(
      "authorization audit limit must be between 1 and 100",
      400
    );
  }
  return { afterId, limit: options.limit };
}

function missingSharedScopeInstruction(
  filePath: string,
  scope: string
): string {
  return (
    `shared authorization scope ${scope} is not initialized; `
    + "run pnpm --filter @layo/server authorization:bootstrap "
    + `--scope ${scope} --base ${filePath} --empty`
  );
}

function requireSharedFingerprint(
  snapshot: TeamAuthorizationStateSnapshot,
  baseFingerprint: string
): void {
  if (snapshot.baseFingerprint !== baseFingerprint) {
    throw managementError(
      "authorization base fingerprint does not match shared state",
      409
    );
  }
}

function sharedConfigFromSnapshot(
  baseConfig: TeamAuthorizationConfig,
  snapshot: TeamAuthorizationStateSnapshot
): {
  state: ManagedTokenState;
  mergedConfig: TeamAuthorizationConfig;
} {
  const state = parseManagedTokenState(snapshot.serializedState);
  try {
    return {
      state,
      mergedConfig: mergeManagedTokenState(baseConfig, state, true)
    };
  } catch (error) {
    throw sharedManagementError(error);
  }
}

function sharedConfigForOperation(
  baseConfig: TeamAuthorizationConfig,
  state: ManagedTokenState,
  identity: SharedManagementIdentity,
  operationNow: Date
): { mergedConfig: TeamAuthorizationConfig; recovered: boolean } {
  if (!("principal" in identity)) {
    return {
      mergedConfig: mergeManagedTokenState(baseConfig, state, true),
      recovered: false
    };
  }

  const stateMember = state.members.find(
    (candidate) => candidate.userId === identity.principal.userId
  );
  if (!stateMember?.quarantined) {
    return {
      mergedConfig: mergeManagedTokenState(baseConfig, state, true),
      recovered: false
    };
  }

  const authenticated = authenticateTeamMember(
    mergeManagedRevocationsForRecovery(baseConfig, state),
    identity.principal.userId,
    identity.principal.memberToken,
    operationNow
  );
  reconcileManagedTokenStateMember(
    state,
    findManagedMember(baseConfig, authenticated.userId)
  );
  return {
    mergedConfig: mergeManagedTokenState(baseConfig, state, true),
    recovered: true
  };
}

const AUTHORIZATION_MUTATION_REVIEW_TTL_MS = 5 * 60 * 1_000;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

interface AuthorizationMutationReceiptPayload {
  version: 1;
  scope: string;
  actorUserId: string;
  generation: string;
  operationDigest: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

function validateReviewSigningKey(input: string): string {
  if (Buffer.byteLength(input, "utf8") < 32) {
    throw new Error(
      "LAYO_AUTHORIZATION_REVIEW_SIGNING_KEY must contain at least 32 UTF-8 bytes"
    );
  }
  return input;
}

function canonicalTeamAuthorizationMutation(
  operation: TeamAuthorizationMutationOperation
): TeamAuthorizationMutationOperation {
  if (operation.type === "create") {
    const name = validateTeamAccessTokenName(operation.input?.name);
    const expiresInDays = operation.input?.expiresInDays;
    if (!isTeamAccessTokenExpiryDays(expiresInDays)) {
      throw managementError("invalid team authorization token expiration", 400);
    }
    return { type: "create", input: { name, expiresInDays } };
  }
  const tokenId = operation.tokenId.trim();
  if (!tokenId) {
    throw managementError("team authorization token id is required", 400);
  }
  return {
    type: "revoke",
    tokenId,
    confirmSelfRevoke: operation.confirmSelfRevoke === true
  };
}

function authorizationMutationDigest(
  operation: TeamAuthorizationMutationOperation
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalTeamAuthorizationMutation(operation)))
    .digest("hex");
}

function authorizationMutationPreview(
  principal: TeamAuthorizationManagementPrincipal,
  operation: TeamAuthorizationMutationOperation,
  mergedConfig: TeamAuthorizationConfig,
  operationNow: Date
): Omit<TeamAuthorizationMutationReview, "expectedGeneration"> {
  const authenticated = authenticateTeamMember(
    mergedConfig,
    principal.userId,
    principal.memberToken,
    operationNow
  );
  const member = findManagedMember(mergedConfig, authenticated.userId);
  const canonical = canonicalTeamAuthorizationMutation(operation);
  if (canonical.type === "create") {
    return {
      type: "create",
      changed: true,
      summary: {
        name: canonical.input.name,
        expiresInDays: canonical.input.expiresInDays
      }
    };
  }
  if (
    authenticated.tokenId === canonical.tokenId
    && canonical.confirmSelfRevoke !== true
  ) {
    throw managementError(
      "confirmSelfRevoke must be true to revoke the active MCP principal token",
      400
    );
  }
  const credential = member.tokens?.find(
    (candidate) => candidate.id === canonical.tokenId
  );
  if (!credential) {
    throw managementError("team authorization token was not found", 404);
  }
  return {
    type: "revoke",
    changed: !credential.revokedAt,
    summary: { metadata: toTeamAccessTokenMetadata(credential) }
  };
}

function signAuthorizationMutationReceipt(
  signingKey: string,
  payload: AuthorizationMutationReceiptPayload
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingKey)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function parseAuthorizationMutationReceipt(
  signingKey: string,
  receipt: string
): AuthorizationMutationReceiptPayload {
  if (!receipt || receipt.length > 4_096) {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  const parts = receipt.split(".");
  if (parts.length !== 2) {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  const [encoded, providedSignature] = parts as [string, string];
  const expectedSignature = createHmac("sha256", signingKey)
    .update(encoded)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature, "base64url");
  } catch {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  if (
    provided.length !== expectedSignature.length
    || !timingSafeEqual(provided, expectedSignature)
  ) {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  if (
    !payload
    || typeof payload !== "object"
    || (payload as Partial<AuthorizationMutationReceiptPayload>).version !== 1
  ) {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  const candidate = payload as Partial<AuthorizationMutationReceiptPayload>;
  const generation = candidate.generation;
  if (
    typeof candidate.scope !== "string"
    || typeof candidate.actorUserId !== "string"
    || typeof generation !== "string"
    || !/^(0|[1-9][0-9]*)$/.test(generation)
    || BigInt(generation) > POSTGRES_BIGINT_MAX
    || typeof candidate.operationDigest !== "string"
    || !/^[0-9a-f]{64}$/.test(candidate.operationDigest)
    || typeof candidate.issuedAt !== "string"
    || !Number.isFinite(Date.parse(candidate.issuedAt))
    || typeof candidate.expiresAt !== "string"
    || !Number.isFinite(Date.parse(candidate.expiresAt))
    || typeof candidate.nonce !== "string"
    || candidate.nonce.length < 1
  ) {
    throw managementError("authorization mutation review receipt is invalid", 400);
  }
  return candidate as AuthorizationMutationReceiptPayload;
}

function verifyAuthorizationMutationReceipt(
  signingKey: string,
  receipt: string,
  scope: string,
  principal: TeamAuthorizationManagementPrincipal,
  operation: TeamAuthorizationMutationOperation,
  lockedGeneration: string,
  operationNow: Date
): void {
  const payload = parseAuthorizationMutationReceipt(signingKey, receipt);
  if (payload.scope !== scope) {
    throw managementError("authorization mutation review scope does not match", 400);
  }
  if (payload.actorUserId !== principal.userId.trim()) {
    throw managementError(
      "authorization mutation review belongs to another principal",
      403
    );
  }
  if (payload.operationDigest !== authorizationMutationDigest(operation)) {
    throw managementError(
      "authorization mutation does not match its reviewed operation",
      400
    );
  }
  if (Date.parse(payload.expiresAt) <= operationNow.getTime()) {
    throw managementError("authorization mutation review receipt has expired", 400);
  }
  if (payload.generation !== lockedGeneration) {
    throw managementError("authorization mutation review generation is stale", 409);
  }
}

function applySharedManagementOperation(
  identity: SharedManagementIdentity,
  operation: TeamAuthorizationManagementOperation,
  baseConfig: TeamAuthorizationConfig,
  state: ManagedTokenState,
  mergedConfig: TeamAuthorizationConfig,
  operationNow: Date,
  generateId: () => string,
  generateSecret: () => string
): SharedOperationResult {
  let authenticatedMember: AuthenticatedTeamMember | undefined;
  let userId: string;
  if ("principal" in identity) {
    authenticatedMember = authenticateTeamMember(
      mergedConfig,
      identity.principal.userId,
      identity.principal.memberToken,
      operationNow
    );
    userId = authenticatedMember.userId;
  } else {
    userId = identity.userId;
  }
  const member = findManagedMember(mergedConfig, userId);

  if (operation.type === "list") {
    return {
      changed: false,
      actorUserId: userId,
      result: {
        type: "list",
        tokens: (member.tokens ?? []).map(toTeamAccessTokenMetadata),
        ...(authenticatedMember?.tokenId
          ? { activeTokenId: authenticatedMember.tokenId }
          : {})
      }
    };
  }

  if (operation.type === "create") {
    const name = validateTeamAccessTokenName(operation.input?.name);
    const expiresInDays = operation.input?.expiresInDays;
    if (!isTeamAccessTokenExpiryDays(expiresInDays)) {
      throw managementError("invalid team authorization token expiration", 400);
    }
    const id = generateId().trim();
    if (!id) {
      throw new Error("generated team authorization token id must not be blank");
    }
    if (member.tokens?.some((credential) => credential.id === id)) {
      throw managementError("team authorization token id already exists", 409);
    }
    const secret = generateSecret();
    if (!secret) {
      throw new Error("generated team authorization token must not be blank");
    }
    const createdAt = validManagementNow(operationNow);
    const expiresAt =
      expiresInDays === null
        ? undefined
        : new Date(
            Date.parse(createdAt) + expiresInDays * 24 * 60 * 60 * 1_000
          ).toISOString();
    const credential: TeamMemberTokenCredential = {
      id,
      name,
      tokenHash: hashToken(secret),
      createdAt,
      ...(expiresAt ? { expiresAt } : {})
    };
    managedTokenStateMember(
      state,
      findManagedMember(baseConfig, userId)
    ).tokens.push(credential);
    return {
      changed: true,
      actorUserId: userId,
      result: {
        type: "create",
        created: {
          token: secret,
          metadata: toTeamAccessTokenMetadata(credential)
        }
      }
    };
  }

  const normalizedTokenId = operation.tokenId.trim();
  if (!normalizedTokenId) {
    throw managementError("team authorization token id is required", 400);
  }
  if (
    authenticatedMember?.tokenId === normalizedTokenId
    && operation.confirmSelfRevoke !== true
  ) {
    throw managementError(
      "confirmSelfRevoke must be true to revoke the active MCP principal token",
      400
    );
  }
  const credential = member.tokens?.find(
    (candidate) => candidate.id === normalizedTokenId
  );
  if (!credential) {
    throw managementError("team authorization token was not found", 404);
  }
  if (credential.revokedAt) {
    return {
      changed: false,
      actorUserId: userId,
      result: {
        type: "revoke",
        metadata: toTeamAccessTokenMetadata(credential)
      }
    };
  }

  const revokedAt = validManagementNow(operationNow);
  managedTokenStateMember(
    state,
    findManagedMember(baseConfig, userId)
  ).revocations.push({
    tokenId: normalizedTokenId,
    revokedAt
  });
  credential.revokedAt = revokedAt;
  return {
    changed: true,
    actorUserId: userId,
    result: {
      type: "revoke",
      metadata: toTeamAccessTokenMetadata(credential)
    }
  };
}

function sharedManagementAuditEvent(
  identity: SharedManagementIdentity,
  applied: SharedOperationResult,
  recovered: boolean
): TeamAuthorizationAuditEventInput | undefined {
  if (!applied.changed && !recovered) {
    return undefined;
  }

  const audit = "principal" in identity ? identity.principal.audit : undefined;
  const attribution = {
    actorUserId: applied.actorUserId,
    source: audit?.source ?? "operator" as TeamAuthorizationAuditSource,
    ...(audit?.requestId ? { requestId: audit.requestId } : {})
  };

  if (applied.changed && applied.result.type === "create") {
    const metadata = applied.result.created.metadata;
    return {
      action: "token_created",
      ...attribution,
      subjectTokenId: metadata.id,
      subjectTokenName: metadata.name,
      metadata: {
        ...(metadata.expiresAt ? { expiresAt: metadata.expiresAt } : {}),
        ...(recovered ? { baseReconciled: true } : {})
      }
    };
  }

  if (applied.changed && applied.result.type === "revoke") {
    const metadata = applied.result.metadata;
    return {
      action: "token_revoked",
      ...attribution,
      subjectTokenId: metadata.id,
      subjectTokenName: metadata.name,
      metadata: {
        ...(metadata.revokedAt ? { revokedAt: metadata.revokedAt } : {}),
        ...(recovered ? { baseReconciled: true } : {})
      }
    };
  }

  return {
    action: "base_reconciled",
    ...attribution,
    metadata: { reason: "credential_recovery" }
  };
}

function compareAuthorizationGenerations(
  left: string,
  right: string
): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

async function publishSharedAuthorizationConfig(
  config: TeamAuthorizationConfig,
  nextConfig: TeamAuthorizationConfig,
  generation: string,
  publishSharedConfig: TeamAuthorizationFileManagerOptions["publishSharedConfig"]
): Promise<void> {
  const previous = sharedAuthorizationPublicationTails.get(config)
    ?? Promise.resolve();
  const publication = previous.catch(() => undefined).then(async () => {
    const current = sharedAuthorizationPublishedGenerations.get(config);
    if (
      current !== undefined
      && compareAuthorizationGenerations(generation, current) < 0
    ) {
      return;
    }
    if (publishSharedConfig) {
      await publishSharedConfig(nextConfig);
    } else {
      replaceTeamAuthorizationMembers(config, nextConfig.members);
    }
    sharedAuthorizationPublishedGenerations.set(config, generation);
  });
  sharedAuthorizationPublicationTails.set(config, publication);
  try {
    await publication;
  } finally {
    if (sharedAuthorizationPublicationTails.get(config) === publication) {
      sharedAuthorizationPublicationTails.delete(config);
    }
  }
}

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function validSharedAuthorizationGeneration(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(
      "authorization generation must be an exact nonnegative decimal string"
    );
  }
  if (BigInt(value) > MAX_POSTGRES_BIGINT) {
    throw new Error("authorization generation exceeds PostgreSQL bigint");
  }
  return value;
}

function validStableReadAttempts(value: number | undefined): number {
  const attempts = value ?? 3;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error(
      "shared authorization maxStableReadAttempts must be an integer from 1 to 10"
    );
  }
  return attempts;
}

export function createTeamAuthorizationProvider(
  config: TeamAuthorizationConfig
): TeamAuthorizationProvider {
  return {
    authenticate: (principal, now) =>
      authenticateTeamMember(
        config,
        principal.userId,
        principal.memberToken,
        now
      )
  };
}

export function createSharedTeamAuthorizationProvider(
  filePath: string,
  config: TeamAuthorizationConfig,
  stateStore: TeamAuthorizationStateStore,
  sharedScope: string,
  options: SharedTeamAuthorizationProviderOptions = {}
): TeamAuthorizationProvider {
  const normalizedPath = filePath.trim();
  const normalizedScope = sharedScope.trim();
  if (!normalizedPath) {
    throw new Error("shared authorization base file path must not be blank");
  }
  if (!normalizedScope) {
    throw new Error("team authorization sharedScope must not be blank");
  }
  const maxStableReadAttempts = validStableReadAttempts(
    options.maxStableReadAttempts
  );
  let parsedCache:
    | {
        baseSnapshot: string;
        generation: string;
        serializedState: string;
        mergedConfig: TeamAuthorizationConfig;
      }
    | undefined;

  return {
    authenticate: async (principal, now) => {
      for (let attempt = 0; attempt < maxStableReadAttempts; attempt += 1) {
        const baseSnapshot = await readFile(normalizedPath, "utf8");
        const committed = await stateStore.read(normalizedScope);
        const currentBaseSnapshot = await readFile(normalizedPath, "utf8");
        if (currentBaseSnapshot !== baseSnapshot) {
          continue;
        }

        const generation = validSharedAuthorizationGeneration(
          committed.generation
        );
        const baseFingerprint =
          canonicalTeamAuthorizationBaseFingerprint(baseSnapshot);
        if (committed.baseFingerprint !== baseFingerprint) {
          continue;
        }

        let mergedConfig: TeamAuthorizationConfig;
        if (
          parsedCache?.baseSnapshot === baseSnapshot
          && parsedCache.generation === generation
          && parsedCache.serializedState === committed.serializedState
        ) {
          mergedConfig = parsedCache.mergedConfig;
        } else {
          const baseConfig = parseRequiredTeamAuthorizationConfig(baseSnapshot);
          mergedConfig = sharedConfigFromSnapshot(
            baseConfig,
            committed
          ).mergedConfig;
          parsedCache = {
            baseSnapshot,
            generation,
            serializedState: committed.serializedState,
            mergedConfig
          };
        }

        await publishSharedAuthorizationConfig(
          config,
          mergedConfig,
          generation,
          options.publishSharedConfig
        );
        const publishedGeneration =
          sharedAuthorizationPublishedGenerations.get(config);
        if (
          publishedGeneration !== undefined
          && compareAuthorizationGenerations(
            generation,
            publishedGeneration
          ) < 0
        ) {
          continue;
        }

        return authenticateTeamMember(
          mergedConfig,
          principal.userId,
          principal.memberToken,
          now
        );
      }
      throw managementError(
        "team authorization base and shared state did not stabilize",
        409
      );
    }
  };
}

function createSharedTeamAuthorizationFileManager(
  filePath: string,
  config: TeamAuthorizationConfig,
  stateStore: TeamAuthorizationStateStore,
  sharedScope: string,
  options: TeamAuthorizationFileManagerOptions
): TeamAuthorizationFileManager {
  const transact = stateStore.transact?.bind(stateStore);
  const listAuditEvents = stateStore.listAuditEvents?.bind(stateStore);
  if (!transact) {
    throw new Error(
      "shared team authorization stateStore must support transact"
    );
  }
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? (() => randomUUID());
  const generateSecret =
    options.generateSecret
    ?? (() => `layo_pat_${randomBytes(32).toString("base64url")}`);
  const reviewSigningKey = options.reviewSigningKey === undefined
    ? undefined
    : validateReviewSigningKey(options.reviewSigningKey);

  const loadSharedSnapshot = async (): Promise<{
    baseSnapshot: string;
    committed: TeamAuthorizationStateSnapshot;
  }> => {
    const baseSnapshot = await readFile(filePath, "utf8");
    const baseFingerprint =
      canonicalTeamAuthorizationBaseFingerprint(baseSnapshot);
    const committed = await transact(
      sharedScope,
      baseFingerprint,
      { mutating: false },
      async (locked) => {
        if (await readFile(filePath, "utf8") !== baseSnapshot) {
          throw managementError(
            "team authorization file changed during shared refresh",
            409
          );
        }
        return {
          baseFingerprint,
          serializedState: locked.serializedState,
          result: undefined,
          changed: false
        };
      }
    );
    return { baseSnapshot, committed };
  };

  const publishSnapshot = async (
    baseSnapshot: string,
    committed: TeamAuthorizationStateSnapshot
  ): Promise<void> => {
    const currentBaseSnapshot = await readFile(filePath, "utf8");
    if (currentBaseSnapshot !== baseSnapshot) {
      throw managementError(
        "team authorization file changed after shared transaction",
        409
      );
    }
    requireSharedFingerprint(
      committed,
      canonicalTeamAuthorizationBaseFingerprint(currentBaseSnapshot)
    );
    const baseConfig = parseRequiredTeamAuthorizationConfig(currentBaseSnapshot);
    const { mergedConfig } = sharedConfigFromSnapshot(baseConfig, committed);
    await publishSharedAuthorizationConfig(
      config,
      mergedConfig,
      committed.generation,
      options.publishSharedConfig
    );
  };

  const refreshSharedConfig = async (): Promise<void> => {
    const { baseSnapshot, committed } = await loadSharedSnapshot();
    await publishSnapshot(baseSnapshot, committed);
  };

  const scheduleRefresh = (): void => {
    const refresh = async () => {
      await refreshSharedConfig();
    };
    try {
      if (options.scheduleSharedRefresh) {
        options.scheduleSharedRefresh(refresh);
      } else {
        queueMicrotask(() => {
          void refresh().catch(() => undefined);
        });
      }
    } catch {
      // The committed database state remains authoritative even if scheduling fails.
    }
  };

  const publishCommittedSnapshot = async (
    baseSnapshot: string,
    committed: TeamAuthorizationStateSnapshot
  ): Promise<void> => {
    try {
      await publishSnapshot(baseSnapshot, committed);
    } catch {
      replaceTeamAuthorizationMembers(config, []);
      scheduleRefresh();
    }
  };

  const executeOperation = async (
    identity: SharedManagementIdentity,
    operation: TeamAuthorizationManagementOperation
  ): Promise<TeamAuthorizationManagementResult> => {
    const baseSnapshot = await readFile(filePath, "utf8");
    const baseConfig = parseRequiredTeamAuthorizationConfig(baseSnapshot);
    const baseFingerprint =
      canonicalTeamAuthorizationBaseFingerprint(baseSnapshot);

    let committed;
    try {
      committed = await transact(
        sharedScope,
        baseFingerprint,
        { mutating: true },
        async (locked) => {
          const state = parseManagedTokenState(locked.serializedState);
          const operationNow = now();
          if (operation.type !== "list" && operation.reviewReceipt !== undefined) {
            if (!reviewSigningKey || !("principal" in identity)) {
              throw managementError(
                "reviewed authorization mutation is unavailable",
                503
              );
            }
            verifyAuthorizationMutationReceipt(
              reviewSigningKey,
              operation.reviewReceipt,
              sharedScope,
              identity.principal,
              operation,
              locked.generation,
              operationNow
            );
          }
          const { mergedConfig, recovered } = sharedConfigForOperation(
            baseConfig,
            state,
            identity,
            operationNow
          );
          const applied = applySharedManagementOperation(
            identity,
            operation,
            baseConfig,
            state,
            mergedConfig,
            operationNow,
            generateId,
            generateSecret
          );
          const changed = recovered || applied.changed;
          if (await readFile(filePath, "utf8") !== baseSnapshot) {
            throw managementError(
              "team authorization file changed during token management",
              409
            );
          }
          const auditEvent = sharedManagementAuditEvent(identity, applied, recovered);
          return {
            baseFingerprint,
            serializedState: changed
              ? serializeManagedTokenState(state)
              : locked.serializedState,
            result: { applied },
            changed,
            ...(auditEvent ? { auditEvent } : {})
          };
        }
      );
    } catch (error) {
      if (
        error instanceof Error
        && error.message === `authorization scope ${sharedScope} does not exist`
      ) {
        throw new Error(missingSharedScopeInstruction(filePath, sharedScope));
      }
      throw sharedManagementError(error);
    }

    await publishCommittedSnapshot(baseSnapshot, committed);
    return committed.result.applied.result;
  };

  const reviewTokenMutation = reviewSigningKey
    ? async (
        principal: TeamAuthorizationManagementPrincipal,
        operation: TeamAuthorizationMutationOperation
      ): Promise<TeamAuthorizationMutationReview> => {
        const baseSnapshot = await readFile(filePath, "utf8");
        const baseConfig = parseRequiredTeamAuthorizationConfig(baseSnapshot);
        const baseFingerprint =
          canonicalTeamAuthorizationBaseFingerprint(baseSnapshot);
        try {
          const reviewed = await transact(
            sharedScope,
            baseFingerprint,
            { mutating: false },
            async (locked) => {
              const state = parseManagedTokenState(locked.serializedState);
              const operationNow = now();
              const { mergedConfig, recovered } = sharedConfigForOperation(
                baseConfig,
                state,
                { principal },
                operationNow
              );
              const preview = authorizationMutationPreview(
                principal,
                operation,
                mergedConfig,
                operationNow
              );
              if (await readFile(filePath, "utf8") !== baseSnapshot) {
                throw managementError(
                  "team authorization file changed during mutation review",
                  409
                );
              }
              const changed = recovered || preview.changed;
              const expectedGeneration = locked.generation;
              let result: TeamAuthorizationMutationReview = {
                ...preview,
                changed,
                expectedGeneration
              };
              if (changed) {
                const issuedAt = validManagementNow(operationNow);
                const receiptExpiresAt = new Date(
                  Date.parse(issuedAt) + AUTHORIZATION_MUTATION_REVIEW_TTL_MS
                ).toISOString();
                const payload: AuthorizationMutationReceiptPayload = {
                  version: 1,
                  scope: sharedScope,
                  actorUserId: principal.userId.trim(),
                  generation: expectedGeneration,
                  operationDigest: authorizationMutationDigest(operation),
                  issuedAt,
                  expiresAt: receiptExpiresAt,
                  nonce: randomUUID()
                };
                result = {
                  ...result,
                  receipt: signAuthorizationMutationReceipt(
                    reviewSigningKey,
                    payload
                  ),
                  receiptExpiresAt
                };
              }
              return {
                baseFingerprint,
                serializedState: locked.serializedState,
                result,
                changed: false
              };
            }
          );
          return reviewed.result;
        } catch (error) {
          if (
            error instanceof Error
            && error.message === `authorization scope ${sharedScope} does not exist`
          ) {
            throw new Error(missingSharedScopeInstruction(filePath, sharedScope));
          }
          throw sharedManagementError(error);
        }
      }
    : undefined;

  const listSharedAuditEvents = listAuditEvents
    ? async (
        principal: TeamAuthorizationManagementPrincipal,
        input: TeamAuthorizationAuditListOptions
      ): Promise<TeamAuthorizationAuditPage> => {
        try {
          const { afterId, limit } = validateAuditListOptions(input);
          const { baseSnapshot, committed } = await loadSharedSnapshot();
          const baseConfig = parseRequiredTeamAuthorizationConfig(baseSnapshot);
          const { mergedConfig } = sharedConfigFromSnapshot(baseConfig, committed);
          const authenticated = authenticateTeamMember(
            mergedConfig,
            principal.userId,
            principal.memberToken,
            now()
          );
          if (authenticated.role !== "owner") {
            throw managementError(
              "owner role is required to read authorization audit history",
              403
            );
          }

          const rows = await listAuditEvents(
            sharedScope,
            {
              afterId,
              limit: limit + 1,
              expectedGeneration: committed.generation,
              expectedBaseFingerprint: committed.baseFingerprint
            }
          );
          if (await readFile(filePath, "utf8") !== baseSnapshot) {
            throw managementError(
              "team authorization base changed during audit read",
              409
            );
          }
          const events = rows.slice(0, limit);
          await publishCommittedSnapshot(baseSnapshot, committed);
          return {
            events,
            ...(rows.length > limit && events.length > 0
              ? { nextAfterId: events[events.length - 1]!.id }
              : {})
          };
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
            throw error;
          }
          throw managementError(
            "authorization audit history is unavailable",
            503
          );
        }
      }
    : undefined;

  return {
    manageTokens: (principal, operation) =>
      executeOperation({ principal }, operation),
    ...(reviewTokenMutation ? { reviewTokenMutation } : {}),
    ...(listSharedAuditEvents
      ? { listAuditEvents: listSharedAuditEvents }
      : {}),
    listTokens: async (userId) => {
      const result = await executeOperation(
        { userId },
        { type: "list" }
      );
      if (result.type !== "list") {
        throw new Error("unexpected team authorization list result");
      }
      return result.tokens;
    },
    createToken: async (userId, input) => {
      const result = await executeOperation(
        { userId },
        { type: "create", input }
      );
      if (result.type !== "create") {
        throw new Error("unexpected team authorization create result");
      }
      return result.created;
    },
    revokeToken: async (userId, tokenId) => {
      const result = await executeOperation(
        { userId },
        { type: "revoke", tokenId }
      );
      if (result.type !== "revoke") {
        throw new Error("unexpected team authorization revoke result");
      }
      return result.metadata;
    }
  };
}

function findManagedMember(
  config: TeamAuthorizationConfig,
  userId: string
): TeamMemberCredential {
  const normalizedUserId = userId.trim();
  const member = config.members.find(
    (candidate) => candidate.userId === normalizedUserId
  );
  if (!member) {
    throw managementError("team authorization member was not found", 404);
  }
  return member;
}

function toTeamAccessTokenMetadata(
  credential: TeamMemberTokenCredential
): TeamAccessTokenMetadata {
  return {
    id: credential.id,
    name: credential.name,
    ...(credential.createdAt ? { createdAt: credential.createdAt } : {}),
    ...(credential.expiresAt ? { expiresAt: credential.expiresAt } : {}),
    ...(credential.revokedAt ? { revokedAt: credential.revokedAt } : {})
  };
}

function validateTeamAccessTokenName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw managementError("team authorization token name is required", 400);
  }
  if (
    Buffer.byteLength(name, "utf8") > 512
    || /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    throw managementError(
      "team authorization token name must be an audit-safe label of at most 512 bytes",
      400
    );
  }
  return name;
}

function validManagementNow(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("team authorization management time must be valid");
  }
  return value.toISOString();
}

function isTeamAccessTokenExpiryDays(
  value: unknown
): value is TeamAccessTokenExpiryDays {
  return value === null || value === 30 || value === 60 || value === 90 || value === 180;
}

function managementError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), {
    code: statusCode === 409 ? "EEXIST" : statusCode === 404 ? "ENOENT" : "EINVAL",
    statusCode
  });
}

interface ManagedTokenRevocation {
  tokenId: string;
  revokedAt: string;
}

interface ManagedTokenStateMember {
  userId: string;
  baseFingerprint: string;
  quarantined: boolean;
  tokens: TeamMemberTokenCredential[];
  revocations: ManagedTokenRevocation[];
}

interface ManagedTokenState {
  version: 2;
  members: ManagedTokenStateMember[];
}

interface ManagedTokenPersistence {
  syncFile: (handle: FileHandle) => Promise<void>;
  syncDirectory: (directoryPath: string) => Promise<void>;
  beforeRename?: () => Promise<void>;
}

class ManagedTokenBindingError extends Error {
  constructor(
    readonly userId: string,
    message: string
  ) {
    super(message);
    this.name = "ManagedTokenBindingError";
  }
}

// Account administration owns this sidecar and never writes the operator-owned members file.
function managedTokenSidecarPath(filePath: string): string {
  return `${filePath}.tokens.json`;
}

function emptyManagedTokenState(): ManagedTokenState {
  return { version: 2, members: [] };
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function parseManagedTokenState(input: string | undefined): ManagedTokenState {
  if (input === undefined) {
    return emptyManagedTokenState();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("invalid team authorization token sidecar JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalid team authorization token sidecar");
  }
  const candidate = parsed as {
    version?: unknown;
    members?: unknown;
  };
  if (
    (candidate.version !== 1 && candidate.version !== 2)
    || !Array.isArray(candidate.members)
  ) {
    throw new Error("invalid team authorization token sidecar");
  }
  const members = candidate.members.map((value): ManagedTokenStateMember => {
    if (!value || typeof value !== "object") {
      throw new Error("invalid team authorization token sidecar member");
    }
    const member = value as {
      userId?: unknown;
      baseFingerprint?: unknown;
      quarantined?: unknown;
      tokens?: unknown;
      revocations?: unknown;
    };
    if (
      typeof member.userId !== "string"
      || !member.userId.trim()
      || !Array.isArray(member.tokens)
      || !Array.isArray(member.revocations)
    ) {
      throw new Error("invalid team authorization token sidecar member");
    }
    const tokens = member.tokens.map((token) => {
      const credential = parseTeamMemberTokenCredential(token);
      if (credential.token) {
        throw new Error("team authorization token sidecar must contain hashes only");
      }
      return credential;
    });
    if (new Set(tokens.map((token) => token.id)).size !== tokens.length) {
      throw new Error("duplicate team authorization token sidecar token id");
    }
    const revocations = member.revocations.map((value): ManagedTokenRevocation => {
      if (!value || typeof value !== "object") {
        throw new Error("invalid team authorization token sidecar revocation");
      }
      const revocation = value as { tokenId?: unknown; revokedAt?: unknown };
      if (typeof revocation.tokenId !== "string" || !revocation.tokenId.trim()) {
        throw new Error("invalid team authorization token sidecar revocation");
      }
      const revokedAt = parseLifecycleTimestamp(
        revocation.revokedAt,
        "revokedAt",
        "team authorization token sidecar revocation"
      );
      if (!revokedAt) {
        throw new Error("invalid team authorization token sidecar revocation");
      }
      return { tokenId: revocation.tokenId.trim(), revokedAt };
    });
    if (
      new Set(revocations.map((revocation) => revocation.tokenId)).size
      !== revocations.length
    ) {
      throw new Error("duplicate team authorization token sidecar revocation");
    }

    const isVersionTwo = candidate.version === 2;
    if (
      isVersionTwo
      && (
        typeof member.baseFingerprint !== "string"
        || !/^[a-f0-9]{64}$/.test(member.baseFingerprint)
        || typeof member.quarantined !== "boolean"
      )
    ) {
      throw new Error("invalid team authorization token sidecar binding");
    }
    return {
      userId: member.userId.trim(),
      baseFingerprint: isVersionTwo ? member.baseFingerprint as string : "",
      quarantined: isVersionTwo ? member.quarantined as boolean : true,
      tokens,
      revocations
    };
  });
  if (new Set(members.map((member) => member.userId)).size !== members.length) {
    throw new Error("duplicate team authorization token sidecar member");
  }
  return { version: 2, members };
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalCredentialHashes(
  credential: Pick<TeamMemberTokenCredential, "token" | "tokenHash" | "tokenHashes">
): string[] {
  return Array.from(new Set([
    ...(credential.token ? [hashToken(credential.token)] : []),
    ...(credential.tokenHash ? [credential.tokenHash] : []),
    ...(credential.tokenHashes ?? [])
  ])).sort();
}

function baseMemberFingerprint(member: TeamMemberCredential): string {
  const namedTokens = (member.tokens ?? [])
    .map((token) => ({
      id: token.id,
      name: token.name,
      hashes: canonicalCredentialHashes(token),
      createdAt: token.createdAt,
      notBefore: token.notBefore,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt
    }))
    .sort((left, right) => compareCanonicalStrings(left.id, right.id));
  const canonical = {
    userId: member.userId,
    role: member.role,
    teamIds: [...member.teamIds].sort(),
    hashes: canonicalCredentialHashes(member),
    notBefore: member.notBefore,
    expiresAt: member.expiresAt,
    revokedAt: member.revokedAt,
    namedTokens
  };
  return hashToken(JSON.stringify(canonical));
}

export function canonicalTeamAuthorizationBaseFingerprint(
  input: string
): string {
  const config = parseRequiredTeamAuthorizationConfig(input);
  const canonicalMembers = config.members
    .map((member) => ({
      userId: member.userId,
      fingerprint: baseMemberFingerprint(member)
    }))
    .sort((left, right) =>
      compareCanonicalStrings(left.userId, right.userId)
      || compareCanonicalStrings(left.fingerprint, right.fingerprint)
    );
  return hashToken(JSON.stringify(canonicalMembers));
}

function canonicalManagedToken(
  token: TeamMemberTokenCredential
): TeamMemberTokenCredential {
  return {
    id: token.id,
    name: token.name,
    ...(token.tokenHash ? { tokenHash: token.tokenHash } : {}),
    ...(token.tokenHashes?.length
      ? { tokenHashes: [...token.tokenHashes].sort() }
      : {}),
    ...(token.createdAt ? { createdAt: token.createdAt } : {}),
    ...(token.notBefore ? { notBefore: token.notBefore } : {}),
    ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}),
    ...(token.revokedAt ? { revokedAt: token.revokedAt } : {})
  };
}

export function canonicalSharedManagedTokenState(
  baseInput: string,
  sidecarInput: string | undefined
): string {
  const baseConfig = parseRequiredTeamAuthorizationConfig(baseInput);
  const state = parseManagedTokenState(sidecarInput);
  const baseByUserId = new Map(
    baseConfig.members.map((member) => [member.userId, member])
  );

  for (const stateMember of state.members) {
    if (stateMember.baseFingerprint !== "") {
      continue;
    }
    const baseMember = baseByUserId.get(stateMember.userId);
    if (!baseMember) {
      throw new ManagedTokenBindingError(
        stateMember.userId,
        "team authorization token sidecar member was removed"
      );
    }
    stateMember.baseFingerprint = baseMemberFingerprint(baseMember);
    stateMember.quarantined = false;
  }

  mergeManagedTokenState(baseConfig, state);
  return serializeManagedTokenState(state);
}

function serializeManagedTokenState(state: ManagedTokenState): string {
  const members = state.members
    .map((member) => ({
      userId: member.userId,
      baseFingerprint: member.baseFingerprint,
      quarantined: member.quarantined,
      tokens: member.tokens
        .map(canonicalManagedToken)
        .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
      revocations: member.revocations
        .map((revocation) => ({ ...revocation }))
        .sort((left, right) => compareCanonicalStrings(left.tokenId, right.tokenId))
    }))
    .sort((left, right) => compareCanonicalStrings(left.userId, right.userId));
  return JSON.stringify({ version: 2, members });
}

export function reconcileSharedManagedTokenState(
  candidateBaseInput: string,
  serializedState: string
): string {
  const candidateConfig = parseRequiredTeamAuthorizationConfig(candidateBaseInput);
  const candidateByUserId = new Map(
    candidateConfig.members.map((member) => [member.userId, member])
  );
  const state = parseManagedTokenState(serializedState);
  for (const stateMember of state.members) {
    const candidateMember = candidateByUserId.get(stateMember.userId);
    if (
      !candidateMember
      || stateMember.baseFingerprint !== baseMemberFingerprint(candidateMember)
    ) {
      stateMember.quarantined = true;
    }
  }
  return serializeManagedTokenState(state);
}

function createManagedTokenStateMember(
  member: TeamMemberCredential
): ManagedTokenStateMember {
  return {
    userId: member.userId,
    baseFingerprint: baseMemberFingerprint(member),
    quarantined: false,
    tokens: [],
    revocations: []
  };
}

function managedTokenStateMember(
  state: ManagedTokenState,
  baseMember: TeamMemberCredential
): ManagedTokenStateMember {
  let member = state.members.find(
    (candidate) => candidate.userId === baseMember.userId
  );
  if (!member) {
    member = createManagedTokenStateMember(baseMember);
    state.members.push(member);
    return member;
  }
  assertManagedTokenBinding(baseMember, member);
  return member;
}

function reconcileManagedTokenStateMember(
  state: ManagedTokenState,
  baseMember: TeamMemberCredential
): ManagedTokenStateMember {
  const index = state.members.findIndex(
    (candidate) => candidate.userId === baseMember.userId
  );
  const previous = index === -1 ? undefined : state.members[index];
  const member = {
    ...createManagedTokenStateMember(baseMember),
    revocations: previous?.revocations.map((revocation) => ({ ...revocation })) ?? []
  };
  if (index === -1) {
    state.members.push(member);
  } else {
    state.members[index] = member;
  }
  return member;
}

function assertManagedTokenBinding(
  baseMember: TeamMemberCredential,
  stateMember: ManagedTokenStateMember
): void {
  if (stateMember.quarantined) {
    throw new ManagedTokenBindingError(
      baseMember.userId,
      "team authorization token sidecar member is quarantined"
    );
  }
  if (stateMember.baseFingerprint !== baseMemberFingerprint(baseMember)) {
    throw new ManagedTokenBindingError(
      baseMember.userId,
      "team authorization token sidecar member binding changed"
    );
  }
}

function mergeManagedRevocationsForRecovery(
  baseConfig: TeamAuthorizationConfig,
  state: ManagedTokenState
): TeamAuthorizationConfig {
  return {
    members: baseConfig.members.map((baseMember) => {
      const tokens = (baseMember.tokens ?? []).map((token) => ({ ...token }));
      const stateMember = state.members.find(
        (candidate) => candidate.userId === baseMember.userId
      );
      if (stateMember) {
        const byId = new Map(tokens.map((token) => [token.id, token]));
        for (const revocation of stateMember.revocations) {
          const token = byId.get(revocation.tokenId);
          if (token) {
            token.revokedAt = revocation.revokedAt;
          }
        }
      }
      return {
        ...baseMember,
        ...(tokens.length ? { tokens } : {})
      };
    })
  };
}

function mergeManagedTokenState(
  baseConfig: TeamAuthorizationConfig,
  state: ManagedTokenState,
  allowQuarantinedRecovery = false
): TeamAuthorizationConfig {
  const baseByUserId = new Map(
    baseConfig.members.map((member) => [member.userId, member])
  );
  for (const stateMember of state.members) {
    const baseMember = baseByUserId.get(stateMember.userId);
    if (!baseMember) {
      if (stateMember.quarantined) {
        continue;
      }
      throw new ManagedTokenBindingError(
        stateMember.userId,
        "team authorization token sidecar member was removed"
      );
    }
    if (!stateMember.quarantined || !allowQuarantinedRecovery) {
      assertManagedTokenBinding(baseMember, stateMember);
    }
  }

  return {
    members: baseConfig.members.map((baseMember) => {
      const stateMember = state.members.find(
        (candidate) => candidate.userId === baseMember.userId
      );
      const baseTokens = (baseMember.tokens ?? []).map((token) => ({ ...token }));
      if (!stateMember) {
        return { ...baseMember, ...(baseTokens.length ? { tokens: baseTokens } : {}) };
      }
      const baseIds = new Set(baseTokens.map((token) => token.id));
      const recoverQuarantinedMember =
        allowQuarantinedRecovery && stateMember.quarantined;
      if (
        !recoverQuarantinedMember
        && stateMember.tokens.some((token) => baseIds.has(token.id))
      ) {
        throw new ManagedTokenBindingError(
          baseMember.userId,
          "team authorization token sidecar conflicts with operator token id"
        );
      }
      const tokens = [
        ...baseTokens,
        ...(recoverQuarantinedMember
          ? []
          : stateMember.tokens.map((token) => ({ ...token })))
      ];
      const byId = new Map(tokens.map((token) => [token.id, token]));
      for (const revocation of stateMember.revocations) {
        const token = byId.get(revocation.tokenId);
        if (token) {
          token.revokedAt = revocation.revokedAt;
        }
      }
      return { ...baseMember, ...(tokens.length ? { tokens } : {}) };
    })
  };
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(directoryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// A successful management result requires durable file data, rename, and directory metadata.
async function persistManagedTokenState(
  basePath: string,
  sidecarPath: string,
  sourceSnapshot: string | undefined,
  state: ManagedTokenState,
  persistence: ManagedTokenPersistence,
  baseSnapshot?: string
): Promise<void> {
  const temporaryPath = `${sidecarPath}.${process.pid}.${randomUUID()}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await persistence.syncFile(handle);
    await handle.close();
    handle = undefined;

    const currentSnapshot = await readOptionalFile(sidecarPath);
    if (currentSnapshot !== sourceSnapshot) {
      throw managementError(
        "team authorization token sidecar changed during token management",
        409
      );
    }
    if (
      baseSnapshot !== undefined
      && await readFile(basePath, "utf8") !== baseSnapshot
    ) {
      throw managementError(
        "team authorization file changed during token management",
        409
      );
    }
    await persistence.beforeRename?.();
    await rename(temporaryPath, sidecarPath);
    await persistence.syncDirectory(path.dirname(sidecarPath));
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function quarantinePersistedManagedTokenState(
  basePath: string,
  sidecarPath: string,
  state: ManagedTokenState,
  userId: string,
  persistence: ManagedTokenPersistence
): Promise<void> {
  const member = state.members.find((candidate) => candidate.userId === userId);
  if (!member) {
    return;
  }
  member.quarantined = true;
  const sourceSnapshot = await readOptionalFile(sidecarPath);
  await persistManagedTokenState(
    basePath,
    sidecarPath,
    sourceSnapshot,
    state,
    {
      ...persistence,
      beforeRename: undefined
    }
  );
}

async function quarantineWatchedManagedTokenState(
  basePath: string,
  observedBaseSnapshot: string,
  observedSourceSnapshot: string | undefined,
  recoverWhileLocked: () => Promise<void>
): Promise<void> {
  const sidecarPath = managedTokenSidecarPath(basePath);
  await withFileProcessMutationLock(sidecarPath, async () => {
    const sourceSnapshot = await readOptionalFile(sidecarPath);
    if (sourceSnapshot !== observedSourceSnapshot) {
      throw managementError(
        "team authorization token sidecar changed during quarantine",
        409
      );
    }
    const observedBaseConfig =
      parseRequiredTeamAuthorizationConfig(observedBaseSnapshot);
    const originalBaseUserIds = new Set(
      observedBaseConfig.members.map((member) => member.userId)
    );
    const state = parseManagedTokenState(sourceSnapshot);
    let changed = false;
    for (const member of state.members) {
      if (!originalBaseUserIds.has(member.userId) && !member.quarantined) {
        member.quarantined = true;
        changed = true;
      }
    }

    const currentBaseSnapshot = await readFile(basePath, "utf8");
    const currentBaseConfig =
      parseRequiredTeamAuthorizationConfig(currentBaseSnapshot);
    if (changed) {
      await persistManagedTokenState(
        basePath,
        sidecarPath,
        sourceSnapshot,
        state,
        {
          syncFile: (handle) => handle.sync(),
          syncDirectory
        },
        currentBaseSnapshot
      );
    }
    mergeManagedTokenState(currentBaseConfig, state);
    await recoverWhileLocked();
  });
}

async function readMergedTeamAuthorizationConfig(
  filePath: string,
  allowQuarantinedRecovery = false
): Promise<TeamAuthorizationConfig> {
  const [baseSnapshot, sidecarSnapshot] = await Promise.all([
    readFile(filePath, "utf8"),
    readOptionalFile(managedTokenSidecarPath(filePath))
  ]);
  return mergeManagedTokenState(
    parseRequiredTeamAuthorizationConfig(baseSnapshot),
    parseManagedTokenState(sidecarSnapshot),
    allowQuarantinedRecovery
  );
}

async function readStableMergedTeamAuthorizationConfig(
  filePath: string
): Promise<TeamAuthorizationConfig> {
  const sidecarPath = managedTokenSidecarPath(filePath);
  const [baseSnapshot, sidecarSnapshot] = await Promise.all([
    readFile(filePath, "utf8"),
    readOptionalFile(sidecarPath)
  ]);
  const nextConfig = mergeManagedTokenState(
    parseRequiredTeamAuthorizationConfig(baseSnapshot),
    parseManagedTokenState(sidecarSnapshot)
  );
  const [verifiedBaseSnapshot, verifiedSidecarSnapshot] = await Promise.all([
    readFile(filePath, "utf8"),
    readOptionalFile(sidecarPath)
  ]);
  if (
    verifiedBaseSnapshot !== baseSnapshot
    || verifiedSidecarSnapshot !== sidecarSnapshot
  ) {
    throw managementError(
      "team authorization files changed during quarantine recovery",
      409
    );
  }
  return nextConfig;
}

export async function watchTeamAuthorizationConfigFile(
  filePath: string,
  options: WatchTeamAuthorizationConfigFileOptions = {}
): Promise<TeamAuthorizationConfigSource> {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    throw new Error("LAYO_LIBRARY_REGISTRY_MEMBERS_FILE must not be blank");
  }
  const sidecarPath = managedTokenSidecarPath(normalizedPath);
  const initialConfig = await readMergedTeamAuthorizationConfig(
    normalizedPath,
    true
  );
  const pollIntervalMs = Math.max(10, Math.floor(options.pollIntervalMs ?? 1_000));
  let closed = false;
  let reloadTail = Promise.resolve();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelRetry(): void {
    if (retryTimer === undefined) {
      return;
    }
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function scheduleRetry(): void {
    if (closed || retryTimer !== undefined) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      reload();
    }, pollIntervalMs);
    retryTimer.unref();
  }

  function reload(): void {
    reloadTail = reloadTail.then(async () => {
      if (closed) {
        return;
      }
      let observedBaseSnapshot: string | undefined;
      let observedSidecarSnapshot: string | undefined;
      const generationBeforeRead = teamAuthorizationConfigGeneration(initialConfig);
      try {
        const [baseSnapshot, sidecarSnapshot] = await Promise.all([
          readFile(normalizedPath, "utf8"),
          readOptionalFile(sidecarPath)
        ]);
        observedBaseSnapshot = baseSnapshot;
        observedSidecarSnapshot = sidecarSnapshot;
        const nextConfig = mergeManagedTokenState(
          parseRequiredTeamAuthorizationConfig(baseSnapshot),
          parseManagedTokenState(sidecarSnapshot)
        );
        cancelRetry();
        if (
          generationBeforeRead
          !== teamAuthorizationConfigGeneration(initialConfig)
        ) {
          return;
        }
        replaceTeamAuthorizationMembers(initialConfig, nextConfig.members);
      } catch (error) {
        replaceTeamAuthorizationMembers(initialConfig, []);
        let recovered = false;
        if (error instanceof ManagedTokenBindingError) {
          try {
            await options.beforeManagedTokenQuarantine?.();
            if (closed) {
              return;
            }
            if (observedBaseSnapshot === undefined) {
              throw managementError(
                "team authorization base snapshot was not observed",
                409
              );
            }
            await quarantineWatchedManagedTokenState(
              normalizedPath,
              observedBaseSnapshot,
              observedSidecarSnapshot,
              async () => {
                const recoveryGeneration =
                  teamAuthorizationConfigGeneration(initialConfig);
                const recoveredConfig =
                  await readStableMergedTeamAuthorizationConfig(normalizedPath);
                await options.beforeManagedTokenRecoveryPublish?.();
                if (closed) {
                  return;
                }
                if (
                  recoveryGeneration
                  === teamAuthorizationConfigGeneration(initialConfig)
                ) {
                  replaceTeamAuthorizationMembers(
                    initialConfig,
                    recoveredConfig.members
                  );
                  cancelRetry();
                  recovered = true;
                }
              }
            );
          } catch (quarantineError) {
            if (closed) {
              return;
            }
            options.onError?.(
              quarantineError instanceof Error
                ? quarantineError
                : new Error(String(quarantineError))
            );
          }
        }
        if (closed) {
          return;
        }
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
        if (!recovered) {
          scheduleRetry();
        }
      }
    });
  }
  teamAuthorizationConfigReloads.set(initialConfig, () => reloadTail);
  const listener: StatsListener = () => reload();
  const watchOptions = {
    interval: pollIntervalMs,
    persistent: false
  };
  watchFile(normalizedPath, watchOptions, listener);
  watchFile(sidecarPath, watchOptions, listener);

  return {
    config: initialConfig,
    settled: async () => {
      while (true) {
        const pending = reloadTail;
        await pending;
        if (pending === reloadTail) {
          return;
        }
      }
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      cancelRetry();
      teamAuthorizationConfigReloads.delete(initialConfig);
      unwatchFile(normalizedPath, listener);
      unwatchFile(sidecarPath, listener);
    }
  };
}

function parseRequiredTeamAuthorizationConfig(input: string): TeamAuthorizationConfig {
  const config = parseTeamAuthorizationConfig(input);
  if (!config) {
    throw new Error("library registry team member file must contain a JSON array");
  }
  return config;
}

export function parseTeamAuthorizationConfig(
  input: string | undefined
): TeamAuthorizationConfig | undefined {
  if (!input?.trim()) {
    return undefined;
  }
  const parsed = JSON.parse(input) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("LAYO_LIBRARY_REGISTRY_MEMBERS must be a JSON array");
  }
  return {
    members: parsed.map(parseTeamMemberCredential)
  };
}

export function authenticateTeamMember(
  config: TeamAuthorizationConfig,
  userId: string | undefined,
  token: string | undefined,
  now = new Date()
): AuthenticatedTeamMember {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId || !token) {
    throw unauthorizedError("team member credentials are required");
  }
  const member = config.members.find((candidate) => candidate.userId === normalizedUserId);
  const matchedToken = member ? matchActiveToken(member, token, now) : undefined;
  if (!member || !matchedToken || !isCredentialActive(member, now)) {
    throw unauthorizedError("team member credentials are invalid");
  }
  return {
    userId: member.userId,
    role: member.role,
    teamIds: [...member.teamIds],
    ...(matchedToken.tokenId
      ? { tokenId: matchedToken.tokenId, tokenName: matchedToken.tokenName }
      : {})
  };
}

export function filterAuthorizedTeamLibraries<T extends { teamId?: string }>(
  member: AuthenticatedTeamMember,
  libraries: T[]
): T[] {
  return libraries.filter(
    (library) =>
      library.teamId !== undefined && member.teamIds.includes(library.teamId)
  );
}

export function authorizeTeamLibraryRead(
  member: AuthenticatedTeamMember,
  teamId: string | undefined
): void {
  if (!teamId) {
    throw forbiddenError("team library read requires a team-shared file");
  }
  if (!member.teamIds.includes(teamId)) {
    throw forbiddenError("team member is not authorized for the library team");
  }
}

export function authorizeTeamLibraryWrite(
  member: AuthenticatedTeamMember,
  teamId: string | undefined
): void {
  if (!teamId) {
    throw forbiddenError("team library publication requires a team-shared source file");
  }
  if (!member.teamIds.includes(teamId)) {
    throw forbiddenError("team member is not authorized for the library team");
  }
  if (member.role === "viewer") {
    throw forbiddenError("team viewer cannot publish or manage libraries");
  }
}

export function bearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

function parseTeamMemberCredential(input: unknown): TeamMemberCredential {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library registry team member credential");
  }
  const candidate = input as Partial<TeamMemberCredential>;
  if (
    typeof candidate.userId !== "string" ||
    !candidate.userId.trim() ||
    !isRole(candidate.role) ||
    !Array.isArray(candidate.teamIds) ||
    candidate.teamIds.length === 0 ||
    !candidate.teamIds.every((teamId) => typeof teamId === "string" && teamId.trim())
  ) {
    throw new Error("invalid library registry team member credential");
  }
  const { token, tokenHash, tokenHashes } = parseTokenSecrets(
    candidate,
    "library registry team member"
  );
  let tokens: TeamMemberTokenCredential[] | undefined;
  if (candidate.tokens !== undefined) {
    if (!Array.isArray(candidate.tokens) || candidate.tokens.length === 0) {
      throw new Error("invalid library registry team member tokens");
    }
    tokens = candidate.tokens.map(parseTeamMemberTokenCredential);
    if (new Set(tokens.map((credential) => credential.id)).size !== tokens.length) {
      throw new Error("duplicate library registry team member token id");
    }
  }
  if (!token && !tokenHash && !tokenHashes?.length && !tokens?.length) {
    throw new Error(
      "library registry team member token, tokenHash, tokenHashes, or tokens is required"
    );
  }

  const notBefore = parseLifecycleTimestamp(candidate.notBefore, "notBefore");
  const expiresAt = parseLifecycleTimestamp(candidate.expiresAt, "expiresAt");
  const revokedAt = parseLifecycleTimestamp(candidate.revokedAt, "revokedAt");
  if (
    notBefore
    && expiresAt
    && Date.parse(expiresAt) <= Date.parse(notBefore)
  ) {
    throw new Error("library registry team member expiresAt must be after notBefore");
  }

  return {
    userId: candidate.userId.trim(),
    role: candidate.role,
    teamIds: Array.from(new Set(candidate.teamIds.map((teamId) => teamId.trim()))).sort(),
    token,
    tokenHash,
    ...(tokenHashes?.length ? { tokenHashes } : {}),
    ...(tokens?.length ? { tokens } : {}),
    ...(notBefore ? { notBefore } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(revokedAt ? { revokedAt } : {})
  };
}

function parseTeamMemberTokenCredential(input: unknown): TeamMemberTokenCredential {
  if (!input || typeof input !== "object") {
    throw new Error("invalid library registry team member token record");
  }
  const candidate = input as Partial<TeamMemberTokenCredential>;
  if (
    typeof candidate.id !== "string"
    || !candidate.id.trim()
    || typeof candidate.name !== "string"
    || !candidate.name.trim()
  ) {
    throw new Error("invalid library registry team member token record");
  }
  const context = `library registry team member token ${candidate.id.trim()}`;
  const { token, tokenHash, tokenHashes } = parseTokenSecrets(candidate, context);
  if (!token && !tokenHash && !tokenHashes?.length) {
    throw new Error(`${context} token, tokenHash, or tokenHashes is required`);
  }
  const createdAt = parseLifecycleTimestamp(candidate.createdAt, "createdAt", context);
  const notBefore = parseLifecycleTimestamp(candidate.notBefore, "notBefore", context);
  const expiresAt = parseLifecycleTimestamp(candidate.expiresAt, "expiresAt", context);
  const revokedAt = parseLifecycleTimestamp(candidate.revokedAt, "revokedAt", context);
  if (notBefore && expiresAt && Date.parse(expiresAt) <= Date.parse(notBefore)) {
    throw new Error(`${context} expiresAt must be after notBefore`);
  }
  return {
    id: candidate.id.trim(),
    name: validateTeamAccessTokenName(candidate.name),
    token,
    tokenHash,
    ...(tokenHashes?.length ? { tokenHashes } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(notBefore ? { notBefore } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(revokedAt ? { revokedAt } : {})
  };
}

function parseTokenSecrets(
  candidate: {
    token?: unknown;
    tokenHash?: unknown;
    tokenHashes?: unknown;
  },
  context: string
): Pick<TeamMemberTokenCredential, "token" | "tokenHash" | "tokenHashes"> {
  const token =
    typeof candidate.token === "string" && candidate.token ? candidate.token : undefined;
  const tokenHash =
    typeof candidate.tokenHash === "string" && /^[a-f0-9]{64}$/i.test(candidate.tokenHash)
      ? candidate.tokenHash.toLowerCase()
      : undefined;
  let tokenHashes: string[] | undefined;
  if (candidate.tokenHashes !== undefined) {
    if (
      !Array.isArray(candidate.tokenHashes)
      || candidate.tokenHashes.length === 0
      || !candidate.tokenHashes.every(
        (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
      )
    ) {
      throw new Error(`invalid ${context} tokenHashes`);
    }
    tokenHashes = Array.from(
      new Set(candidate.tokenHashes.map((value) => value.toLowerCase()))
    );
  }
  return { token, tokenHash, tokenHashes };
}

function matchActiveToken(
  member: TeamMemberCredential,
  token: string,
  now: Date
): { tokenId?: string; tokenName?: string } | undefined {
  const matchingNamedTokens = member.tokens?.filter((credential) =>
    matchesToken(credential, token)
  ) ?? [];
  if (matchingNamedTokens.length > 0) {
    if (
      matchingNamedTokens.length !== 1
      || !isCredentialActive(matchingNamedTokens[0]!, now)
    ) {
      return undefined;
    }
    const namedToken = matchingNamedTokens[0]!;
    return { tokenId: namedToken.id, tokenName: namedToken.name };
  }
  return matchesToken(member, token) ? {} : undefined;
}

function matchesToken(
  credential: Pick<TeamMemberTokenCredential, "token" | "tokenHash" | "tokenHashes">,
  token: string
): boolean {
  if (credential.token && safeEqual(credential.token, token)) {
    return true;
  }
  const actualHash = hashToken(token);
  return [credential.tokenHash, ...(credential.tokenHashes ?? [])].some(
    (expectedHash) => expectedHash !== undefined && safeEqual(expectedHash, actualHash)
  );
}

function isCredentialActive(
  member: Pick<TeamMemberCredential, "notBefore" | "expiresAt" | "revokedAt">,
  now: Date
): boolean {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("authentication time must be a valid date");
  }
  if (member.notBefore && nowMs < Date.parse(member.notBefore)) {
    return false;
  }
  if (member.expiresAt && nowMs >= Date.parse(member.expiresAt)) {
    return false;
  }
  return !member.revokedAt || nowMs < Date.parse(member.revokedAt);
}

function parseLifecycleTimestamp(
  value: unknown,
  field: "createdAt" | "notBefore" | "expiresAt" | "revokedAt",
  context = "library registry team member"
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`invalid ${context} ${field}`);
  }
  return new Date(value).toISOString();
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isRole(value: unknown): value is TeamAuthorizationRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

function unauthorizedError(message: string) {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "EAUTH";
  error.statusCode = 401;
  return error;
}

function forbiddenError(message: string) {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = "EACCES";
  error.statusCode = 403;
  return error;
}
