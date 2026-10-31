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
import ResourceSlice from '../../lib/k8s/resourceSlice';
import ResourceListView from '../common/Resource/ResourceListView';
import ResourceSliceNode from './ResourceSliceNode';

export default function ResourceSliceList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const servingClusters = useClustersServing(ResourceSlice);

  return (
    <ResourceListView
      title={t('glossary|Resource Slices')}
      resourceClass={ResourceSlice}
      clusters={servingClusters}
      headerProps={servingClusters === undefined ? { titleSideActions: [] } : undefined}
      columns={[
        'name',
        'cluster',
        {
          id: 'driver',
          label: t('glossary|Driver'),
          getValue: item => item.driver,
        },
        {
          id: 'pool',
          label: t('translation|Pool'),
          getValue: item => item.poolName,
        },
        {
          id: 'node',
          label: t('glossary|Node'),
          getValue: item => {
            switch (item.nodeAccess) {
              case 'nodeSelector':
                return t('translation|Selected nodes');
              case 'allNodes':
                return t('translation|All nodes');
              case 'perDevice':
                return t('translation|Set per device');
              default:
                return item.spec?.nodeName ?? '';
            }
          },
          render: item => <ResourceSliceNode slice={item} />,
        },
        {
          id: 'devices',
          label: t('glossary|Devices'),
          gridTemplate: 'min-content',
          getValue: item => item.devices.length,
        },
        'age',
      ]}
    />
  );
}
