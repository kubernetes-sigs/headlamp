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

import { GlobalStyles } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import React from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { getBaseUrl } from '../../helpers/getBaseUrl';
import { setBackendToken } from '../../helpers/getHeadlampAPIHeaders';
import { isElectron } from '../../helpers/isElectron';
import Plugins from '../../plugin/Plugins';
import ReleaseNotes from '../common/ReleaseNotes/ReleaseNotes';
import Layout from './Layout';
import { PreviousRouteProvider } from './RouteSwitcher';

window.desktopApi?.send('request-backend-token');
window.desktopApi?.receive('backend-token', (token: string) => {
  setBackendToken(token);
});

export default function AppContainer() {
  const Router = ({ children }: React.PropsWithChildren<{}>) =>
    isElectron() ? (
      <HashRouter>{children}</HashRouter>
    ) : (
      <BrowserRouter basename={getBaseUrl()}>{children}</BrowserRouter>
    );

  return (
    <SnackbarProvider
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'left',
      }}
    >
      <GlobalStyles
        styles={{
          ':root': {
            '@media (prefers-reduced-motion: reduce)': {
              '& *': {
                animationDuration: '0.01ms !important',
                animationIterationCount: '1 !important',
                transitionDuration: '0.01ms !important',
                scrollBehavior: 'auto !important',
              },
            },
          },
        }}
      />
      <Router>
        <PreviousRouteProvider>
          <Plugins />
          <Layout />
        </PreviousRouteProvider>
      </Router>
      <ReleaseNotes />
    </SnackbarProvider>
  );
}
