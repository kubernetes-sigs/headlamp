/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Walks the production build directory and writes <file>.br sidecars next to
// every compressible asset above a small threshold. The Go backend
// (`pkg/spa`) negotiates Accept-Encoding and serves these precompressed
// files directly, so no on-the-fly compression is ever needed.
//
// Only brotli is emitted: every browser Headlamp targets supports it, and
// emitting a parallel gzip set would double the post-build cost and disk
// footprint for no real benefit. The backend still negotiates `gzip` and
// will simply serve identity bytes when a `.br` sidecar is missing or the
// client only advertises gzip.

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';

const brotliCompress = promisify(zlib.brotliCompress);

const BUILD_DIR: string = path.resolve(process.argv[2] ?? 'build');
const MIN_BYTES: number = 1024; // skip tiny files: framing overhead dominates

// Extensions worth compressing. Everything else (png, woff2, jpg, ...) is
// already compressed and would only get bigger.
const COMPRESSIBLE: Set<string> = new Set([
  '.html', '.js', '.mjs', '.cjs', '.css', '.json', '.map',
  '.svg', '.txt', '.xml', '.wasm', '.ttf', '.eot', '.ico',
]);

// Brotli mode by file type: text mode for UTF-8, generic for binary.
// Quality 11 is the maximum in all cases.
const TEXT_EXTENSIONS: Set<string> = new Set([
  '.html', '.js', '.mjs', '.cjs', '.css', '.json', '.map',
  '.svg', '.txt', '.xml',
]);

function brotliMode(file: string): number {
  const ext = path.extname(file).toLowerCase();
  return TEXT_EXTENSIONS.has(ext)
    ? zlib.constants.BROTLI_MODE_TEXT
    : zlib.constants.BROTLI_MODE_GENERIC;
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function shouldCompress(file: string, size: number): boolean {
  if (size < MIN_BYTES) return false;
  if (file.endsWith('.br') || file.endsWith('.gz')) return false;
  return COMPRESSIBLE.has(path.extname(file).toLowerCase());
}

if (!fs.existsSync(BUILD_DIR)) {
  console.error(`precompress-build: build dir not found: ${BUILD_DIR}`);
  process.exit(1);
}

// Collect eligible files up-front so we can fan out in parallel.
// Files that are no longer eligible have any stale sidecar removed immediately
// so incremental rebuilds can't serve mismatched bytes.
const files: string[] = [];
for (const file of walk(BUILD_DIR)) {
  if (file.endsWith('.br') || file.endsWith('.gz')) continue;
  const { size } = fs.statSync(file);
  if (shouldCompress(file, size)) {
    files.push(file);
  } else {
    fs.rmSync(file + '.br', { force: true }); // remove stale sidecar if present
  }
}

async function processFile(
  file: string
): Promise<{ raw: number; br: number; kept: boolean }> {
  const data = await fs.promises.readFile(file);
  const compressed = await brotliCompress(data, {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: brotliMode(file),
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });

  // Only keep the sidecar if it's actually smaller than the original.
  // (Some pre-minified or already-compressed files don't compress further.)
  if (compressed.length < data.length) {
    await fs.promises.writeFile(file + '.br', compressed);
    return { raw: data.length, br: compressed.length, kept: true };
  }
  // Brotli didn't help — remove any stale sidecar so the server can't serve it.
  await fs.promises.rm(file + '.br', { force: true });
  return { raw: 0, br: 0, kept: false };
}

// zlib.brotliCompress runs on the libuv thread pool (UV_THREADPOOL_SIZE,
// default 4), so Promise.all gives real parallel compression.
const results = await Promise.all(files.map(processFile));

let rawTotal = 0;
let brTotal = 0;
let count = 0;
let skipped = 0;
for (const r of results) {
  if (r.kept) { rawTotal += r.raw; brTotal += r.br; count++; }
  else { skipped++; }
}

const fmt = (b: number): string => {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
};
const ratio = rawTotal > 0 ? ((1 - brTotal / rawTotal) * 100).toFixed(1) : '0';
console.log(
  `precompress-build: ${count} files compressed (${skipped} skipped), ` +
  `raw ${fmt(rawTotal)} -> br ${fmt(brTotal)} (-${ratio}%)`
);
