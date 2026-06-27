export interface ZipBlobEntry {
  path: string;
  data: Blob;
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION_NEEDED = 20;
const MAX_UINT32 = 0xffffffff;

interface CentralDirectoryRecord {
  path: string;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export async function createZipBlob(entries: ZipBlobEntry[]): Promise<Blob> {
  const seen = new Set<string>();
  const localParts: BlobPart[] = [];
  const centralRecords: CentralDirectoryRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const safePath = normalizeArchivePath(entry.path);
    if (seen.has(safePath)) {
      throw new Error(`duplicate archive path: ${safePath}`);
    }
    seen.add(safePath);

    const data = new Uint8Array(await entry.data.arrayBuffer());
    assertZipSize(data.length);
    const fileName = new TextEncoder().encode(safePath);
    const crc = crc32(data);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    view.setUint16(4, ZIP_VERSION_NEEDED, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, ZIP_STORE_METHOD, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, fileName.length, true);
    view.setUint16(28, 0, true);

    localParts.push(header, fileName, data);
    centralRecords.push({
      path: safePath,
      crc32: crc,
      compressedSize: data.length,
      uncompressedSize: data.length,
      localHeaderOffset: offset
    });
    offset += header.length + fileName.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralParts: BlobPart[] = [];
  for (const record of centralRecords) {
    const fileName = new TextEncoder().encode(record.path);
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, CENTRAL_DIRECTORY_HEADER_SIGNATURE, true);
    view.setUint16(4, ZIP_VERSION_NEEDED, true);
    view.setUint16(6, ZIP_VERSION_NEEDED, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, ZIP_STORE_METHOD, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, record.crc32, true);
    view.setUint32(20, record.compressedSize, true);
    view.setUint32(24, record.uncompressedSize, true);
    view.setUint16(28, fileName.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, record.localHeaderOffset, true);
    centralParts.push(header, fileName);
    offset += header.length + fileName.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  assertZipSize(centralDirectoryOffset);
  assertZipSize(centralDirectorySize);
  if (centralRecords.length > 0xffff) {
    throw new Error("too many archive entries");
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, centralRecords.length, true);
  endView.setUint16(10, centralRecords.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function normalizeArchivePath(rawPath: string): string {
  if (!rawPath || rawPath.includes("\0") || rawPath.includes("\\") || rawPath.startsWith("/")) {
    throw new Error("unsafe archive path");
  }
  const parts = rawPath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("unsafe archive path");
  }
  return parts.join("/");
}

function assertZipSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_UINT32) {
    throw new Error("archive entry too large");
  }
}

const CRC32_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_unused, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  })
);

function crc32(data: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
