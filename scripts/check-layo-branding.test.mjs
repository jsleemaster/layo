import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const disallowedLegacyIdentifiers = [
  "Canvas MCP Editor",
  "canvas-mcp-editor",
  "@canvas-mcp-editor",
  ".canvas-mcp-editor",
  "캔버스 MCP 에디터"
];

const allowedSelf = "scripts/check-layo-branding.test.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((path) => path !== allowedSelf);
}

test("workspace packages use the Layo package identity", () => {
  assert.equal(readJson("package.json").name, "layo");
  assert.equal(readJson("apps/server/package.json").name, "@layo/server");
  assert.equal(readJson("apps/web/package.json").name, "@layo/web");
  assert.equal(readJson("apps/collab-relay/package.json").name, "@layo/collab-relay");
  assert.equal(readJson("packages/renderer/package.json").name, "@layo/renderer");
  assert.equal(readJson("packages/collaboration/package.json").name, "@layo/collaboration");
});

test("core runtime identifiers use Layo", () => {
  assert.match(readFileSync("apps/server/src/storage.ts", "utf8"), /\.layo/);
  assert.match(readFileSync("apps/server/src/mcp.ts", "utf8"), /name: "layo"/);
  assert.match(readFileSync("apps/web/index.html", "utf8"), /<title>Layo<\/title>/);
  assert.match(readFileSync("packages/collaboration/src/room.ts", "utf8"), /ROOM_PREFIX = "layo"/);
});

test("tracked text files do not keep the legacy product identifiers", () => {
  const offenders = [];

  for (const file of trackedFiles()) {
    const content = readFileSync(file);
    if (content.includes(0)) {
      continue;
    }

    const text = content.toString("utf8");
    for (const identifier of disallowedLegacyIdentifiers) {
      if (text.includes(identifier)) {
        offenders.push(`${file}: ${identifier}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
