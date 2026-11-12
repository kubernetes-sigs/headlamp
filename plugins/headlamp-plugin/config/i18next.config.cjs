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
const path = require('path');
const { createDefaultValuePlugin } = require('./extraction-defaults.cjs');

const pluginDir = process.cwd();
const directoryPath = path.join(pluginDir, 'locales');
const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
const existingLocales = fs.existsSync(directoryPath)
  ? fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  : [];
const locales =
  Array.isArray(manifest.headlamp?.i18n) && manifest.headlamp.i18n.length > 0
    ? manifest.headlamp.i18n
    : existingLocales.length > 0
    ? existingLocales
    : ['en'];
const contextSeparator = '//context:';

module.exports = {
  locales,
  plugins: [createDefaultValuePlugin()],
  extract: {
    input: ['src/**/*.{ts,tsx,js,jsx}'],
    output: path.join(directoryPath, '{{language}}/{{namespace}}.json'),
    nsSeparator: '|',
    keySeparator: false,
    contextSeparator,
    primaryLanguage: 'en',
    removeUnusedKeys: false,
    sort: false,
    defaultValue: (key, _namespace, locale, value) =>
      locale === 'en' ? value ?? key.split(contextSeparator)[0] : '',
  },
};
