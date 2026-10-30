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
import CSIDriver from '../../lib/k8s/csiDriver';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function CSIDriverList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('CSI Drivers')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={CSIDriver}
      columns={[
        'name',
        {
          id: 'attachRequired',
          label: t('Attach Required'),
          filterVariant: 'checkbox',
          getValue: item => String(item.spec?.attachRequired ?? false),
          render: item => (item.spec?.attachRequired ? t('Yes') : t('No')),
        },
        {
          id: 'podInfoOnMount',
          label: t('Pod Info On Mount'),
          filterVariant: 'checkbox',
          getValue: item => String(item.spec?.podInfoOnMount ?? false),
          render: item => (item.spec?.podInfoOnMount ? t('Yes') : t('No')),
        },
        {
          id: 'storageCapacity',
          label: t('Storage Capacity'),
          filterVariant: 'checkbox',
          getValue: item => String(item.spec?.storageCapacity ?? false),
          render: item => (item.spec?.storageCapacity ? t('Yes') : t('No')),
        },
        {
          id: 'volumeLifecycleModes',
          label: t('Volume Lifecycle Modes'),
          filterVariant: 'multi-select',
          getValue: item => item.spec?.volumeLifecycleModes?.join(', '),
          render: item => <LabelListItem labels={item.spec?.volumeLifecycleModes ?? []} />,
        },
        'age',
      ]}
    />
  );
}
