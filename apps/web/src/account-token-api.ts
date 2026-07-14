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
    "계정 토큰 목록을 불러오지 못했습니다"
  );
  const candidate = objectPayload(payload);
  if (!candidate || !Array.isArray(candidate.tokens)) {
    throw malformedResponse("계정 토큰 목록");
  }
  const activeTokenId = optionalNonBlankString(candidate.activeTokenId);
  if (candidate.activeTokenId !== undefined && !activeTokenId) {
    throw malformedResponse("계정 토큰 목록");
  }
  return {
    tokens: candidate.tokens.map((token) => parseMetadata(token, "계정 토큰 목록")),
    ...(activeTokenId ? { activeTokenId } : {})
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
    "계정 토큰을 만들지 못했습니다"
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
    "계정 토큰을 해지하지 못했습니다"
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
  fetcher: typeof fetch
): Promise<unknown>;
async function requestJson(
  url: string,
  init: RequestInit,
  failureMessage: string
): Promise<unknown>;
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
