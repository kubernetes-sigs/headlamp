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
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { setConfig } from '../../redux/configSlice';
import { useTypedSelector } from '../../redux/hooks';
import { AUTH_STATUS_KEY } from './constants';

/** Signals OIDC authentication completion via localStorage for the popup handler or navigates in full-page mode. */
function OIDCAuth() {
  const { search } = useLocation();
  const history = useHistory();
  const dispatch = useDispatch();
  const clusters = useTypedSelector(state => state.config.clusters);
  const cluster = new URLSearchParams(search).get('cluster');
  const { t } = useTranslation();
  const hasHandledRef = useRef(false);

  useEffect(() => {
    if (!cluster || hasHandledRef.current) {
      return;
    }

    const isPopup = Boolean(window.opener && window.opener !== window);
    if (isPopup) {
      localStorage.setItem(AUTH_STATUS_KEY, 'success');
      hasHandledRef.current = true;
    } else if (!clusters?.[cluster]) {
      return;
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
      hasHandledRef.current = true;
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
  }, [cluster, clusters, dispatch, history]);

  return <Typography color="textPrimary">{t('Redirecting to main page…')}</Typography>;
}

export default OIDCAuth;
