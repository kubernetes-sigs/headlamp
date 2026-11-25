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
const zlib = require('node:zlib');
const { test } = require('node:test');
const realYargs = require('yargs/yargs');
const { load, root } = require('./helpers/source.cjs');

function fixture(t) {
  const cwd = process.cwd();
  const env = { ...process.env };
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-cli-')));
  process.env = {
    ...env,
    HOME: dir,
    USERPROFILE: dir,
    APPDATA: dir,
    LOCALAPPDATA: dir,
    XDG_CONFIG_HOME: dir,
    XDG_DATA_HOME: dir,
  };
  process.chdir(dir);
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function plugin(folder = '.', extra = {}) {
  fs.ensureDirSync(path.join(folder, 'src'));
  fs.ensureDirSync(path.join(folder, 'node_modules'));
  fs.writeJsonSync(path.join(folder, 'package.json'), {
    name: path.basename(path.resolve(folder)),
    version: '1.0.0',
    scripts: {},
    devDependencies: { '@headlamp-k8s/eslint-config': 'old', '@kinvolk/headlamp-plugin': 'old' },
    ...extra,
  });
  fs.writeFileSync(path.join(folder, 'src/index.tsx'), 'export const original = true;');
}

async function run(args, options = {}) {
  let parsed;
  const commands = [];
  const messages = [];
  const timers = [];
  const proc = {
    ...process,
    platform: options.platform || process.platform,
    argv: [process.execPath, path.join(root, 'bin/headlamp-plugin.js'), ...args],
    env: { ...process.env, ...options.env },
    exitCode: 0,
    exit: code => {
      const error = new Error(`CLI exit ${code}`);
      error.status = code;
      throw error;
    },
  };
  const config = { build: {}, plugins: [] };
  const execute = (command, args, settings) => {
    commands.push({ command, args, cwd: process.cwd(), settings });
    if (options.execute) return options.execute(command, args, settings);
    if (command.includes('outdated')) return '{}';
    if (args?.includes('view')) return JSON.stringify({ integrity: 'fixture-integrity' });
    return '';
  };
  const mocks = {
    'env-paths': () => ({
      data: path.join(process.cwd(), '.fixture-data'),
      config: path.join(process.cwd(), '.fixture-config'),
    }),
    child_process: {
      execSync: command => execute(command),
      execFileSync: execute,
      spawnSync: (...args) => {
        execute(...args);
        return { status: 0 };
      },
      exec: (command, callback) => {
        commands.push({ command });
        callback(
          options.outdated ? new Error('outdated') : null,
          JSON.stringify(options.outdated || {})
        );
      },
    },
    'yargs/yargs': values => {
      const parser = realYargs(values).exitProcess(false);
      const proxy = new Proxy(parser, {
        get(target, property) {
          if (property === 'argv') return (parsed = target.parseAsync());
          const value = Reflect.get(target, property);
          if (typeof value !== 'function') return value;
          return (...args) => {
            const result = value.apply(target, args);
            return result === target ? proxy : result;
          };
        },
      });
      return proxy;
    },
    vite: {
      build: async value => {
        if (options.build) return options.build(value);
        fs.outputFileSync('dist/main.js', 'export const built = true;'.repeat(50));
      },
    },
    '../config/vite.config.mjs': config,
    'vite-plugin-static-copy': { viteStaticCopy: options => ({ name: 'copy', options }) },
    '../config/vite-plugin-name-injection.mjs': {
      pluginNameInjection: () => ({ name: 'injection' }),
    },
  };
  try {
    load('bin/headlamp-plugin.js', {
      process: proc,
      mocks,
      console: Object.fromEntries(
        ['log', 'info', 'warn', 'error'].map(name => [
          name,
          (...args) => messages.push(args.join(' ')),
        ])
      ),
      globals: {
        setTimeout: callback => {
          timers.push(callback);
          return 1;
        },
      },
    });
    await parsed;
    if (options.outdated) for (const timer of timers) timer();
    return { status: proc.exitCode, commands, messages, config };
  } catch (error) {
    if (typeof error.status === 'number')
      return { status: error.status, commands, messages, config };
    throw error;
  }
}

test('create validates names and existing destinations, then substitutes template metadata', async t => {
  fixture(t);
  assert.equal((await run(['create', 'BadName', '--noinstall'])).status, 2);
  fs.mkdirSync('exists');
  assert.equal((await run(['create', 'exists', '--noinstall'])).status, 1);
  assert.equal((await run(['create', 'example', '--noinstall'])).status, 0);
  assert.equal(fs.readJsonSync('example/package.json').name, 'example');
  assert.ok(fs.existsSync('example/AGENTS.md'));
});

test('create resolves install integrity and preserves explicitly requested linking', async t => {
  fixture(t);
  const result = await run(['create', 'example', '--link']);
  assert.equal(result.status, 0);
  assert.ok(result.commands.some(c => c.args?.includes('link')));
  assert.ok(result.commands.some(c => c.command === 'npm ci'));
  assert.equal(
    fs.readJsonSync('example/package-lock.json').packages['node_modules/@kinvolk/headlamp-plugin']
      .integrity,
    'fixture-integrity'
  );
});

test('create falls back to npm install when registry metadata is unavailable and reports install failures', async t => {
  fixture(t);
  const result = await run(['create', 'example'], {
    execute(command, args) {
      if (args?.includes('view')) throw new Error('registry unavailable');
      if (command === 'npm install') throw new Error('install failed');
    },
  });
  assert.equal(result.status, 3);
  assert.ok(result.commands.some(c => c.command === 'npm install'));
});

test('extract handles package collections, nested assets and missing build output', async t => {
  fixture(t);
  for (const name of ['one', 'two']) {
    plugin(`packages/${name}`);
    fs.outputFileSync(`packages/${name}/dist/main.js`, name);
    fs.outputFileSync(`packages/${name}/dist/nested/data.json`, '{}');
  }
  assert.equal((await run(['extract', 'packages', 'output'])).status, 0);
  assert.deepEqual(fs.readdirSync('output').sort(), ['one', 'two']);
  assert.ok(fs.existsSync('output/one/nested/data.json'));
  assert.equal((await run(['extract', 'missing', 'output'])).status, 1);
  fs.mkdirSync('empty');
  assert.equal((await run(['extract', 'empty', 'output'])).status, 1);
  assert.equal((await run(['package', 'missing'])).status, 1);
  assert.equal((await run(['package', 'empty'])).status, 1);
});

test('package copies locales and extra assets, computes real archive bytes, and rejects overwrites', async t => {
  fixture(t);
  plugin('example', {
    name: '@example/package',
    headlamp: {
      extraDist: {
        locales: 'locales',
        extra: 'extra',
        'readme.txt': 'readme.txt',
        missing: 'absent',
      },
    },
  });
  fs.outputFileSync('example/dist/main.js', 'main');
  fs.outputFileSync('example/locales/en/translation.json', '{}');
  fs.outputFileSync('example/extra/data.txt', 'data');
  fs.writeFileSync('example/readme.txt', 'readme');
  const result = await run(['package', 'example', 'archives']);
  assert.equal(result.status, 0);
  const archive = 'archives/example-package-1.0.0.tar.gz';
  const checksum = require('node:crypto')
    .createHash('sha256')
    .update(fs.readFileSync(archive))
    .digest('hex');
  assert.ok(result.messages.some(message => message.includes(checksum)));
  assert.equal(fs.readFileSync('example/dist/extra/data.txt', 'utf8'), 'data');
  assert.equal((await run(['package', 'example', 'archives'])).status, 1);
});

test('build preserves scoped env values and maintains compressed assets without stale sidecars', async t => {
  fixture(t);
  plugin();
  const value = 'repeated'.repeat(100);
  const result = await run(['build'], {
    env: { REACT_APP_FIXTURE: 'visible', SECRET_FIXTURE: 'not exposed' },
    build(config) {
      assert.equal(config.define['process.env.REACT_APP_FIXTURE'], '"visible"');
      assert.equal(config.define['process.env.SECRET_FIXTURE'], undefined);
      fs.outputFileSync('dist/main.js', value);
      fs.outputFileSync('dist/nested/style.css', value);
      fs.outputFileSync('dist/orphan.js.br', 'old');
      fs.outputFileSync('dist/image.png', 'image');
      fs.outputFileSync('dist/image.png.br', 'old');
      fs.outputFileSync('dist/tiny.txt', 'x');
      fs.outputFileSync('dist/tiny.txt.br', 'old');
      fs.outputFileSync('dist/ignored.gz', 'already compressed');
    },
  });
  assert.equal(result.status, 0);
  assert.equal(zlib.brotliDecompressSync(fs.readFileSync('dist/main.js.br')).toString(), value);
  assert.equal(
    zlib.brotliDecompressSync(fs.readFileSync('dist/nested/style.css.br')).toString(),
    value
  );
  for (const file of ['orphan.js.br', 'image.png.br', 'tiny.txt.br'])
    assert.ok(!fs.existsSync(`dist/${file}`));
  assert.equal((await run(['build', 'missing'])).status, 1);
});

test('watch mode configures source maps, extra-file copying and isolated development destinations', async t => {
  const dir = fixture(t);
  const destination = path.join(dir, '.fixture-config', 'plugins', 'watched');
  plugin('.', { name: '@example/watched' });
  const result = await run(['start'], {
    outdated: { '@kinvolk/headlamp-plugin': { latest: 'new' } },
    build: async config => {
      assert.equal(config.build.sourcemap, 'inline');
      assert.deepEqual(Object.keys(config.build.watch), []);
      for (const plugin of config.plugins) if (plugin.buildEnd) await plugin.buildEnd();
    },
  });
  assert.equal(result.status, 0, result.messages.join('\n'));
  assert.ok(
    result.config.plugins.some(
      p => p.name === 'copy' && p.options.targets.every(target => target.dest === destination)
    )
  );
  assert.ok(result.messages.some(m => m.includes('out of date')));
  assert.equal(
    (
      await run(['start'], {
        build: () => {
          throw new Error('bundler failed');
        },
      })
    ).status,
    1
  );
  assert.ok(fs.existsSync(path.join(dir, 'dist')));
});

test('collection builds finish sequentially and retain distinct package outputs', async t => {
  const dir = fixture(t);
  plugin('packages/one');
  plugin('packages/two');
  fs.mkdirSync('packages/empty');
  const visited = [];
  let active = false;
  const result = await run(['build', 'packages'], {
    async build(config) {
      assert.equal(active, false);
      active = true;
      const cwd = process.cwd();
      visited.push(cwd);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(process.cwd(), cwd);
      fs.outputFileSync('dist/main.js', path.basename(cwd));
      assert.equal(config.plugins.filter(plugin => plugin.name === 'injection').length, 1);
      active = false;
    },
  });
  assert.equal(result.status, 0);
  assert.deepEqual(visited, [path.join(dir, 'packages/one'), path.join(dir, 'packages/two')]);
  assert.equal(process.cwd(), dir);
  for (const name of ['one', 'two']) {
    const bytes = fs.readFileSync(`packages/${name}/dist/main.js.br`);
    assert.equal(zlib.brotliDecompressSync(bytes).toString(), name);
  }
});

test('build failures restore the working directory and do not start later packages', async t => {
  const dir = fixture(t);
  plugin('packages/one');
  plugin('packages/two');
  let calls = 0;
  const result = await run(['build', 'packages'], {
    build() {
      calls++;
      throw new Error('fixture bundler failure');
    },
  });
  assert.equal(result.status, 1);
  assert.equal(calls, 1);
  assert.equal(process.cwd(), dir);
  assert.ok(result.messages.some(message => message.includes('fixture bundler failure')));
  fs.mkdirSync('empty');
  assert.equal((await run(['build', 'empty'])).status, 1);
});

test('tool commands traverse package collections and propagate individual failures', async t => {
  fixture(t);
  plugin('packages/one');
  plugin('packages/two');
  const ok = await run(['lint', 'packages', '--fix']);
  assert.equal(ok.status, 0);
  assert.equal(ok.commands.length, 2);
  assert.ok(ok.commands.every(c => c.args.includes('--fix')));
  assert.equal(
    (
      await run(['format', 'packages', '--check'], {
        execute() {
          throw new Error('formatter failed');
        },
      })
    ).status,
    1
  );
  assert.equal((await run(['tsc', 'missing'])).status, 1);
  fs.mkdirSync('empty');
  assert.equal((await run(['lint', 'empty'])).status, 1);
  for (const command of ['storybook', 'storybook-build', 'test']) {
    assert.equal((await run([command, 'packages/one'])).status, 0);
  }
});

for (const platform of ['linux', 'win32']) {
  test(`tool commands select local executables on ${platform} and report missing-dependency installation errors`, async t => {
    fixture(t);
    plugin();
    const localFormatter = path.join(
      'node_modules',
      '.bin',
      'prettier' + (platform === 'win32' ? '.cmd' : '')
    );
    fs.ensureFileSync(localFormatter);
    const formatted = await run(['format'], { platform });
    assert.equal(formatted.status, 0);
    assert.equal(formatted.commands.length, 1);
    if (platform === 'win32') {
      assert.equal(formatted.commands[0].command, 'cmd.exe');
      assert.deepEqual(Array.from(formatted.commands[0].args).slice(0, 4), [
        '/d',
        '/s',
        '/c',
        localFormatter,
      ]);
    } else {
      assert.equal(formatted.commands[0].command, localFormatter);
    }
    fs.rmSync('node_modules', { recursive: true });
    assert.equal(
      (
        await run(['lint'], {
          platform,
          execute(command) {
            if (command === 'npm install') throw new Error('offline');
          },
        })
      ).status,
      1
    );
  });
}

test('upgrade updates a collection and stops after a failed package', async t => {
  fixture(t);
  for (const folder of ['packages/one', 'packages/two']) {
    plugin(folder);
    fs.writeFileSync(path.join(folder, 'jsconfig.json'), '{}');
    fs.writeFileSync(path.join(folder, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(folder, 'src/legacy.ts'), 'import x from "@material-ui/core";');
  }
  const result = await run(['upgrade', 'packages', '--headlamp-plugin-version', '1.2.3']);
  assert.equal(result.status, 0);
  assert.ok(result.commands.some(c => c.command.includes('npm remove')));
  assert.ok(result.commands.some(c => c.command.includes('npm audit fix')));
  assert.ok(result.commands.some(c => c.command.includes('@mui/codemod')));
  assert.ok(!fs.existsSync('packages/one/jsconfig.json'));
  assert.ok(!fs.existsSync('packages/one/package-lock.json'));
  const failure = await run(['upgrade', 'packages', '--headlamp-plugin-version', '1.2.3'], {
    execute(command) {
      if (command.includes('npm install')) throw Object.assign(new Error('offline'), { status: 1 });
    },
  });
  assert.equal(failure.status, 1);
  assert.ok(failure.messages.some(m => m.includes('Skipping "two"')));
  assert.equal((await run(['upgrade', 'missing'])).status, 1);
  fs.mkdirSync('empty');
  assert.equal((await run(['upgrade', 'empty'])).status, 1);
});

test('upgrade handles audit warnings but fails formatter, linter and compiler errors', async t => {
  fixture(t);
  for (const failedCommand of ['npm audit fix', 'npm run format', 'npm run lint', 'npm run tsc']) {
    plugin();
    const result = await run(['upgrade', '.', '--headlamp-plugin-version', '1.2.3'], {
      execute(command) {
        if (command === failedCommand)
          throw Object.assign(new Error('command failed'), { status: 1 });
      },
    });
    assert.equal(result.status, failedCommand === 'npm audit fix' ? 0 : 1);
  }
});

test('i18n configures package collections, preserves translations, and validates locale requests', async t => {
  fixture(t);
  plugin('packages/one', { name: 'one', headlamp: { i18n: ['en', 'fr'] } });
  plugin('packages/two', { name: 'two' });
  fs.outputFileSync('packages/one/locales/fr/translation.json', '{"original":"kept"}');
  assert.equal((await run(['i18n', 'packages', '--setup'])).status, 0);
  assert.equal(
    fs.readFileSync('packages/one/locales/fr/translation.json', 'utf8'),
    '{"original":"kept"}'
  );
  assert.equal((await run(['i18n', path.resolve('packages/two'), 'es'])).status, 0);
  assert.deepEqual(fs.readJsonSync('packages/two/package.json').headlamp.i18n, ['es']);
  assert.equal((await run(['i18n', path.resolve('packages/two'), 'es'])).status, 0);
  assert.equal((await run(['i18n', path.resolve('packages/two'), 'invalid'])).status, 1);
  fs.writeFileSync('packages/two/i18next-parser.config.js', 'module.exports = {};');
  assert.equal((await run(['i18n', path.resolve('packages/two')])).status, 0);
  assert.equal((await run(['i18n', 'missing'])).status, 1);
  assert.equal((await run(['i18n', 'missing', '--setup'])).status, 1);
  fs.mkdirSync('empty');
  assert.equal((await run(['i18n', path.resolve('empty')])).status, 1);
  assert.equal((await run(['i18n', 'empty', '--setup'])).status, 1);
});
