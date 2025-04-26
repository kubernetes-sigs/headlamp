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
