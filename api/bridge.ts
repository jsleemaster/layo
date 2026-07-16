import type { IncomingMessage, ServerResponse } from "node:http";
import { createHttpServer } from "../apps/server/src/http.js";
import { FileStorage } from "../apps/server/src/storage.js";

type LayoServer = Awaited<ReturnType<typeof createHttpServer>>;

let serverPromise: Promise<LayoServer> | null = null;

function storageRoot() {
  return process.env.LAYO_STORAGE_DIR ?? (process.env.VERCEL ? "/tmp/layo" : undefined);
}

async function getServer(): Promise<LayoServer> {
  serverPromise ??= (async () => {
    const root = storageRoot();
    const server = createHttpServer(root ? new FileStorage(root) : undefined, { webDistDir: null });
    await server.ready();
    return server;
  })();
  return serverPromise;
}

export function resolveRoutedRequestUrl(originalUrl: string | undefined) {
  const parsed = new URL(originalUrl ?? "/api/bridge", "http://127.0.0.1");
  const routedPath = parsed.searchParams.get("__layo_path");
  if (!routedPath || !routedPath.startsWith("/") || routedPath.startsWith("//")) {
    return null;
  }

  parsed.searchParams.delete("__layo_path");
  const query = parsed.searchParams.toString();
  return query ? `${routedPath}?${query}` : routedPath;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const routedPath = resolveRoutedRequestUrl(request.url);
  if (!routedPath) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  request.url = routedPath;
  const server = await getServer();
  server.server.emit("request", request, response);
}
