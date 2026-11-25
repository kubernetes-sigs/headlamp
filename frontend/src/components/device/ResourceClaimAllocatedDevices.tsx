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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResourceHealth } from '../../lib/k8s/cluster';
import Pod from '../../lib/k8s/pod';
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import type {
  AllocatedDeviceCondition,
  DeviceRequestAllocationResult,
} from '../../lib/k8s/resourceClaim';
import { StatusLabel } from '../common/Label';
import SimpleTable from '../common/SimpleTable';
import { LightTooltip } from '../common/Tooltip';
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

/**
 * A condition the driver reports for a device. Its reason and message are shown in a tooltip
 * that can also be reached with the keyboard. Some drivers set only the reason.
 */
function DeviceConditionLabel({ condition }: { condition: AllocatedDeviceCondition }) {
  const details = [condition.reason, condition.message].filter(Boolean).join(': ');
  const label = (
    <StatusLabel status="">
      {condition.type}: {condition.status}
    </StatusLabel>
  );
  if (!details) {
    return label;
  }

  // describeChild keeps "Ready: True" as the accessible name and announces the
  // reason and message as its description, instead of replacing the name. The
  // tooltip wraps a span because StatusLabel turns a title into its own
  // tooltip, which would name the label after the diagnostics again.
  return (
    <LightTooltip title={details} describeChild>
      <Box component="span" tabIndex={0}>
        {label}
      </Box>
    </LightTooltip>
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
  const hasConditions = results.some(result => !!claim.deviceStatus(result)?.conditions?.length);
  const hasNetworkData = results.some(result => !!claim.deviceStatus(result)?.networkData);
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
          ...(hasConditions
            ? [
                {
                  label: t('translation|Conditions'),
                  getter: (result: DeviceRequestAllocationResult) =>
                    claim.deviceStatus(result)?.conditions?.map(condition => (
                      <div key={condition.type}>
                        <DeviceConditionLabel condition={condition} />
                      </div>
                    )),
                },
              ]
            : []),
          ...(hasNetworkData
            ? [
                {
                  label: t('translation|Network'),
                  getter: (result: DeviceRequestAllocationResult) => {
                    const network = claim.deviceStatus(result)?.networkData;
                    if (!network) {
                      return null;
                    }
                    return (
                      <>
                        {network.interfaceName && (
                          <div>
                            {t('translation|Interface')}: {network.interfaceName}
                          </div>
                        )}
                        {!!network.ips?.length && (
                          <div>
                            {t('translation|IPs')}: {network.ips.join(', ')}
                          </div>
                        )}
                        {network.hardwareAddress && (
                          <div>
                            {t('translation|Hardware Address')}: {network.hardwareAddress}
                          </div>
                        )}
                      </>
                    );
                  },
                },
              ]
            : []),
        ]}
        data={results}
        emptyMessage={t('translation|No devices are allocated yet.')}
      />
    </>
  );
}
