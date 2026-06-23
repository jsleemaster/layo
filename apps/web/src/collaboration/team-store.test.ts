import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { createTeamManifest } from "@layo/collaboration";
import {
  createTeamManifestDownload,
  createIndexedDbTeamStore,
  exportTeamManifest,
  fetchTeamManifestFromUrl,
  importTeamManifest
} from "./team-store";

describe("indexeddb team store", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("layo-collaboration-test");
  });

  test("saves, lists, and loads the current team", async () => {
    const store = createIndexedDbTeamStore({
      databaseName: "layo-collaboration-test",
      indexedDB
    });
    const team = createTeamManifest({
      name: "Design Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      }
    });

    await store.saveTeam(team);
    await store.setCurrentTeam(team.teamId);

    expect(await store.listTeams()).toEqual([team]);
    expect(await store.getTeam(team.teamId)).toEqual(team);
    expect(await store.getCurrentTeam()).toEqual(team);
  });

  test("imports and exports a manifest as JSON", () => {
    const team = createTeamManifest({
      name: "Export Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      }
    });

    expect(importTeamManifest(exportTeamManifest(team))).toEqual(team);
  });

  test("redacts runtime relay credentials from exported manifests", () => {
    const team = createTeamManifest({
      name: "Secret Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      },
      sync: {
        mode: "websocket",
        relayUrl: "ws://127.0.0.1:4327",
        token: "plain-runtime-token",
        memberTokenHashes: [
          {
            userId: "user-1",
            tokenHash: "sha256-user-1",
            role: "owner"
          }
        ]
      }
    });

    const exported = exportTeamManifest(team);

    expect(exported).not.toContain("plain-runtime-token");
    expect(exported).toContain("sha256-user-1");
    expect(importTeamManifest(exported).sync).toEqual({
      mode: "websocket",
      roomPrefix: "layo",
      relayUrl: "ws://127.0.0.1:4327"
    });
  });

  test("creates a stable manifest download artifact", () => {
    const team = createTeamManifest({
      teamId: "team-download",
      name: "Download Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      }
    });

    expect(createTeamManifestDownload(team)).toEqual({
      filename: "team-download-manifest.json",
      mimeType: "application/json",
      contents: exportTeamManifest(team)
    });
  });

  test("imports migrated manifest JSON from a URL fetcher", async () => {
    const legacyManifest = {
      teamId: "team-url",
      name: "URL Team",
      createdAt: "2026-06-16T00:00:00.000Z",
      currentUserId: "user-1",
      members: [
        {
          userId: "user-1",
          displayName: "Lee",
          color: "#2563eb"
        }
      ],
      documents: [],
      sync: {
        mode: "local",
        roomPrefix: "layo"
      }
    };
    const fetcher = async () =>
      new Response(JSON.stringify(legacyManifest), {
        status: 200
      });

    await expect(
      fetchTeamManifestFromUrl("https://raw.githubusercontent.com/jsleemaster/example/main/team.json", fetcher)
    ).resolves.toMatchObject({
      schemaVersion: 1,
      teamId: "team-url",
      members: [
        {
          userId: "user-1",
          displayName: "Lee",
          color: "#2563eb",
          role: "owner"
        }
      ]
    });
  });

  test("rejects unsupported manifest URL hosts and failed responses", async () => {
    await expect(
      fetchTeamManifestFromUrl("https://example.com/team.json", async () => new Response("{}", { status: 200 }))
    ).rejects.toThrow(/지원하지 않는 팀 설정 URL/);

    await expect(
      fetchTeamManifestFromUrl(
        "https://gist.githubusercontent.com/jsleemaster/example/raw/team.json",
        async () => new Response("not found", { status: 404, statusText: "Not Found" })
      )
    ).rejects.toThrow(/팀 설정을 가져오지 못했습니다/);
  });
});
