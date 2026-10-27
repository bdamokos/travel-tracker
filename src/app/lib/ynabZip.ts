import { Writable, type TransformOptions } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw, type ZlibOptions } from 'node:zlib';
import { fromBufferPromise, type Entry } from 'yauzl';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_EXTRACTED_SIZE = 5 * 1024 * 1024;
const STREAM_CHUNK_SIZE = 16 * 1024;
const INFLATE_OPTIONS: ZlibOptions & TransformOptions = {
  chunkSize: STREAM_CHUNK_SIZE,
  highWaterMark: STREAM_CHUNK_SIZE,
};

export async function extractYnabTsvFromZip(zipFile: File): Promise<string> {
  if (zipFile.size > MAX_FILE_SIZE) {
    throw new Error('Zip file too large. Maximum size is 10MB.');
  }

  const zip = await fromBufferPromise(Buffer.from(await zipFile.arrayBuffer()), {
    lazyEntries: true,
    autoClose: false,
    strictFileNames: true,
  });

  try {
    const tsvFiles = new Map<string, Entry>();
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (!name.includes('..') && !name.includes('/') && !name.includes('\\') &&
          name.toLowerCase().endsWith('.tsv')) {
        tsvFiles.set(name, entry);
      }
    }
    const names = [...tsvFiles.keys()];
    const targetName = names.find(name => /register|transaction/i.test(name)) ?? names[0];
    if (!targetName) {
      throw new Error('No TSV files found in the zip archive');
    }
    const entry = tsvFiles.get(targetName)!;
    if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) {
      throw new Error('Unsupported ZIP member encoding');
    }

    // Read compressed bytes only. Own the inflater so pipeline cancellation closes it,
    // rather than leaving a ZIP library's synchronous expansion running after rejection.
    const source = await zip.openReadStreamPromise(entry, { decodeFileData: false });
    const inflater = entry.compressionMethod === 8 ? createInflateRaw(INFLATE_OPTIONS) : undefined;
    const chunks: Buffer[] = [];
    let byteLength = 0;
    const collector = new Writable({
      highWaterMark: STREAM_CHUNK_SIZE,
      write(chunk: Buffer, _encoding, callback) {
        if (chunk.length > MAX_EXTRACTED_SIZE - byteLength) {
          const error = new Error('Extracted file too large. Maximum size is 5MB.');
          // Stop inside the current output callback, before zlib can schedule
          // another native write while pipeline propagates the collector error.
          inflater?.destroy(error);
          callback(error);
          return;
        }
        byteLength += chunk.length;
        chunks.push(chunk);
        callback();
      },
    });

    try {
      if (inflater) {
        await pipeline(source, inflater, collector);
      } else {
        await pipeline(source, collector);
      }
      if (byteLength !== entry.uncompressedSize) {
        throw new Error('Invalid ZIP member size');
      }
      const content = Buffer.concat(chunks, byteLength).toString('utf8');
      const lines = content.split('\n');
      if (lines.length < 2) {
        throw new Error('Invalid TSV file: too few lines');
      }
      if (lines[0].split('\t').length < 3) {
        throw new Error('Invalid TSV file: insufficient columns');
      }
      return content;
    } finally {
      chunks.length = 0;
    }
  } finally {
    zip.close();
  }
}
