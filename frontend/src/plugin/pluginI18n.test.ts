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

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changePluginLanguage, initializePluginI18n, useTranslation } from './pluginI18n';

// Mock react-i18next so the hook can read a "current language" without a provider.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));

function localeUrls(fetchSpy: ReturnType<typeof vi.fn>): string[] {
  return fetchSpy.mock.calls
    .map(args => String(args[0]))
    .filter(url => url.includes('/locales/') && url.includes('translation.json'));
}

describe('pluginI18n', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Default: every translation file request 404s, mirroring a plugin (e.g. the
    // Prometheus plugin in #4854) whose locale files are not present.
    fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch translation files for a plugin that does not declare i18n', async () => {
    // Plugin with no `headlamp.i18n` in package.json.
    await initializePluginI18n(
      'no-i18n-plugin',
      { name: 'no-i18n-plugin' },
      '/plugins/no-i18n-plugin'
    );

    const { result } = renderHook(() => useTranslation('no-i18n-plugin'));
    await waitFor(() => expect(result.current.ready).toBe(true));

    // An undeclared plugin has no translation files, so it must not probe for any.
    expect(localeUrls(fetchSpy)).toHaveLength(0);
    // With no translations, t() falls back to returning the original key.
    expect(result.current.t('Hello')).toBe('Hello');
  });

  it('fetches only the active language, not every declared locale (#4854)', async () => {
    // Mirrors the Prometheus plugin: declares many locales, user is viewing 'en'.
    await initializePluginI18n(
      'many-locales-plugin',
      {
        name: 'many-locales-plugin',
        headlamp: { i18n: ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh'] },
      },
      '/plugins/many-locales-plugin'
    );

    const urls = localeUrls(fetchSpy);
    // Only the active language is fetched up front - not the whole declared list,
    // which is what produced the 404 flood in #4854.
    expect(urls).toEqual([
      expect.stringContaining('/plugins/many-locales-plugin/locales/en/translation.json'),
    ]);
    expect(urls.some(url => url.includes('/locales/ja/'))).toBe(false);
  });

  it('lazily fetches a locale only when the language switches to it', async () => {
    await initializePluginI18n(
      'lazy-plugin',
      { name: 'lazy-plugin', headlamp: { i18n: ['en', 'de'] } },
      '/plugins/lazy-plugin'
    );
    // 'de' was not fetched during init (user is on 'en').
    expect(localeUrls(fetchSpy).some(url => url.includes('/locales/de/'))).toBe(false);

    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ Hello: 'Hallo' }) });
    await changePluginLanguage('de');

    // Switching to 'de' triggers an on-demand fetch for it.
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/plugins/lazy-plugin/locales/de/translation.json')
    );
  });
});
