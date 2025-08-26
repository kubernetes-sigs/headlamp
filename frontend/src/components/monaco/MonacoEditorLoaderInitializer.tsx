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

import { loader } from '@monaco-editor/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBaseUrl } from '../../helpers/getBaseUrl';
import { isElectron } from '../../helpers/isElectron';

/**
 * A React component which configures the monaco-editor loader to make sure
 * it loads using local files instead of via a CDN. This component does not
 * load the Monaco editor, it just configures the loader for it.
 */
export function MonacoEditorLoaderInitializer({ children }: React.PropsWithChildren<{}>) {
  const { i18n } = useTranslation();

  // We need our setup to run before the first render, incase the first render
  // causes an editor instance to be initialized further in the tree; that's why it's
  // inside the initializer of a useState, because that runs before the first render
  useState(() => {
    // We also set the language for Monaco to load if it's available; but this only happens once, changing language is not supported
    const isLanguageSupported = [
      'de',
      'es',
      'fr',
      'it',
      'ja',
      'ko',
      'ru',
      'zh-cn',
      'zh-tw',
    ].includes(i18n.language);

    // Configure the monaco loader to load its scripts from the "assets/vs" local url instead of the default internet-based CDN.
    // This needs to include the origin and not just a relative path because it is used as a fetch
    // from inside a web worker; which isn't allowed to fetch from relative paths.
    // The Vite configuration will copy the relevant source files into the served assets/vs/ folder
    let url = `${window.location.origin}/${getBaseUrl()}assets/vs`;

    // If electron in the built app, get the base url from window.location.href
    // eg window.location.href
    //   'file:///Applications/Headlamp.app/Contents/Resources/frontend/index.html#/c/minikube-1/'

    if (isElectron() && window.location.href.includes('index.html')) {
      url = window.location.href.split('index.html')[0] + 'assets/vs';
    }

    loader.config({
      paths: {
        vs: url,
      },
      ...(isLanguageSupported ? { 'vs/nls': { availableLanguages: { '*': i18n.language } } } : {}),
    });
  });

  return <>{children}</>;
}
