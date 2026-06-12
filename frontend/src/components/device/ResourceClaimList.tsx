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
import ResourceClaim from '../../lib/k8s/resourceClaim';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ResourceClaimList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Resource Claims')}
      resourceClass={ResourceClaim}
      columns={[
        'name',
        'namespace',
        {
          id: 'allocated',
          label: t('translation|Allocated'),
          getValue: item => (item.status?.allocation ? 'True' : 'False'),
          filterVariant: 'multi-select',
          gridTemplate: 'auto',
        },
        {
          id: 'reservedFor',
          label: t('Reserved For'),
          getValue: item =>
            item.status?.reservedFor?.map(r => `${r.resource}/${r.name}`).join(', ') ?? '',
        },
        'age',
      ]}
    />
  );
}
