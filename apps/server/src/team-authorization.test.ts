import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  authenticateTeamMember,
  authorizeTeamLibraryWrite,
  bearerToken,
  parseTeamAuthorizationConfig
} from "./team-authorization";

describe("team library authorization", () => {
  test("parses normalized plaintext and SHA-256 member credentials", () => {
    const tokenHash = createHash("sha256").update("hashed-token").digest("hex");
    const config = parseTeamAuthorizationConfig(
      JSON.stringify([
        {
          userId: " editor-user ",
          role: "editor",
          teamIds: [" team-beta ", "team-alpha", "team-alpha"],
          token: "editor-token"
        },
        {
          userId: "owner-user",
          role: "owner",
          teamIds: ["team-alpha"],
          tokenHash
        }
      ])
    );

    expect(config).toEqual({
      members: [
        {
          userId: "editor-user",
          role: "editor",
          teamIds: ["team-alpha", "team-beta"],
          token: "editor-token",
          tokenHash: undefined
        },
        {
          userId: "owner-user",
          role: "owner",
          teamIds: ["team-alpha"],
          token: undefined,
          tokenHash
        }
      ]
    });
    expect(authenticateTeamMember(config!, "editor-user", "editor-token")).toMatchObject({
      userId: "editor-user",
      role: "editor"
    });
    expect(authenticateTeamMember(config!, "owner-user", "hashed-token")).toMatchObject({
      userId: "owner-user",
      role: "owner"
    });
  });

  test("rejects blank member and team identifiers at configuration time", () => {
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "   ",
            role: "editor",
            teamIds: ["team-alpha"],
            token: "editor-token"
          }
        ])
      )
    ).toThrow("invalid library registry team member credential");
    expect(() =>
      parseTeamAuthorizationConfig(
        JSON.stringify([
          {
            userId: "editor-user",
            role: "editor",
            teamIds: ["   "],
            token: "editor-token"
          }
        ])
      )
    ).toThrow("invalid library registry team member credential");
  });

  test("returns stable authentication and authorization failures", () => {
    const config = {
      members: [
        {
          userId: "viewer-user",
          role: "viewer" as const,
          teamIds: ["team-alpha"],
          token: "viewer-token"
        }
      ]
    };

    expect(captureError(() => authenticateTeamMember(config, undefined, undefined))).toMatchObject({
      statusCode: 401
    });
    expect(captureError(() => authenticateTeamMember(config, "viewer-user", "wrong-token"))).toMatchObject({
      statusCode: 401
    });
    const viewer = authenticateTeamMember(config, "viewer-user", "viewer-token");
    expect(captureError(() => authorizeTeamLibraryWrite(viewer, "team-alpha"))).toMatchObject({
      statusCode: 403
    });
    expect(captureError(() => authorizeTeamLibraryWrite({ ...viewer, role: "editor" }, "team-beta"))).toMatchObject({
      statusCode: 403
    });
    expect(captureError(() => authorizeTeamLibraryWrite({ ...viewer, role: "editor" }, undefined))).toMatchObject({
      statusCode: 403
    });
  });

  test("extracts only bearer authorization headers", () => {
    expect(bearerToken("Bearer member-token")).toBe("member-token");
    expect(bearerToken(["Bearer first-token", "Bearer second-token"])).toBe("first-token");
    expect(bearerToken("Basic member-token")).toBeUndefined();
  });
});

function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("expected callback to throw");
}
