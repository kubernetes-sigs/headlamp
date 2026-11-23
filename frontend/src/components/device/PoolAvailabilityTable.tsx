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

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type ResourcePoolStatusRequest from '../../lib/k8s/resourcePoolStatusRequest';
import { isPoolIncomplete, type PoolStatus } from '../../lib/k8s/resourcePoolStatusRequest';
import { StatusLabel } from '../common/Label';
import Link from '../common/Link';
import SimpleTable from '../common/SimpleTable';

const NO_VALUE = '-';

function PoolNotCounted({ pool }: { pool: PoolStatus }) {
  const { t } = useTranslation(['translation']);
  const incomplete = isPoolIncomplete(pool);

  return (
    <StatusLabel
      status={incomplete ? 'warning' : 'error'}
      title={pool.validationError}
      tabIndex={0}
    >
      {incomplete ? t('translation|Incomplete') : t('translation|Not counted')}
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

  const count = (pool: PoolStatus, value?: number) => (pool.validationError ? NO_VALUE : value);

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
            pool.validationError ? <PoolNotCounted pool={pool} /> : pool.availableDevices,
        },
        {
          label: t('translation|Allocated'),
          getter: (pool: PoolStatus) => count(pool, pool.allocatedDevices),
        },
        {
          label: t('translation|Unavailable'),
          getter: (pool: PoolStatus) => count(pool, pool.unavailableDevices),
        },
        {
          label: t('translation|Total'),
          getter: (pool: PoolStatus) => count(pool, pool.totalDevices),
        },
      ]}
      data={pools}
      emptyMessage={
        poolName ? t('translation|No results found') : t('translation|This driver has no pools.')
      }
    />
  );
}
