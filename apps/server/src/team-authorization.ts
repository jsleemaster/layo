import { createHash, timingSafeEqual } from "node:crypto";
import { unwatchFile, watchFile, type StatsListener } from "node:fs";
import { readFile } from "node:fs/promises";

export type TeamAuthorizationRole = "owner" | "editor" | "viewer";

export interface TeamMemberTokenCredential {
  id: string;
  name: string;
  token?: string;
  tokenHash?: string;
  tokenHashes?: string[];
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

export async function watchTeamAuthorizationConfigFile(
  filePath: string,
  options: WatchTeamAuthorizationConfigFileOptions = {}
): Promise<TeamAuthorizationConfigSource> {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    throw new Error("LAYO_LIBRARY_REGISTRY_MEMBERS_FILE must not be blank");
  }
  const initialConfig = parseRequiredTeamAuthorizationConfig(
    await readFile(normalizedPath, "utf8")
  );
  let closed = false;
  let reloadTail = Promise.resolve();

  const reload = () => {
    reloadTail = reloadTail.then(async () => {
      if (closed) {
        return;
      }
      try {
        const nextConfig = parseRequiredTeamAuthorizationConfig(
          await readFile(normalizedPath, "utf8")
        );
        initialConfig.members = nextConfig.members;
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
    config: initialConfig,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      unwatchFile(normalizedPath, listener);
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
  const namedToken = member.tokens?.find((credential) =>
    matchesToken(credential, token)
  );
  if (namedToken) {
    return isCredentialActive(namedToken, now)
      ? { tokenId: namedToken.id, tokenName: namedToken.name }
      : undefined;
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
  field: "notBefore" | "expiresAt" | "revokedAt",
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
