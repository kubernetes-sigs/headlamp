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
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import ResourceClaim, { getAllocatedDeviceId } from '../../lib/k8s/resourceClaim';
import ResourceListView from '../common/Resource/ResourceListView';
import ResourceClaimStatus, { getResourceClaimStatusText } from './ResourceClaimStatus';

export default function ResourceClaimList() {
  const { t } = useTranslation(['glossary', 'translation']);
  // Only some of the selected clusters may serve the API, and asking the others
  // would report errors for clusters that simply do not have the feature. Until
  // the probe has answered the list stays on every selected cluster.
  const servingClusters = useClustersServing(ResourceClaim);

  return (
    <ResourceListView
      title={t('glossary|Resource Claims')}
      resourceClass={ResourceClaim}
      clusters={servingClusters}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'status',
          label: t('translation|Status'),
          gridTemplate: 'min-content',
          getValue: item => getResourceClaimStatusText(item, t),
          render: item => <ResourceClaimStatus claim={item} />,
        },
        {
          id: 'deviceClasses',
          label: t('glossary|Device Classes'),
          getValue: item => item.requestedClasses.join(', '),
        },
        {
          id: 'devices',
          label: t('translation|Devices'),
          getValue: item => item.allocatedDevices.map(getAllocatedDeviceId).join(', '),
        },
        {
          id: 'node',
          label: t('glossary|Node'),
          getValue: item => item.allocatedNodeName ?? '',
        },
        'age',
      ]}
    />
  );
}
