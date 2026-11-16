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

import fs from 'fs';
import { fileURLToPath } from 'node:url';
import path from 'path';
import { createDefaultValuePlugin } from '../../../plugins/headlamp-plugin/config/extraction-defaults.cjs';
import sharedConfig from './i18nextSharedConfig.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const directoryPath = path.join(__dirname, sharedConfig.localesPath);
const currentLocales = [];

fs.readdirSync(directoryPath).forEach(file => currentLocales.push(file));

export default {
  locales: currentLocales,
  plugins: [createDefaultValuePlugin()],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    ignore: ['src/**/*.test.{ts,tsx}'],
    nsSeparator: '|',
    keySeparator: false,
    output: path.join(directoryPath, '{{language}}/{{namespace}}.json'),
    primaryLanguage: 'en',
    removeUnusedKeys: false,
    sort: false,
    contextSeparator: sharedConfig.contextSeparator,
    defaultValue: (key, _namespace, locale, value) => {
      if (locale === 'en') {
        if (value !== undefined) return value;
        const contextSepIdx = key.indexOf(sharedConfig.contextSeparator);
        return contextSepIdx >= 0 ? key.substring(0, contextSepIdx) : key;
      }
      return '';
    },
  },
};
