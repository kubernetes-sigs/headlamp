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
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { setConfig } from '../../redux/configSlice';
import { useTypedSelector } from '../../redux/hooks';
import { AUTH_STATUS_KEY } from './constants';

const handledAuthUrls = new Set<string>();

export function resetHandledAuthUrls() {
  handledAuthUrls.clear();
}

/** Signals OIDC authentication completion via localStorage for the popup handler or navigates in full-page mode. */
function OIDCAuth() {
  const { search } = useLocation();
  const history = useHistory();
  const dispatch = useDispatch();
  const clusters = useTypedSelector(state => state.config.clusters);
  const cluster = new URLSearchParams(search).get('cluster');
  const { t } = useTranslation();

  const isPopup = Boolean(window.opener && window.opener !== window);
  const storageError = useMemo(() => {
    if (!cluster || isPopup) {
      return null;
    }
    try {
      sessionStorage.setItem(`oidc-login-attempted.${cluster}`, 'true');
      return null;
    } catch {
      return t(
        'Unable to access browser storage to complete authentication. Please enable cookies and storage in your browser settings and try again.'
      );
    }
  }, [cluster, isPopup, t]);

  useEffect(() => {
    if (storageError || !cluster || handledAuthUrls.has(search)) {
      return;
    }

    handledAuthUrls.add(search);

    if (isPopup) {
      localStorage.setItem(AUTH_STATUS_KEY, 'success');
    }

    if (clusters?.[cluster] && clusters[cluster].useToken !== false) {
      const updatedClusters = {
        ...clusters,
        [cluster]: {
          ...clusters[cluster],
          useToken: false,
        },
      };
      dispatch(setConfig({ clusters: updatedClusters }));
    }

    if (!isPopup) {
      let returnUrl = '';
      try {
        returnUrl = sessionStorage.getItem('oidc_return_url') || '';
        if (returnUrl) {
          sessionStorage.removeItem('oidc_return_url');
        }
      } catch (e) {
        console.error('Failed to get return URL from sessionStorage', e);
      }

      if (!returnUrl && cluster) {
        returnUrl = createRouteURL('cluster', { cluster }) || `/c/${cluster}/`;
      }

      if (!returnUrl) {
        returnUrl = '/';
      }

      history.replace(returnUrl);
    }
  }, [cluster, clusters, dispatch, history, isPopup, search, storageError]);

  if (storageError) {
    return (
      <Typography color="error" role="alert">
        {storageError}
      </Typography>
    );
  }

  return <Typography color="textPrimary">{t('Redirecting to main page…')}</Typography>;
}

export default OIDCAuth;
