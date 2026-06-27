import { describe, expect, test } from "vitest";
import { createZipBlob } from "./zip-archive";

interface ParsedZipEntry {
  path: string;
  data: Uint8Array;
}

function readUint16(data: DataView, offset: number) {
  return data.getUint16(offset, true);
}

function readUint32(data: DataView, offset: number) {
  return data.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("invalid zip archive");
}

async function parseZipBlob(blob: Blob): Promise<ParsedZipEntry[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries: ParsedZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    expect(readUint32(view, cursor)).toBe(0x02014b50);
    expect(readUint16(view, cursor + 10)).toBe(0);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const pathLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const pathStart = cursor + 46;
    const pathEnd = pathStart + pathLength;
    const path = decoder.decode(bytes.subarray(pathStart, pathEnd));

    expect(compressedSize).toBe(uncompressedSize);
    expect(readUint32(view, localHeaderOffset)).toBe(0x04034b50);
    const localPathLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localPathLength + localExtraLength;
    entries.push({
      path,
      data: bytes.slice(dataStart, dataStart + uncompressedSize)
    });
    cursor = pathEnd + extraLength + commentLength;
  }

  return entries;
}

describe("createZipBlob", () => {
  test("creates a browser-readable zip with stable artifact paths", async () => {
    const zip = await createZipBlob([
      { path: "text-1.svg", data: new Blob(["<svg/>"], { type: "image/svg+xml" }) },
      { path: "exports/text-1@2x.png", data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) }
    ]);

    expect(zip.type).toBe("application/zip");
    const entries = await parseZipBlob(zip);

    expect(entries.map((entry) => entry.path)).toEqual(["text-1.svg", "exports/text-1@2x.png"]);
    expect(new TextDecoder().decode(entries[0].data)).toBe("<svg/>");
    expect([...entries[1].data]).toEqual([1, 2, 3]);
  });

  test("rejects duplicate and unsafe paths", async () => {
    await expect(
      createZipBlob([
        { path: "text-1.svg", data: new Blob(["one"]) },
        { path: "text-1.svg", data: new Blob(["two"]) }
      ])
    ).rejects.toThrow("duplicate archive path");

    await expect(createZipBlob([{ path: "../unsafe.svg", data: new Blob(["bad"]) }])).rejects.toThrow(
      "unsafe archive path"
    );
  });
});
