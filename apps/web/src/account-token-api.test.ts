import { describe, expect, test, vi } from "vitest";
import {
  createAccountToken,
  listAccountTokens,
  revokeAccountToken
} from "./account-token-api";

describe("account token browser API", () => {
  test("lists whitelisted metadata with exact credential headers", async () => {
    const fetcher = mockFetch({
      tokens: [{
        id: "token-current",
        name: "Current browser",
        createdAt: "2026-07-14T12:00:00.000Z",
        expiresAt: "2026-08-13T12:00:00.000Z",
        revokedAt: "2026-07-20T12:00:00.000Z",
        token: "must-not-escape",
        tokenHash: "must-not-escape",
        tokenHashes: ["must-not-escape"],
        arbitrary: "must-not-escape"
      }],
      activeTokenId: "token-current",
      token: "root-secret",
      arbitrary: "root-extra"
    });

    const result = await listAccountTokens(
      "owner-user",
      "active-member-token",
      fetcher as typeof fetch
    );

    expect(result).toEqual({
      tokens: [{
        id: "token-current",
        name: "Current browser",
        createdAt: "2026-07-14T12:00:00.000Z",
        expiresAt: "2026-08-13T12:00:00.000Z",
        revokedAt: "2026-07-20T12:00:00.000Z"
      }],
      activeTokenId: "token-current"
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/account\/tokens$/),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer active-member-token",
          "X-Layo-User-Id": "owner-user"
        }
      }
    );
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
  });

  test.each([
    {
      label: "duplicate token ids",
      payload: {
        tokens: [
          { id: "duplicate-token", name: "First" },
          { id: "duplicate-token", name: "Second" }
        ]
      }
    },
    {
      label: "an active token id missing from the list",
      payload: {
        tokens: [{ id: "listed-token", name: "Listed" }],
        activeTokenId: "unknown-token"
      }
    }
  ])("rejects list responses with $label", async ({ payload }) => {
    await expect(
      listAccountTokens(
        "owner-user",
        "member-token",
        mockFetch(payload) as typeof fetch
      )
    ).rejects.toThrow(/서버 응답.*올바르지/);
  });

  test.each([null, 30, 60, 90, 180] as const)(
    "creates a one-time token with Penpot expiry %s",
    async (expiresInDays) => {
      const fetcher = mockFetch(
        {
          token: "layo_pat_one_time",
          metadata: {
            id: "created-token",
            name: "Deploy automation",
            createdAt: "2026-07-14T12:00:00.000Z",
            tokenHash: "must-not-escape",
            arbitrary: "must-not-escape"
          },
          arbitrary: "must-not-escape"
        },
        201
      );

      const result = await createAccountToken(
        "owner-user",
        "active-member-token",
        { name: "Deploy automation", expiresInDays },
        fetcher as typeof fetch
      );

      expect(result).toEqual({
        token: "layo_pat_one_time",
        metadata: {
          id: "created-token",
          name: "Deploy automation",
          createdAt: "2026-07-14T12:00:00.000Z"
        }
      });
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(/\/account\/tokens$/),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer active-member-token",
            "Content-Type": "application/json",
            "X-Layo-User-Id": "owner-user"
          },
          body: JSON.stringify({
            name: "Deploy automation",
            expiresInDays
          })
        }
      );
      expect(result.token).toBe("layo_pat_one_time");
      expect(JSON.stringify(result.metadata)).not.toContain("must-not-escape");
    }
  );

  test("revokes with an explicit self-revoke confirmation body", async () => {
    const fetcher = mockFetch({
      metadata: {
        id: "token/id",
        name: "Current browser",
        revokedAt: "2026-07-14T12:00:00.000Z",
        tokenHash: "must-not-escape"
      }
    });

    const result = await revokeAccountToken(
      "owner-user",
      "active-member-token",
      "token/id",
      true,
      fetcher as typeof fetch
    );

    expect(result).toEqual({
      metadata: {
        id: "token/id",
        name: "Current browser",
        revokedAt: "2026-07-14T12:00:00.000Z"
      }
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/account\/tokens\/token%2Fid$/),
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer active-member-token",
          "Content-Type": "application/json",
          "X-Layo-User-Id": "owner-user"
        },
        body: JSON.stringify({ confirmSelfRevoke: true })
      }
    );
  });

  test.each([
    {
      label: "list",
      call: (fetcher: typeof fetch) =>
        listAccountTokens("owner-user", "member-token", fetcher),
      payload: { tokens: [{ id: "missing-name" }] }
    },
    {
      label: "create",
      call: (fetcher: typeof fetch) =>
        createAccountToken(
          "owner-user",
          "member-token",
          { name: "Deploy", expiresInDays: 30 },
          fetcher
        ),
      payload: {
        token: 123,
        metadata: { id: "created-token", name: "Deploy" }
      }
    },
    {
      label: "revoke",
      call: (fetcher: typeof fetch) =>
        revokeAccountToken("owner-user", "member-token", "token-id", false, fetcher),
      payload: { metadata: { id: "", name: "Broken" } }
    }
  ])("rejects malformed $label responses in Korean", async ({ call, payload }) => {
    await expect(call(mockFetch(payload) as typeof fetch)).rejects.toThrow(
      /서버 응답.*올바르지/
    );
  });

  test("includes server status and JSON error details in Korean failures", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "team member credentials are invalid" }),
        {
          status: 401,
          statusText: "Unauthorized",
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await expect(
      listAccountTokens("owner-user", "revoked-token", fetcher as typeof fetch)
    ).rejects.toThrow(
      "계정 토큰 목록을 불러오지 못했습니다 (401 Unauthorized): team member credentials are invalid"
    );
  });
});

function mockFetch(payload: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      statusText: status === 201 ? "Created" : "OK",
      headers: { "Content-Type": "application/json" }
    })
  );
}
