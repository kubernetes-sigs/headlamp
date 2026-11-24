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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./helpers/source.cjs');

function fixture(t) {
  const cwd = process.cwd();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-config-')));
  process.chdir(dir);
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('translation configuration prefers explicit locales, otherwise scans folders or falls back to English', t => {
  const dir = fixture(t);
  const config = () => load('config/i18next-parser.config.js');
  assert.equal(config().locales.join(), 'en');
  fs.mkdirSync('locales/fr', { recursive: true });
  assert.equal(config().locales.join(), 'fr');
  fs.writeFileSync('package.json', JSON.stringify({ headlamp: { i18n: ['en', 'de'] } }));
  const explicit = config();
  assert.equal(explicit.locales.join(), 'en,de');
  assert.equal(explicit.output, path.join(dir, 'locales/$LOCALE/$NAMESPACE.json'));
  assert.equal(explicit.defaultValue('en', 'translation', 'Name//context:menu'), 'Name');
  assert.equal(explicit.defaultValue('en', 'translation', 'Name'), 'Name');
  assert.equal(explicit.defaultValue('fr', 'translation', 'Name'), '');
  fs.writeFileSync('package.json', '{');
  const warnings = [];
  assert.equal(
    load('config/i18next-parser.config.js', {
      console: { ...console, warn: (...args) => warnings.push(args) },
    }).locales.join(),
    'fr'
  );
  assert.equal(warnings.length, 1);
});

test('name injection walks from source files, skips malformed parents, and preserves explicit namespaces', t => {
  const dir = fixture(t);
  fs.writeFileSync('package.json', JSON.stringify({ name: '@example/parent' }));
  fs.mkdirSync('nested/src', { recursive: true });
  fs.writeFileSync('nested/package.json', '{');
  const plugin = load('config/vite-plugin-name-injection.mjs').pluginNameInjection();
  const file = path.join(dir, 'nested/src/component.tsx');
  assert.equal(plugin.transform('useTranslation()', file), 'useTranslation("@example/parent")');
  assert.equal(plugin.transform('useTranslation("explicit")', file), null);
  assert.equal(plugin.transform('const x = 1;', file), null);
  assert.equal(plugin.transform('useTranslation()', file + '.css'), null);
  plugin.buildStart();
  assert.equal(plugin.transform('useTranslation( )', file), 'useTranslation("@example/parent")');
  fs.unlinkSync('package.json');
  const orphan = load('config/vite-plugin-name-injection.mjs').pluginNameInjection();
  assert.equal(
    orphan.transform('useTranslation()', path.join(path.parse(dir).root, 'orphan.ts')),
    null
  );
});

test('Vite configuration keeps external globals and k8s aliases compatible with plugin consumers', () => {
  const marker = () => ({});
  const config = load('config/vite.config.mjs', {
    mocks: {
      '@vitejs/plugin-react': marker,
      vite: { defineConfig: value => value },
      'vite-plugin-node-polyfills': { nodePolyfills: marker },
      'vite-plugin-svgr': marker,
      'vite-plugin-css-injected-by-js': marker,
    },
  }).default;
  const globals = config.build.rollupOptions.output.globals;
  assert.equal(globals('react'), 'pluginLib.React');
  assert.equal(globals('@mui/material/Button'), 'pluginLib.MuiMaterial.Button');
  assert.equal(globals('unrecognized'), 'unrecognized');
  assert.ok(config.build.rollupOptions.external.some(item => item === 'react'));
  assert.ok(
    config.resolve.alias.some(item => item.find.test('@kinvolk/headlamp-plugin/lib/K8s/pod'))
  );
  assert.ok(
    path.isAbsolute(
      config.resolve.alias[0].customResolver('vite-plugin-node-polyfills/shims/buffer')
    )
  );
});

test('Storybook webpack setup preserves existing plugins and configures TSX, environment definitions and aliases', () => {
  const defined = [];
  class Plugin {
    constructor(options) {
      this.options = options;
      defined.push(options);
    }
  }
  const config = load('config/.storybook/main.mjs', {
    mocks: { webpack: { DefinePlugin: Plugin, ProvidePlugin: Plugin } },
  }).default;
  const input = {
    plugins: [],
    module: { rules: [] },
    resolve: { fallback: { fs: false }, alias: { keep: 'kept' } },
  };
  return config.webpackFinal(input).then(result => {
    assert.equal(result, input);
    assert.equal(result.module.rules[0].use.options.transpileOnly, true);
    assert.equal(result.resolve.fallback.fs, false);
    assert.equal(result.resolve.alias.keep, 'kept');
    assert.ok(
      result.resolve.alias['@kinvolk/headlamp-plugin/lib/k8s'].endsWith(
        path.join('lib', 'lib', 'k8s')
      )
    );
    assert.ok(defined[0]['import.meta.env']);
    assert.equal(defined[1].process, 'process/browser');
  });
});

test('Storybook preview selects themes and provides query and mock contexts', () => {
  const initialize = [];
  const makeTheme = [];
  const theme = load('config/.storybook/HeadlampTheme.js', {
    mocks: {
      'storybook/theming/create': { create: options => options },
      './headlamp_light.svg': 'logo.svg',
    },
  }).default;
  let configured;
  load('config/.storybook/manager.js', {
    mocks: {
      'storybook/manager-api': {
        addons: {
          setConfig: config => {
            configured = config;
          },
        },
      },
      './HeadlampTheme': theme,
    },
  });
  assert.equal(configured.theme.brandImage, 'logo.svg');
  class QueryClient {
    constructor(options) {
      this.options = options;
    }
  }
  const view = load('config/.storybook/preview.tsx', {
    mocks: {
      './index.css': {},
      './baseMocks': { baseMocks: ['base'], fallbackMocks: ['fallback'] },
      '@mui/material/styles': { ThemeProvider: 'theme' },
      '@tanstack/react-query': { QueryClient, QueryClientProvider: 'query' },
      'msw-storybook-addon': {
        initialize: options => initialize.push(options),
        mswLoader: 'loader',
      },
      '@storybook/addon-docs/blocks': {
        Title: 'title',
        Subtitle: 'subtitle',
        Description: 'description',
        Primary: 'primary',
        Controls: 'controls',
      },
      '@kinvolk/headlamp-plugin/lib/components/App/defaultAppThemes': {
        darkTheme: 'dark',
        lightTheme: 'light',
      },
      '@kinvolk/headlamp-plugin/lib/lib/themes': {
        createMuiTheme: theme => {
          makeTheme.push(theme);
          return theme;
        },
      },
    },
  });
  for (const value of ['#1f1f1f', '#FFF'])
    view.decorators[0](() => null, { globals: { backgrounds: { value } } });
  assert.deepEqual(makeTheme, ['dark', 'light']);
  assert.equal(initialize[0].onUnhandledRequest, 'warn');
  assert.equal(view.queryClient.options.defaultOptions.queries.retry, false);
  assert.equal(view.parameters.msw.handlers.base[0], 'base');
  assert.ok(view.parameters.docs.page());
});
