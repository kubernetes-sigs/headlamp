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

import i18next from 'i18next';
import { CURRENT_LOCALES, LOCALES_DIR } from './i18n-helper';
import { createJsonBackend } from './i18nextJsonBackend';

i18next.use(createJsonBackend(LOCALES_DIR)).init({
  debug: process.env.NODE_ENV === 'development',
  fallbackLng: 'en',
  supportedLngs: CURRENT_LOCALES,
  // CURRENT_LOCALES comes from the lowercase locale directory names, so region codes
  // like pt-BR have to be lowercased to match them and to resolve the load path.
  lowerCaseLng: true,
  ns: ['app'],
  defaultNS: 'app',
  interpolation: {
    escapeValue: false, // not needed for react as it escapes by default
    format: function (value, format, lng) {
      // https://www.i18next.com/translation-function/formatting
      if (format === 'number') return new Intl.NumberFormat(lng).format(value);
      if (format === 'date') return new Intl.DateTimeFormat(lng).format(value);
      return value;
    },
  },
  returnEmptyString: false,
  nsSeparator: '|',
  keySeparator: false,
});

export default i18next;
