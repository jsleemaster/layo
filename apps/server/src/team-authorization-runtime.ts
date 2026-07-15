import {
  createSharedTeamAuthorizationProvider,
  createTeamAuthorizationFileManager,
  createTeamAuthorizationProvider,
  parseTeamAuthorizationConfig,
  watchTeamAuthorizationConfigFile,
  type TeamAuthorizationConfig,
  type TeamAuthorizationConfigSource,
  type TeamAuthorizationFileManager,
  type TeamAuthorizationFileManagerOptions,
  type TeamAuthorizationPrincipal,
  type TeamAuthorizationProvider
} from "./team-authorization.js";
import {
  createPostgresTeamAuthorizationStateStore,
  type PostgresTeamAuthorizationOptions,
  type TeamAuthorizationStateStore
} from "./team-authorization-postgres.js";

export interface TeamAuthorizationRuntimeEnvironment {
  LAYO_LIBRARY_REGISTRY_MEMBERS_FILE?: string;
  LAYO_LIBRARY_REGISTRY_MEMBERS?: string;
  LAYO_AUTHORIZATION_DATABASE_URL?: string;
  LAYO_AUTHORIZATION_SHARED_SCOPE?: string;
}

export interface TeamAuthorizationRuntimeDependencies {
  watchConfigFile: (
    filePath: string,
    options?: { onError?: (error: Error) => void }
  ) => Promise<TeamAuthorizationConfigSource>;
  parseConfig: (input: string | undefined) => TeamAuthorizationConfig | undefined;
  createStateStore: (
    options: PostgresTeamAuthorizationOptions
  ) => Promise<TeamAuthorizationStateStore>;
  createLocalProvider: (
    config: TeamAuthorizationConfig
  ) => TeamAuthorizationProvider;
  createSharedProvider: (
    filePath: string,
    config: TeamAuthorizationConfig,
    stateStore: TeamAuthorizationStateStore,
    sharedScope: string
  ) => TeamAuthorizationProvider;
  createFileManager: (
    filePath: string,
    config: TeamAuthorizationConfig,
    options?: TeamAuthorizationFileManagerOptions
  ) => TeamAuthorizationFileManager;
}

export interface TeamAuthorizationRuntime {
  libraryRegistryAuth?: TeamAuthorizationConfig;
  authorizationProvider?: TeamAuthorizationProvider;
  teamAuthorizationManager?: TeamAuthorizationFileManager;
  shared: boolean;
  close(): Promise<void>;
  settled(): Promise<void>;
}

const defaultDependencies: TeamAuthorizationRuntimeDependencies = {
  watchConfigFile: watchTeamAuthorizationConfigFile,
  parseConfig: parseTeamAuthorizationConfig,
  createStateStore: createPostgresTeamAuthorizationStateStore,
  createLocalProvider: createTeamAuthorizationProvider,
  createSharedProvider: createSharedTeamAuthorizationProvider,
  createFileManager: createTeamAuthorizationFileManager
};

function unavailableAfterClose(): Error {
  return Object.assign(new Error("team authorization runtime is closing"), {
    code: "EUNAVAILABLE",
    statusCode: 503
  });
}

function wrapSharedProvider(
  provider: TeamAuthorizationProvider,
  track: <T>(operation: () => T | Promise<T>) => Promise<T>
): TeamAuthorizationProvider {
  return {
    authenticate: (principal: TeamAuthorizationPrincipal, now?: Date) =>
      track(() => provider.authenticate(principal, now))
  };
}

function wrapSharedManager(
  manager: TeamAuthorizationFileManager,
  track: <T>(operation: () => T | Promise<T>) => Promise<T>
): TeamAuthorizationFileManager {
  return {
    manageTokens: (principal, operation) =>
      track(() => manager.manageTokens(principal, operation)),
    listTokens: (userId) =>
      track(() => manager.listTokens(userId)),
    createToken: (userId, input) =>
      track(() => manager.createToken(userId, input)),
    revokeToken: (userId, tokenId) =>
      track(() => manager.revokeToken(userId, tokenId))
  };
}

export async function createTeamAuthorizationRuntime(
  environment: TeamAuthorizationRuntimeEnvironment,
  dependencies: TeamAuthorizationRuntimeDependencies = defaultDependencies
): Promise<TeamAuthorizationRuntime> {
  const databaseUrl =
    environment.LAYO_AUTHORIZATION_DATABASE_URL?.trim() || undefined;
  const sharedScope =
    environment.LAYO_AUTHORIZATION_SHARED_SCOPE?.trim() || undefined;
  const databaseConfigured = databaseUrl !== undefined;
  const scopeConfigured = sharedScope !== undefined;
  if (databaseConfigured !== scopeConfigured) {
    const missing = databaseConfigured
      ? "LAYO_AUTHORIZATION_SHARED_SCOPE"
      : "LAYO_AUTHORIZATION_DATABASE_URL";
    throw new Error(
      `${missing} is required when shared authorization is configured`
    );
  }

  const shared = databaseConfigured && scopeConfigured;
  const membersFile =
    environment.LAYO_LIBRARY_REGISTRY_MEMBERS_FILE?.trim() || undefined;
  if (shared && !membersFile) {
    throw new Error(
      "LAYO_LIBRARY_REGISTRY_MEMBERS_FILE is required for shared authorization"
    );
  }

  let source: TeamAuthorizationConfigSource | undefined;
  let stateStore: TeamAuthorizationStateStore | undefined;
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const inFlight = new Set<Promise<unknown>>();

  const track = <T>(operation: () => T | Promise<T>): Promise<T> => {
    if (closing) {
      return Promise.reject(unavailableAfterClose());
    }
    const promise = Promise.resolve().then(operation);
    inFlight.add(promise);
    void promise.then(
      () => inFlight.delete(promise),
      () => inFlight.delete(promise)
    );
    return promise;
  };

  const drain = async (): Promise<void> => {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight]);
    }
  };

  const closeOpenedResources = async (): Promise<void> => {
    source?.close();
    await source?.settled().catch(() => undefined);
    await drain();
    await stateStore?.close();
  };

  try {
    source = membersFile
      ? await dependencies.watchConfigFile(membersFile, {
          onError: (error) =>
            console.error("library registry authorization reload failed", error)
        })
      : undefined;
    const libraryRegistryAuth =
      source?.config
      ?? dependencies.parseConfig(environment.LAYO_LIBRARY_REGISTRY_MEMBERS);

    if (!shared) {
      const authorizationProvider = libraryRegistryAuth
        ? dependencies.createLocalProvider(libraryRegistryAuth)
        : undefined;
      const teamAuthorizationManager =
        source && membersFile
          ? dependencies.createFileManager(membersFile, source.config)
          : undefined;
      return {
        libraryRegistryAuth,
        authorizationProvider,
        teamAuthorizationManager,
        shared: false,
        close: async () => {
          if (closePromise) {
            return closePromise;
          }
          closing = true;
          closePromise = closeOpenedResources();
          return closePromise;
        },
        settled: async () => {
          await source?.settled();
          await drain();
        }
      };
    }

    stateStore = await dependencies.createStateStore({
      connectionString: databaseUrl!
    });
    // Purpose: reject missing, unreadable, or unbootstrapped shared authority before serving.
    await stateStore.read(sharedScope);
    const baseProvider = dependencies.createSharedProvider(
      membersFile!,
      libraryRegistryAuth!,
      stateStore,
      sharedScope
    );
    const baseManager = dependencies.createFileManager(
      membersFile!,
      libraryRegistryAuth!,
      {
        stateStore,
        sharedScope,
        scheduleSharedRefresh: (refresh) => {
          if (!closing) {
            void track(refresh).catch(() => undefined);
          }
        }
      }
    );
    const authorizationProvider = wrapSharedProvider(baseProvider, track);
    const teamAuthorizationManager = wrapSharedManager(baseManager, track);

    return {
      libraryRegistryAuth,
      authorizationProvider,
      teamAuthorizationManager,
      shared: true,
      close: async () => {
        if (closePromise) {
          return closePromise;
        }
        closing = true;
        closePromise = closeOpenedResources();
        return closePromise;
      },
      settled: async () => {
        await source?.settled();
        await drain();
      }
    };
  } catch (error) {
    closing = true;
    await closeOpenedResources().catch(() => undefined);
    throw error;
  }
}
