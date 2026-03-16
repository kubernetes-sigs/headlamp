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
import HTTPRoute from '../../lib/k8s/httpRoute';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function HTTPRouteList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('HttpRoutes')}
      resourceClass={HTTPRoute}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'hostnames',
          label: t('Hostnames'),
          getValue: httpRoute => httpRoute.hostnames.join(''),
          render: httpRoute => (
            <LabelListItem labels={httpRoute.hostnames.map(host => host || '*')} />
          ),
        },
        {
          id: 'rules',
          label: t('translation|rules'),
          getValue: (httpRoute: HTTPRoute) => httpRoute.spec.rules?.length,
        },
        'age',
      ]}
    />
  );
}
