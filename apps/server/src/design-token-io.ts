import type { DesignToken, DesignTokenSet, DesignTokenTheme } from "./storage.js";

type JsonRecord = Record<string, unknown>;

const DTCG_TOKEN_SET = "global";
const SUPPORTED_TOKEN_TYPES = new Set(["color", "spacing", "dimension", "typography"]);

export interface ImportedDesignTokenDocument {
  tokens: DesignToken[];
  tokenSets: DesignTokenSet[];
  tokenThemes: DesignTokenTheme[];
}

export function exportDesignTokensToDtcg(
  tokens: DesignToken[],
  tokenSets: DesignTokenSet[] = [],
  tokenThemes: DesignTokenTheme[] = []
): JsonRecord {
  const normalizedTokenSets = normalizeTokenSetsForExport(tokens, tokenSets);
  const normalizedTokenThemes = normalizeTokenThemesForExport(tokenThemes, normalizedTokenSets);
  if (normalizedTokenSets.length > 0) {
    return exportTokenSetDocumentToDtcg(tokens, normalizedTokenSets, normalizedTokenThemes);
  }

  const root: JsonRecord = {
    $metadata: {
      tokenSetOrder: [DTCG_TOKEN_SET],
      activeThemes: []
    },
    [DTCG_TOKEN_SET]: {}
  };
  const tokenSet = root[DTCG_TOKEN_SET] as JsonRecord;

  for (const token of tokens) {
    if (!SUPPORTED_TOKEN_TYPES.has(token.type) || !token.value.trim()) {
      continue;
    }

    const path = tokenNamePath(token);
    let cursor = tokenSet;
    for (const segment of path.slice(0, -1)) {
      const existing = cursor[segment];
      if (!isRecord(existing) || "$value" in existing) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as JsonRecord;
    }
    cursor[path[path.length - 1]] = {
      $type: token.type === "spacing" ? "dimension" : token.type,
      $value: token.type === "typography" ? typographyTokenValueToDtcg(token.value) : token.value
    };
  }

  return root;
}

export function importDesignTokensFromDtcg(input: unknown): DesignToken[] {
  return importDesignTokenDocumentFromDtcg(input).tokens;
}

export function importDesignTokenDocumentFromDtcg(input: unknown): ImportedDesignTokenDocument {
  if (!isRecord(input)) {
    throw new Error("DTCG token document must be an object");
  }

  const tokens: DesignToken[] = [];
  const seenIds = new Map<string, number>();
  const explicitTokenSetNames = tokenSetOrder(input).filter((tokenSetName) => isRecord(input[tokenSetName]));
  const activeTokenSets = activeTokenSetIds(input);
  const importedTokenThemes = tokenThemes(input);
  const shouldPersistTokenSets =
    explicitTokenSetNames.length > 1 ||
    explicitTokenSetNames.some((tokenSetName) => tokenSetName !== DTCG_TOKEN_SET) ||
    activeTokenSets.length > 0 ||
    importedTokenThemes.length > 0;

  if (shouldPersistTokenSets) {
    const orderedTokenSetNames = explicitTokenSetNames.length ? explicitTokenSetNames : [DTCG_TOKEN_SET];
    const tokenSets = orderedTokenSetNames.map((tokenSetName) => ({
      id: normalizeTokenSetId(tokenSetName),
      name: tokenSetName,
      enabled: activeTokenSets.length ? activeTokenSets.includes(tokenSetName) : importedTokenThemes.length ? false : true
    }));
    for (const tokenSet of tokenSets) {
      const root = input[tokenSet.name];
      if (!isRecord(root)) {
        continue;
      }
      collectDesignTokens(root, [], inheritedTokenType(root), tokens, seenIds, tokenSet.id);
    }
    return { tokens, tokenSets, tokenThemes: importedTokenThemes };
  }

  const roots = tokenSetRootsForDocument(input);

  for (const root of roots) {
    collectDesignTokens(root, [], inheritedTokenType(root), tokens, seenIds);
  }

  return { tokens, tokenSets: [], tokenThemes: importedTokenThemes };
}

export const exportColorTokensToDtcg = exportDesignTokensToDtcg;
export const importColorTokensFromDtcg = importDesignTokensFromDtcg;

export function resolveActiveDesignTokens(
  tokens: DesignToken[],
  tokenSets: DesignTokenSet[] = [],
  tokenThemes: DesignTokenTheme[] = []
): DesignToken[] {
  if (!tokenSets.length) {
    return [...tokens];
  }

  const tokenSetOrder = tokenSets.map((tokenSet) => tokenSet.id);
  const enabledTokenSetIds = activeTokenSetIdsForResolution(tokenSets, tokenThemes);
  const winners = new Map<string, DesignToken>();
  const keyOrder: string[] = [];
  const remember = (token: DesignToken) => {
    const key = tokenResolutionKey(token);
    if (!winners.has(key)) {
      keyOrder.push(key);
    }
    winners.set(key, token);
  };

  for (const token of tokens.filter((token) => !token.set_id)) {
    remember(token);
  }
  for (const tokenSetId of tokenSetOrder) {
    if (!enabledTokenSetIds.has(tokenSetId)) {
      continue;
    }
    for (const token of tokens.filter((candidate) => candidate.set_id === tokenSetId)) {
      remember(token);
    }
  }

  return keyOrder.map((key) => winners.get(key)).filter((token): token is DesignToken => Boolean(token));
}

export function createActiveDesignTokenReferenceMap(
  tokens: DesignToken[],
  tokenSets: DesignTokenSet[] = [],
  tokenThemes: DesignTokenTheme[] = []
): Map<string, DesignToken> {
  if (!tokenSets.length) {
    return new Map(tokens.map((token) => [token.id, token]));
  }

  const activeTokens = resolveActiveDesignTokens(tokens, tokenSets, tokenThemes);
  const activeTokenByKey = new Map(activeTokens.map((token) => [tokenResolutionKey(token), token]));
  const tokenMap = new Map<string, DesignToken>();
  for (const token of tokens) {
    const activeToken = activeTokenByKey.get(tokenResolutionKey(token));
    if (activeToken) {
      tokenMap.set(token.id, activeToken);
    }
  }
  for (const token of activeTokens) {
    tokenMap.set(token.id, token);
  }
  return tokenMap;
}

function exportTokenSetDocumentToDtcg(
  tokens: DesignToken[],
  tokenSets: DesignTokenSet[],
  tokenThemes: DesignTokenTheme[] = []
): JsonRecord {
  const root: JsonRecord = {
    $metadata: {
      tokenSetOrder: tokenSets.map((tokenSet) => tokenSet.id),
      activeThemes: tokenThemes.filter((theme) => theme.enabled).map((theme) => theme.id),
      activeTokenSets: tokenSets.filter((tokenSet) => tokenSet.enabled).map((tokenSet) => tokenSet.id)
    }
  };
  const tokenSetIds = new Set(tokenSets.map((tokenSet) => tokenSet.id));
  const defaultTokenSetId = tokenSets[0]?.id ?? DTCG_TOKEN_SET;

  for (const tokenSet of tokenSets) {
    root[tokenSet.id] = {};
  }
  if (tokenThemes.length) {
    root.$themes = tokenThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      ...(theme.group ? { group: theme.group } : {}),
      selectedTokenSets: theme.token_set_ids
    }));
  }

  for (const token of tokens) {
    if (!SUPPORTED_TOKEN_TYPES.has(token.type) || !token.value.trim()) {
      continue;
    }

    const tokenSetId = token.set_id && tokenSetIds.has(token.set_id) ? token.set_id : defaultTokenSetId;
    const tokenSet = root[tokenSetId] as JsonRecord;
    writeTokenToDtcgSet(tokenSet, token);
  }

  return root;
}

function writeTokenToDtcgSet(tokenSet: JsonRecord, token: DesignToken) {
  const path = tokenNamePath(token);
  let cursor = tokenSet;
  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];
    if (!isRecord(existing) || "$value" in existing) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as JsonRecord;
  }
  cursor[path[path.length - 1]] = {
    $type: token.type === "spacing" ? "dimension" : token.type,
    $value: token.type === "typography" ? typographyTokenValueToDtcg(token.value) : token.value
  };
}

function tokenSetRootsForDocument(input: JsonRecord): JsonRecord[] {
  const orderedTokenSetRoots = tokenSetOrder(input)
    .map((tokenSetName) => input[tokenSetName])
    .filter(isRecord);
  if (orderedTokenSetRoots.length) {
    return orderedTokenSetRoots;
  }

  const globalTokenSet = input[DTCG_TOKEN_SET];
  if (isRecord(globalTokenSet)) {
    return [globalTokenSet];
  }

  return [input];
}

function tokenSetOrder(input: JsonRecord): string[] {
  const metadata = input.$metadata;
  if (!isRecord(metadata) || !Array.isArray(metadata.tokenSetOrder)) {
    return [];
  }
  return metadata.tokenSetOrder.filter((value): value is string => typeof value === "string");
}

function activeTokenSetIds(input: JsonRecord): string[] {
  const metadata = input.$metadata;
  if (!isRecord(metadata) || !Array.isArray(metadata.activeTokenSets)) {
    return [];
  }
  return metadata.activeTokenSets.filter((value): value is string => typeof value === "string");
}

function activeThemeIds(input: JsonRecord): string[] {
  const metadata = input.$metadata;
  if (!isRecord(metadata) || !Array.isArray(metadata.activeThemes)) {
    return [];
  }
  return metadata.activeThemes.filter((value): value is string => typeof value === "string");
}

function tokenThemes(input: JsonRecord): DesignTokenTheme[] {
  if (!Array.isArray(input.$themes)) {
    return [];
  }
  const activeThemes = new Set(activeThemeIds(input));
  return input.$themes
    .filter(isRecord)
    .map((theme, index) => {
      const id = normalizeTokenThemeId(typeof theme.id === "string" ? theme.id : `theme-${index + 1}`);
      const name = typeof theme.name === "string" && theme.name.trim() ? theme.name.trim() : id;
      const group = typeof theme.group === "string" && theme.group.trim() ? theme.group.trim() : undefined;
      const rawTokenSetIds = Array.isArray(theme.selectedTokenSets)
        ? theme.selectedTokenSets
        : Array.isArray(theme.tokenSetIds)
          ? theme.tokenSetIds
          : [];
      return {
        id,
        name,
        ...(group ? { group } : {}),
        enabled: activeThemes.has(id),
        token_set_ids: rawTokenSetIds
          .filter((value): value is string => typeof value === "string")
          .map(normalizeTokenSetId)
      };
    });
}

function collectDesignTokens(
  node: JsonRecord,
  path: string[],
  inheritedType: string | null,
  tokens: DesignToken[],
  seenIds: Map<string, number>,
  setId?: string
) {
  const ownType = inheritedTokenType(node) ?? inheritedType;
  if ("$value" in node) {
    const value = node.$value;
    const tokenType = normalizeTokenType(ownType);
    const tokenValue = normalizeTokenValue(tokenType, value);
    if (tokenType && tokenValue && path.length) {
      const baseId = slugifyTokenPath(path, tokenType, setId);
      const seenCount = seenIds.get(baseId) ?? 0;
      seenIds.set(baseId, seenCount + 1);
      tokens.push({
        id: seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`,
        name: path.join(" / "),
        type: tokenType,
        value: tokenValue,
        ...(setId ? { set_id: setId } : {})
      });
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || !isRecord(value)) {
      continue;
    }
    collectDesignTokens(value, [...path, key], ownType, tokens, seenIds, setId);
  }
}

function normalizeTokenType(input: string | null): DesignToken["type"] | null {
  if (input === "color") {
    return "color";
  }
  if (input === "spacing" || input === "dimension") {
    return "spacing";
  }
  if (input === "typography") {
    return "typography";
  }
  return null;
}

function normalizeTokenValue(tokenType: DesignToken["type"] | null, value: unknown): string | null {
  if (!tokenType) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (tokenType === "spacing" && typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (tokenType === "typography") {
    return normalizeTypographyTokenValue(value);
  }
  return null;
}

function normalizeTypographyTokenValue(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const fontFamily = typeof value.fontFamily === "string" ? value.fontFamily.trim() : "";
  const fontSize = Number(value.fontSize);
  const lineHeight = value.lineHeight === undefined ? undefined : Number(value.lineHeight);
  if (!fontFamily || !Number.isFinite(fontSize) || fontSize <= 0) {
    return null;
  }
  if (lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)) {
    return null;
  }
  return JSON.stringify({
    fontFamily,
    fontSize,
    ...(lineHeight !== undefined ? { lineHeight } : {})
  });
}

function typographyTokenValueToDtcg(value: string): unknown {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      return value;
    }
    const fontFamily = typeof parsed.fontFamily === "string" ? parsed.fontFamily.trim() : "";
    const fontSize = Number(parsed.fontSize);
    const lineHeight = parsed.lineHeight === undefined ? undefined : Number(parsed.lineHeight);
    if (!fontFamily || !Number.isFinite(fontSize) || fontSize <= 0) {
      return value;
    }
    if (lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)) {
      return value;
    }
    return {
      fontFamily,
      fontSize,
      ...(lineHeight !== undefined ? { lineHeight } : {})
    };
  } catch {
    return value;
  }
}

function inheritedTokenType(node: JsonRecord): string | null {
  return typeof node.$type === "string" ? node.$type : null;
}

function tokenNamePath(token: DesignToken): string[] {
  const segments = token.name
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length) {
    return segments;
  }
  return [token.id || "Token"];
}

function slugifyTokenPath(path: string[], tokenType: DesignToken["type"], setId?: string): string {
  const slug = path
    .join("-")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return `${tokenType}-${setId ? `${normalizeTokenSetId(setId)}-` : ""}${slug || "token"}`;
}

function normalizeTokenSetId(input: string): string {
  return (
    input
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-") || DTCG_TOKEN_SET
  );
}

function normalizeTokenThemeId(input: string): string {
  return (
    input
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-") || "theme"
  );
}

function normalizeTokenSetsForExport(tokens: DesignToken[], tokenSets: DesignTokenSet[]): DesignTokenSet[] {
  const normalized = new Map<string, DesignTokenSet>();
  for (const tokenSet of tokenSets) {
    const id = normalizeTokenSetId(tokenSet.id);
    normalized.set(id, {
      id,
      name: tokenSet.name || id,
      enabled: Boolean(tokenSet.enabled)
    });
  }
  for (const token of tokens) {
    if (token.set_id && !normalized.has(token.set_id)) {
      normalized.set(token.set_id, {
        id: token.set_id,
        name: token.set_id,
        enabled: true
      });
    }
  }
  return [...normalized.values()];
}

function normalizeTokenThemesForExport(
  tokenThemes: DesignTokenTheme[],
  tokenSets: DesignTokenSet[]
): DesignTokenTheme[] {
  const tokenSetIds = new Set(tokenSets.map((tokenSet) => tokenSet.id));
  return tokenThemes
    .map((theme) => {
      const id = normalizeTokenThemeId(theme.id);
      const tokenSetIdsForTheme = Array.from(
        new Set(theme.token_set_ids.map(normalizeTokenSetId).filter((tokenSetId) => tokenSetIds.has(tokenSetId)))
      );
      return {
        id,
        name: theme.name?.trim() || id,
        ...(theme.group?.trim() ? { group: theme.group.trim() } : {}),
        enabled: Boolean(theme.enabled),
        token_set_ids: tokenSetIdsForTheme
      };
    })
    .filter((theme) => theme.token_set_ids.length > 0);
}

function activeTokenSetIdsForResolution(
  tokenSets: DesignTokenSet[],
  tokenThemes: DesignTokenTheme[] = []
): Set<string> {
  const activeIds = new Set(tokenSets.filter((tokenSet) => tokenSet.enabled).map((tokenSet) => tokenSet.id));
  const knownTokenSetIds = new Set(tokenSets.map((tokenSet) => tokenSet.id));
  for (const theme of tokenThemes) {
    if (!theme.enabled) {
      continue;
    }
    for (const tokenSetId of theme.token_set_ids) {
      if (knownTokenSetIds.has(tokenSetId)) {
        activeIds.add(tokenSetId);
      }
    }
  }
  return activeIds;
}

function tokenResolutionKey(token: DesignToken): string {
  return `${token.type}\u0000${token.name.trim().toLowerCase()}`;
}

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}
