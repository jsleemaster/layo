import { createHttpServer } from "./http.js";
import { createTeamAuthorizationRuntime } from "./team-authorization-runtime.js";

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "127.0.0.1";
// Purpose: configure optional team-owned shared authorization before accepting requests.
const authorizationRuntime = await createTeamAuthorizationRuntime(process.env);
const server = createHttpServer(undefined, {
  libraryRegistryAuth: authorizationRuntime.libraryRegistryAuth,
  libraryRegistryAuthorizationProvider:
    authorizationRuntime.authorizationProvider,
  teamAuthorizationManager: authorizationRuntime.teamAuthorizationManager
});

server.addHook("onClose", async () => {
  // Purpose: drain authorization work and close its pool after Fastify stops requests.
  await authorizationRuntime.close();
});

let shutdownPromise: Promise<void> | undefined;
const shutdown = (): Promise<void> => {
  shutdownPromise ??= server.close();
  return shutdownPromise;
};
const onSignal = () => {
  void shutdown().catch((error) => {
    console.error("Layo server shutdown failed", error);
    process.exitCode = 1;
  });
};
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

try {
  await server.listen({ host, port });
} catch (error) {
  await shutdown().catch(() => authorizationRuntime.close());
  throw error;
}
