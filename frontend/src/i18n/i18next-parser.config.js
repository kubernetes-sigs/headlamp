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
import path from 'path';
import { fileURLToPath } from 'url';
import sharedConfig from './i18nextSharedConfig.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const directoryPath = path.join(__dirname, sharedConfig.localesPath);
const currentLocales = [];

fs.readdirSync(directoryPath).forEach(file => currentLocales.push(file));

export default {
  lexers: {
    default: ['JsxLexer'],
  },
  namespaceSeparator: '|',
  keySeparator: false,
  output: path.join(directoryPath, './$LOCALE/$NAMESPACE.json'),
  locales: currentLocales,
  contextSeparator: sharedConfig.contextSeparator,
  defaultValue: (locale, _namespace, key) => {
    // The English catalog has "SomeKey": "SomeKey" so we stop warnings about
    // missing values.
    if (locale === 'en') {
      const contextSepIdx = key.indexOf(sharedConfig.contextSeparator);
      if (contextSepIdx >= 0) {
        return key.substring(0, contextSepIdx);
      }
      return key;
    }
    return '';
  },
};
