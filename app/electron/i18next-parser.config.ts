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

import * as path from 'path';
import sharedConfig from '../../frontend/src/i18n/i18nextSharedConfig.mjs';
import { CURRENT_LOCALES, LOCALES_DIR } from './i18n-helper';

export default {
  lexers: {
    default: ['JsxLexer'],
  },
  namespaceSeparator: '|',
  keySeparator: false,
  defaultNamespace: 'app',
  contextSeparator: sharedConfig.contextSeparator,
  output: path.join(LOCALES_DIR, '$LOCALE/$NAMESPACE.json'),
  locales: CURRENT_LOCALES.length > 0 ? CURRENT_LOCALES : ['en'],
  // The English catalog has "SomeKey": "SomeKey" so we stop warnings about
  // missing values.
  useKeysAsDefaultValue: (locale: string) => locale === 'en',
};
