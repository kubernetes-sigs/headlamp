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

import * as fs from 'fs';
import * as path from 'path';
import { Translations, Namespace, TranslationCounts } from './types';

export function getLanguages(localesDir: string): string[] {
  return fs.readdirSync(localesDir)
    .filter(file => fs.statSync(path.join(localesDir, file)).isDirectory())
    .sort();
}

export function loadTranslationFile(localesDir: string, lang: string, namespace: Namespace): Translations | null {
  const filePath = path.join(localesDir, lang, `${namespace}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as Translations;
  } catch (error) {
    console.error(`Error loading ${filePath}:`, (error as Error).message);
    return null;
  }
}

export function countTranslations(translations: Translations | null): TranslationCounts {
  if (!translations) return { total: 0, translated: 0, empty: 0 };

  const keys = Object.keys(translations);
  const total = keys.length;
  const empty = keys.filter(key => translations[key] === '').length;
  const translated = total - empty;

  return { total, translated, empty };
}
