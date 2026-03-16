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
import Endpoints from '../../lib/k8s/endpoints';
import { useFilterFunc } from '../../lib/util';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function EndpointList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const filterFunc = useFilterFunc<Endpoints>([
    '.jsonData.subsets[*].addresses[*].ip',
    '.jsonData.subsets[*].ports[*].port',
    '.jsonData.subsets[*].ports[*].name',
  ]);

  return (
    <ResourceListView
      title={t('glossary|Endpoints')}
      resourceClass={Endpoints}
      filterFunction={filterFunc}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'addresses',
          label: t('translation|Addresses'),
          getValue: endpoint => endpoint.getAddresses().join(', '),
          render: endpoint => <LabelListItem labels={endpoint.getAddresses()} />,
          gridTemplate: 1.5,
        },
        'age',
      ]}
    />
  );
}
