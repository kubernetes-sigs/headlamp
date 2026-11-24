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

import { render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changePluginLanguage, initializePluginI18n, useTranslation } from './pluginI18n';

// Mock react-i18next so the hook can read a "current language" without a provider.
// Mutable so tests can simulate the app switching language.
const mainI18n: { language: string; resolvedLanguage: string } = {
  language: 'en',
  resolvedLanguage: 'en',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mainI18n }),
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
    mainI18n.language = 'en';
    mainI18n.resolvedLanguage = 'en';
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

  it('does not re-probe a missing locale each time the language switches back', async () => {
    await initializePluginI18n(
      'reprobe-plugin',
      { name: 'reprobe-plugin', headlamp: { i18n: ['en', 'de'] } },
      '/plugins/reprobe-plugin'
    );

    const deFetches = () => localeUrls(fetchSpy).filter(url => url.includes('/locales/de/')).length;

    // 'de' has no translation file, so the first switch 404s once.
    await changePluginLanguage('de');
    expect(deFetches()).toBe(1);

    // Switching away and back must not fetch it again - re-probing a file known
    // to be absent is exactly the 404 flood this change exists to stop (#4854).
    await changePluginLanguage('en');
    await changePluginLanguage('de');
    await changePluginLanguage('en');
    await changePluginLanguage('de');
    expect(deFetches()).toBe(1);
  });

  it('shares a single request when several callers need the same locale at once', async () => {
    await initializePluginI18n(
      'dedupe-plugin',
      { name: 'dedupe-plugin', headlamp: { i18n: ['en', 'de'] } },
      '/plugins/dedupe-plugin'
    );

    // Every mounted hook and the languageChanged listener react to the same
    // switch; they must not each start their own fetch for the same locale.
    await Promise.all([
      changePluginLanguage('de'),
      changePluginLanguage('de'),
      changePluginLanguage('de'),
    ]);

    expect(localeUrls(fetchSpy).filter(url => url.includes('/locales/de/'))).toHaveLength(1);
  });

  it('re-renders with the new translations once the locale has loaded', async () => {
    fetchSpy.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('/locales/de/') ? { Hello: 'Hallo' } : { Hello: 'Hello' },
    }));

    await initializePluginI18n(
      'render-plugin',
      { name: 'render-plugin', headlamp: { i18n: ['en', 'de'] } },
      '/plugins/render-plugin'
    );

    function Widget() {
      const { t } = useTranslation('render-plugin');
      return React.createElement('div', { 'data-testid': 'out' }, t('Hello') as string);
    }

    const { rerender } = render(React.createElement(Widget));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('Hello'));

    // The main i18n switch re-renders consumers before the plugin's own locale
    // has been fetched, so the component must be re-rendered again once the
    // plugin instance has actually changed language.
    mainI18n.language = 'de';
    mainI18n.resolvedLanguage = 'de';
    rerender(React.createElement(Widget));

    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('Hallo'));
  });

  it('ignores a slow language change that a newer one has superseded', async () => {
    await initializePluginI18n(
      'race-plugin',
      { name: 'race-plugin', headlamp: { i18n: ['en', 'de', 'fr'] } },
      '/plugins/race-plugin'
    );

    // Grab the plugin's i18n instance, then unmount so the hook's own language
    // sync cannot mask the race by re-applying the main language afterwards.
    const { result, unmount } = renderHook(() => useTranslation('race-plugin'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const instance = result.current.i18n;
    unmount();

    // 'de' resolves slowly and 'fr' immediately, so the 'de' switch lands last.
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('/locales/de/')) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { ok: true, status: 200, json: async () => ({ Hello: 'Hallo' }) };
      }
      return { ok: true, status: 200, json: async () => ({ Hello: 'Bonjour' }) };
    });

    await Promise.all([changePluginLanguage('de'), changePluginLanguage('fr')]);

    // The user ended up on 'fr', so the late 'de' completion must not win.
    expect(instance?.language).toBe('fr');
  });
});
