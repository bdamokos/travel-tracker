/** @jest-environment node */

import JSZip from 'jszip';
import type { InflateRaw } from 'node:zlib';
import { extractYnabTsvFromZip } from '@/app/lib/ynabZip';

const LIMIT = 5 * 1024 * 1024;
const SIZE_ERROR = 'Extracted file too large. Maximum size is 5MB.';
const mockInflaters: {
  stream: InflateRaw;
  bytes: number;
  pending: number;
  rejected: boolean;
  callbacksAfterRejection: number;
}[] = [];

jest.mock('node:zlib', () => {
  const actual = jest.requireActual<typeof import('node:zlib')>('node:zlib');
  return {
    ...actual,
    createInflateRaw: (...args: Parameters<typeof actual.createInflateRaw>) => {
      // Test-only native instrumentation: stream.close alone can precede the
      // completion callback of an already-issued native zlib operation.
      type NativeHandle = {
        init: (...args: unknown[]) => unknown;
        write: (...args: unknown[]) => unknown;
      };
      const dummy = actual.createInflateRaw();
      const prototype = Object.getPrototypeOf((dummy as unknown as { _handle: NativeHandle })._handle) as NativeHandle;
      dummy.destroy();
      const init = prototype.init;
      const counts = { bytes: 0, pending: 0, rejected: false, callbacksAfterRejection: 0 };
      prototype.init = function (...initArgs: unknown[]): unknown {
        const callback = initArgs[5] as (...args: unknown[]) => unknown;
        initArgs[5] = function (this: unknown, ...callbackArgs: unknown[]): unknown {
          counts.pending--;
          if (counts.rejected) counts.callbacksAfterRejection++;
          return callback.apply(this, callbackArgs);
        };
        return init.apply(this, initArgs);
      };
      let stream: InflateRaw;
      try {
        stream = actual.createInflateRaw(...args);
      } finally {
        prototype.init = init;
      }
      const handle = (stream as unknown as { _handle: NativeHandle })._handle;
      const write = handle.write;
      handle.write = function (...writeArgs: unknown[]): unknown {
        counts.pending++;
        return write.apply(this, writeArgs);
      };
      const record = Object.assign(counts, { stream });
      stream.on('data', (chunk: Buffer) => { record.bytes += chunk.length; });
      mockInflaters.push(record);
      return stream;
    },
  };
});

async function archive(
  files: Record<string, string | Buffer>,
  compression: 'STORE' | 'DEFLATE' = 'DEFLATE',
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer', compression });
}

function upload(bytes: Buffer): File {
  // Avoid copying into a multipart body for focused extraction tests.
  return { size: bytes.length, arrayBuffer: async () => bytes } as unknown as File;
}

function tsvWithBytes(length: number): string {
  const header = 'A\tB\tC\n';
  return header + 'a'.repeat(length - header.length);
}

describe('bounded YNAB ZIP extraction', () => {
  beforeEach(() => { mockInflaters.length = 0; });

  it.each(['STORE', 'DEFLATE'] as const)('accepts exactly 5MiB and rejects one extra byte (%s)', async compression => {
    const valid = tsvWithBytes(LIMIT);
    await expect(extractYnabTsvFromZip(upload(await archive({ 'Register.tsv': valid }, compression))))
      .resolves.toBe(valid);
    await expect(extractYnabTsvFromZip(upload(await archive({ 'Register.tsv': valid + 'a' }, compression))))
      .rejects.toThrow(SIZE_ERROR);
  });

  it('counts UTF-8 bytes rather than UTF-16 string units', async () => {
    const header = 'A\tB\tC\n';
    const valid = header + 'é'.repeat((LIMIT - header.length) / 2);
    expect(Buffer.byteLength(valid)).toBe(LIMIT);
    await expect(extractYnabTsvFromZip(upload(await archive({ 'Register.tsv': valid })))).resolves.toBe(valid);
    const invalid = valid + 'é';
    expect(invalid.length).toBeLessThan(LIMIT);
    await expect(extractYnabTsvFromZip(upload(await archive({ 'Register.tsv': invalid })))).rejects.toThrow(SIZE_ERROR);
  });

  it.each([false, true])('cancels native inflation with bounded overshoot and waits for closure (false size header: %s)', async lieAboutSize => {
    const bytes = await archive({ 'Register.tsv': tsvWithBytes(LIMIT + 256 * 1024) });
    expect(bytes.length).toBeLessThan(10 * 1024);
    if (lieAboutSize) {
      // The central-directory size is attacker controlled; actual output must govern.
      const centralOffset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      bytes.writeUInt32LE(1, centralOffset + 24);
    }
    await expect(extractYnabTsvFromZip(upload(bytes))).rejects.toThrow(SIZE_ERROR);
    expect(mockInflaters).toHaveLength(1);
    const record = mockInflaters[0];
    record.rejected = true;
    expect(record.bytes).toBeGreaterThan(LIMIT);
    expect(record.bytes).toBeLessThanOrEqual(LIMIT + 2 * 16 * 1024);
    expect(record.stream.destroyed).toBe(true);
    expect(record.stream.closed).toBe(true);
    expect(record.pending).toBe(0);
    const atRejection = record.bytes;
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(record.bytes).toBe(atRejection);
    expect(record.callbacksAfterRejection).toBe(0);
  });

  it('preserves UTF-8, BOM, CRLF and multibyte characters across output chunks', async () => {
    const text = '\uFEFFA\tB\tC\r\n' + 'a'.repeat(16373) + '😀東京é\r\n';
    await expect(extractYnabTsvFromZip(upload(await archive({ 'Register.TSV': text })))).resolves.toBe(text);
  });

  it('selects the first register/transaction match and ignores nested/non-TSV members without inflating them', async () => {
    const first = 'A\tB\tC\ntransaction';
    const bytes = await archive({
      'notes.tsv': 'A\tB\tC\nnotes',
      'folder/Register.tsv': 'a'.repeat(LIMIT + 1),
      'readme.txt': 'a'.repeat(LIMIT + 1),
      'Transactions.TSV': first,
      'Register.tsv': 'A\tB\tC\nregister',
    });
    await expect(extractYnabTsvFromZip(upload(bytes))).resolves.toBe(first);
    expect(mockInflaters).toHaveLength(1);
    expect(mockInflaters[0].bytes).toBe(Buffer.byteLength(first));
  });

  it('falls back to the first top-level TSV', async () => {
    const first = 'A\tB\tC\nfirst';
    await expect(extractYnabTsvFromZip(upload(await archive({ 'one.tsv': first, 'two.tsv': 'A\tB\tC\nsecond' })))).resolves.toBe(first);
  });

  it('rejects archives without a top-level TSV and malformed archives', async () => {
    await expect(extractYnabTsvFromZip(upload(await archive({ 'folder/Register.tsv': 'A\tB\tC\nvalue' })))).rejects.toThrow('No TSV files');
    await expect(extractYnabTsvFromZip(upload(Buffer.from('not a zip')))).rejects.toThrow();
  });

  it.each([
    ['A\tB\tC', 'too few lines'],
    ['A\tB\nvalue', 'insufficient columns'],
  ])('preserves TSV validation for %j', async (text, error) => {
    await expect(extractYnabTsvFromZip(upload(await archive({ 'Register.tsv': text })))).rejects.toThrow(error);
  });

  it('rejects a compressed upload over 10MiB before reading it', async () => {
    const arrayBuffer = jest.fn();
    await expect(extractYnabTsvFromZip({ size: 10 * 1024 * 1024 + 1, arrayBuffer } as unknown as File))
      .rejects.toThrow('Zip file too large');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects corrupt deflate data and inconsistent output length', async () => {
    const bytes = await archive({ 'Register.tsv': 'A\tB\tC\nvalid' });
    const centralOffset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(1, centralOffset + 24);
    await expect(extractYnabTsvFromZip(upload(bytes))).rejects.toThrow('Invalid ZIP member size');
    const dataOffset = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
    bytes[dataOffset] = 0x07; // Reserved DEFLATE block type.
    await expect(extractYnabTsvFromZip(upload(bytes))).rejects.toThrow();
    expect(mockInflaters.every(({ stream }) => stream.closed)).toBe(true);
  });
});
