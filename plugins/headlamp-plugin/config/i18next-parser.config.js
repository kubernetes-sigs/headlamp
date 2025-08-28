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

// Get the current working directory (where the plugin is)
const pluginDir = process.cwd();
const directoryPath = path.join(pluginDir, './locales');

// Read configured locales from package.json
let configuredLocales = [];
const packageJsonPath = path.join(pluginDir, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (Array.isArray(packageJson.headlamp?.i18n)) {
      configuredLocales = packageJson.headlamp.i18n;
    }
  } catch (error) {
    console.warn('Failed to read package.json for i18n configuration:', error.message);
  }
}

// Fall back to scanning existing locale directories if no configuration found
const currentLocales = [];
if (fs.existsSync(directoryPath)) {
  fs.readdirSync(directoryPath).forEach(file => currentLocales.push(file));
}

// Use configured locales first, then existing directories, then fallback to 'en'
const localesToUse =
  configuredLocales.length > 0
    ? configuredLocales
    : currentLocales.length > 0
    ? currentLocales
    : ['en'];

module.exports = {
  lexers: {
    default: ['JsxLexer'],
  },
  namespaceSeparator: '|',
  keySeparator: false,
  output: path.join(directoryPath, './$LOCALE/$NAMESPACE.json'),
  locales: localesToUse,
  contextSeparator: '//context:',
  defaultValue: (locale, _namespace, key) => {
    // The English catalog has "SomeKey": "SomeKey" so we stop warnings about
    // missing values.
    if (locale === 'en') {
      const contextSepIdx = key.indexOf('//context:');
      if (contextSepIdx >= 0) {
        return key.substring(0, contextSepIdx);
      }
      return key;
    }
    return '';
  },
};
