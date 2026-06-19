import { describe, expect, test } from "vitest";
import { createTeamAssetId, createTeamAssetMetadata } from "./assets";

describe("team collaboration assets", () => {
  test("creates stable asset ids from content hashes", () => {
    expect(createTeamAssetId("sha256:abc123")).toBe("asset-sha256-abc123");
  });

  test("normalizes duplicate image metadata to the same asset id", () => {
    const first = createTeamAssetMetadata({
      name: "Paste.png",
      mimeType: "image/png",
      byteLength: 128,
      hash: "sha256:abc123"
    });
    const second = createTeamAssetMetadata({
      name: "Paste Copy.png",
      mimeType: "image/png",
      byteLength: 128,
      hash: "sha256:abc123"
    });

    expect(first.assetId).toBe(second.assetId);
    expect(first).toMatchObject({
      assetId: "asset-sha256-abc123",
      mimeType: "image/png",
      byteLength: 128,
      hash: "sha256:abc123"
    });
  });
});
