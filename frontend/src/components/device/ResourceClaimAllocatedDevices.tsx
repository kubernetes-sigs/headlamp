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

import { useTranslation } from 'react-i18next';
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import type { DeviceRequestAllocationResult } from '../../lib/k8s/resourceClaim';
import SimpleTable from '../common/SimpleTable';
import { splitAllocatedRequest } from './allocatedRequest';

export default function ResourceClaimAllocatedDevices({ claim }: { claim: ResourceClaim }) {
  const { t } = useTranslation(['glossary', 'translation']);
  const results = claim.allocatedDevices;
  const hasAlternative = results.some(result => !!splitAllocatedRequest(result.request).subrequest);

  return (
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
      ]}
      data={results}
      emptyMessage={t('translation|No devices are allocated yet.')}
    />
  );
}
