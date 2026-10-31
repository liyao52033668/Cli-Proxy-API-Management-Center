import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { buildTimestampedZipName, crc32, createZip } from './zip.ts';
import { extractZipEntries } from './unzip.ts';

const encoder = new TextEncoder();

function makeEntries() {
  return [
    { name: 'qoder-d467a88a.json', data: encoder.encode(`{"type":"qoder","token":"${'a'.repeat(50)}"}`) },
    { name: '认证文件-中文名.json', data: encoder.encode('{"type":"gemini-cli","中文":"值"}') },
    { name: 'empty.json', data: new Uint8Array(0) },
    {
      name: 'binary.bin',
      data: new Uint8Array(Array.from({ length: 4096 }, (_, i) => i % 256)),
    },
  ];
}

test('buildTimestampedZipName produces auth-files_<date>_<time>.zip', () => {
  const name = buildTimestampedZipName(new Date('2026-10-31T20:38:15'));
  assert.match(name, /^auth-files_\d{8}_\d{6}\.zip$/);
  assert.equal(buildTimestampedZipName(new Date('2026-10-31T20:38:15')), 'auth-files_20261031_203815.zip');
});

test('crc32 matches the standard test vector', () => {
  assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926);
});

test('createZip rejects empty entries', () => {
  assert.throws(() => createZip([]));
});

test('createZip -> extractZipEntries round trip (store method)', async () => {
  const entries = makeEntries();
  const archive = createZip(entries);
  const extracted = await extractZipEntries(archive);
  assert.equal(extracted.length, entries.length);
  for (let i = 0; i < entries.length; i += 1) {
    assert.equal(extracted[i].name, entries[i].name);
    assert.deepEqual(extracted[i].data, entries[i].data);
  }
});

test('extractZipEntries handles deflate-compressed entries', async () => {
  // 手工构造 method=8 的归档，压缩数据来自 node:zlib（独立于打包器实现）
  const raw = encoder.encode('{"type":"codex","payload":"' + 'x'.repeat(2000) + '"}');
  const deflated = deflateRawSync(raw);

  const name = encoder.encode('codex.json');
  const local = new Uint8Array(30 + name.length + deflated.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(8, 8, true); // method = deflate
  lv.setUint32(14, crc32(raw), true);
  lv.setUint32(18, deflated.length, true);
  lv.setUint32(22, raw.length, true);
  lv.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(deflated, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(16, crc32(raw), true);
  cv.setUint32(20, deflated.length, true);
  cv.setUint32(24, raw.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true);
  central.set(name, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);

  const archive = new Uint8Array(local.length + central.length + 22);
  archive.set(local, 0);
  archive.set(central, local.length);
  archive.set(eocd, local.length + central.length);

  const extracted = await extractZipEntries(archive);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].name, 'codex.json');
  assert.deepEqual(extracted[0].data, raw);
});

test('extractZipEntries skips directory entries and normalizes backslashes', async () => {
  const inner = encoder.encode('{"a":1}');
  const archive = createZip([
    { name: 'nested/path.json', data: inner },
    { name: 'dir\\win.json', data: inner },
    { name: 'folder/', data: new Uint8Array(0) },
  ]);
  const extracted = await extractZipEntries(archive);
  assert.deepEqual(
    extracted.map((e) => e.name),
    ['nested/path.json', 'dir/win.json']
  );
  assert.deepEqual(extracted[0].data, inner);
  assert.deepEqual(extracted[1].data, inner);
});

test('extractZipEntries rejects corrupted archives', async () => {
  const archive = createZip([{ name: 'a.json', data: encoder.encode('{}') }]);
  // 破坏 EOCD 签名
  const broken = archive.slice();
  broken[broken.length - 22] = 0x00;
  await assert.rejects(() => extractZipEntries(broken), /end of central directory/);
});
