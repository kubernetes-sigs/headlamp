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

import './i18n/config';
import './components/App/icons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import AppContainer from './components/App/AppContainer';
import { useCurrentAppTheme } from './components/App/themeSlice';
import ErrorBoundary from './components/common/ErrorBoundary';
import ErrorComponent from './components/common/ErrorPage';
import i18n from './i18n/config';
import { useElectronI18n } from './i18n/electronI18n';
import ThemeProviderNexti18n from './i18n/ThemeProviderNexti18n';
import { createMuiTheme, getThemeName, usePrefersColorScheme } from './lib/themes';
import { useTypedSelector } from './redux/reducers/reducers';
import store from './redux/stores/store';

function AppWithRedux(props: React.PropsWithChildren<{}>) {
  let themeName = useTypedSelector(state => state.theme.name);
  usePrefersColorScheme();
  useElectronI18n();

  if (!themeName) {
    themeName = getThemeName();
  }

  const currentAppTheme = useCurrentAppTheme();
  const muiTheme = useMemo(() => createMuiTheme(currentAppTheme), [themeName, currentAppTheme]);

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProviderNexti18n theme={muiTheme}>{props.children}</ThemeProviderNexti18n>
    </I18nextProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// https://vite.dev/guide/env-and-mode
// if you want to enable the devtools for react-query,
// just set REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS=true in .env file
const queryDevtoolsEnabled = import.meta.env.REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS === 'true';

function App() {
  return (
    <ErrorBoundary fallback={<ErrorComponent />}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          {queryDevtoolsEnabled && <ReactQueryDevtools initialIsOpen={false} />}

          <AppWithRedux>
            <AppContainer />
          </AppWithRedux>
        </QueryClientProvider>
      </Provider>
    </ErrorBoundary>
  );
}

export default App;
