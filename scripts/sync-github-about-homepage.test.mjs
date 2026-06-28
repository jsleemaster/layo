import assert from "node:assert/strict";
import test from "node:test";
import { syncGithubAboutHomepage } from "./sync-github-about-homepage.mjs";

function textResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    }
  };
}

test("patches GitHub About only after the Vercel URL passes the live Layo smoke check", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body });
    if (String(url) === "https://preview-layo.vercel.app/") {
      return textResponse('<!doctype html><meta name="layo-app" content="vite-editor" /><div id="root"></div>');
    }
    if (String(url) === "https://preview-layo.vercel.app/health") {
      return textResponse('{"ok":true}');
    }
    if (String(url) === "https://api.github.com/repos/jsleemaster/layo") {
      assert.equal(init.method, "PATCH");
      assert.equal(init.headers.Authorization, "Bearer repo-admin-token");
      assert.deepEqual(JSON.parse(init.body), {
        homepage: "https://preview-layo.vercel.app/"
      });
      return textResponse('{"homepage":"https://preview-layo.vercel.app/"}');
    }
    return textResponse("not found", { status: 404 });
  };

  const result = await syncGithubAboutHomepage({
    repository: "jsleemaster/layo",
    token: "repo-admin-token",
    url: "https://preview-layo.vercel.app",
    fetcher
  });

  assert.equal(result.homepage, "https://preview-layo.vercel.app/");
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      "GET https://preview-layo.vercel.app/",
      "GET https://preview-layo.vercel.app/health",
      "PATCH https://api.github.com/repos/jsleemaster/layo"
    ]
  );
});

test("does not patch GitHub About when the Vercel URL is not the Layo editor", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    if (String(url) === "https://layo.vercel.app/") {
      return textResponse('<!doctype html><script src="/_next/static/chunks/main-app.js"></script><div id="__next"></div>');
    }
    throw new Error(`unexpected fetch ${init.method ?? "GET"} ${url}`);
  };

  await assert.rejects(
    syncGithubAboutHomepage({
      repository: "jsleemaster/layo",
      token: "repo-admin-token",
      url: "https://layo.vercel.app",
      fetcher
    }),
    /not the Layo Vite editor/
  );

  assert.deepEqual(calls, [{ url: "https://layo.vercel.app/", method: "GET" }]);
});

test("requires repository, token, and deployment URL before updating GitHub About", async () => {
  await assert.rejects(
    syncGithubAboutHomepage({
      repository: "",
      token: "repo-admin-token",
      url: "https://preview-layo.vercel.app",
      fetcher: async () => textResponse("{}")
    }),
    /repository/
  );
  await assert.rejects(
    syncGithubAboutHomepage({
      repository: "jsleemaster/layo",
      token: "",
      url: "https://preview-layo.vercel.app",
      fetcher: async () => textResponse("{}")
    }),
    /token/
  );
  await assert.rejects(
    syncGithubAboutHomepage({
      repository: "jsleemaster/layo",
      token: "repo-admin-token",
      url: "",
      fetcher: async () => textResponse("{}")
    }),
    /deployment URL/
  );
});
