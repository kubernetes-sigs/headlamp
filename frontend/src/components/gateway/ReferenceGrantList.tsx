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
import ReferenceGrant from '../../lib/k8s/referenceGrant';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

export default function ReferenceGrantList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Reference Grants')}
      resourceClass={ReferenceGrant}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'from',
          label: t('From'),
          getValue: (refGrant: ReferenceGrant) =>
            refGrant.from.map(f => `${f.kind} (${f.namespace})`).join(', '),
          render: (refGrant: ReferenceGrant) => (
            <LabelListItem labels={refGrant.from.map(f => `${f.kind} (${f.namespace})`)} />
          ),
        },
        {
          id: 'to',
          label: t('To'),
          getValue: (refGrant: ReferenceGrant) =>
            refGrant.to.map(t => `${t.kind}${t.name ? ` (${t.name})` : ''}`).join(', '),
          render: (refGrant: ReferenceGrant) => (
            <LabelListItem
              labels={refGrant.to.map(t => `${t.kind}${t.name ? ` (${t.name})` : ''}`)}
            />
          ),
        },
        'age',
      ]}
    />
  );
}
