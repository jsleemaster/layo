import { describe, expect, test } from "vitest";
import { deflateRawSync } from "node:zlib";
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

  test("reads standard deflated zip entries", () => {
    const archive = createDeflatedZipArchive([
      { path: "manifest.json", data: Buffer.from('{"source":"penpot"}', "utf8") },
      { path: "assets/logo.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
    ]);

    const entries = readZipArchive(archive);

    expect(entries.get("manifest.json")?.toString("utf8")).toBe('{"source":"penpot"}');
    expect([...(entries.get("assets/logo.png") ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

function createDeflatedZipArchive(entries: Array<{ path: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const records: Array<{
    path: string;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  }> = [];
  let offset = 0;

  for (const entry of entries) {
    const compressed = deflateRawSync(entry.data);
    const fileName = Buffer.from(entry.path, "utf8");
    const crc = crc32ForTest(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(fileName.length, 26);
    header.writeUInt16LE(0, 28);
    localParts.push(header, fileName, compressed);
    records.push({
      path: entry.path,
      crc32: crc,
      compressedSize: compressed.length,
      uncompressedSize: entry.data.length,
      localHeaderOffset: offset
    });
    offset += header.length + fileName.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  for (const record of records) {
    const fileName = Buffer.from(record.path, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(record.crc32, 16);
    header.writeUInt32LE(record.compressedSize, 20);
    header.writeUInt32LE(record.uncompressedSize, 24);
    header.writeUInt16LE(fileName.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(record.localHeaderOffset, 42);
    centralParts.push(header, fileName);
    offset += header.length + fileName.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32ForTest(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC32_TABLE_FOR_TEST[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE_FOR_TEST = new Uint32Array(
  Array.from({ length: 256 }, (_unused, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  })
);
