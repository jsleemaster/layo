import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { unwatchFile, watchFile, type StatsListener } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { withFileProcessMutationLock } from "./file-process-lock.js";

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
}

export interface WatchTeamAuthorizationConfigFileOptions {
  pollIntervalMs?: number;
  onError?: (error: Error) => void;
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
}

export type TeamAuthorizationManagementOperation =
  | { type: "list" }
  | { type: "create"; input: CreateTeamAccessTokenInput }
  | { type: "revoke"; tokenId: string; confirmSelfRevoke?: boolean };

export type TeamAuthorizationManagementResult =
  | { type: "list"; tokens: TeamAccessTokenMetadata[]; activeTokenId?: string }
  | { type: "create"; created: CreatedTeamAccessToken }
  | { type: "revoke"; metadata: TeamAccessTokenMetadata };

export interface TeamAuthorizationFileManager {
  manageTokens: (
    principal: TeamAuthorizationManagementPrincipal,
    operation: TeamAuthorizationManagementOperation
  ) => Promise<TeamAuthorizationManagementResult>;
  listTokens: (userId: string) => TeamAccessTokenMetadata[];
  createToken: (
    userId: string,
    input: CreateTeamAccessTokenInput
  ) => Promise<CreatedTeamAccessToken>;
  revokeToken: (
    userId: string,
    tokenId: string
  ) => Promise<TeamAccessTokenMetadata>;
}

export interface TeamAuthorizationFileManagerOptions {
  now?: () => Date;
  generateId?: () => string;
  generateSecret?: () => string;
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
  const sidecarPath = managedTokenSidecarPath(normalizedPath);
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? (() => randomUUID());
  const generateSecret =
    options.generateSecret
    ?? (() => `layo_pat_${randomBytes(32).toString("base64url")}`);
  const listTokens = (userId: string): TeamAccessTokenMetadata[] => {
    const member = findManagedMember(config, userId);
    return (member.tokens ?? []).map(toTeamAccessTokenMetadata);
  };

  const mutate = <T>(operation: () => Promise<T>): Promise<T> =>
    withFileProcessMutationLock(sidecarPath, operation);

  const persist = async (
    baseSnapshot: string,
    sourceSnapshot: string | undefined,
    state: ManagedTokenState
  ): Promise<void> => {
    const temporaryPath = `${sidecarPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(state, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 }
      );
      const currentSnapshot = await readOptionalFile(sidecarPath);
      if (currentSnapshot !== sourceSnapshot) {
        throw managementError(
          "team authorization token sidecar changed during token management",
          409
        );
      }
      if (await readFile(normalizedPath, "utf8") !== baseSnapshot) {
        throw managementError(
          "team authorization file changed during token management",
          409
        );
      }
      await rename(temporaryPath, sidecarPath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    const currentConfig = await readMergedTeamAuthorizationConfig(normalizedPath);
    replaceTeamAuthorizationMembers(config, currentConfig.members);
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
      const nextConfig = mergeManagedTokenState(baseConfig, state);
      const operationNow = now();
      let authenticatedMember: AuthenticatedTeamMember | undefined;
      let userId: string;
      if ("principal" in identity) {
        authenticatedMember = authenticateTeamMember(
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
        const name =
          typeof operation.input?.name === "string"
            ? operation.input.name.trim()
            : "";
        if (!name) {
          throw managementError("team authorization token name is required", 400);
        }
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
        managedTokenStateMember(state, userId).tokens.push(credential);
        await persist(baseSnapshot, sidecarSnapshot, state);
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
        managedTokenStateMember(state, userId).revocations.push({
          tokenId: normalizedTokenId,
          revokedAt
        });
        credential.revokedAt = revokedAt;
        await persist(baseSnapshot, sidecarSnapshot, state);
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
  tokens: TeamMemberTokenCredential[];
  revocations: ManagedTokenRevocation[];
}

interface ManagedTokenState {
  version: 1;
  members: ManagedTokenStateMember[];
}

// Account administration owns this sidecar and never writes the operator-owned members file.
function managedTokenSidecarPath(filePath: string): string {
  return `${filePath}.tokens.json`;
}

function emptyManagedTokenState(): ManagedTokenState {
  return { version: 1, members: [] };
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
  if (candidate.version !== 1 || !Array.isArray(candidate.members)) {
    throw new Error("invalid team authorization token sidecar");
  }
  const members = candidate.members.map((value): ManagedTokenStateMember => {
    if (!value || typeof value !== "object") {
      throw new Error("invalid team authorization token sidecar member");
    }
    const member = value as {
      userId?: unknown;
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
    return {
      userId: member.userId.trim(),
      tokens,
      revocations
    };
  });
  if (new Set(members.map((member) => member.userId)).size !== members.length) {
    throw new Error("duplicate team authorization token sidecar member");
  }
  return { version: 1, members };
}

function managedTokenStateMember(
  state: ManagedTokenState,
  userId: string
): ManagedTokenStateMember {
  const normalizedUserId = userId.trim();
  let member = state.members.find(
    (candidate) => candidate.userId === normalizedUserId
  );
  if (!member) {
    member = { userId: normalizedUserId, tokens: [], revocations: [] };
    state.members.push(member);
  }
  return member;
}

function mergeManagedTokenState(
  baseConfig: TeamAuthorizationConfig,
  state: ManagedTokenState
): TeamAuthorizationConfig {
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
      if (stateMember.tokens.some((token) => baseIds.has(token.id))) {
        throw new Error("team authorization token sidecar conflicts with operator token id");
      }
      const tokens = [
        ...baseTokens,
        ...stateMember.tokens.map((token) => ({ ...token }))
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

async function readMergedTeamAuthorizationConfig(
  filePath: string
): Promise<TeamAuthorizationConfig> {
  const [baseSnapshot, sidecarSnapshot] = await Promise.all([
    readFile(filePath, "utf8"),
    readOptionalFile(managedTokenSidecarPath(filePath))
  ]);
  return mergeManagedTokenState(
    parseRequiredTeamAuthorizationConfig(baseSnapshot),
    parseManagedTokenState(sidecarSnapshot)
  );
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
  const initialConfig = await readMergedTeamAuthorizationConfig(normalizedPath);
  let closed = false;
  let reloadTail = Promise.resolve();

  const reload = () => {
    reloadTail = reloadTail.then(async () => {
      if (closed) {
        return;
      }
      try {
        const generationBeforeRead = teamAuthorizationConfigGeneration(initialConfig);
        const nextConfig = await readMergedTeamAuthorizationConfig(normalizedPath);
        if (
          generationBeforeRead
          !== teamAuthorizationConfigGeneration(initialConfig)
        ) {
          return;
        }
        replaceTeamAuthorizationMembers(initialConfig, nextConfig.members);
      } catch (error) {
        options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };
  const listener: StatsListener = () => reload();
  const watchOptions = {
    interval: Math.max(10, Math.floor(options.pollIntervalMs ?? 1_000)),
    persistent: false
  };
  watchFile(normalizedPath, watchOptions, listener);
  watchFile(sidecarPath, watchOptions, listener);

  return {
    config: initialConfig,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
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
    name: candidate.name.trim(),
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
