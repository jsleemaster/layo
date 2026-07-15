import { expect, test, vi } from "vitest";
import { startHttpServer } from "./http-startup";
import type { TeamAuthorizationRuntime } from "./team-authorization-runtime";

test("HTTP startup closes authorization resources when server construction fails", async () => {
  const runtime = {
    shared: true,
    close: vi.fn(async () => undefined),
    settled: vi.fn(async () => undefined)
  } as TeamAuthorizationRuntime;
  const constructionFailure = new Error("server construction failed");
  const createServer = vi.fn(() => {
    throw constructionFailure;
  });

  await expect(
    startHttpServer(
      { HOST: "127.0.0.1", PORT: "4317" },
      {
        createAuthorizationRuntime: vi.fn(async () => runtime),
        createServer
      }
    )
  ).rejects.toBe(constructionFailure);

  expect(runtime.close).toHaveBeenCalledOnce();
});

test("HTTP listen failure closes the server and authorization runtime", async () => {
  const runtime = {
    shared: false,
    close: vi.fn(async () => undefined),
    settled: vi.fn(async () => undefined)
  } as TeamAuthorizationRuntime;
  const listenFailure = new Error("listen failed");
  const server = {
    addHook: vi.fn(),
    listen: vi.fn(async () => {
      throw listenFailure;
    }),
    close: vi.fn(async () => undefined)
  };

  await expect(
    startHttpServer(
      { HOST: "127.0.0.1", PORT: "4317" },
      {
        createAuthorizationRuntime: vi.fn(async () => runtime),
        createServer: vi.fn(() => server)
      }
    )
  ).rejects.toBe(listenFailure);

  expect(server.close).toHaveBeenCalledOnce();
  expect(runtime.close).toHaveBeenCalledOnce();
});

test("HTTP shutdown closes authorization runtime when server close rejects", async () => {
  const runtime = {
    shared: true,
    close: vi.fn(async () => undefined),
    settled: vi.fn(async () => undefined)
  } as TeamAuthorizationRuntime;
  const closeFailure = new Error("close failed");
  const server = {
    addHook: vi.fn(),
    listen: vi.fn(async () => undefined),
    close: vi.fn(async () => {
      throw closeFailure;
    })
  };
  const started = await startHttpServer(
    { HOST: "127.0.0.1", PORT: "4317" },
    {
      createAuthorizationRuntime: vi.fn(async () => runtime),
      createServer: vi.fn(() => server)
    }
  );

  await expect(started.shutdown()).rejects.toBe(closeFailure);

  expect(runtime.close).toHaveBeenCalledOnce();
});
