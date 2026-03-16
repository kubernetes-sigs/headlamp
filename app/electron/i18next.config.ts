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
import i18nextBackend from 'i18next-fs-backend';
import * as path from 'path';
import { CURRENT_LOCALES, LOCALES_DIR } from './i18n-helper';

i18next.use(i18nextBackend).init({
  debug: process.env.NODE_ENV === 'development',
  fallbackLng: 'en',
  supportedLngs: CURRENT_LOCALES,
  ns: ['app'],
  defaultNS: 'app',
  backend: {
    loadPath: path.join(LOCALES_DIR, '{{lng}}/{{ns}}.json'),
  },
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
