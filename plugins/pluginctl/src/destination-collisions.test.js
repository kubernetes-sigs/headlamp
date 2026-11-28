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

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const tar = require('tar');
const MultiPluginManager = require('./multi-plugin-management');

let directory;
let installed;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pluginctl-collision-'));
  installed = path.join(directory, 'installed');
  jest.spyOn(os, 'tmpdir').mockReturnValue(directory);
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
async function servePackages(packages) {
  const responses = new Map();
  for (const [repository, name, content] of packages) {
    const folder = path.join(directory, repository, 'package');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'main.js'), content);
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
    const archive = path.join(directory, repository + '.tar.gz');
    await tar.c({ gzip: true, file: archive, cwd: path.dirname(folder) }, ['package']);
    const bytes = fs.readFileSync(archive);
    const archiveURL = `https://github.com/example/${repository}/releases/download/v1/plugin.tar.gz`;
    responses.set(`https://artifacthub.io/api/v1/packages/headlamp/${repository}/${name}`, {
      name, version: '1.0.0', repository: { name: repository, user_alias: 'test' },
      data: { 'headlamp/plugin/archive-url': archiveURL,
        'headlamp/plugin/archive-checksum': crypto.createHash('sha256').update(bytes).digest('hex') },
    });
    responses.set(archiveURL, bytes);
  }
  const fetch = jest.spyOn(global, 'fetch').mockImplementation(async url => {
    const value = responses.get(url);
    if (!value) throw new Error(`Unexpected fixture request: ${url}`);
    return Buffer.isBuffer(value) ? { ok: true, body: Readable.from([value]) }
      : { ok: true, json: async () => value };
  });
  return { responses, fetch };
}
function configuration(plugins, parallel) {
  const config = path.join(directory, 'plugins.json');
  fs.writeFileSync(config, JSON.stringify({ plugins, installOptions: { parallel, maxConcurrent: 2 } }));
  return config;
}
function entry(alias, repository, packageName = 'shared') {
  return { name: alias, source: `https://artifacthub.io/packages/headlamp/${repository}/${packageName}` };
}
for (const parallel of [false, true]) {
  test(`rejects colliding sources before overwriting an installed plugin (${parallel})`, async () => {
    const { fetch } = await servePackages([
      ['first', 'shared', 'first repository'], ['second', 'shared', 'second repository'],
    ]);
    fs.mkdirSync(path.join(installed, 'shared'), { recursive: true });
    const main = path.join(installed, 'shared', 'main.js');
    fs.writeFileSync(main, 'existing installation');
    const config = configuration([entry('first-alias', 'first'), entry('second-alias', 'second')], parallel);
    const manager = new MultiPluginManager(installed);
    let failure;
    try { await manager.installFromConfig(config); } catch (error) { failure = error; }
    // This also exposes the old overwrite: the real archives replace main.js.
    expect(fs.readFileSync(main, 'utf8')).toBe('existing installation');
    expect(failure).toEqual(expect.objectContaining({ message: expect.stringMatching(/destination.*shared/i) }));
    expect(fetch).not.toHaveBeenCalled();
  });
  test(`distinct package destinations still install with aliases (${parallel})`, async () => {
    await servePackages([['first', 'alpha', 'alpha content'], ['second', 'beta', 'beta content']]);
    const config = configuration([entry('first-alias', 'first', 'alpha'), entry('second-alias', 'second', 'beta')], parallel);
    expect(await new MultiPluginManager(installed).installFromConfig(config)).toEqual({
      total: 2, failed: 0, skipped: 0, successful: 2,
    });
    expect(fs.readFileSync(path.join(installed, 'alpha/main.js'), 'utf8')).toBe('alpha content');
    expect(fs.readFileSync(path.join(installed, 'beta/main.js'), 'utf8')).toBe('beta content');
  });
}
test.each(['shared/', '%73hared', 'Shared'])('rejects destination aliases through %s', async packageName => {
  const config = configuration([entry('first-alias', 'first'), entry('second-alias', 'second', packageName)], false);
  await expect(new MultiPluginManager(installed).validateConfig(config)).rejects.toThrow(/destination.*shared/i);
  expect(fs.existsSync(installed)).toBe(false);
});
test.each([false, true])('rejects mismatched metadata before archive download or cleanup (pinned: %s)', async pinned => {
  const { responses, fetch } = await servePackages([['first', 'alpha', 'new content']]);
  const metadataURL = 'https://artifacthub.io/api/v1/packages/headlamp/first/alpha';
  const metadata = responses.get(metadataURL);
  if (pinned) {
    metadata.available_versions = [{ version: '0.9.0' }];
    responses.set(metadataURL + '/0.9.0', { ...metadata, name: 'shared', version: '0.9.0' });
  } else {
    metadata.name = 'shared';
  }
  fs.mkdirSync(path.join(installed, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(installed, 'shared/main.js'), 'existing installation');
  const config = configuration([{ ...entry('first-alias', 'first', 'alpha'), ...(pinned ? { version: '0.9.0' } : {}) }], false);
  const events = [];
  const manager = new MultiPluginManager(installed, '', event => events.push(event));
  expect(await manager.installFromConfig(config)).toEqual({ total: 1, failed: 1, skipped: 0, successful: 0 });
  expect(events.some(event => /name.*source/i.test(event.message))).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(pinned ? 2 : 1);
  expect(fs.readFileSync(path.join(installed, 'shared/main.js'), 'utf8')).toBe('existing installation');
});

test('retains installations when the source uses an encoded name and trailing slash', async () => {
  const { responses } = await servePackages([['first', 'alpha', 'alpha content']]);
  responses.set('https://artifacthub.io/api/v1/packages/headlamp/first/%61lpha/',
    responses.get('https://artifacthub.io/api/v1/packages/headlamp/first/alpha'));
  const config = configuration([entry('first-alias', 'first', '%61lpha/')], false);
  expect(await new MultiPluginManager(installed).installFromConfig(config)).toEqual({
    total: 1, failed: 0, skipped: 0, successful: 1,
  });
  expect(fs.readFileSync(path.join(installed, 'alpha/main.js'), 'utf8')).toBe('alpha content');
});
