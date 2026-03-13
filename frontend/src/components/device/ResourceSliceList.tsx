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
import ResourceSlice from '../../lib/k8s/resourceSlice';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ResourceSliceList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('Resource Slices')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={ResourceSlice}
      columns={[
        'name',
        {
          id: 'driver',
          label: t('Driver'),
          filterVariant: 'multi-select',
          getValue: item => item.spec?.driver ?? '',
        },
        {
          id: 'nodeName',
          label: t('Node'),
          filterVariant: 'multi-select',
          getValue: item => item.spec?.nodeName ?? '',
        },
        {
          id: 'pool',
          label: t('Pool'),
          getValue: item => item.spec?.pool?.name ?? '',
        },
        {
          id: 'devices',
          label: t('Devices'),
          getValue: item => item.spec?.devices?.length ?? 0,
          render: item => String(item.spec?.devices?.length ?? 0),
          gridTemplate: 'auto',
        },
        'age',
      ]}
    />
  );
}
