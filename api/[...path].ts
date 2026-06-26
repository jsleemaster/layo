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

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const originalUrl = request.url ?? "/";
  if (originalUrl === "/api") {
    request.url = "/";
  } else if (originalUrl.startsWith("/api/")) {
    request.url = originalUrl.slice(4);
  }

  const server = await getServer();
  server.server.emit("request", request, response);
}
