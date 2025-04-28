import { InlineIcon } from '@iconify/react';
import { Button, Card, CardContent, CardHeader, Grid, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { createRouteURL } from '../../../lib/router';
import { ClusterProviderInfo } from '../../../redux/clusterProviderSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import { DialogProps, PageGrid, SectionBox } from '../../common';

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

  if (!open) {
    return null;
  }

  return (
    <PageGrid>
      <SectionBox backLink title={t('translation|Add Cluster')} py={2} mt={[4, 0, 0]}>
        <Grid container justifyContent="flex-start" alignItems="stretch" spacing={4}>
          <Grid size={{ xs: 12 }}>
            <Typography>
              {t('Proceed to select your preferred method for cluster creation and addition')}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
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
          {addClusterProviders.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="h4">{t('translation|Providers')}</Typography>
            </Grid>
          )}
          {addClusterProviders.length > 0 && (
            <Grid size={{ xs: 12 }}>
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
