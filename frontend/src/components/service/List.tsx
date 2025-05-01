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
import Service from '../../lib/k8s/service';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ServiceList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Services')}
      resourceClass={Service}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'type',
          label: t('translation|Type'),
          gridTemplate: 'min-content',
          getValue: service => service.spec.type,
        },
        {
          id: 'clusterIP',
          label: t('Cluster IP'),
          gridTemplate: 'min-content',
          getValue: service => service.spec.clusterIP,
        },
        {
          id: 'externalIP',
          label: t('External IP'),
          gridTemplate: 'min-content',
          getValue: service => service.getExternalAddresses(),
        },
        {
          id: 'ports',
          label: t('Ports'),
          gridTemplate: 'auto',
          getValue: service => service.getPorts()?.join(', '),
          render: service => <LabelListItem labels={service.getPorts() ?? []} />,
        },
        {
          id: 'selector',
          label: t('Selector'),
          gridTemplate: 'auto',
          getValue: service => service.getSelector().join(', '),
          render: service => <LabelListItem labels={service.getSelector()} />,
        },
        'age',
      ]}
    />
  );
}
