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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { isElectron } from '../helpers/isElectron';

declare global {
  interface Window {
    desktopApi: any;
  }
}

// If we're running under electron, we need to communicate any language changes.
const ipcRenderer = isElectron() ? window.desktopApi : null;

function tellAppAboutLanguage(lang: string) {
  if (ipcRenderer) {
    ipcRenderer.send('locale', lang);
  }
}

/** Integration with Electron app, so it can change locale information. */
export function useElectronI18n() {
  const { i18n } = useTranslation();

  React.useEffect(() => {
    i18n.on('languageChanged', tellAppAboutLanguage);
    return () => {
      i18n.off('languageChanged', tellAppAboutLanguage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
