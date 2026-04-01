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
import { queryClient } from '../../lib/queryClient';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { AuthWorkflowSplash } from '../common/AuthWorkflowSplash';

const OIDCAuth: FunctionComponent<{}> = () => {
  const location = useLocation();
  const history = useHistory();
  const urlSearchParams = new URLSearchParams(location.search);
  const cluster = urlSearchParams.get('cluster');
  const { t } = useTranslation();

  useEffect(() => {
    if (!cluster) {
      return;
    }

    localStorage.setItem('auth_status', 'success');
    queryClient.invalidateQueries({ queryKey: ['clusterMe', cluster], exact: true });
    const home = createRouteURL('cluster', { cluster });
    if (home) {
      history.replace(home);
    }
  }, [cluster, history]);

  if (!cluster) {
    return (
      <Typography color="textPrimary">
        {t('Missing cluster in URL. Open Headlamp from your cluster link or try signing in again.')}
      </Typography>
    );
  }

  return (
    <AuthWorkflowSplash
      title={t('Redirecting to main page…')}
      subtitle={t('Taking you to the cluster overview.')}
      branding={false}
    />
  );
};

export default OIDCAuth;
