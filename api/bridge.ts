import type { IncomingMessage, ServerResponse } from "node:http";
import { createHttpServer } from "../apps/server/src/http.js";
import { FileStorage } from "../apps/server/src/storage.js";
import { resolveVercelBridgeRequestUrl } from "../apps/server/src/vercel-bridge-url.js";

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

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const routedPath = resolveVercelBridgeRequestUrl(request.url);
  if (!routedPath) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  request.url = routedPath;
  const server = await getServer();
  server.server.emit("request", request, response);
}
