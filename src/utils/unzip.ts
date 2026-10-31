/**
 * 轻量 ZIP 解包器，与 {@link createZip} 配套，用于上传认证文件 ZIP 包时在前端提取条目。
 *
 * 支持 store（0）与 deflate（8）两种压缩方式；deflate 通过浏览器原生
 * `DecompressionStream('deflate-raw')` 解压，无需第三方依赖。
 * 不支持：加密条目、Zip64、分卷压缩包（显式报错）。
 */

import { crc32 } from './zip.ts';

export type ExtractedZipEntry = {
  /** 条目名（已把 `\` 归一化为 `/`，保留原始路径结构） */
  name: string;
  /** 条目内容（已解压） */
  data: Uint8Array<ArrayBuffer>;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x0001;

class ZipParseError extends Error {}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 解析 ZIP 归档并返回全部文件条目（自动跳过目录条目）。 */
export async function extractZipEntries(
  archive: Uint8Array<ArrayBuffer>
): Promise<ExtractedZipEntry[]> {
  if (archive.byteLength < EOCD_MIN_SIZE) {
    throw new ZipParseError('file is too small to be a zip archive');
  }

  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const eocdOffset = findEocdOffset(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries: ExtractedZipEntry[] = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ZipParseError(`corrupted central directory at entry ${i}`);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = archive.subarray(offset + 46, offset + 46 + nameLength);

    if (localHeaderOffset === 0xffffffff || compressedSize === 0xffffffff) {
      throw new ZipParseError('zip64 archives are not supported');
    }
    if ((flags & FLAG_ENCRYPTED) !== 0) {
      throw new ZipParseError(`entry "${decodeName(nameBytes)}" is encrypted`);
    }

    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (isDirectoryEntry(nameBytes, view.getUint32(offset + 38, true))) {
      offset = nextOffset;
      continue;
    }
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
      throw new ZipParseError(`entry "${decodeName(nameBytes)}" uses unsupported method ${method}`);
    }

    const data = readEntryData(view, archive, {
      localHeaderOffset,
      method,
      compressedSize,
      uncompressedSize,
    });
    const resolved = method === METHOD_DEFLATE ? await inflateRaw(data) : new Uint8Array(data);

    if (resolved.length !== uncompressedSize) {
      throw new ZipParseError(`entry "${decodeName(nameBytes)}" size mismatch after extraction`);
    }
    if (crc32(resolved) !== view.getUint32(offset + 16, true)) {
      throw new ZipParseError(`entry "${decodeName(nameBytes)}" failed CRC check`);
    }

    entries.push({ name: decodeName(nameBytes).replace(/\\/g, '/'), data: resolved });
    offset = nextOffset;
  }

  if (offset > eocdOffset) {
    throw new ZipParseError('central directory extends past end of central directory record');
  }
  return entries;
}

function findEocdOffset(view: DataView): number {
  // EOCD 注释最长 0xFFFF，从末尾向前扫描签名
  const minOffset = Math.max(0, view.byteLength - EOCD_MIN_SIZE - 0xffff);
  for (let offset = view.byteLength - EOCD_MIN_SIZE; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + EOCD_MIN_SIZE + commentLength === view.byteLength) {
      return offset;
    }
  }
  throw new ZipParseError('end of central directory record not found');
}

function readEntryData(
  view: DataView,
  archive: Uint8Array<ArrayBuffer>,
  entry: {
    localHeaderOffset: number;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
  }
): Uint8Array<ArrayBuffer> {
  if (entry.localHeaderOffset + 30 > view.byteLength) {
    throw new ZipParseError('local file header out of range');
  }
  if (view.getUint32(entry.localHeaderOffset, true) !== LOCAL_SIGNATURE) {
    throw new ZipParseError('corrupted local file header');
  }
  const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const start = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > view.byteLength) {
    throw new ZipParseError('entry data out of range');
  }
  return archive.slice(start, end);
}

function isDirectoryEntry(nameBytes: Uint8Array, externalAttributes: number): boolean {
  // 目录条目：外部属性目录位（MS-DOS 0x10），或名称以 / 结尾
  if ((externalAttributes & 0x10) !== 0 && (externalAttributes >>> 16) === 0) {
    return true;
  }
  return nameBytes.length > 0 && (nameBytes[nameBytes.length - 1] === 0x2f || nameBytes[nameBytes.length - 1] === 0x5c);
}

function decodeName(nameBytes: Uint8Array): string {
  return new TextDecoder().decode(nameBytes);
}
