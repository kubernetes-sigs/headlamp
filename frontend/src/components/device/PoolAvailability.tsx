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

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import { useSelectedClusters } from '../../lib/k8s/api/v1/hooks';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import ResourcePoolStatusRequest, {
  PoolStatusRequestTimeoutError,
  usePoolStatusRequest,
} from '../../lib/k8s/resourcePoolStatusRequest';
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { ClusterGroupErrorMessage } from '../cluster/ClusterGroupErrorMessage';
import Loader from '../common/Loader';
import SectionBox from '../common/SectionBox';
import PoolAvailabilityTable from './PoolAvailabilityTable';

function PoolStatusResult({
  status,
  poolName,
}: {
  status: ReturnType<typeof usePoolStatusRequest>;
  poolName: string;
}) {
  const { t } = useTranslation(['glossary', 'translation']);

  if (status.isPending) {
    const message = status.isWaitingForPools
      ? t(
          'translation|The driver is still publishing a pool. The cluster waits up to 15 seconds for it.'
        )
      : t('translation|Calculating availability');
    return (
      <Box sx={{ textAlign: 'center' }}>
        <Loader title={message} />
        <Typography color="text.secondary">{message}</Typography>
      </Box>
    );
  }

  if (status.error) {
    if (status.error instanceof PoolStatusRequestTimeoutError) {
      return (
        <Alert severity="info">
          {t('translation|No result yet, the pool may still be publishing or be incomplete.')}
        </Alert>
      );
    }
    if ((status.error as ApiError).status === 403) {
      return (
        <Alert severity="warning">
          {t(
            'translation|You are not allowed to request pool status. By default, only cluster admins can.'
          )}
        </Alert>
      );
    }
    return <Alert severity="error">{status.error.message}</Alert>;
  }

  const { answer } = status;
  if (!answer) {
    return null;
  }

  if (answer.isFailed) {
    return (
      <Alert severity="error">
        {answer.failureMessage ?? t('translation|The cluster could not calculate availability.')}
      </Alert>
    );
  }

  return (
    <>
      {answer.isTruncated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('translation|The cluster returned {{returned}} of {{total}} pools.', {
            returned: answer.pools.length,
            total: answer.poolCount,
          })}
        </Alert>
      )}
      <PoolAvailabilityTable key={poolName} answer={answer} poolName={poolName} />
    </>
  );
}

interface ClusterPoolAvailabilityProps {
  /** The cluster to ask, which serves pool status requests. */
  cluster: string;
  /** The clusters to pick from, empty when only one cluster is selected. */
  clusters: string[];
}

function ClusterPoolAvailability({ cluster, clusters }: ClusterPoolAvailabilityProps) {
  const { t } = useTranslation(['glossary', 'translation']);
  const location = useLocation();
  const history = useHistory();
  const searchParams = new URLSearchParams(location.search);
  const driver = searchParams.get('driver') ?? '';
  const pool = searchParams.get('pool') ?? '';

  const { items: slices, errors: slicesErrors } = ResourceSlice.useList({ cluster });
  const drivers = useMemo(
    () =>
      [
        ...new Set([...(slices ?? []).map(slice => slice.driver), ...(driver ? [driver] : [])]),
      ].sort((a, b) => a.localeCompare(b)),
    [slices, driver]
  );

  const status = usePoolStatusRequest(cluster, driver ? { driver } : undefined);

  const show = (next: { cluster: string; driver?: string }) =>
    history.push({
      search: new URLSearchParams({
        ...(clusters.length > 0 ? { cluster: next.cluster } : {}),
        ...(next.driver ? { driver: next.driver } : {}),
      }).toString(),
    });

  let body;
  if (driver) {
    body = <PoolStatusResult status={status} poolName={pool} />;
  } else if (drivers.length > 0) {
    body = (
      <Typography color="text.secondary">
        {t('translation|Pick a driver to see how many of its devices are free.')}
      </Typography>
    );
  } else if (slicesErrors) {
    // The error shown above the body says why there is no driver to pick.
    body = null;
  } else if (!slices) {
    body = <Loader title={t('translation|Loading')} />;
  } else {
    body = (
      <Typography color="text.secondary">
        {t('translation|No driver publishes devices in this cluster.')}
      </Typography>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        {clusters.length > 0 && (
          <TextField
            select
            size="small"
            label={t('glossary|Cluster')}
            value={cluster}
            onChange={event => show({ cluster: event.target.value })}
            sx={{ minWidth: 160 }}
          >
            {clusters.map(name => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label={t('glossary|Driver')}
          value={driver}
          onChange={event => show({ cluster, driver: event.target.value })}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 240 }}
        >
          {drivers.map(name => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        {pool && (
          <>
            <Typography>{t('translation|Pool: {{pool}}', { pool })}</Typography>
            <Button onClick={() => show({ cluster, driver })}>
              {t('translation|Show all pools')}
            </Button>
          </>
        )}
        <Button
          variant="contained"
          disabled={!driver || status.isPending}
          onClick={() => status.refetch()}
        >
          {t('translation|Refresh')}
        </Button>
      </Box>
      <ClusterGroupErrorMessage errors={slicesErrors} />
      {body}
    </>
  );
}

export default function PoolAvailability() {
  const { t } = useTranslation(['glossary', 'translation']);
  const location = useLocation();
  const selectedClusters = useSelectedClusters();
  const servingClusters = useClustersServing(ResourcePoolStatusRequest);

  // A request is answered by one cluster, so with several selected, one that serves it is asked.
  const chosenCluster = new URLSearchParams(location.search).get('cluster');
  const cluster = servingClusters?.find(name => name === chosenCluster) ?? servingClusters?.[0];

  let body;
  if (servingClusters === undefined) {
    body = <Loader title={t('translation|Loading')} />;
  } else if (cluster === undefined) {
    body = (
      <Alert severity="info">
        {t(
          'translation|Pool availability needs the DRAResourcePoolStatus feature gate and the resource.k8s.io/v1alpha3 API.'
        )}
      </Alert>
    );
  } else {
    body = (
      <ClusterPoolAvailability
        cluster={cluster}
        clusters={selectedClusters.length > 1 ? servingClusters : []}
      />
    );
  }

  return <SectionBox title={t('glossary|Pool Availability')}>{body}</SectionBox>;
}
