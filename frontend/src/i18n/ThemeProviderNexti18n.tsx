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

import {
  arSA,
  deDE,
  enUS,
  esES,
  frFR,
  heIL,
  hiIN,
  itIT,
  jaJP,
  koKR,
  ptPT,
  ruRU,
  urPK,
  zhCN,
  zhTW,
} from '@mui/material/locale';
import { createTheme, StyledEngineProvider, Theme, ThemeProvider } from '@mui/material/styles';
import React, { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from './config';

/**
 * Returns the Material-UI locale object for a given language code.
 *
 * @param locale - The language code to retrieve the locale for.
 * @returns A Material-UI locale object, defaults to enUS if locale is unsupported.
 */
function getLocale(locale: string): typeof enUS {
  const normalizedLocale = locale.toLowerCase();

  const LOCALES = {
    en: enUS,
    pt: ptPT,
    ru: ruRU,
    es: esES,
    de: deDE,
    ta: enUS, // @todo: material ui needs a translation for this.
    hi: hiIN,
    fr: frFR,
    it: itIT,
    ko: koKR,
    'zh-tw': zhTW,
    ja: jaJP,
    zh: zhCN,
    ar: arSA,
    ur: urPK,
    he: heIL,
  };

  type LocalesType =
    | 'en'
    | 'pt'
    | 'ru'
    | 'es'
    | 'ta'
    | 'de'
    | 'hi'
    | 'fr'
    | 'it'
    | 'zh-tw'
    | 'ja'
    | 'ko'
    | 'zh'
    | 'ar'
    | 'ur'
    | 'he';

  return normalizedLocale in LOCALES ? LOCALES[normalizedLocale as LocalesType] : LOCALES['en'];
}

interface ThemeProviderNexti18nProps {
  /** The Material-UI theme to apply. */
  theme: Theme;

  /** The child components to render within the theme provider. */
  children: ReactNode;
}

/**
 * A ThemeProvider that integrates with react-i18next for language selection,
 * applying Material-UI localization and RTL/LTR direction support.
 *
 * @param props - The properties to configure the ThemeProviderNexti18n component.
 * @returns A themed container with localized child components.
 */
const ThemeProviderNexti18n: React.FunctionComponent<ThemeProviderNexti18nProps> = props => {
  const { i18n, ready: isI18nReady } = useTranslation(['translation', 'glossary'], {
    useSuspense: false,
  });

  const [lang, setLang] = useState(i18n.language);

  /**
   * Updates the document language and direction based on the selected language.
   *
   * @param lng - The new language code.
   */
  function changeLang(lng: string) {
    if (lng) {
      const dir = supportedLanguages[lng]?.dir || 'ltr';

      document.documentElement.lang = lng;
      document.documentElement.dir = dir;
      document.body.dir = dir;

      setLang(lng);
    }
  }

  /**
   * Sets up language change listeners and initializes the document language.
   */
  useEffect(() => {
    i18n.on('languageChanged', changeLang);

    if (i18n.language) {
      // Set the language when the page loads.
      changeLang(i18n.language);
    }

    return () => {
      i18n.off('languageChanged', changeLang);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const theme = createTheme(
    {
      ...props.theme,
      // Use the local config metadata for the theme direction too
      direction: supportedLanguages[lang]?.dir || 'ltr',
    },
    getLocale(lang)
  );

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>{!!isI18nReady ? props.children : null}</ThemeProvider>
    </StyledEngineProvider>
  );
};

export default ThemeProviderNexti18n;
