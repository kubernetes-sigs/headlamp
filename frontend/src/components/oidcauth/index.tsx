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
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { AUTH_STATUS_KEY } from './constants';

/** Signals OIDC authentication completion via localStorage for the popup handler. */
function OIDCAuth() {
  const { search } = useLocation();
  const cluster = new URLSearchParams(search).get('cluster');
  const { t } = useTranslation();

  useEffect(() => {
    if (cluster) {
      localStorage.setItem(AUTH_STATUS_KEY, 'success');
    }
  }, [cluster]);

  return <Typography color="textPrimary">{t('Redirecting to main page…')}</Typography>;
}

export default OIDCAuth;
