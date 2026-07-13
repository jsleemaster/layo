import { createHttpServer } from "./http.js";
import { parseTeamAuthorizationConfig } from "./team-authorization.js";

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "127.0.0.1";
// Enables team-owned library role enforcement without storing plaintext tokens in project files.
const libraryRegistryAuth = parseTeamAuthorizationConfig(
  process.env.LAYO_LIBRARY_REGISTRY_MEMBERS
);
const server = createHttpServer(undefined, { libraryRegistryAuth });

await server.listen({ host, port });
