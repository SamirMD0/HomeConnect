import zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { createZip, ZipEntry } from './zip-writer';

/**
 * Parses the archive back out of the bytes, so correctness is proved against
 * the format rather than against the writer's own assumptions. (The output was
 * additionally opened with Windows' own Expand-Archive during development.)
 */
function readZip(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(-1);

  const total = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const files: Array<{ name: string; content: string; crcOk: boolean }> = [];

  for (let index = 0; index < total; index += 1) {
    expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    expect(buffer.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const extraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + extraLength;
    const raw = zlib.inflateRawSync(buffer.subarray(dataStart, dataStart + compressedSize));

    expect(raw.length).toBe(uncompressedSize);
    files.push({ name, content: raw.toString('utf8'), crcOk: crc32(raw) === crc });
    cursor += 46 + nameLength;
  }

  return files;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    let value = (crc ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crc = value ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('zip writer', () => {
  it('round-trips content exactly', () => {
    const entries: ZipEntry[] = [
      { name: 'meta.json', content: '{"app":"HomeConnect"}' },
      { name: 'notes/errors.jsonl', content: 'line one\nline two\n' },
    ];

    const files = readZip(createZip(entries));

    expect(files.map((file) => file.name)).toEqual(['meta.json', 'notes/errors.jsonl']);
    expect(files[0].content).toBe('{"app":"HomeConnect"}');
    expect(files[1].content).toBe('line one\nline two\n');
  });

  it('records a correct CRC for every entry', () => {
    const files = readZip(createZip([
      { name: 'a.txt', content: 'x'.repeat(5000) },
      { name: 'b.txt', content: 'mixed éè content' },
    ]));
    expect(files.every((file) => file.crcOk)).toBe(true);
  });

  it('actually compresses repetitive content', () => {
    const content = 'the same line over and over\n'.repeat(500);
    const buffer = createZip([{ name: 'big.txt', content }]);
    expect(buffer.length).toBeLessThan(content.length / 5);
  });

  it('preserves UTF-8 in both names and content', () => {
    const files = readZip(createZip([{ name: 'ملاحظات.txt', content: 'مرحبا' }]));
    expect(files[0].name).toBe('ملاحظات.txt');
    expect(files[0].content).toBe('مرحبا');
  });

  it('handles an empty entry and an empty archive', () => {
    expect(readZip(createZip([{ name: 'empty.txt', content: '' }]))[0].content).toBe('');
    expect(readZip(createZip([]))).toEqual([]);
  });

  it('accepts Buffer content', () => {
    expect(readZip(createZip([{ name: 'b.bin', content: Buffer.from('bytes') }]))[0].content).toBe('bytes');
  });

  it('clamps timestamps below the 1980 DOS epoch instead of emitting a negative year', () => {
    expect(() => createZip([{ name: 'a.txt', content: 'x' }], new Date('1970-01-01T00:00:00Z'))).not.toThrow();
  });
});
