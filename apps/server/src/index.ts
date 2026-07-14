import { createHttpServer } from "./http.js";
import {
  createTeamAuthorizationFileManager,
  parseTeamAuthorizationConfig,
  watchTeamAuthorizationConfigFile
} from "./team-authorization.js";

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "127.0.0.1";
// The operator-owned file takes precedence so credential rotation does not restart the server.
const libraryRegistryAuthSource = process.env.LAYO_LIBRARY_REGISTRY_MEMBERS_FILE
  ? await watchTeamAuthorizationConfigFile(process.env.LAYO_LIBRARY_REGISTRY_MEMBERS_FILE, {
      onError: (error) => console.error("library registry authorization reload failed", error)
    })
  : undefined;
// The environment fallback keeps single-process local setups configuration-only.
const libraryRegistryAuth =
  libraryRegistryAuthSource?.config
  ?? parseTeamAuthorizationConfig(process.env.LAYO_LIBRARY_REGISTRY_MEMBERS);
// Token administration is writable only when the operator selected a watched file.\nconst teamAuthorizationManager = libraryRegistryAuthSource\n  ? createTeamAuthorizationFileManager(\n      process.env.LAYO_LIBRARY_REGISTRY_MEMBERS_FILE!,\n      libraryRegistryAuthSource.config\n    )\n  : undefined;\nconst server = createHttpServer(undefined, {\n  libraryRegistryAuth,\n  teamAuthorizationManager\n});
server.addHook("onClose", async () => {
  libraryRegistryAuthSource?.close();
});

await server.listen({ host, port });
