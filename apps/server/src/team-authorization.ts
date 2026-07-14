import { createHash, timingSafeEqual } from "node:crypto";

export type TeamAuthorizationRole = "owner" | "editor" | "viewer";

export interface TeamMemberCredential {
  userId: string;
  role: TeamAuthorizationRole;
  teamIds: string[];
  token?: string;
  tokenHash?: string;
  tokenHashes?: string[];
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
  if (!member || !matchesToken(member, token) || !isCredentialActive(member, now)) {
    throw unauthorizedError("team member credentials are invalid");
  }
  return {
    userId: member.userId,
    role: member.role,
    teamIds: [...member.teamIds]
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
  const token = typeof candidate.token === "string" && candidate.token ? candidate.token : undefined;
  const tokenHash =
    typeof candidate.tokenHash === "string" && /^[a-f0-9]{64}$/i.test(candidate.tokenHash)
      ? candidate.tokenHash.toLowerCase()
      : undefined;
  const tokenHashes = Array.isArray(candidate.tokenHashes)
    && candidate.tokenHashes.every(
      (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
    )
      ? Array.from(new Set(candidate.tokenHashes.map((value) => value.toLowerCase())))
      : undefined;
  if (!token && !tokenHash && !tokenHashes?.length) {
    throw new Error("library registry team member token, tokenHash, or tokenHashes is required");
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
    ...(notBefore ? { notBefore } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(revokedAt ? { revokedAt } : {})
  };
}

function matchesToken(member: TeamMemberCredential, token: string): boolean {
  if (member.token && safeEqual(member.token, token)) {
    return true;
  }
  const actualHash = hashToken(token);
  return [member.tokenHash, ...(member.tokenHashes ?? [])].some(
    (expectedHash) => expectedHash !== undefined && safeEqual(expectedHash, actualHash)
  );
}

function isCredentialActive(member: TeamMemberCredential, now: Date): boolean {
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
  field: "notBefore" | "expiresAt" | "revokedAt"
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`invalid library registry team member ${field}`);
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
