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
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const tar = require('tar');
const { test } = require('node:test');

test('real CLI processes create, package and build an offline collection without global links', async t => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-process-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 }));
  const cli = path.resolve(__dirname, '../bin/headlamp-plugin.js');
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        HOME: directory,
        USERPROFILE: directory,
        APPDATA: directory,
        LOCALAPPDATA: directory,
        XDG_CONFIG_HOME: directory,
        XDG_DATA_HOME: directory,
      },
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result;
  };
  run(['create', 'offline-consumer', '--noinstall']);
  const plugin = path.join(directory, 'offline-consumer');
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8')).name,
    'offline-consumer'
  );
  assert.ok(!fs.existsSync(path.join(plugin, 'node_modules')));
  fs.mkdirSync(path.join(plugin, 'dist'));
  fs.writeFileSync(path.join(plugin, 'dist/main.js'), 'export const fixture = true;');
  run(['extract', plugin, path.join(directory, 'extracted')]);
  assert.equal(
    fs.readFileSync(path.join(directory, 'extracted/offline-consumer/main.js'), 'utf8'),
    'export const fixture = true;'
  );
  const result = run(['package', plugin, path.join(directory, 'archives')]);
  const archive = path.join(directory, 'archives/offline-consumer-0.1.0.tar.gz');
  assert.ok(
    result.stdout.includes(
      crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
    )
  );
  const unpacked = path.join(directory, 'unpacked');
  fs.mkdirSync(unpacked);
  await tar.x({ cwd: unpacked, file: archive, gzip: true });
  assert.equal(
    fs.readFileSync(path.join(unpacked, 'offline-consumer/main.js'), 'utf8'),
    'export const fixture = true;'
  );
  const collection = path.join(directory, 'collection');
  for (const name of ['one', 'two']) {
    const folder = path.join(collection, name);
    fs.mkdirSync(path.join(folder, 'src'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    fs.writeFileSync(path.join(folder, 'src/index.tsx'), `export const identity = "${name}";`);
  }
  run(['build', collection]);
  for (const name of ['one', 'two']) {
    const output = fs.readFileSync(path.join(collection, name, 'dist/main.js'));
    const compressed = fs.readFileSync(path.join(collection, name, 'dist/main.js.br'));
    assert.deepEqual(require('node:zlib').brotliDecompressSync(compressed), output);
    assert.match(output.toString(), new RegExp(name));
  }
});
