import { describe, expect, it } from "vitest";
import { resolveVercelBridgeRequestUrl } from "./vercel-bridge-url";

describe("resolveVercelBridgeRequestUrl", () => {
  it("restores a nested Fastify path and preserves caller query parameters", () => {
    expect(
      resolveVercelBridgeRequestUrl(
        "/api/bridge?__layo_path=%2Faccount%2Fauthorization-audit&afterId=9007199254740994&limit=25"
      )
    ).toBe("/account/authorization-audit?afterId=9007199254740994&limit=25");
  });

  it("rejects missing, absolute, and protocol-relative internal paths", () => {
    expect(resolveVercelBridgeRequestUrl("/api/bridge")).toBeNull();
    expect(resolveVercelBridgeRequestUrl("/api/bridge?__layo_path=https%3A%2F%2Fexample.com")).toBeNull();
    expect(resolveVercelBridgeRequestUrl("/api/bridge?__layo_path=%2F%2Fexample.com")).toBeNull();
  });
});
