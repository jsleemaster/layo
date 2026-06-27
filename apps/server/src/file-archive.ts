export interface ZipArchiveEntry {
  path: string;
  data: Buffer;
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

export function createZipArchive(entries: ZipArchiveEntry[]): Buffer {
  const seen = new Set<string>();
  const localParts: Buffer[] = [];
  const centralRecords: CentralDirectoryRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const safePath = normalizeArchivePath(entry.path);
    if (seen.has(safePath)) {
      throw new Error(`duplicate archive path: ${safePath}`);
    }
    seen.add(safePath);
    assertZipSize(entry.data.length);

    const fileName = Buffer.from(safePath, "utf8");
    const crc = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(ZIP_STORE_METHOD, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(fileName.length, 26);
    header.writeUInt16LE(0, 28);

    localParts.push(header, fileName, entry.data);
    centralRecords.push({
      path: safePath,
      crc32: crc,
      compressedSize: entry.data.length,
      uncompressedSize: entry.data.length,
      localHeaderOffset: offset
    });
    offset += header.length + fileName.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  const centralParts: Buffer[] = [];
  for (const record of centralRecords) {
    const fileName = Buffer.from(record.path, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_DIRECTORY_HEADER_SIGNATURE, 0);
    header.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
    header.writeUInt16LE(ZIP_VERSION_NEEDED, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(ZIP_STORE_METHOD, 10);
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
  assertZipSize(centralDirectoryOffset);
  assertZipSize(centralDirectorySize);
  if (centralRecords.length > 0xffff) {
    throw new Error("too many archive entries");
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralRecords.length, 8);
  end.writeUInt16LE(centralRecords.length, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

export function readZipArchive(archive: Buffer): Map<string, Buffer> {
  const eocdOffset = findEndOfCentralDirectory(archive);
  const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > eocdOffset) {
    throw new Error("invalid archive central directory");
  }

  const entries = new Map<string, Buffer>();
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error("invalid archive central directory entry");
    }

    const compressionMethod = archive.readUInt16LE(cursor + 10);
    if (compressionMethod !== ZIP_STORE_METHOD) {
      throw new Error("unsupported compressed archive entry");
    }
    const expectedCrc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const fileNameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const pathStart = cursor + 46;
    const pathEnd = pathStart + fileNameLength;
    const safePath = normalizeArchivePath(archive.subarray(pathStart, pathEnd).toString("utf8"));

    if (compressedSize !== uncompressedSize) {
      throw new Error("invalid stored archive entry size");
    }
    if (entries.has(safePath)) {
      throw new Error(`duplicate archive path: ${safePath}`);
    }

    const data = readStoredEntryData(archive, {
      path: safePath,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      crc32: expectedCrc
    });
    entries.set(safePath, data);
    cursor = pathEnd + extraLength + commentLength;
  }

  if (cursor !== centralDirectoryEnd) {
    throw new Error("invalid archive central directory size");
  }

  return entries;
}

function readStoredEntryData(archive: Buffer, record: CentralDirectoryRecord): Buffer {
  const cursor = record.localHeaderOffset;
  if (archive.readUInt32LE(cursor) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("invalid archive local entry");
  }
  const compressionMethod = archive.readUInt16LE(cursor + 8);
  if (compressionMethod !== ZIP_STORE_METHOD) {
    throw new Error("unsupported compressed archive entry");
  }
  const fileNameLength = archive.readUInt16LE(cursor + 26);
  const extraLength = archive.readUInt16LE(cursor + 28);
  const dataStart = cursor + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + record.compressedSize;
  if (dataEnd > archive.length) {
    throw new Error("archive entry data exceeds archive size");
  }
  const data = archive.subarray(dataStart, dataEnd);
  if (crc32(data) !== record.crc32) {
    throw new Error(`archive entry checksum mismatch: ${record.path}`);
  }
  return Buffer.from(data);
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumOffset = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("invalid zip archive");
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

function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
