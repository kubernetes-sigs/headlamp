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
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { beforeEach, afterEach, test } = require('node:test');
const tar = require('tar');

const cli = path.resolve(__dirname, '../bin/pluginctl.js');
let directory;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pluginctl-cli-'));
  fs.mkdirSync(path.join(directory, 'tmp'));
});

afterEach(() =>
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 })
);

function run(args, status = 0, cwd = directory) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: directory,
      USERPROFILE: directory,
      APPDATA: directory,
      LOCALAPPDATA: directory,
      XDG_CONFIG_HOME: directory,
      XDG_DATA_HOME: directory,
      TMPDIR: path.join(directory, 'tmp'),
      TMP: path.join(directory, 'tmp'),
      TEMP: path.join(directory, 'tmp'),
    },
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, status, result.stdout + result.stderr);
  return result;
}

function plugin(name = 'example', extra = {}) {
  const root = path.join(directory, 'packages', name);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/main.js'), `// ${name} plugin`);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: `@example/${name}`,
      version: '1.2.3',
      ...extra,
    })
  );
  return root;
}

test('extracts one package or a directory of packages without including unrelated folders', () => {
  const first = plugin('first');
  plugin('second');
  fs.mkdirSync(path.join(directory, 'packages/empty'));
  const single = path.join(directory, 'single');
  run(['extract', first + path.sep, single]);
  assert.equal(
    fs.readFileSync(path.join(single, 'first/main.js'), 'utf8'),
    '// first plugin'
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(single, 'first/package.json'))).name,
    '@example/first'
  );

  const all = path.join(directory, 'all');
  run(['extract', path.dirname(first), all]);
  assert.deepEqual(fs.readdirSync(all).sort(), ['first', 'second']);
});

test('rejects nonexistent packages, empty directories, and invalid package metadata', () => {
  const missing = path.join(directory, 'missing');
  const empty = path.join(directory, 'empty');
  fs.mkdirSync(empty);
  assert.match(run(['extract', missing, empty], 1).stderr, /does not exist/);
  assert.match(
    run(['extract', empty, path.join(directory, 'output')], 1).stderr,
    /does not contain packages/
  );
  assert.match(run(['package', missing], 1).stderr, /does not exist/);
  assert.match(
    run(['package', empty], 1).stderr,
    /Failed to read package.json/
  );
  fs.writeFileSync(
    path.join(empty, 'package.json'),
    '{"name":"empty","version":"1"}'
  );
  assert.match(
    run(['package', empty], 1).stderr,
    /Failed to extract plugin package/
  );
});

test('packages extra files, reports the correct checksum, and refuses overwrite', async () => {
  const root = plugin('archive', {
    headlamp: {
      extraDist: {
        'config.json': './settings.json',
        'absent.txt': './missing.txt',
      },
    },
  });
  fs.writeFileSync(path.join(root, 'settings.json'), '{"enabled":true}');
  const output = path.join(directory, 'archives');
  const result = run(['package', root, output]);
  const archive = path.join(output, 'example-archive-1.2.3.tar.gz');
  assert.match(result.stderr, /extraDist source.*missing.txt.*does not exist/);
  assert.ok(
    result.stdout.includes(
      crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
    )
  );
  const extracted = path.join(directory, 'unpacked');
  fs.mkdirSync(extracted);
  await tar.x({ file: archive, cwd: extracted, gzip: true });
  assert.equal(
    fs.readFileSync(path.join(extracted, 'archive/config.json'), 'utf8'),
    '{"enabled":true}'
  );
  assert.equal(
    fs.readFileSync(path.join(extracted, 'archive/main.js'), 'utf8'),
    '// archive plugin'
  );
  assert.match(run(['package', root, output], 1).stderr, /already exists/);
});

test('packages the current directory when no paths are supplied', () => {
  const root = plugin();
  run(['package'], 0, root);
  assert.ok(fs.existsSync(path.join(root, 'example-example-1.2.3.tar.gz')));
});

test('lists real extracted plugin metadata as JSON or a table and uninstalls it', () => {
  const root = plugin('managed', {
    isManagedByHeadlampPlugin: true,
    artifacthub: {
      title: 'Managed plugin',
      url: 'https://artifacthub.io/packages/headlamp/example/managed',
      repoName: 'example',
      author: 'Tester',
      version: '1.2.3',
    },
  });
  const installed = path.join(directory, 'installed');
  run(['extract', root, installed]);
  const result = run(['list', '--json', '--folderName', installed]);
  const [item] = JSON.parse(result.stdout);
  assert.equal(item.pluginName, '@example/managed');
  assert.match(
    run(['list', '--folderName', installed]).stdout,
    /@example\/managed/
  );
  run(['uninstall', '@example/managed', '--folderName', installed, '--quiet']);
  assert.deepEqual(
    JSON.parse(run(['list', '--json', '--folderName', installed]).stdout),
    []
  );
});

test('validates install arguments before attempting network requests', () => {
  for (const [args, message] of [
    [['install'], /Either URL or --config must be specified/],
    [
      ['install', 'https://example.test', '--config', 'plugins.yaml'],
      /Cannot specify both/,
    ],
    [
      ['install', 'https://example.test', '--watch'],
      /Watch option can only be used/,
    ],
  ]) {
    assert.match(run(args, 1).stderr, message);
  }
});

test('returns failure for missing plugins in quiet mode', () => {
  const installed = path.join(directory, 'installed');
  fs.mkdirSync(installed);
  assert.match(
    run(['update', 'missing', installed, '--quiet'], 1).stderr,
    /Plugin not found/
  );
  assert.match(
    run(['uninstall', 'missing', '--folderName', installed, '--quiet'], 1)
      .stderr,
    /Plugin not found/
  );
});
