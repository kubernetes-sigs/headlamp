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
import StorageClass from '../../lib/k8s/storageClass';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ClassList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('Storage Classes')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={StorageClass}
      columns={[
        'name',
        {
          id: 'provisioner',
          label: t('Provisioner'),
          getValue: storageClass => storageClass.provisioner,
        },
        {
          id: 'reclaimPolicy',
          label: t('Reclaim Policy'),
          getValue: storageClass => storageClass.reclaimPolicy,
        },
        {
          id: 'volumeBindingMode',
          label: t('Volume Binding Mode'),
          getValue: storageClass => storageClass.volumeBindingMode,
        },
        {
          id: 'allowVolumeExpansion',
          label: t('Allow Volume Expansion'),
          getValue: storageClass => String(storageClass.allowVolumeExpansion),
        },
        'age',
      ]}
    />
  );
}
