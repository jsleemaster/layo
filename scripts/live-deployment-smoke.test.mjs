import assert from "node:assert/strict";
import test from "node:test";
import { checkLiveDeployment } from "./live-deployment-smoke.mjs";

function textResponse(body, { status = 200, contentType = "text/html; charset=utf-8" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([["content-type", contentType]]),
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    }
  };
}

test("passes when the production URL serves the Layo Vite editor and health endpoint", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    if (String(url) === "https://layo.example/") {
      return textResponse('<!doctype html><meta name="layo-app" content="vite-editor" /><div id="root"></div>');
    }
    if (String(url) === "https://layo.example/health") {
      return textResponse('{"ok":true}', { contentType: "application/json" });
    }
    return textResponse("not found", { status: 404 });
  };

  await expectCheckResolves(
    checkLiveDeployment({
      url: "https://layo.example",
      fetcher
    })
  );
  assert.deepEqual(calls, ["https://layo.example/", "https://layo.example/health"]);
});

test("requires an explicit production URL instead of defaulting to a stale host", async () => {
  const originalUrl = process.env.LAYO_PRODUCTION_URL;
  delete process.env.LAYO_PRODUCTION_URL;

  try {
    await assert.rejects(
      checkLiveDeployment({
        fetcher: async () =>
          textResponse('<!doctype html><meta name="layo-app" content="vite-editor" /><div id="root"></div>')
      }),
      /Provide a deployment URL/
    );
  } finally {
    if (originalUrl === undefined) {
      delete process.env.LAYO_PRODUCTION_URL;
    } else {
      process.env.LAYO_PRODUCTION_URL = originalUrl;
    }
  }
});

test("rejects unrelated Next.js pages as not the Layo Vite editor", async () => {
  const fetcher = async () =>
    textResponse('<!doctype html><script src="/_next/static/chunks/main-app.js"></script><div id="__next"></div>');

  await assert.rejects(
    checkLiveDeployment({
      url: "https://layo.example",
      fetcher
    }),
    /not the Layo Vite editor/
  );
});

test("rejects deployments without a same-origin health endpoint", async () => {
  const fetcher = async (url) => {
    if (String(url) === "https://layo.example/") {
      return textResponse('<!doctype html><meta name="layo-app" content="vite-editor" /><div id="root"></div>');
    }
    return textResponse("not found", { status: 404 });
  };

  await assert.rejects(
    checkLiveDeployment({
      url: "https://layo.example",
      fetcher
    }),
    /\/health/
  );
});

async function expectCheckResolves(promise) {
  await assert.doesNotReject(promise);
}
