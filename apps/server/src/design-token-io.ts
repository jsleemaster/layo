import type { DesignToken } from "./storage.js";

type JsonRecord = Record<string, unknown>;

const DTCG_TOKEN_SET = "global";
const SUPPORTED_TOKEN_TYPES = new Set(["color", "spacing", "dimension", "typography"]);

export function exportDesignTokensToDtcg(tokens: DesignToken[]): JsonRecord {
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
  if (!isRecord(input)) {
    throw new Error("DTCG token document must be an object");
  }

  const tokens: DesignToken[] = [];
  const seenIds = new Map<string, number>();
  const roots = tokenSetRootsForDocument(input);

  for (const root of roots) {
    collectDesignTokens(root, [], inheritedTokenType(root), tokens, seenIds);
  }

  return tokens;
}

export const exportColorTokensToDtcg = exportDesignTokensToDtcg;
export const importColorTokensFromDtcg = importDesignTokensFromDtcg;

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

function collectDesignTokens(
  node: JsonRecord,
  path: string[],
  inheritedType: string | null,
  tokens: DesignToken[],
  seenIds: Map<string, number>
) {
  const ownType = inheritedTokenType(node) ?? inheritedType;
  if ("$value" in node) {
    const value = node.$value;
    const tokenType = normalizeTokenType(ownType);
    const tokenValue = normalizeTokenValue(tokenType, value);
    if (tokenType && tokenValue && path.length) {
      const baseId = slugifyTokenPath(path, tokenType);
      const seenCount = seenIds.get(baseId) ?? 0;
      seenIds.set(baseId, seenCount + 1);
      tokens.push({
        id: seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`,
        name: path.join(" / "),
        type: tokenType,
        value: tokenValue
      });
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || !isRecord(value)) {
      continue;
    }
    collectDesignTokens(value, [...path, key], ownType, tokens, seenIds);
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

function slugifyTokenPath(path: string[], tokenType: DesignToken["type"]): string {
  const slug = path
    .join("-")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return `${tokenType}-${slug || "token"}`;
}

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}
