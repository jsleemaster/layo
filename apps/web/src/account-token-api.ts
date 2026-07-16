import { apiUrl } from "./api-base";

export type AccountTokenExpiryDays = null | 30 | 60 | 90 | 180;

export interface AccountTokenMetadata {
  id: string;
  name: string;
  createdAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface AccountTokenList {
  tokens: AccountTokenMetadata[];
  activeTokenId?: string;
}

export interface CreateAccountTokenInput {
  name: string;
  expiresInDays: AccountTokenExpiryDays;
}

export interface CreatedAccountToken {
  token: string;
  metadata: AccountTokenMetadata;
}

export interface RevokedAccountToken {
  metadata: AccountTokenMetadata;
}

export type AuthorizationAuditAction =
  | "token_created"
  | "token_revoked"
  | "scope_bootstrapped"
  | "scope_restored"
  | "base_reconciled";

export type AuthorizationAuditSource = "http" | "mcp" | "operator";

export interface AuthorizationAuditEvent {
  id: string;
  scope: string;
  generation: string;
  action: AuthorizationAuditAction;
  actorUserId: string;
  subjectTokenId?: string;
  subjectTokenName?: string;
  source: AuthorizationAuditSource;
  requestId?: string;
  createdAt: string;
  archivedAt?: string;
}

export interface AuthorizationAuditPage {
  events: AuthorizationAuditEvent[];
  nextAfterId?: string;
}

export interface AuthorizationAuditCursor {
  afterId: string;
  limit: number;
}

export async function listAccountTokens(
  userId: string,
  memberToken: string,
  fetcher: typeof fetch = fetch
): Promise<AccountTokenList> {
  const payload = await requestJson(
    apiUrl("/account/tokens"),
    {
      method: "GET",
      headers: authorizationHeaders(userId, memberToken)
    },
    "계정 토큰 목록을 불러오지 못했습니다",
    fetcher
  );
  const candidate = objectPayload(payload);
  if (!candidate || !Array.isArray(candidate.tokens)) {
    throw malformedResponse("계정 토큰 목록");
  }
  const tokens = candidate.tokens.map((token) =>
    parseMetadata(token, "계정 토큰 목록")
  );
  if (new Set(tokens.map((token) => token.id)).size !== tokens.length) {
    throw malformedResponse("계정 토큰 목록");
  }
  const activeTokenId = optionalNonBlankString(candidate.activeTokenId);
  if (
    (candidate.activeTokenId !== undefined && !activeTokenId)
    || (activeTokenId !== undefined
      && tokens.filter((token) => token.id === activeTokenId).length !== 1)
  ) {
    throw malformedResponse("계정 토큰 목록");
  }
  return {
    tokens,
    ...(activeTokenId ? { activeTokenId } : {})
  };
}

export async function listAuthorizationAudit(
  userId: string,
  memberToken: string,
  cursor: AuthorizationAuditCursor,
  fetcher: typeof fetch = fetch
): Promise<AuthorizationAuditPage> {
  if (
    !exactDecimalString(cursor.afterId)
    || !Number.isSafeInteger(cursor.limit)
    || cursor.limit < 1
    || cursor.limit > 100
  ) {
    throw new Error("권한 감사 활동 커서가 올바르지 않습니다");
  }
  const query = new URLSearchParams();
  query.set("afterId", cursor.afterId);
  query.set("limit", String(cursor.limit));
  const payload = await requestJson(
    apiUrl(`/account/authorization-audit?${query.toString()}`),
    {
      method: "GET",
      headers: authorizationHeaders(userId, memberToken),
      cache: "no-store"
    },
    "권한 감사 활동을 불러오지 못했습니다",
    fetcher
  );
  const candidate = objectPayload(payload);
  if (!candidate || !Array.isArray(candidate.events)) {
    throw malformedResponse("권한 감사 활동");
  }

  let previousId = cursor.afterId;
  const events = candidate.events.map((event) => {
    const parsed = parseAuthorizationAuditEvent(event);
    if (BigInt(parsed.id) <= BigInt(previousId)) {
      throw malformedResponse("권한 감사 활동");
    }
    previousId = parsed.id;
    return parsed;
  });
  const nextAfterId = optionalExactDecimalString(candidate.nextAfterId);
  if (
    (candidate.nextAfterId !== undefined && !nextAfterId)
    || (nextAfterId !== undefined
      && (events.length === 0 || nextAfterId !== events[events.length - 1]!.id))
  ) {
    throw malformedResponse("권한 감사 활동");
  }
  return {
    events,
    ...(nextAfterId ? { nextAfterId } : {})
  };
}

export async function createAccountToken(
  userId: string,
  memberToken: string,
  input: CreateAccountTokenInput,
  fetcher: typeof fetch = fetch
): Promise<CreatedAccountToken> {
  const payload = await requestJson(
    apiUrl("/account/tokens"),
    {
      method: "POST",
      headers: authorizationHeaders(userId, memberToken, true),
      body: JSON.stringify(input)
    },
    "계정 토큰을 만들지 못했습니다",
    fetcher
  );
  const candidate = objectPayload(payload);
  const token = candidate && nonBlankString(candidate.token);
  if (!candidate || !token) {
    throw malformedResponse("계정 토큰 생성");
  }
  return {
    token,
    metadata: parseMetadata(candidate.metadata, "계정 토큰 생성")
  };
}

export async function revokeAccountToken(
  userId: string,
  memberToken: string,
  tokenId: string,
  confirmSelfRevoke: boolean,
  fetcher: typeof fetch = fetch
): Promise<RevokedAccountToken> {
  const payload = await requestJson(
    apiUrl(`/account/tokens/${encodeURIComponent(tokenId)}`),
    {
      method: "DELETE",
      headers: authorizationHeaders(userId, memberToken, true),
      body: JSON.stringify({ confirmSelfRevoke })
    },
    "계정 토큰을 해지하지 못했습니다",
    fetcher
  );
  const candidate = objectPayload(payload);
  if (!candidate) {
    throw malformedResponse("계정 토큰 해지");
  }
  return {
    metadata: parseMetadata(candidate.metadata, "계정 토큰 해지")
  };
}

function authorizationHeaders(
  userId: string,
  memberToken: string,
  hasBody = false
): Record<string, string> {
  return {
    Authorization: `Bearer ${memberToken}`,
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    "X-Layo-User-Id": userId
  };
}

async function requestJson(
  url: string,
  init: RequestInit,
  failureMessage: string,
  fetcher: typeof fetch = fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${failureMessage}: ${detail}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw responseError(failureMessage, response, undefined);
    }
    throw malformedResponse(failureMessage);
  }
  if (!response.ok) {
    throw responseError(failureMessage, response, payload);
  }
  return payload;
}

function responseError(
  failureMessage: string,
  response: Response,
  payload: unknown
): Error {
  const candidate = objectPayload(payload);
  const detail =
    nonBlankString(candidate?.message)
    ?? nonBlankString(candidate?.error)
    ?? response.statusText
    ?? "요청 실패";
  const status = [response.status, response.statusText].filter(Boolean).join(" ");
  return new Error(`${failureMessage} (${status}): ${detail}`);
}

function parseAuthorizationAuditEvent(payload: unknown): AuthorizationAuditEvent {
  const candidate = objectPayload(payload);
  const id = exactDecimalString(candidate?.id);
  const generation = exactDecimalString(candidate?.generation);
  const scope = nonBlankString(candidate?.scope);
  const actorUserId = nonBlankString(candidate?.actorUserId);
  const createdAt = nonBlankString(candidate?.createdAt);
  const action = candidate?.action;
  const source = candidate?.source;
  if (
    !candidate
    || !id
    || !generation
    || !scope
    || !actorUserId
    || !createdAt
    || !isAuthorizationAuditAction(action)
    || !isAuthorizationAuditSource(source)
    || !objectPayload(candidate.metadata)
  ) {
    throw malformedResponse("권한 감사 활동");
  }
  const subjectTokenId = parseOptionalAuditString(candidate, "subjectTokenId");
  const subjectTokenName = parseOptionalAuditString(candidate, "subjectTokenName");
  const requestId = parseOptionalAuditString(candidate, "requestId");
  const archivedAt = parseOptionalAuditString(candidate, "archivedAt");
  return {
    id,
    scope,
    generation,
    action,
    actorUserId,
    ...(subjectTokenId ? { subjectTokenId } : {}),
    ...(subjectTokenName ? { subjectTokenName } : {}),
    source,
    ...(requestId ? { requestId } : {}),
    createdAt,
    ...(archivedAt ? { archivedAt } : {})
  };
}

function parseOptionalAuditString(
  payload: Record<string, unknown>,
  field: "subjectTokenId" | "subjectTokenName" | "requestId" | "archivedAt"
): string | undefined {
  if (payload[field] === undefined || payload[field] === null) {
    return undefined;
  }
  const value = nonBlankString(payload[field]);
  if (!value) {
    throw malformedResponse("권한 감사 활동");
  }
  return value;
}

function isAuthorizationAuditAction(value: unknown): value is AuthorizationAuditAction {
  return value === "token_created"
    || value === "token_revoked"
    || value === "scope_bootstrapped"
    || value === "scope_restored"
    || value === "base_reconciled";
}

function isAuthorizationAuditSource(value: unknown): value is AuthorizationAuditSource {
  return value === "http" || value === "mcp" || value === "operator";
}

function exactDecimalString(value: unknown): string | undefined {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
    ? value
    : undefined;
}

function optionalExactDecimalString(value: unknown): string | undefined {
  return value === undefined ? undefined : exactDecimalString(value);
}

function parseMetadata(payload: unknown, context: string): AccountTokenMetadata {
  const candidate = objectPayload(payload);
  const id = nonBlankString(candidate?.id);
  const name = nonBlankString(candidate?.name);
  if (!candidate || !id || !name) {
    throw malformedResponse(context);
  }
  const createdAt = parseOptionalString(candidate, "createdAt", context);
  const expiresAt = parseOptionalString(candidate, "expiresAt", context);
  const revokedAt = parseOptionalString(candidate, "revokedAt", context);
  return {
    id,
    name,
    ...(createdAt ? { createdAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(revokedAt ? { revokedAt } : {})
  };
}

function parseOptionalString(
  payload: Record<string, unknown>,
  field: "createdAt" | "expiresAt" | "revokedAt",
  context: string
): string | undefined {
  if (payload[field] === undefined) {
    return undefined;
  }
  const value = nonBlankString(payload[field]);
  if (!value) {
    throw malformedResponse(context);
  }
  return value;
}

function objectPayload(payload: unknown): Record<string, unknown> | undefined {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : undefined;
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNonBlankString(value: unknown): string | undefined {
  return value === undefined ? undefined : nonBlankString(value);
}

function malformedResponse(context: string): Error {
  return new Error(`${context} 서버 응답이 올바르지 않습니다`);
}
