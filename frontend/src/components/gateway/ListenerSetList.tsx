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
import ListenerSet from '../../lib/k8s/listenerSet';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';
import { makeGatewayStatusLabel } from './ClassList';

export default function ListenerSetList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Listener Sets')}
      resourceClass={ListenerSet}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'parent',
          label: t('glossary|Parent Gateway'),
          filterVariant: 'multi-select',
          getValue: (listenerSet: ListenerSet) => listenerSet.parentRef?.name,
          render: (listenerSet: ListenerSet) =>
            listenerSet.parentRef?.name ? (
              <Link
                routeName="gateway"
                params={{
                  name: listenerSet.parentRef.name,
                  namespace: listenerSet.parentRef.namespace ?? listenerSet.metadata.namespace,
                }}
                activeCluster={listenerSet.cluster}
              >
                {listenerSet.parentRef.name}
              </Link>
            ) : null,
        },
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          getValue: (listenerSet: ListenerSet) =>
            listenerSet.status?.conditions?.find(
              ({ status }: { status: string }) => status === 'True'
            )?.type || null,
          render: (listenerSet: ListenerSet) =>
            makeGatewayStatusLabel(listenerSet.status?.conditions || null),
        },
        {
          id: 'listeners',
          label: t('translation|Listeners'),
          getValue: (listenerSet: ListenerSet) => listenerSet.getListeners().length,
        },
        'labels',
        'age',
      ]}
    />
  );
}
