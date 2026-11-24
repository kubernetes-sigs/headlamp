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

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResourceHealth } from '../../lib/k8s/cluster';
import Pod from '../../lib/k8s/pod';
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import type { DeviceRequestAllocationResult } from '../../lib/k8s/resourceClaim';
import { StatusLabel } from '../common/Label';
import SimpleTable from '../common/SimpleTable';
import { splitAllocatedRequest } from './allocatedRequest';
import { getDeviceHealth } from './deviceHealth';
import { isPod } from './ResourceClaimConsumers';

const healthStatus = {
  Healthy: 'success',
  Unhealthy: 'error',
  Unknown: '',
} as const;

function DeviceHealthLabel({ report }: { report?: ResourceHealth }) {
  const { t } = useTranslation(['translation']);
  const health = report?.health ?? 'Unknown';
  const labels = {
    Healthy: t('translation|Healthy'),
    Unhealthy: t('translation|Unhealthy'),
    Unknown: t('translation|Unknown'),
  };

  return (
    <StatusLabel
      status={healthStatus[health]}
      title={report?.message}
      tabIndex={report?.message ? 0 : undefined}
    >
      {labels[health]}
    </StatusLabel>
  );
}

function ConsumerPod(props: {
  name: string;
  namespace?: string;
  cluster: string;
  onLoad: (name: string, pod: Pod | null) => void;
}) {
  const { name, namespace, cluster, onLoad } = props;
  const [pod, error] = Pod.useGet(name, namespace, { cluster });

  useEffect(() => {
    if (pod || error) {
      onLoad(name, pod);
    }
  }, [name, pod, error, onLoad]);

  return null;
}

export default function ResourceClaimAllocatedDevices({ claim }: { claim: ResourceClaim }) {
  const { t } = useTranslation(['glossary', 'translation']);
  const results = claim.allocatedDevices;
  const hasAlternative = results.some(result => !!splitAllocatedRequest(result.request).subrequest);
  const podConsumers = results.length ? claim.consumers.filter(isPod) : [];
  const [loadedPods, setLoadedPods] = useState<Record<string, Pod | null>>({});
  const onLoad = useCallback(
    (name: string, pod: Pod | null) =>
      setLoadedPods(loaded => (loaded[name] === pod ? loaded : { ...loaded, [name]: pod })),
    []
  );
  const podsLoaded = podConsumers.every(consumer => consumer.name in loadedPods);
  const consumerPods = podConsumers.flatMap(consumer => {
    const pod = loadedPods[consumer.name];
    return pod?.metadata.uid === consumer.uid ? [pod] : [];
  });

  return (
    <>
      {podConsumers.map(consumer => (
        <ConsumerPod
          key={consumer.name}
          name={consumer.name}
          namespace={claim.getNamespace()}
          cluster={claim.cluster}
          onLoad={onLoad}
        />
      ))}
      <SimpleTable
        columns={[
          {
            label: t('translation|Request'),
            getter: (result: DeviceRequestAllocationResult) =>
              splitAllocatedRequest(result.request).request,
          },
          ...(hasAlternative
            ? [
                {
                  label: t('translation|Chosen Alternative'),
                  getter: (result: DeviceRequestAllocationResult) =>
                    splitAllocatedRequest(result.request).subrequest ?? '',
                },
              ]
            : []),
          {
            label: t('translation|Device'),
            getter: (result: DeviceRequestAllocationResult) => result.device,
          },
          {
            label: t('translation|Pool'),
            getter: (result: DeviceRequestAllocationResult) => result.pool,
          },
          {
            label: t('glossary|Driver'),
            getter: (result: DeviceRequestAllocationResult) => result.driver,
          },
          {
            label: t('translation|Health'),
            getter: (result: DeviceRequestAllocationResult) =>
              podsLoaded ? (
                <DeviceHealthLabel report={getDeviceHealth(result, claim, consumerPods)} />
              ) : null,
          },
        ]}
        data={results}
        emptyMessage={t('translation|No devices are allocated yet.')}
      />
    </>
  );
}
