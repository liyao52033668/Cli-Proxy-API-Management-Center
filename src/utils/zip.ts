/**
 * 轻量 ZIP 打包器（store 模式，不做压缩）。
 *
 * 认证文件均为小体积 JSON，无需压缩收益；store 模式实现简单且兼容所有常见解压工具。
 * 输出标准 ZIP 结构：本地文件头 + 中央目录 + EOCD，文件名使用 UTF-8（设置通用标志位 11）。
 */

export type ZipEntry = {
  /** 归档内的文件名（UTF-8，支持中文） */
  name: string;
  /** 文件内容 */
  data: Uint8Array<ArrayBuffer>;
};

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let bit = 0; bit < 8; bit += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

/** ZIP 标准 CRC-32（IEEE 802.3），供打包与解包校验共用。 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { time: number; date: number } {
  // DOS 时间只支持 1980 年及以后
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
}

/** 把多个文件打包为一个 ZIP 归档，返回完整的归档字节。 */
export function createZip(
  entries: readonly ZipEntry[],
  timestamp = new Date()
): Uint8Array<ArrayBuffer> {
  if (entries.length === 0) {
    throw new Error('createZip: entries must not be empty');
  }
  if (entries.length > 0xffff) {
    throw new Error('createZip: too many entries');
  }

  const { time: dosTime, date: dosDate } = toDosDateTime(timestamp);
  const encoder = new TextEncoder();

  const prepared = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    return { nameBytes, data: entry.data, crc: crc32(entry.data) };
  });

  // 计算总长度：本地文件头(30) + 文件名 + 数据；中央目录(46) + 文件名；EOCD(22)
  let localPartSize = 0;
  let centralPartSize = 0;
  for (const item of prepared) {
    localPartSize += 30 + item.nameBytes.length + item.data.length;
    centralPartSize += 46 + item.nameBytes.length;
  }
  const totalSize = localPartSize + centralPartSize + 22;

  const buffer = new ArrayBuffer(totalSize);
  const output = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let offset = 0;
  for (const item of prepared) {
    // 本地文件头
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 10, true); // version needed: 1.0（store）
    view.setUint16(offset + 6, 0x0800, true); // 通用标志位 11：UTF-8 文件名
    view.setUint16(offset + 8, 0, true); // 压缩方式：store
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.data.length, true); // 压缩后大小
    view.setUint32(offset + 22, item.data.length, true); // 原始大小
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // extra 长度
    output.set(item.nameBytes, offset + 30);
    output.set(item.data, offset + 30 + item.nameBytes.length);
    offset += 30 + item.nameBytes.length + item.data.length;
  }

  const centralDirOffset = offset;
  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i];
    const localHeaderOffset = prepared
      .slice(0, i)
      .reduce((sum, prev) => sum + 30 + prev.nameBytes.length + prev.data.length, 0);

    // 中央目录项
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 10, true); // version needed
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 文件名
    view.setUint16(offset + 10, 0, true); // store
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.data.length, true);
    view.setUint32(offset + 24, item.data.length, true);
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // 注释
    view.setUint16(offset + 34, 0, true); // 起始磁盘号
    view.setUint16(offset + 36, 0, true); // 内部属性
    view.setUint32(offset + 38, 0, true); // 外部属性
    view.setUint32(offset + 42, localHeaderOffset, true);
    output.set(item.nameBytes, offset + 46);
    offset += 46 + item.nameBytes.length;
  }

  // EOCD
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, offset - centralDirOffset, true);
  view.setUint32(offset + 16, centralDirOffset, true);
  view.setUint16(offset + 20, 0, true);

  return output;
}

/** 生成形如 auth-files_20261031_203815.zip 的归档文件名。 */
export function buildTimestampedZipName(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `auth-files_${stamp}.zip`;
}
