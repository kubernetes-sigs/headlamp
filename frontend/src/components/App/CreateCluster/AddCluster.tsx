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

import { InlineIcon } from '@iconify/react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../../../helpers/isElectron';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { ClusterProviderInfo } from '../../../redux/clusterProviderSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { DialogProps } from '../../common/Dialog';
import { PageGrid } from '../../common/Resource';
import SectionBox from '../../common/SectionBox';

function AddClusterProvider({ title, icon, description, url }: ClusterProviderInfo) {
  const history = useHistory();
  const { t } = useTranslation(['translation']);
  const Icon = icon;
  const avatar = <Icon width={24} height={24} />;

  return (
    <Card variant="outlined">
      <CardHeader title={title} avatar={avatar} />
      <CardContent>
        <Typography>{description}</Typography>
        <Button variant="contained" onClick={() => history.push(url)} sx={{ mt: 2 }}>
          {t('translation|Add')}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AddCluster(props: DialogProps & { onChoice: () => void }) {
  const { open } = props;
  const { t } = useTranslation(['translation']);
  const history = useHistory();
  const addClusterProviders = useTypedSelector(state => state.clusterProvider.clusterProviders);
  const customSidebarEntries = useTypedSelector(state => state.sidebar.entries);

  if (!open) {
    return null;
  }

  const isPluginCatalogRegistered = Object.values(customSidebarEntries).some(
    entry => entry.url === '/plugin-catalog'
  );

  return (
    <PageGrid>
      <SectionBox backLink title={t('translation|Add Cluster')} py={2} mt={[4, 0, 0]}>
        <Grid container justifyContent="flex-start" alignItems="stretch" spacing={4}>
          <Grid item xs={12}>
            <Typography>
              {t('Proceed to select your preferred method for cluster creation and addition')}
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Button
                  onClick={() => history.push(createRouteURL('loadKubeConfig'))}
                  startIcon={<InlineIcon icon="mdi:plus-box-outline" />}
                >
                  {t('translation|Load from KubeConfig')}
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="h4">{t('translation|Providers')}</Typography>
          </Grid>
          {isElectron() && isPluginCatalogRegistered && addClusterProviders.length === 0 && (
            <Grid item xs={12}>
              <Button
                onClick={() => history.push('/#/plugin-catalog/headlamp-plugins/headlamp_minikube')}
                startIcon={<InlineIcon icon="mdi:plus-box-outline" />}
              >
                {t('translation|Add Local Cluster Provider')}
              </Button>
            </Grid>
          )}
          {addClusterProviders.length > 0 && (
            <Grid item xs={12}>
              {addClusterProviders.map(addClusterProviderInfo => (
                <AddClusterProvider {...addClusterProviderInfo} />
              ))}
            </Grid>
          )}
        </Grid>
      </SectionBox>
    </PageGrid>
  );
}
