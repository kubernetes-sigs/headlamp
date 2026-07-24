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

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import sharedConfig from '../i18n/i18nextSharedConfig.mjs';

const testI18nResources = {
  en: Object.fromEntries(sharedConfig.namespaces.map(namespace => [namespace, {}])),
};

export const testI18n = createInstance();

export async function initTestI18n() {
  if (testI18n.isInitialized) {
    return testI18n;
  }

  await testI18n.use(initReactI18next).init({
    resources: testI18nResources,
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en'],
    ns: sharedConfig.namespaces,
    defaultNS: sharedConfig.defaultNamespace,
    contextSeparator: sharedConfig.contextSeparator,
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
    react: {
      useSuspense: false,
    },
    nsSeparator: '|',
    keySeparator: false,
  });

  return testI18n;
}
