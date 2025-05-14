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

import { configureStore } from '@reduxjs/toolkit';
import { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import defaultStore from '../redux/stores/store';

export type TestContextProps = PropsWithChildren<{
  store?: ReturnType<typeof configureStore>;
  routerMap?: Record<string, string>;
  urlPrefix?: string;
  urlSearchParams?: {
    [key: string]: string;
  };
}>;

export function TestContext(props: TestContextProps) {
  const { store, routerMap, urlPrefix = '', urlSearchParams, children } = props;
  let url = '';
  let routePath = '';

  for (const [key, value] of Object.entries(routerMap || {})) {
    // Add the prefix : to the key to make it a param if needed.
    routePath += '/' + (key.startsWith(':') ? key : ':' + key);
    url += '/' + value;
  }

  if (!!urlPrefix) {
    const prefix = urlPrefix.endsWith('/') ? urlPrefix.slice(0, -1) : urlPrefix;
    url = prefix + url;
    routePath = prefix + routePath;
  }

  if (!!urlSearchParams) {
    url += '?' + new URLSearchParams(urlSearchParams).toString();
  }

  return (
    <Provider store={store || defaultStore}>
      <MemoryRouter initialEntries={url ? [url] : undefined}>
        {routePath ? <Route path={routePath}>{children}</Route> : children}
      </MemoryRouter>
    </Provider>
  );
}

export function overrideKubeObject<U>(kubeObject: U, propsToOverride: Partial<U>) {
  for (const [key, value] of Object.entries(propsToOverride)) {
    if (value !== undefined) {
      // @ts-ignore
      kubeObject[key] = value;
    }
  }
}
