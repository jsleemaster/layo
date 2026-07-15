import { createHttpServer } from "./http.js";
import {
  createTeamAuthorizationRuntime,
  type TeamAuthorizationRuntime,
  type TeamAuthorizationRuntimeEnvironment
} from "./team-authorization-runtime.js";

export interface HttpStartupEnvironment
  extends TeamAuthorizationRuntimeEnvironment {
  HOST?: string;
  PORT?: string;
}

export interface HttpStartupServer {
  addHook(name: "onClose", hook: () => Promise<void>): unknown;
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<void>;
}

export interface HttpStartupDependencies {
  createAuthorizationRuntime: (
    environment: TeamAuthorizationRuntimeEnvironment
  ) => Promise<TeamAuthorizationRuntime>;
  createServer: (
    runtime: TeamAuthorizationRuntime
  ) => HttpStartupServer;
}

export interface StartedHttpServer {
  server: HttpStartupServer;
  authorizationRuntime: TeamAuthorizationRuntime;
  shutdown(): Promise<void>;
}

const defaultDependencies: HttpStartupDependencies = {
  createAuthorizationRuntime: createTeamAuthorizationRuntime,
  createServer: (runtime) =>
    createHttpServer(undefined, {
      libraryRegistryAuth: runtime.libraryRegistryAuth,
      libraryRegistryAuthorizationProvider: runtime.authorizationProvider,
      teamAuthorizationManager: runtime.teamAuthorizationManager
    })
};

export async function startHttpServer(
  environment: HttpStartupEnvironment,
  dependencies: HttpStartupDependencies = defaultDependencies
): Promise<StartedHttpServer> {
  const authorizationRuntime =
    await dependencies.createAuthorizationRuntime(environment);
  let server: HttpStartupServer | undefined;
  let shutdownPromise: Promise<void> | undefined;

  try {
    server = dependencies.createServer(authorizationRuntime);
    server.addHook("onClose", async () => {
      // Purpose: drain authorization work after Fastify stops accepting requests.
      await authorizationRuntime.close();
    });
    await server.listen({
      host: environment.HOST ?? "127.0.0.1",
      port: Number(environment.PORT ?? 4317)
    });

    const activeServer = server;
    return {
      server: activeServer,
      authorizationRuntime,
      shutdown: () => {
        shutdownPromise ??= activeServer.close();
        return shutdownPromise;
      }
    };
  } catch (error) {
    await server?.close().catch(() => undefined);
    await authorizationRuntime.close().catch(() => undefined);
    throw error;
  }
}
