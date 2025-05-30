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

/**
 * @file Configures the i18next-parser to extract translatable strings from code.
 */

import fs from 'fs';
import path from 'path';
import sharedConfig from './i18nextSharedConfig.mjs';

/** @type {string} Path to the 'locales' directory. */
const directoryPath = path.join(import.meta.dirname, sharedConfig.localesPath);

/** @type {string[]} List of available language codes (e.g., 'en', 'es'). */
const currentLocales = [];

fs.readdirSync(directoryPath).forEach(file => currentLocales.push(file));

/**
 * @type {import('i18next-parser').UserConfig}
 */
export default {
  /** Defines how to parse different file types for translatable strings. */
  lexers: {
    default: ['JsxLexer'], // For .js, .jsx, .ts, .tsx files
  },
  /** Character separating namespace from key (e.g., "namespace|key"). */
  namespaceSeparator: '|',
  /** Character separating nested keys (e.g., "parent.child"). False if not used. */
  keySeparator: false,
  /** Output path for generated translation files (e.g., "locales/en/translation.json"). */
  output: path.join(directoryPath, './$LOCALE/$NAMESPACE.json'),
  /** List of languages to process. */
  locales: currentLocales,
  /** Character separating key from its context (e.g., "key_male"). */
  contextSeparator: sharedConfig.contextSeparator,
  /**
   * Sets the default value for new translation keys.
   * @param {string} locale Current language.
   * @param {string} _namespace Key's namespace.
   * @param {string} key The translation key.
   * @returns {string} Default translation value.
   */
  defaultValue: (locale, _namespace, key) => {
    // For English, use the key itself as the translation.
    if (locale === 'en') {
      const contextSepIdx = key.indexOf(sharedConfig.contextSeparator);
      // If there's a context (e.g. key_plural), use only the base key.
      return contextSepIdx >= 0 ? key.substring(0, contextSepIdx) : key;
    }
    // For other languages, leave it empty for translators.
    return '';
  },
};
