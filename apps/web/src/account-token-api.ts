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
  _userId: string,
  _memberToken: string,
  _fetcher: typeof fetch = fetch
): Promise<AccountTokenList> {
  throw new Error("account token API is not implemented");
}

export async function createAccountToken(
  _userId: string,
  _memberToken: string,
  _input: CreateAccountTokenInput,
  _fetcher: typeof fetch = fetch
): Promise<CreatedAccountToken> {
  throw new Error("account token API is not implemented");
}

export async function revokeAccountToken(
  _userId: string,
  _memberToken: string,
  _tokenId: string,
  _confirmSelfRevoke: boolean,
  _fetcher: typeof fetch = fetch
): Promise<RevokedAccountToken> {
  throw new Error("account token API is not implemented");
}
