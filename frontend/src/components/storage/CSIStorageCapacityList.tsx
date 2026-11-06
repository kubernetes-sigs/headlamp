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
import CSIStorageCapacity from '../../lib/k8s/csiStorageCapacity';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';

export default function CSIStorageCapacityList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('CSI Storage Capacities')}
      resourceClass={CSIStorageCapacity}
      columns={[
        'name',
        'namespace',
        {
          id: 'storageClassName',
          label: t('Storage Class'),
          filterVariant: 'multi-select',
          getValue: item => item.storageClassName,
          render: item =>
            item.storageClassName ? (
              <Link
                routeName="storageClass"
                params={{ name: item.storageClassName }}
                activeCluster={item.cluster}
                tooltip
              >
                {item.storageClassName}
              </Link>
            ) : (
              ''
            ),
        },
        {
          id: 'capacity',
          label: t('Capacity'),
          getValue: item => item.capacity ?? '-',
        },
        {
          id: 'maximumVolumeSize',
          label: t('Maximum Volume Size'),
          getValue: item => item.maximumVolumeSize ?? '-',
        },
        'age',
      ]}
    />
  );
}
