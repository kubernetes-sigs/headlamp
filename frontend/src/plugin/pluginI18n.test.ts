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
import i18next from 'i18next';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changePluginLanguage,
  getPluginTranslation,
  initializePluginI18n,
  useTranslation,
} from './pluginI18n';

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

  describe('getPluginTranslation', () => {
    // The plugin i18n code reads Headlamp's language from the default i18next
    // instance, which the app switches; tests set it directly.
    function setAppLanguage(language: string) {
      i18next.language = language;
      i18next.resolvedLanguage = language;
      mainI18n.language = language;
      mainI18n.resolvedLanguage = language;
    }

    function serveTranslations(byLocale: Record<string, Record<string, string>>) {
      fetchSpy.mockImplementation(async (url: string) => {
        const locale = Object.keys(byLocale).find(l => String(url).includes(`/locales/${l}/`));
        return locale
          ? { ok: true, status: 200, json: async () => byLocale[locale] }
          : { ok: false, status: 404, json: async () => ({}) };
      });
    }

    beforeEach(() => setAppLanguage('en'));

    afterEach(() => {
      i18next.language = undefined as unknown as string;
      i18next.resolvedLanguage = undefined;
    });

    it('translates outside React and follows a later language change', async () => {
      serveTranslations({ en: {}, de: { Hello: 'Hallo' } });
      await initializePluginI18n(
        'nonhook-plugin',
        { name: 'nonhook-plugin', headlamp: { i18n: ['en', 'de'] } },
        '/plugins/nonhook-plugin'
      );

      const t = await getPluginTranslation('nonhook-plugin');
      expect(t('Hello')).toBe('Hello');

      setAppLanguage('de');
      await changePluginLanguage('de');

      expect(t('Hello')).toBe('Hallo');
      expect((await getPluginTranslation('nonhook-plugin'))('Hello')).toBe('Hallo');
    });

    it('waits for the current language before returning', async () => {
      serveTranslations({ en: {}, de: { Hello: 'Hallo' } });
      await initializePluginI18n(
        'current-lang-plugin',
        { name: 'current-lang-plugin', headlamp: { i18n: ['en', 'de'] } },
        '/plugins/current-lang-plugin'
      );

      // The app is already on 'de', but no languageChanged event has reached
      // the plugin instance yet.
      setAppLanguage('de');
      const t = await getPluginTranslation('current-lang-plugin');

      expect(t('Hello')).toBe('Hallo');
    });

    it('creates one instance when callers ask while it is still loading', async () => {
      let releaseEn: () => void = () => {};
      const enLoaded = new Promise<void>(resolve => (releaseEn = resolve));
      fetchSpy.mockImplementation(async (url: string) => {
        if (String(url).includes('/locales/en/')) {
          await enLoaded;
        }
        return { ok: true, status: 200, json: async () => ({ Hello: 'Hello!' }) };
      });

      const startup = initializePluginI18n(
        'concurrent-plugin',
        { name: 'concurrent-plugin', headlamp: { i18n: ['en', 'de'] } },
        '/plugins/concurrent-plugin'
      );
      const first = getPluginTranslation('concurrent-plugin');
      const second = getPluginTranslation('concurrent-plugin');
      const { result } = renderHook(() => useTranslation('concurrent-plugin'));

      releaseEn();
      await startup;
      const [t1, t2] = await Promise.all([first, second]);
      await waitFor(() => expect(result.current.ready).toBe(true));

      // Every caller shares the instance startup created, so the locale is
      // fetched once and a later language change reaches all of them.
      expect(localeUrls(fetchSpy).filter(url => url.includes('/locales/en/'))).toHaveLength(1);
      expect(t1('Hello')).toBe('Hello!');
      expect(t2('Hello')).toBe('Hello!');

      serveTranslations({ de: { Hello: 'Hallo' } });
      setAppLanguage('de');
      await changePluginLanguage('de');

      expect(t1('Hello')).toBe('Hallo');
      expect(t2('Hello')).toBe('Hallo');
      expect(result.current.i18n?.language).toBe('de');
    });

    it('picks up a language change that happens while the instance is loading', async () => {
      let releaseEn: () => void = () => {};
      const enLoaded = new Promise<void>(resolve => (releaseEn = resolve));
      fetchSpy.mockImplementation(async (url: string) => {
        if (String(url).includes('/locales/en/')) {
          await enLoaded;
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ Hello: 'Hallo' }) };
      });

      const startup = initializePluginI18n(
        'switch-during-load-plugin',
        { name: 'switch-during-load-plugin', headlamp: { i18n: ['en', 'de'] } },
        '/plugins/switch-during-load-plugin'
      );

      // The user switches language before the instance exists, so Headlamp's
      // languageChanged listener has nothing to switch yet.
      setAppLanguage('de');
      await changePluginLanguage('de');
      releaseEn();
      await startup;

      const t = await getPluginTranslation('switch-during-load-plugin');
      expect(t('Hello')).toBe('Hallo');
    });

    it('keeps waiting when the language changes again while it loads', async () => {
      const release: Record<string, () => void> = {};
      const held: Record<string, Promise<void>> = {};
      for (const locale of ['de', 'fr']) {
        held[locale] = new Promise<void>(resolve => (release[locale] = resolve));
      }
      const texts: Record<string, Record<string, string>> = {
        en: {},
        de: { Hello: 'Hallo' },
        fr: { Hello: 'Bonjour' },
      };
      fetchSpy.mockImplementation(async (url: string) => {
        const locale = Object.keys(texts).find(l => String(url).includes(`/locales/${l}/`))!;
        await held[locale];
        return { ok: true, status: 200, json: async () => texts[locale] };
      });

      await initializePluginI18n(
        'superseded-plugin',
        { name: 'superseded-plugin', headlamp: { i18n: ['en', 'de', 'fr'] } },
        '/plugins/superseded-plugin'
      );

      setAppLanguage('de');
      // Read the text as soon as the getter resolves, as a one-off message would.
      const textWhenResolved = getPluginTranslation('superseded-plugin').then(t => t('Hello'));
      await new Promise(resolve => setTimeout(resolve, 0));

      // While 'de' is loading the user moves on to 'fr'. The 'de' load
      // finishes first and is dropped as stale; the getter must wait for 'fr'.
      setAppLanguage('fr');
      const switchToFr = changePluginLanguage('fr');
      release.de();
      await new Promise(resolve => setTimeout(resolve, 0));
      release.fr();
      await switchToFr;

      expect(await textWhenResolved).toBe('Bonjour');
    });

    it("does not cancel another plugin's language change", async () => {
      let releaseA: () => void = () => {};
      const aHeld = new Promise<void>(resolve => (releaseA = resolve));
      fetchSpy.mockImplementation(async (url: string) => {
        if (String(url).includes('/plugins/plugin-a/locales/pt/')) {
          await aHeld;
          return { ok: true, status: 200, json: async () => ({ Hello: 'Olá' }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      for (const name of ['plugin-a', 'plugin-b']) {
        await initializePluginI18n(
          name,
          { name, headlamp: { i18n: ['en', 'pt', 'pt-PT'] } },
          `/plugins/${name}`
        );
      }
      const tA = await getPluginTranslation('plugin-a');

      // Headlamp's listener passes the raw language ('pt'), while catching a
      // plugin up uses the resolved one ('pt-PT').
      i18next.language = 'pt';
      i18next.resolvedLanguage = 'pt-PT';
      const switchAll = changePluginLanguage('pt');
      await getPluginTranslation('plugin-b');

      releaseA();
      await switchAll;
      expect(tA('Hello')).toBe('Olá');
    });

    it('starts a translator kept from before startup in the current language', async () => {
      // Asked for before the plugin's translations were set up, so it starts
      // out returning keys and picks up the instance once it exists.
      const early = await getPluginTranslation('early-plugin');
      expect(early('Hello')).toBe('Hello');

      let releaseDe: () => void = () => {};
      const deHeld = new Promise<void>(resolve => (releaseDe = resolve));
      const texts: Record<string, Record<string, string>> = {
        en: { Hello: 'Hello!' },
        de: { Hello: 'Hallo' },
        fr: { Hello: 'Bonjour' },
      };
      fetchSpy.mockImplementation(async (url: string) => {
        const locale = Object.keys(texts).find(l => String(url).includes(`/locales/${l}/`))!;
        if (locale === 'de') {
          await deHeld;
        }
        return { ok: true, status: 200, json: async () => texts[locale] };
      });

      setAppLanguage('de');
      const startup = initializePluginI18n(
        'early-plugin',
        { name: 'early-plugin', headlamp: { i18n: ['en', 'de', 'fr'] } },
        '/plugins/early-plugin'
      );
      // Switched during startup to a locale that has not been fetched, with
      // no changePluginLanguage call reaching this plugin.
      setAppLanguage('fr');
      releaseDe();
      await startup;

      expect(early('Hello')).toBe('Bonjour');
    });

    it('catches up with a switch made while its own load was running', async () => {
      let releaseDe: () => void = () => {};
      const deHeld = new Promise<void>(resolve => (releaseDe = resolve));
      const texts: Record<string, Record<string, string>> = {
        en: {},
        de: { Hello: 'Hallo' },
        fr: { Hello: 'Bonjour' },
      };
      fetchSpy.mockImplementation(async (url: string) => {
        const locale = Object.keys(texts).find(l => String(url).includes(`/locales/${l}/`))!;
        if (locale === 'de') {
          await deHeld;
        }
        return { ok: true, status: 200, json: async () => texts[locale] };
      });

      await initializePluginI18n(
        'catch-up-plugin',
        { name: 'catch-up-plugin', headlamp: { i18n: ['en', 'de', 'fr'] } },
        '/plugins/catch-up-plugin'
      );

      setAppLanguage('de');
      const textWhenResolved = getPluginTranslation('catch-up-plugin').then(t => t('Hello'));
      await new Promise(resolve => setTimeout(resolve, 0));

      // No changePluginLanguage call: the getter's own 'de' load completes,
      // but Headlamp is on 'fr' by then.
      setAppLanguage('fr');
      releaseDe();

      expect(await textWhenResolved).toBe('Bonjour');
    });

    it('supports the default-value form of t', async () => {
      const t = await getPluginTranslation('default-value-plugin');

      expect(t('missing.key', 'Hello {{name}}', { name: 'prod' })).toBe('Hello prod');
    });

    it('returns the key, interpolated, for a plugin without declared locales', async () => {
      await initializePluginI18n(
        'nonhook-no-i18n-plugin',
        { name: 'nonhook-no-i18n-plugin' },
        '/plugins/nonhook-no-i18n-plugin'
      );

      const t = await getPluginTranslation('nonhook-no-i18n-plugin');

      expect(localeUrls(fetchSpy)).toHaveLength(0);
      expect(t('Hello')).toBe('Hello');
      expect(t('Cannot reach {{name}}: check your VPN.', { name: 'prod' })).toBe(
        'Cannot reach prod: check your VPN.'
      );
    });

    it('falls back to the interpolated key when a translation is missing', async () => {
      // Every locale file 404s (the default fetch mock).
      await initializePluginI18n(
        'nonhook-missing-plugin',
        { name: 'nonhook-missing-plugin', headlamp: { i18n: ['en', 'de'] } },
        '/plugins/nonhook-missing-plugin'
      );
      setAppLanguage('de');

      const t = await getPluginTranslation('nonhook-missing-plugin');

      expect(t('Cannot reach {{name}}: check your VPN.', { name: 'prod' })).toBe(
        'Cannot reach prod: check your VPN.'
      );
    });
  });
});
