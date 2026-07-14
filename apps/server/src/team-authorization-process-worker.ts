import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  createTeamAuthorizationFileManager,
  watchTeamAuthorizationConfigFile
} from "./team-authorization.js";

const [mode, configPath, tokenId, tokenSecret, releasePath] = process.argv.slice(2);
if (
  (mode !== "create" && mode !== "revoke")
  || !configPath
  || !tokenId
  || !tokenSecret
  || !releasePath
) {
  throw new Error(
    "token process worker requires mode, configPath, tokenId, tokenSecret, and releasePath"
  );
}

const source = await watchTeamAuthorizationConfigFile(configPath, {
  pollIntervalMs: 60_000
});
const manager = createTeamAuthorizationFileManager(configPath, source.config, {
  now: () => new Date("2026-07-14T12:00:00.000Z"),
  generateId: () => tokenId,
  generateSecret: () => tokenSecret
});

try {
  process.stdout.write("ready\\n");
  while (!existsSync(releasePath)) {
    await delay(10);
  }
  if (mode === "create") {
    await manager.createToken("owner-user", {
      name: `Concurrent ${tokenId}`,
      expiresInDays: 30
    });
  } else {
    await manager.revokeToken("owner-user", tokenId);
  }
  process.stdout.write("done\\n");
} finally {
  source.close();
}
