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

import cronstrue from 'cronstrue/i18n';
import { describe, expect, it, vi } from 'vitest';
import { supportedLanguages } from '../../i18n/config';
import { getCronstrueLocale } from './List';

describe('getCronstrueLocale', () => {
  it.each([
    ['en', 'en'],
    ['tr', 'tr'],
    ['pt-BR', 'pt_BR'],
    ['pt-PT', 'pt_PT'],
    ['pt', 'pt_PT'],
    ['zh-TW', 'zh_TW'],
    ['zh', 'zh_CN'],
    ['en-US', 'en'],
    ['hi', 'en'],
  ])('maps %s to %s', (language, expected) => {
    expect(getCronstrueLocale(language)).toBe(expected);
  });

  it('gives cronstrue a known locale for every supported language', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const language of Object.keys(supportedLanguages)) {
      cronstrue.toString('0 9 * * 1', { locale: getCronstrueLocale(language) });
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
