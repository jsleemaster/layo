export function resolveVercelBridgeRequestUrl(originalUrl: string | undefined) {
  const parsed = new URL(originalUrl ?? "/api/bridge", "http://127.0.0.1");
  const routedPath = parsed.searchParams.get("__layo_path");
  if (!routedPath || !routedPath.startsWith("/") || routedPath.startsWith("//")) {
    return null;
  }

  parsed.searchParams.delete("__layo_path");
  const query = parsed.searchParams.toString();
  return query ? `${routedPath}?${query}` : routedPath;
}
