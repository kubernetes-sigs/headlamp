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

import Typography from '@mui/material/Typography';
import { FunctionComponent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';

//@todo: needs cleanup.

// OIDCAuthFallbackDelayMs is how long /auth waits before navigating to
// returnTo on its own. The popup→opener storage handshake (when /auth is
// running inside an OAuth popup with a live opener) usually completes
// well before this, in which case AuthChooser's onCode handler navigates
// the opener and unmounts /auth, which cancels this fallback.
//
// When the storage handshake doesn't fire (page reloaded, opener gone,
// full-page redirect, etc.), the fallback unblocks the "Redirecting to
// main page…" hang reported in #4877 / #2126.
export const OIDCAuthFallbackDelayMs = 250;

const OIDCAuth: FunctionComponent<{}> = () => {
  const location = useLocation();
  const history = useHistory();
  const urlSearchParams = new URLSearchParams(location.search);
  const cluster = urlSearchParams.get('cluster');
  const returnTo = urlSearchParams.get('returnTo') || '';
  const { t } = useTranslation();

  useEffect(() => {
    if (cluster) {
      localStorage.setItem('auth_status', 'success');
    }
  }, [cluster]);

  // Defense-in-depth fallback: if the popup storage handshake never
  // completes, navigate the user out of the "Redirecting…" page on our
  // own. Cancelled on unmount so the happy path (opener navigates,
  // unmounting us) doesn't double-navigate.
  useEffect(() => {
    if (!returnTo) {
      return;
    }

    const id = window.setTimeout(() => {
      history.replace(returnTo);
    }, OIDCAuthFallbackDelayMs);

    return () => window.clearTimeout(id);
  }, [returnTo, history]);

  return <Typography color="textPrimary">{t('Redirecting to main page…')}</Typography>;
};

export default OIDCAuth;
