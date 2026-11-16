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
const { test } = require('node:test');

const cli = path.join(__dirname, 'bin/headlamp-plugin.js');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-i18n-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'src'));
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'headlamp-i18n-fixture',
      headlamp: { i18n: ['en', 'fr'] },
    })
  );
  fs.writeFileSync(
    path.join(directory, 'src/index.tsx'),
    "t('Hello'); t('labels|Pod', { context: 'plural' }); t('Items', { count: 2 });"
  );
  return {
    directory,
    run(args = [], expectedStatus = 0) {
      const result = spawnSync(process.execPath, [cli, 'i18n', directory, ...args], {
        encoding: 'utf8',
      });
      if (result.error) throw result.error;
      assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
      return result;
    },
    read(file) {
      return JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    },
  };
}

test('bundled extraction preserves namespaces, plurals, context, and existing translations', t => {
  const project = fixture(t);
  fs.mkdirSync(path.join(project.directory, 'locales/fr'), { recursive: true });
  fs.writeFileSync(
    path.join(project.directory, 'locales/fr/translation.json'),
    JSON.stringify({ Hello: 'Bonjour', Dynamic: 'Dynamique' })
  );
  project.run();
  const english = project.read('locales/en/translation.json');
  assert.equal(english.Hello, 'Hello');
  assert.equal(english.Items_one, 'Items');
  assert.equal(english.Items_other, 'Items');
  assert.equal(project.read('locales/en/labels.json')['Pod//context:plural'], 'Pod');
  assert.deepEqual(project.read('locales/fr/translation.json'), {
    Hello: 'Bonjour',
    Dynamic: 'Dynamique',
    Items_one: '',
    Items_many: '',
    Items_other: '',
  });
});

test('bundled extraction preserves JSX text and explicit call-site defaults', t => {
  const project = fixture(t);
  fs.writeFileSync(
    path.join(project.directory, 'src/index.tsx'),
    `
const message = <Trans i18nKey="welcome">Welcome</Trans>;
const contextMessage = <Trans i18nKey="context-message">Literal //context: marker</Trans>;
t('greeting', 'Hello there');
t('labels|pod', { defaultValue: 'Pod label' });
`
  );
  project.run();
  const english = project.read('locales/en/translation.json');
  assert.equal(english.welcome, 'Welcome');
  assert.equal(english['context-message'], 'Literal //context: marker');
  assert.equal(english.greeting, 'Hello there');
  assert.equal(project.read('locales/en/labels.json').pod, 'Pod label');
});

test('explicit defaults survive repeated implicit keys in either declaration order', t => {
  for (const calls of [
    "t('labels|pod'); t('labels|pod', { defaultValue: 'Pod label' });",
    "t('labels|pod', { defaultValue: 'Pod label' }); t('labels|pod');",
  ]) {
    const project = fixture(t);
    fs.writeFileSync(
      path.join(project.directory, 'src/index.tsx'),
      `
${calls}
t('plain'); t('plain', 'Plain label');
t('other|pod');
t('labels|prefix'); t('labels|prefix', { defaultValue: 'labels|literal text' });
`
    );
    project.run();
    assert.equal(project.read('locales/en/labels.json').pod, 'Pod label');
    assert.equal(project.read('locales/en/translation.json').plain, 'Plain label');
    assert.equal(project.read('locales/en/other.json').pod, 'pod');
    assert.equal(project.read('locales/en/labels.json').prefix, 'labels|literal text');
  }
});

test('mixed t and Trans calls preserve JSX text in either declaration order', t => {
  const implicit = "t('labels|welcome');";
  const jsx = 'const message = <Trans i18nKey="labels|welcome">Welcome</Trans>;';
  for (const calls of [
    [implicit, jsx],
    [jsx, implicit],
  ]) {
    const project = fixture(t);
    fs.writeFileSync(
      path.join(project.directory, 'src/index.tsx'),
      calls.join('\n') + "\nt('other|welcome');"
    );
    project.run();
    assert.equal(project.read('locales/en/labels.json').welcome, 'Welcome');
    assert.equal(project.read('locales/en/other.json').welcome, 'welcome');
  }
});

test('explicit defaults outrank JSX text and key fallbacks in every declaration order', t => {
  const calls = [
    "t('labels|welcome');",
    'const message = <Trans i18nKey="labels|welcome">Welcome</Trans>;',
    "t('labels|welcome', { defaultValue: 'Explicit welcome' });",
  ];
  for (const order of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const project = fixture(t);
    fs.writeFileSync(
      path.join(project.directory, 'src/index.tsx'),
      order.map(index => calls[index]).join('\n')
    );
    project.run();
    assert.equal(project.read('locales/en/labels.json').welcome, 'Explicit welcome');
  }
});

test('mixed defaults preserve cardinal, ordinal, context, prefix, and literal-key forms', t => {
  const cases = [
    {
      implicit: "t('labels|items', { count: 2 });",
      jsx: '<Trans i18nKey="labels|items" count={2}>Items</Trans>',
      keys: ['items_one', 'items_other'],
      value: 'Items',
    },
    {
      implicit: "t('labels|rank', { count: 2, ordinal: true });",
      jsx: '<Trans i18nKey="labels|rank" count={2} ordinal>Place</Trans>',
      keys: ['rank_ordinal_one', 'rank_ordinal_two', 'rank_ordinal_few', 'rank_ordinal_other'],
      value: 'Place',
    },
    {
      implicit: "t('labels|friend', { count: 2, context: 'female' });",
      jsx: '<Trans i18nKey="labels|friend" count={2} context="female">Friends</Trans>',
      keys: ['friend//context:female_one', 'friend//context:female_other'],
      value: 'Friends',
    },
    {
      implicit: "t('labels|rank', { count: 2, ordinal: true, context: 'female' });",
      jsx: '<Trans i18nKey="labels|rank" count={2} ordinal context="female">Place</Trans>',
      keys: ['rank//context:female_ordinal_one', 'rank//context:female_ordinal_other'],
      value: 'Place',
    },
    ...['section.', 'section'].map(prefix => ({
      prelude: `const { t } = useTranslation('labels', { keyPrefix: '${prefix}' });`,
      implicit: "t('welcome');",
      jsx: '<Trans t={t} i18nKey="welcome">Welcome</Trans>',
      keys: [`${prefix}welcome`],
      value: 'Welcome',
    })),
    ...['note_one', 'note_ordinal_one'].map(key => ({
      implicit: `t('labels|${key}');`,
      jsx: `<Trans i18nKey="labels|${key}">Note</Trans>`,
      keys: [key],
      value: 'Note',
    })),
    {
      implicit: "t('labels|welcome');",
      jsx: '<Trans i18nKey="labels|welcome">labels|welcome</Trans>',
      keys: ['welcome'],
      value: 'labels|welcome',
    },
  ];
  for (const scenario of cases) {
    for (const jsxFirst of [false, true]) {
      const project = fixture(t);
      const jsx = `const message = ${scenario.jsx};`;
      const calls = jsxFirst ? [jsx, scenario.implicit] : [scenario.implicit, jsx];
      fs.writeFileSync(
        path.join(project.directory, 'src/index.tsx'),
        (scenario.prelude ?? '') + '\n' + calls.join('\n')
      );
      project.run();
      const labels = project.read('locales/en/labels.json');
      for (const key of scenario.keys) {
        assert.equal(labels[key], scenario.value, `${key}, JSX first: ${jsxFirst}`);
      }
    }
  }
});

test('source defaults remain consistent across files in either discovery order', t => {
  for (const jsxFirst of [false, true]) {
    const project = fixture(t);
    const implicitFile = jsxFirst ? 'b.ts' : 'a.ts';
    const jsxFile = jsxFirst ? 'a.tsx' : 'b.tsx';
    fs.writeFileSync(path.join(project.directory, 'src', implicitFile), "t('labels|welcome');");
    fs.writeFileSync(
      path.join(project.directory, 'src', jsxFile),
      'const message = <Trans i18nKey="labels|welcome">Welcome</Trans>;'
    );
    project.run();
    assert.equal(project.read('locales/en/labels.json').welcome, 'Welcome');
  }
});

test('shorthand count defaults outrank JSX without replacing existing plural translations', t => {
  const cases = [
    { text: "'{{count}} widgets'", options: 'count: 2', key: 'items_other' },
    { text: '`{{count}} widgets`', options: 'count: 2', key: 'items_other' },
    { text: "('{{count}} widgets')", options: 'count: 2', key: 'items_other' },
    {
      text: "'labels|{{ count }} widgets'",
      options: 'count: 2',
      key: 'items_other',
      value: 'labels|{{ count }} widgets',
    },
    {
      text: "'{{count}} widgets'",
      options: 'count: 2',
      key: 'items_other',
      crossFile: true,
    },
    {
      text: "'{{count}} widgets'",
      options: "count: 2, ordinal: true, context: 'female'",
      key: 'items//context:female_ordinal_other',
      attributes: 'ordinal context="female"',
    },
  ];
  for (const scenario of cases) {
    for (const callFirst of [false, true]) {
      const project = fixture(t);
      const call = `t('labels|items', ${scenario.text}, { ${scenario.options} });`;
      const jsx = `const message = <Trans i18nKey="labels|items" count={2} ${
        scenario.attributes ?? ''
      }>JSX items</Trans>;`;
      const calls = callFirst ? [call, jsx] : [jsx, call];
      if (scenario.crossFile) {
        fs.writeFileSync(path.join(project.directory, 'src/a.tsx'), calls[0]);
        fs.writeFileSync(path.join(project.directory, 'src/b.tsx'), calls[1]);
        fs.writeFileSync(
          path.join(project.directory, 'src/index.tsx'),
          "t('other|items', { count: 2 });"
        );
      } else {
        fs.writeFileSync(
          path.join(project.directory, 'src/index.tsx'),
          calls.join('\n') + "\nt('other|items', { count: 2 });"
        );
      }
      project.run();
      assert.equal(
        project.read('locales/en/labels.json')[scenario.key],
        scenario.value ?? '{{count}} widgets'
      );
      assert.equal(project.read('locales/en/other.json').items_other, 'items');
      fs.writeFileSync(
        path.join(project.directory, 'locales/en/labels.json'),
        JSON.stringify({ [scenario.key]: 'Existing plural text' })
      );
      project.run();
      assert.equal(project.read('locales/en/labels.json')[scenario.key], 'Existing plural text');
    }
  }
});

test('legacy-only configs fail with migration guidance before writing catalogs', t => {
  for (const extension of ['js', 'ts', 'mjs', 'cjs']) {
    const project = fixture(t);
    fs.writeFileSync(
      path.join(project.directory, `i18next-parser.config.${extension}`),
      "throw new Error('Legacy config must not execute');"
    );
    const result = project.run([], 1);
    assert.match(result.stderr, /Migrate.*i18next-parser\.config/);
    assert.match(result.stderr, /i18next-cli migrate-config/);
    assert.equal(fs.existsSync(path.join(project.directory, 'locales/en/translation.json')), false);
  }
});

test('modern configs take precedence and invalid configs fail setup', t => {
  const project = fixture(t);
  fs.writeFileSync(
    path.join(project.directory, 'i18next-parser.config.js'),
    "throw new Error('Legacy config must not execute');"
  );
  fs.writeFileSync(
    path.join(project.directory, 'i18next.config.cjs'),
    `
module.exports = {
  locales: ['en'],
  extract: {
    input: ['src/**/*.tsx'],
    output: 'modern/{{language}}/{{namespace}}.json',
    nsSeparator: '|',
    keySeparator: false,
  },
};
`
  );
  project.run();
  assert.equal(project.read('modern/en/translation.json').Hello, 'Hello');
  fs.writeFileSync(
    path.join(project.directory, 'i18next.config.cjs'),
    "throw new Error('Invalid extraction config');"
  );
  const result = project.run(['--setup'], 1);
  assert.match(result.stderr, /Invalid extraction config/);
});

test('failed parent setup does not fall back to modifying child packages', t => {
  const project = fixture(t);
  fs.writeFileSync(
    path.join(project.directory, 'i18next.config.cjs'),
    "throw new Error('Parent extraction failed');"
  );
  const child = path.join(project.directory, 'child');
  fs.mkdirSync(path.join(child, 'src'), { recursive: true });
  const childManifest = JSON.stringify({ name: 'child-plugin', version: '1.0.0' });
  fs.writeFileSync(path.join(child, 'package.json'), childManifest);
  fs.writeFileSync(path.join(child, 'src/index.tsx'), "t('Child translation');");

  const result = project.run(['--setup'], 1);
  assert.match(result.stderr, /Parent extraction failed/);
  assert.equal(fs.readFileSync(path.join(child, 'package.json'), 'utf8'), childManifest);
  assert.equal(fs.existsSync(path.join(child, 'locales')), false);
});

test('setup still discovers packages when the directory has no package manifest', t => {
  const project = fixture(t);
  fs.unlinkSync(path.join(project.directory, 'package.json'));
  const child = path.join(project.directory, 'child');
  fs.mkdirSync(path.join(child, 'src'), { recursive: true });
  fs.writeFileSync(path.join(child, 'package.json'), JSON.stringify({ name: 'child-plugin' }));
  fs.writeFileSync(path.join(child, 'src/index.tsx'), "t('Child translation');");

  project.run(['--setup']);
  const childManifest = project.read('child/package.json');
  assert.equal(childManifest.scripts.i18n, 'headlamp-plugin i18n');
  assert.equal(
    project.read('child/locales/en/translation.json')['Child translation'],
    'Child translation'
  );
});
