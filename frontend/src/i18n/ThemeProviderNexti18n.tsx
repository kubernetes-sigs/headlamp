import { deDE, enUS, esES, frFR, hiIN, itIT, ptPT, zhTW } from '@mui/material/locale';
import { createTheme, StyledEngineProvider, Theme, ThemeProvider } from '@mui/material/styles';
import React, { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from '../components/common';

/**
 * Returns the Material UI locale object for the given language code.
 *
 * @remarks
 * This method retrieves the locale configuration for a specific language supported by
 * Material UI. It checks the provided language code against a predefined set of available locales,
 * and returns the corresponding locale object. If the language code is not found, it defaults to
 * English (`enUS`).
 *
 * @param locale - The language code for which the locale object is required (e.g., 'en', 'pt', 'es').
 *
 * @returns The Material UI locale object corresponding to the provided language code.
 *          Defaults to `enUS` if the locale is not found in the predefined list.
 */

function getLocale(locale: string): typeof enUS {
  const LOCALES = {
    en: enUS,
    pt: ptPT,
    es: esES,
    de: deDE,
    ta: enUS, // @todo: material ui needs a translation for this.
    hi: hiIN,
    fr: frFR,
    it: itIT,
    'zh-tw': zhTW,
  };
  type LocalesType = 'en' | 'pt' | 'es' | 'ta' | 'de' | 'hi' | 'fr' | 'it' | 'zh-tw';
  return locale in LOCALES ? LOCALES[locale as LocalesType] : LOCALES['en'];
}

/**
 * A custom theme provider component that integrates Material UI's theme with `react-i18next` for language selection.
 * It ensures that both the theme and language are synchronized, providing seamless localization across the application.
 *
 * @remarks
 * This component functions like a standard Material UI `ThemeProvider`, but it also listens for language changes using `react-i18next`.
 * When the language is changed, the corresponding Material UI locale is applied to update the theme accordingly.
 * This is essential for supporting multiple languages and ensuring the UI behaves correctly with Right-To-Left (RTL) languages.
 *
 * The component will show a loading state (`<Loader />`) until the i18n resources are ready for rendering.
 *
 * @param props - The properties for the component.
 * @param props.theme - The Material UI theme object to be applied to the app.
 * @param props.children - The child components wrapped by this theme provider.
 *
 * @returns The children components wrapped with the updated Material UI theme and language configurations.
 *
 * @example
 * ```tsx
 * <ThemeProviderNexti18n theme={theme}>
 *   <YourComponent />
 * </ThemeProviderNexti18n>
 * ```
 */
const ThemeProviderNexti18n: React.FunctionComponent<{
  theme: Theme;
  children: ReactNode;
}> = props => {
  const { i18n, ready: isI18nReady } = useTranslation(['translation', 'glossary'], {
    useSuspense: false,
  });
  const [lang, setLang] = useState(i18n.language);

  function changeLang(lng: string) {
    if (lng) {
      document.documentElement.lang = lng;
      document.body.dir = i18n.dir();
      setLang(lng);
    }
  }

  useEffect(() => {
    i18n.on('languageChanged', changeLang);
    if (i18n.language) {
      // Set the lang when the page loads too.
      changeLang(i18n.language);
    }
    return () => {
      i18n.off('languageChanged', changeLang);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const theme = createTheme(props.theme, getLocale(lang));

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        {!!isI18nReady ? props.children : <Loader title="Loading..." />}
      </ThemeProvider>
    </StyledEngineProvider>
  );
};

export default ThemeProviderNexti18n;
