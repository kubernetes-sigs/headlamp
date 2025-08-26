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

import GlobalStyles from '@mui/material/GlobalStyles';
import { SnackbarProvider } from 'notistack';
import React, { useEffect } from 'react';
import { BrowserRouter, HashRouter, useHistory, useLocation } from 'react-router-dom';
import { getBaseUrl } from '../../helpers/getBaseUrl';
import { setBackendToken } from '../../helpers/getHeadlampAPIHeaders';
import { isElectron } from '../../helpers/isElectron';
import Plugins from '../../plugin/Plugins';
import ReleaseNotes from '../common/ReleaseNotes/ReleaseNotes';
import { MonacoEditorLoaderInitializer } from '../monaco/MonacoEditorLoaderInitializer';
import Layout from './Layout';
import { PreviousRouteProvider } from './RouteSwitcher';

window.desktopApi?.send('request-backend-token');
window.desktopApi?.receive('backend-token', (token: string) => {
  setBackendToken(token);
});

/**
 * Validates if a redirect path is safe to use
 * @param redirectPath - The path to validate
 * @returns true if the path is safe, false otherwise
 */
export const isValidRedirectPath = (redirectPath: string): boolean => {
  // Reject empty or null paths
  if (!redirectPath || redirectPath.trim() === '') {
    return false;
  }

  // Reject paths that start with dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'];
  const lowerPath = redirectPath.toLowerCase();
  if (dangerousProtocols.some(protocol => lowerPath.startsWith(protocol))) {
    return false;
  }

  // Reject absolute URLs (external redirects)
  if (redirectPath.startsWith('http://') || redirectPath.startsWith('https://')) {
    return false;
  }

  // Reject protocol-relative URLs (//example.com)
  if (redirectPath.startsWith('//')) {
    return false;
  }

  // Allow relative paths that start with / or are relative paths
  // This ensures we only allow internal navigation
  return true;
};

/**
 * QueryParamRedirect is a component that checks for a 'to' query parameter and redirects accordingly
 * This should be placed near the top of your component hierarchy,
 * typically in your main App component
 * @returns null - This component doesn't render anything visible
 */
const QueryParamRedirect = () => {
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    // Get the current URL search params
    const searchParams = new URLSearchParams(location.search);

    // Check if 'to' parameter exists
    const redirectPath = searchParams.get('to');

    if (redirectPath) {
      // Validate the redirect path for security
      if (!isValidRedirectPath(redirectPath)) {
        console.warn('QueryParamRedirect: Invalid redirect path blocked:', redirectPath);
        return;
      }

      // Create a new URLSearchParams without the 'to' parameter
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('to');

      // Construct the new URL without the 'to' parameter
      const newSearch = newSearchParams.toString();
      const newPathWithSearch = redirectPath + (newSearch ? `?${newSearch}` : '');

      // Perform the redirect
      history.replace(newPathWithSearch);
    }
  }, [location.search, history]);

  return null;
};
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
          <MonacoEditorLoaderInitializer>
            <Plugins />
            <Layout />
          </MonacoEditorLoaderInitializer>
          <QueryParamRedirect />
        </PreviousRouteProvider>
      </Router>
      <ReleaseNotes />
    </SnackbarProvider>
  );
}
