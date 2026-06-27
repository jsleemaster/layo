import { describe, expect, test } from "vitest";
import { createZipArchive, readZipArchive } from "./file-archive";

describe("file archive zip utilities", () => {
  test("round-trips readable json and binary entries as a standard zip", () => {
    const archive = createZipArchive([
      { path: "manifest.json", data: Buffer.from('{"schemaVersion":1}', "utf8") },
      { path: "assets/asset-1.bin", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
    ]);

    expect(archive.subarray(0, 2).toString("utf8")).toBe("PK");
    const entries = readZipArchive(archive);

    expect(entries.get("manifest.json")?.toString("utf8")).toBe('{"schemaVersion":1}');
    expect([...(entries.get("assets/asset-1.bin") ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("rejects archive paths that escape the archive root", () => {
    expect(() =>
      createZipArchive([{ path: "../document.json", data: Buffer.from("{}", "utf8") }])
    ).toThrow("unsafe archive path");
  });
});
