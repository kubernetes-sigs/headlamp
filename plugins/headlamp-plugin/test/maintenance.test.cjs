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
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { load } = require('./helpers/source.cjs');

function fixture(t) {
  const cwd = process.cwd();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-maintenance-')));
  const sdk = path.join(dir, 'plugins/headlamp-plugin');
  fs.mkdirSync(path.join(sdk, 'scripts'), { recursive: true });
  process.chdir(sdk);
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, sdk };
}
const exited = code => {
  throw new Error(`exit:${code}`);
};
const processWithExit = () =>
  Object.defineProperties(Object.create(process), {
    exit: { value: exited, writable: true },
    exitCode: { value: undefined, writable: true },
  });

test('hash cache requires both content and matching git state and surfaces unavailable git', t => {
  const { sdk } = fixture(t);
  const hash = path.join(sdk, '.git-hash');
  let fail = false;
  const utils = load('scripts/git-hash-utils.js', {
    mocks: {
      child_process: {
        execFileSync: (_cmd, args) => {
          if (fail) throw new Error('git unavailable');
          return args[0] === 'ls-remote' ? 'abcdef\tHEAD\n' : 'abcdef\n';
        },
      },
    },
  });
  assert.equal(utils.getStoredHash(hash), null);
  assert.equal(utils.shouldSkipBasedOnHash(path.join(sdk, 'missing'), hash, 'abcdef'), false);
  utils.storeHash(hash, 'abcdef');
  assert.equal(utils.shouldSkipBasedOnHash(sdk, hash, 'abcdef'), true); // scripts exists
  assert.equal(utils.shouldSkipBasedOnHash(sdk, hash, ''), false);
  assert.equal(utils.shouldSkipBasedOnHash(sdk, hash, 'different'), false);
  const empty = path.join(sdk, 'empty');
  fs.mkdirSync(empty);
  assert.equal(utils.shouldSkipBasedOnHash(empty, hash, 'abcdef'), false);
  assert.equal(utils.getLocalGitHash('plugins/examples', sdk), 'abcdef');
  assert.equal(utils.getRemoteGitHash('https://example.test/repo'), 'abcdef');
  fail = true;
  assert.equal(utils.getLocalGitHash('plugins/examples', sdk), null);
  assert.equal(utils.getRemoteGitHash('https://example.test/repo'), null);
});

test('example bundling excludes generated assets and skips unchanged trees', t => {
  const { dir, sdk } = fixture(t);
  const source = path.join(dir, 'plugins/examples/demo');
  fs.mkdirSync(source, { recursive: true });
  for (const name of [
    'src/index.tsx',
    'node_modules/x',
    'dist/main.js',
    '.eslintcache',
    'storybook-static/index.html',
    'package-lock.json',
  ]) {
    fs.ensureFileSync(path.join(source, name));
  }
  const filename = path.join(sdk, 'scripts/bundle-examples.js');
  const options = {
    filename,
    process: processWithExit(),
    mocks: {
      child_process: { execFileSync: () => 'abcdef\n' },
    },
  };
  load('scripts/bundle-examples.js', options);
  assert.ok(fs.existsSync(path.join(sdk, 'examples/demo/src/index.tsx')));
  for (const name of [
    'node_modules',
    'dist',
    '.eslintcache',
    'storybook-static',
    'package-lock.json',
  ]) {
    assert.ok(!fs.existsSync(path.join(sdk, 'examples/demo', name)));
  }
  assert.throws(() => load('scripts/bundle-examples.js', options), /exit:0/);
  fs.writeFileSync(path.join(sdk, 'examples/.git-hash'), 'changed');
  load('scripts/bundle-examples.js', options);
  assert.equal(fs.readFileSync(path.join(sdk, 'examples/.git-hash'), 'utf8'), 'abcdef');
});

test('official-plugin fetch copies only source, cleans a successful checkout and skips unchanged trees', t => {
  const { sdk } = fixture(t);
  const options = {
    filename: path.join(sdk, 'scripts/fetch-official-plugins.js'),
    process: processWithExit(),
    mocks: {
      child_process: {
        execFileSync: (_cmd, args) => {
          if (args[0] === 'ls-remote') return 'abcdef\tHEAD';
          if (args[0] === 'rev-parse') return 'abcdef';
          const checkout = args.at(-1);
          for (const file of [
            'demo/src/index.tsx',
            'demo/node_modules/x',
            'demo/dist/x',
            'demo/.git/x',
            'demo/.eslintcache',
            'demo/storybook-static/x',
            'demo/package-lock.json',
            '.git/config',
            '.hidden/file',
          ])
            fs.ensureFileSync(path.join(checkout, file));
        },
      },
    },
  };
  load('scripts/fetch-official-plugins.js', options);
  assert.ok(fs.existsSync(path.join(sdk, 'official-plugins/demo/src/index.tsx')));
  assert.deepEqual(fs.readdirSync(path.join(sdk, 'official-plugins/demo')), ['src']);
  assert.ok(!fs.existsSync(path.join(sdk, '.temp-official-plugins')));
  assert.throws(() => load('scripts/fetch-official-plugins.js', options), /exit:0/);
});

for (const stage of ['clone', 'rev-parse']) {
  test(`official-plugin fetch removes a partial checkout after ${stage} fails with real exit semantics`, t => {
    const { sdk } = fixture(t);
    const helper = path.resolve(__dirname, 'helpers/source.cjs');
    const marker = path.join(sdk, 'checkout-created');
    const script = `
      const fs = require('node:fs');
      const path = require('node:path');
      require(${JSON.stringify(helper)}).load('scripts/fetch-official-plugins.js', {
        filename: ${JSON.stringify(path.join(sdk, 'scripts/fetch-official-plugins.js'))},
        mocks: {
          child_process: {
            execFileSync(_command, args) {
              if (args[0] === 'ls-remote') return 'abcdef\\tHEAD';
              if (args[0] === 'clone') {
                const checkout = args.at(-1);
                fs.mkdirSync(checkout, { recursive: true });
                fs.writeFileSync(path.join(checkout, 'partial'), 'partial checkout');
                fs.writeFileSync(${JSON.stringify(marker)}, 'created');
                if (${JSON.stringify(stage)} === 'clone') throw new Error('fixture clone failure');
                return '';
              }
              if (args[0] === 'rev-parse') throw new Error('fixture rev-parse failure');
              throw new Error('Unexpected git command: ' + args[0]);
            }
          }
        }
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: sdk,
      encoding: 'utf8',
      timeout: 15000,
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, new RegExp(`fixture ${stage} failure`));
    assert.equal(fs.readFileSync(marker, 'utf8'), 'created');
    assert.ok(!fs.existsSync(path.join(sdk, '.temp-official-plugins')));
    assert.ok(!fs.existsSync(path.join(sdk, 'official-plugins/.git-hash')));
  });
}

test('static asset copying preserves paths and ignores source files', t => {
  const { dir, sdk } = fixture(t);
  const components = path.join(dir, 'frontend/src/components');
  fs.outputFileSync(path.join(components, 'nested/style.css'), 'body{}');
  fs.outputFileSync(path.join(components, 'nested/icon.svg'), '<svg/>');
  fs.outputFileSync(path.join(components, 'nested/source.tsx'), 'export{}');
  load('scripts/copy-static-assets.js', {
    filename: path.join(sdk, 'scripts/copy-static-assets.js'),
  });
  assert.deepEqual(fs.readdirSync(path.join(sdk, 'lib/components/nested')).sort(), [
    'icon.svg',
    'style.css',
  ]);
});

test('dependency synchronization checks before writing and preserves SDK-only and intentionally different versions', t => {
  fixture(t);
  const sdk = {
    name: 'sdk',
    dependencies: { react: 'old', obsolete: '1', 'env-paths': '2', vitest: '5' },
  };
  const frontend = {
    dependencies: { react: 'new', added: '1', vitest: '4', '@rsbuild/core': '2' },
  };
  let parsed;
  const yargs = () => {
    const api = {
      command: (name, _description, _builder, handler) => {
        if (name === parsed) handler();
        return api;
      },
      demandCommand: () => api,
      strict: () => api,
      help: () => api,
    };
    return api;
  };
  const run = name => {
    parsed = name;
    const proc = processWithExit();
    load('dependencies-sync.js', {
      process: proc,
      mocks: {
        'yargs/yargs': yargs,
        './package.json': structuredClone(sdk),
        '../../frontend/package.json': frontend,
      },
    });
    return proc.exitCode;
  };
  const originalExitCode = process.exitCode;
  assert.equal(run('check'), 1);
  assert.equal(process.exitCode, originalExitCode);
  assert.ok(!fs.existsSync('package.json'));
  assert.equal(run('update'), 0);
  assert.equal(run('check'), 1);
  assert.equal(process.exitCode, originalExitCode);
  const result = fs.readJsonSync('package.json').dependencies;
  assert.equal(result.react, 'new');
  assert.equal(result.added, '1');
  assert.equal(result.vitest, '5');
  assert.equal(result['env-paths'], '2');
  assert.equal(result.obsolete, undefined);
  assert.equal(result['@rsbuild/core'], undefined);
});

test('template lock generation removes local tarball integrity and restores publishable placeholders', t => {
  const { sdk } = fixture(t);
  fs.writeJsonSync('package.json', { version: '1.2.3' });
  fs.ensureDirSync('template');
  fs.writeFileSync('kinvolk-headlamp-plugin-old.tgz', 'old');
  const commands = [];
  load('scripts/copy-package-lock.js', {
    mocks: {
      child_process: {
        spawnSync: (cmd, args) => {
          commands.push([cmd, ...args]);
          if (args[0] === 'pack') fs.writeFileSync('kinvolk-headlamp-plugin-1.2.3.tgz', 'fixture');
          if (cmd === 'node') fs.mkdirSync('mypkgtmp');
          if (args[0] === 'install' || args[0] === 'ci') {
            fs.ensureDirSync('mypkgtmp/node_modules');
            fs.writeJsonSync(
              'mypkgtmp/package-lock.json',
              {
                name: 'mypkgtmp',
                packages: {
                  '': {
                    dependencies: {
                      '@kinvolk/headlamp-plugin': 'file:../kinvolk-headlamp-plugin-1.2.3.tgz',
                    },
                  },
                  'node_modules/@kinvolk/headlamp-plugin': {
                    resolved: 'file:../kinvolk-headlamp-plugin-1.2.3.tgz',
                    integrity: 'local-only',
                  },
                },
              },
              { spaces: 2 }
            );
          }
          return { status: 0 };
        },
      },
    },
  });
  const lock = fs.readJsonSync(path.join(sdk, 'template/package-lock.json'));
  assert.equal(lock.name, '$${name}');
  assert.equal(
    lock.packages[''].dependencies['@kinvolk/headlamp-plugin'],
    '^$${headlamp-plugin-version}'
  );
  assert.equal(lock.packages['node_modules/@kinvolk/headlamp-plugin'].integrity, undefined);
  assert.equal(
    lock.packages['node_modules/@kinvolk/headlamp-plugin'].resolved,
    'https://registry.npmjs.org/@kinvolk/headlamp-plugin/-/headlamp-plugin-1.2.3.tgz'
  );
  assert.ok(commands.some(command => command[1] === 'ci'));
  assert.ok(!fs.existsSync('mypkgtmp'));
  assert.ok(!fs.existsSync('kinvolk-headlamp-plugin-old.tgz'));
});
