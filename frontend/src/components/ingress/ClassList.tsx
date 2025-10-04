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
import IngressClass from '../../lib/k8s/ingressClass';
import ResourceListView from '../common/Resource/ResourceListView';

export default function IngressClassList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('Ingress Classes')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={IngressClass}
      columns={[
        'name',
        {
          id: 'controller',
          label: t('Controller'),
          filterVariant: 'multi-select',
          getValue: (ingressClass: IngressClass) => ingressClass.spec?.controller,
          gridTemplate: 'auto',
        },
        {
          id: 'default',
          label: t('Default'),
          filterVariant: 'checkbox',
          getValue: resource => String(resource?.isDefault ?? false),
          render: (resource: IngressClass) => (resource && resource.isDefault ? t('Yes') : null),
          gridTemplate: 'auto',
        },
        {
          id: 'parameters',
          label: t('Parameters'),
          getValue: (ingressClass: IngressClass) => {
            const params = ingressClass.spec?.parameters;
            if (!params) return '';
            const { kind, apiGroup, name } = params;
            return apiGroup ? `${kind}.${apiGroup}/${name}` : name;
          },
        },
        'age',
      ]}
    />
  );
}
