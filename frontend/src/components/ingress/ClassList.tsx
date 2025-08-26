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
import { HoverInfoLabel } from '../common/Label';
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
        {
          id: 'default',
          label: '',
          gridTemplate: 0.1,
          getValue: resource => (resource?.isDefault ? t('Default Ingress Class') : null),
          render: (resource: IngressClass) =>
            resource && resource.isDefault ? <DefaultLabel /> : null,
          sort: false,
          disableFiltering: true,
        },
        'name',
        {
          id: 'controller',
          label: t('Controller'),
          filterVariant: 'multi-select',
          getValue: (ingressClass: IngressClass) => ingressClass.spec?.controller,
        },
        'age',
      ]}
    />
  );
}

export function DefaultLabel() {
  const { t } = useTranslation('glossary');
  return <HoverInfoLabel label="" hoverInfo={t('Default Ingress Class')} icon="mdi:star" />;
}
