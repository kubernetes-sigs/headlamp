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

import Box from '@mui/material/Box';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type ResourcePoolStatusRequest from '../../lib/k8s/resourcePoolStatusRequest';
import { isPoolIncomplete, type PoolStatus } from '../../lib/k8s/resourcePoolStatusRequest';
import { StatusLabel } from '../common/Label';
import Link from '../common/Link';
import SimpleTable from '../common/SimpleTable';

const NO_VALUE = '-';

function PoolProblem({ pool }: { pool: PoolStatus }) {
  const { t } = useTranslation(['translation']);

  // Counts stay valid when only a summary of the pool's partitions or sharing has a problem.
  let status: 'warning' | 'error' = 'warning';
  let label = t('translation|Validation error');
  if (pool.availableDevices === undefined) {
    const incomplete = isPoolIncomplete(pool);
    status = incomplete ? 'warning' : 'error';
    label = incomplete ? t('translation|Incomplete') : t('translation|Not counted');
  }

  return (
    <StatusLabel status={status} title={pool.validationError} tabIndex={0}>
      {label}
    </StatusLabel>
  );
}

export interface PoolAvailabilityTableProps {
  /** The answered request. */
  answer: ResourcePoolStatusRequest;
  /** Show only this pool of the answer. */
  poolName?: string;
}

export default function PoolAvailabilityTable({ answer, poolName }: PoolAvailabilityTableProps) {
  const { t } = useTranslation(['glossary', 'translation']);
  const pools = useMemo(
    () => answer.pools.filter(pool => !poolName || pool.poolName === poolName),
    [answer, poolName]
  );

  return (
    <SimpleTable
      columns={[
        {
          label: t('translation|Pool'),
          getter: (pool: PoolStatus) => pool.poolName,
        },
        {
          label: t('glossary|Node'),
          getter: (pool: PoolStatus) =>
            pool.nodeName ? (
              <Link
                routeName="node"
                params={{ name: pool.nodeName }}
                activeCluster={answer.cluster}
              >
                {pool.nodeName}
              </Link>
            ) : (
              NO_VALUE
            ),
        },
        {
          label: t('translation|Available'),
          getter: (pool: PoolStatus) =>
            pool.validationError ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                {pool.availableDevices}
                <PoolProblem pool={pool} />
              </Box>
            ) : (
              pool.availableDevices ?? NO_VALUE
            ),
        },
        {
          label: t('translation|Allocated'),
          getter: (pool: PoolStatus) => pool.allocatedDevices ?? NO_VALUE,
        },
        {
          label: t('translation|Unavailable'),
          getter: (pool: PoolStatus) => pool.unavailableDevices ?? NO_VALUE,
        },
        {
          label: t('translation|Total'),
          getter: (pool: PoolStatus) => pool.totalDevices ?? NO_VALUE,
        },
      ]}
      data={pools}
      emptyMessage={
        poolName ? t('translation|No results found') : t('translation|This driver has no pools.')
      }
    />
  );
}
