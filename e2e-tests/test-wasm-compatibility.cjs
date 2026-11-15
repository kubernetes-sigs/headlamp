/*
 * Copyright 2026 The Kubernetes Authors
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

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

test(
  'Go WASM and process consumers work with the Headlamp Vite configuration',
  {
    timeout: 240_000,
  },
  async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-wasm-'));
    const frontend = path.resolve(__dirname, '../frontend');
    const originalDirectory = process.cwd();
    process.chdir(frontend);
    t.after(() => process.chdir(originalDirectory));
    const publicDirectory = path.join(root, 'public');
    fs.mkdirSync(publicDirectory);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.symlinkSync(
      path.join(frontend, 'node_modules'),
      path.join(root, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><body><script type="module" src="/entry.js"></script></body></html>'
    );
    fs.writeFileSync(
      path.join(root, 'explicit-process.js'),
      "import process from 'process'; export default typeof process.nextTick;"
    );
    fs.writeFileSync(
      path.join(root, 'entry.js'),
      `
    import React from 'react';
    import { Buffer } from 'buffer';
    import { PassThrough } from 'stream';
    import explicitNextTick from './explicit-process.js';
    import './wasm_exec.js';
    window.compatibility = {
      react: typeof React.createElement,
      nextTick: typeof process.nextTick,
      explicitNextTick,
      browser: process.browser,
    };
    const stream = new PassThrough();
    stream.on('data', data => { window.streamOutput = data.toString(); });
    stream.end(Buffer.from('stream-ok'));
    (async () => {
      const go = new globalThis.Go();
      go.exit = code => { window.goExit = code; };
      try {
        const name = new URLSearchParams(location.search).get('module');
        const {instance} = await WebAssembly.instantiateStreaming(fetch('/' + name), go.importObject);
        await go.run(instance);
      } catch(error) {
        window.goError = String(error);
      } finally {
        window.goDone = true;
      }
    })();
  `
    );
    fs.writeFileSync(
      path.join(root, 'probe.go'),
      `package main
import (
  _ "embed"
  "os"
  "syscall/js"
)
//go:embed payload.bin
var payload []byte
func main() {
  js.Global().Set("wasmProbe", js.ValueOf(map[string]interface{}{
    "bytes": len(payload),
    "last": int(payload[len(payload)-1]),
    "pid": os.Getpid(),
  }))
}
`
    );
    const goRoot = execFileSync('go', ['env', 'GOROOT'], {
      encoding: 'utf8',
      timeout: 30_000,
    }).trim();
    fs.copyFileSync(path.join(goRoot, 'lib/wasm/wasm_exec.js'), path.join(root, 'wasm_exec.js'));
    const modules = [
      ['small.wasm', 1],
      ['large.wasm', 66 * 1024 * 1024],
    ];
    for (const [name, length] of modules) {
      fs.writeFileSync(path.join(root, 'payload.bin'), Buffer.alloc(length, 37));
      execFileSync('go', ['build', '-o', path.join(publicDirectory, name), 'probe.go'], {
        cwd: root,
        env: { ...process.env, GOOS: 'js', GOARCH: 'wasm', CGO_ENABLED: '0' },
        timeout: 120_000,
      });
    }
    assert.ok(fs.statSync(path.join(publicDirectory, 'large.wasm')).size > 64 * 1024 * 1024);
    console.log(
      'Compiled Go WASM fixtures, large module bytes:',
      fs.statSync(path.join(publicDirectory, 'large.wasm')).size
    );
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
    t.after(() => browser.close());
    const { createServer, build, preview } = await import('vite');
    const options = {
      configFile: path.join(frontend, 'vite.config.ts'),
      root,
      publicDir: publicDirectory,
      cacheDir: path.join(root, '.vite'),
      server: { host: '127.0.0.1', port: 0, open: false },
      build: { outDir: path.join(root, 'dist'), emptyOutDir: true },
      logLevel: 'warn',
    };
    for (const mode of ['development', 'production']) {
      await t.test(mode, async t => {
        let server;
        if (mode === 'development') {
          server = await createServer(options);
          await server.listen();
        } else {
          await build(options);
          server = await preview({
            ...options,
            preview: { host: '127.0.0.1', port: 0, open: false },
          });
        }
        t.after(() => server.close());
        const url = server.resolvedUrls.local[0];
        for (const [name, length] of modules) {
          await t.test(name, async () => {
            const page = await browser.newPage();
            const errors = [];
            page.on('console', message => {
              if (message.text().includes('panic:')) errors.push(message.text());
            });
            try {
              await page.goto(url + '?module=' + name);
              await page.waitForFunction(() => window.goDone === true, undefined, {
                timeout: 60_000,
              });
              const result = await page.evaluate(() => ({
                exit: window.goExit,
                error: window.goError,
                probe: window.wasmProbe,
                compatibility: window.compatibility,
                stream: window.streamOutput,
              }));
              assert.equal(result.exit, 0, JSON.stringify({ ...result, errors }));
              assert.deepEqual(result.probe, { bytes: length, last: 37, pid: -1 });
              assert.deepEqual(result.compatibility, {
                react: 'function',
                nextTick: 'function',
                explicitNextTick: 'function',
                browser: true,
              });
              assert.equal(result.stream, 'stream-ok');
            } finally {
              await page.close();
            }
          });
        }
      });
    }
  }
);
