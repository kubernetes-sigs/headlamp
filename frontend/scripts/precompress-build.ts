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
  // Never precompress index.html — the backend rewrites it at startup for
  // baseURL substitution and never serves precompressed sidecars for it.
  if (path.basename(file) === 'index.html') return false;
  return COMPRESSIBLE.has(path.extname(file).toLowerCase());
}

type PrecompressResult = {
  count: number;
  skipped: number;
  rawTotal: number;
  brTotal: number;
  orphanRemoved: number;
};

type ProcessFileResult = { raw: number; br: number; kept: boolean };

type RunPrecompressBuildOptions = {
  maxConcurrency?: number;
  processFileFn?: (file: string) => Promise<ProcessFileResult>;
};

const DEFAULT_MAX_CONCURRENCY = 4;

function collectBuildFiles(buildDir: string): { files: string[]; orphanRemoved: number } {
  const files: string[] = [];
  let orphanRemoved = 0;

  for (const file of walk(buildDir)) {
    // Remove orphan .br sidecars when the original file no longer exists.
    if (file.endsWith('.br')) {
      const original = file.slice(0, -3);
      if (!fs.existsSync(original)) {
        fs.rmSync(file, { force: true });
        orphanRemoved++;
      }
      continue;
    }

    if (file.endsWith('.gz')) continue;

    const { size } = fs.statSync(file);
    if (shouldCompress(file, size)) {
      files.push(file);
    } else {
      // Remove stale sidecar if present.
      fs.rmSync(file + '.br', { force: true });
    }
  }

  return { files, orphanRemoved };
}

async function processFile(file: string): Promise<ProcessFileResult> {
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

function normalizedConcurrency(maxConcurrency?: number): number {
  if (!Number.isInteger(maxConcurrency) || !maxConcurrency || maxConcurrency < 1) {
    return DEFAULT_MAX_CONCURRENCY;
  }

  return maxConcurrency;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let next = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const current = next;
      next++;
      if (current >= items.length) {
        return;
      }

      results[current] = await worker(items[current]);
    }
  }

  const workerCount = Math.min(maxConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

export async function runPrecompressBuild(
  buildDir: string,
  options: RunPrecompressBuildOptions = {}
): Promise<PrecompressResult> {
  if (!fs.existsSync(buildDir)) {
    throw new Error(`precompress-build: build dir not found: ${buildDir}`);
  }

  const { files, orphanRemoved } = collectBuildFiles(buildDir);
  const maxConcurrency = normalizedConcurrency(options.maxConcurrency);
  const processFileFn = options.processFileFn ?? processFile;

  // Keep read/compress concurrency bounded to avoid large memory spikes when
  // many big assets are processed in one build.
  const results = await mapWithConcurrency(files, maxConcurrency, processFileFn);

  let rawTotal = 0;
  let brTotal = 0;
  let count = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.kept) {
      rawTotal += r.raw;
      brTotal += r.br;
      count++;
    } else {
      skipped++;
    }
  }

  return { count, skipped, rawTotal, brTotal, orphanRemoved };
}

const fmt = (b: number): string => {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
};
if (process.argv[1] && ['precompress-build.ts', 'precompress-build.js'].includes(path.basename(process.argv[1]))) {
  const result = await runPrecompressBuild(BUILD_DIR);
  const ratio = result.rawTotal > 0
    ? ((1 - result.brTotal / result.rawTotal) * 100).toFixed(1)
    : '0';

  console.log(
    `precompress-build: ${result.count} files compressed (${result.skipped} skipped), ` +
    `${result.orphanRemoved} orphan .br removed, ` +
    `raw ${fmt(result.rawTotal)} -> br ${fmt(result.brTotal)} (-${ratio}%)`
  );
}
