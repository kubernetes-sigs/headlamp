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
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import { useCluster } from '../../lib/k8s/api/v1/hooks';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import ResourcePoolStatusRequest, {
  PoolStatusRequestTimeoutError,
  usePoolStatusRequest,
} from '../../lib/k8s/resourcePoolStatusRequest';
import ResourceSlice from '../../lib/k8s/resourceSlice';
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

export default function PoolAvailability() {
  const { t } = useTranslation(['glossary', 'translation']);
  const cluster = useCluster() ?? '';
  const location = useLocation();
  const history = useHistory();
  const searchParams = new URLSearchParams(location.search);
  const driver = searchParams.get('driver') ?? '';
  const pool = searchParams.get('pool') ?? '';

  const { data: isServed } = useQuery({
    queryKey: ['poolStatusServed', cluster],
    queryFn: () => ResourcePoolStatusRequest.isEnabled(cluster),
  });
  const { items: slices } = ResourceSlice.useList({ cluster });
  const drivers = useMemo(
    () =>
      [
        ...new Set([...(slices ?? []).map(slice => slice.driver), ...(driver ? [driver] : [])]),
      ].sort((a, b) => a.localeCompare(b)),
    [slices, driver]
  );

  const status = usePoolStatusRequest(cluster, isServed && driver ? { driver } : undefined);

  const show = (next: { driver: string; pool?: string }) =>
    history.push({
      search: new URLSearchParams(
        next.pool ? { driver: next.driver, pool: next.pool } : { driver: next.driver }
      ).toString(),
    });

  let body;
  if (isServed === undefined) {
    body = <Loader title={t('translation|Loading')} />;
  } else if (!isServed) {
    body = (
      <Alert severity="info">
        {t(
          'translation|Pool availability needs the DRAResourcePoolStatus feature gate and the resource.k8s.io/v1alpha3 API.'
        )}
      </Alert>
    );
  } else if (!driver) {
    body = (
      <Typography color="text.secondary">
        {slices && drivers.length === 0
          ? t('translation|No driver publishes devices in this cluster.')
          : t('translation|Pick a driver to see how many of its devices are free.')}
      </Typography>
    );
  } else {
    body = <PoolStatusResult status={status} poolName={pool} />;
  }

  return (
    <SectionBox title={t('glossary|Pool Availability')}>
      {isServed && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
          <TextField
            select
            size="small"
            label={t('glossary|Driver')}
            value={driver}
            onChange={event => show({ driver: event.target.value })}
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
              <Button onClick={() => show({ driver })}>{t('translation|Show all pools')}</Button>
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
      )}
      {body}
    </SectionBox>
  );
}
