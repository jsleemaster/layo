import { describe, expect, test } from "vitest";
import {
  createTeamManifest,
  parseTeamManifest,
  migrateTeamManifest,
  validateTeamManifest,
  TEAM_MANIFEST_SCHEMA_VERSION,
  type TeamManifest
} from "./team-manifest";

describe("team manifests", () => {
  test("creates a valid local team manifest", () => {
    const team = createTeamManifest({
      name: "Design Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      }
    });

    expect(team).toMatchObject({
      schemaVersion: 1,
      name: "Design Team",
      currentUserId: "user-1",
      sync: {
        mode: "local",
        roomPrefix: "canvas-mcp-editor"
      },
      permissions: {
        canEdit: true,
        canInvite: true
      }
    });
    expect(team.teamId).toMatch(/^team-/);
    expect(team.members).toEqual([
      {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb",
        role: "owner"
      }
    ]);
    expect(team.documents).toEqual([]);
    expect(team.auth).toEqual({
      relay: {
        memberTokenHashes: [],
        inviteTokenHashes: []
      }
    });
  });

  test("creates websocket auth metadata without storing plaintext relay tokens", () => {
    const team = createTeamManifest({
      name: "Relay Team",
      currentUser: {
        userId: "owner-1",
        displayName: "Owner",
        color: "#2563eb"
      },
      members: [
        {
          userId: "viewer-1",
          displayName: "Viewer",
          color: "#16a34a",
          role: "viewer"
        }
      ],
      sync: {
        mode: "websocket",
        relayUrl: "ws://127.0.0.1:4327",
        token: "runtime-secret",
        memberTokenHashes: [
          {
            userId: "owner-1",
            tokenHash: "sha256-owner",
            role: "owner"
          },
          {
            userId: "viewer-1",
            tokenHash: "sha256-viewer",
            role: "viewer"
          }
        ]
      }
    });

    expect(team.sync).toEqual({
      mode: "websocket",
      roomPrefix: "canvas-mcp-editor",
      relayUrl: "ws://127.0.0.1:4327"
    });
    expect(team.members.map((member) => [member.userId, member.role])).toEqual([
      ["owner-1", "owner"],
      ["viewer-1", "viewer"]
    ]);
    expect(team.permissions).toEqual({
      canEdit: true,
      canInvite: true
    });
    expect(team.auth.relay.memberTokenHashes).toEqual([
      {
        userId: "owner-1",
        tokenHash: "sha256-owner",
        role: "owner"
      },
      {
        userId: "viewer-1",
        tokenHash: "sha256-viewer",
        role: "viewer"
      }
    ]);
  });

  test("rejects empty team names", () => {
    expect(() =>
      createTeamManifest({
        name: " ",
        currentUser: {
          userId: "user-1",
          displayName: "Lee",
          color: "#2563eb"
        }
      })
    ).toThrow(/team name/i);
  });

  test("rejects websocket sync config without relayUrl", () => {
    expect(() =>
      createTeamManifest({
        name: "Design Team",
        currentUser: {
          userId: "user-1",
          displayName: "Lee",
          color: "#2563eb"
        },
        sync: {
          mode: "websocket",
          roomPrefix: "canvas-mcp-editor"
        }
      })
    ).toThrow(/relayUrl/i);
  });

  test("preserves imported manifest fields after validation", () => {
    const imported: TeamManifest = {
      schemaVersion: 1,
      teamId: "team-imported",
      name: "Imported Team",
      createdAt: "2026-06-16T00:00:00.000Z",
      currentUserId: "user-2",
      members: [
        {
          userId: "user-2",
          displayName: "Kim",
          color: "#16a34a",
          role: "editor"
        }
      ],
      documents: [
        {
          documentId: "sample-file",
          name: "Sample File",
          updatedAt: "2026-06-16T00:00:00.000Z"
        }
      ],
      sync: {
        mode: "websocket",
        roomPrefix: "canvas-mcp-editor",
        relayUrl: "ws://127.0.0.1:4327"
      },
      permissions: {
        canEdit: true,
        canInvite: false
      },
      auth: {
        relay: {
          memberTokenHashes: [
            {
              userId: "user-2",
              tokenHash: "sha256-user-2",
              role: "editor"
            }
          ],
          inviteTokenHashes: []
        }
      }
    };

    expect(parseTeamManifest(imported)).toEqual(imported);
  });

  test("migrates legacy manifests without schema metadata to the current schema", () => {
    const legacyManifest = {
      teamId: "team-legacy",
      name: "Legacy Team",
      createdAt: "2026-06-16T00:00:00.000Z",
      currentUserId: "user-legacy",
      members: [
        {
          userId: "user-legacy",
          displayName: "Legacy",
          color: "#2563eb"
        }
      ],
      documents: [],
      sync: {
        mode: "websocket",
        roomPrefix: "canvas-mcp-editor",
        relayUrl: "ws://127.0.0.1:4327",
        token: "plain-relay-token",
        memberToken: "plain-member-token"
      }
    };

    expect(migrateTeamManifest(legacyManifest)).toEqual({
      schemaVersion: TEAM_MANIFEST_SCHEMA_VERSION,
      teamId: "team-legacy",
      name: "Legacy Team",
      createdAt: "2026-06-16T00:00:00.000Z",
      currentUserId: "user-legacy",
      members: [
        {
          userId: "user-legacy",
          displayName: "Legacy",
          color: "#2563eb",
          role: "owner"
        }
      ],
      documents: [],
      sync: {
        mode: "websocket",
        roomPrefix: "canvas-mcp-editor",
        relayUrl: "ws://127.0.0.1:4327"
      },
      permissions: {
        canEdit: true,
        canInvite: true
      },
      auth: {
        relay: {
          memberTokenHashes: [],
          inviteTokenHashes: []
        }
      }
    });
    expect(JSON.stringify(parseTeamManifest(legacyManifest))).not.toContain("plain-relay-token");
    expect(JSON.stringify(parseTeamManifest(legacyManifest))).not.toContain("plain-member-token");
  });

  test("returns validation issues without throwing", () => {
    const result = validateTeamManifest({
      schemaVersion: TEAM_MANIFEST_SCHEMA_VERSION,
      teamId: "",
      name: "",
      createdAt: "",
      currentUserId: "",
      members: [],
      documents: [],
      sync: {
        mode: "websocket",
        roomPrefix: "",
        relayUrl: ""
      },
      permissions: {
        canEdit: true,
        canInvite: false
      },
      auth: {
        relay: {
          memberTokenHashes: [],
          inviteTokenHashes: []
        }
      }
    });

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("invalid team manifest"),
      issues: expect.arrayContaining(["teamId", "name", "members"])
    });
  });

  test("rejects future manifest schemas with a clear validation result", () => {
    const result = validateTeamManifest({
      schemaVersion: TEAM_MANIFEST_SCHEMA_VERSION + 1,
      teamId: "team-future",
      name: "Future Team"
    });

    expect(result).toEqual({
      ok: false,
      message: "unsupported team manifest schema version: 2",
      issues: ["schemaVersion"]
    });
    expect(() =>
      parseTeamManifest({
        schemaVersion: TEAM_MANIFEST_SCHEMA_VERSION + 1,
        teamId: "team-future",
        name: "Future Team"
      })
    ).toThrow(/unsupported team manifest schema version: 2/);
  });
});
