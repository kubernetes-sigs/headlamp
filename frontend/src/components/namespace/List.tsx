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
import Namespace from '../../lib/k8s/namespace';
import { StatusLabel } from '../common/Label';
import { MetadataDictGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import CreateNamespaceButton from './CreateNamespaceButton';

export default function NamespacesList() {
  const { t } = useTranslation(['glossary', 'translation']);

  function makeStatusLabel(namespace: Namespace) {
    const status = namespace.status.phase;
    return <StatusLabel status={status === 'Active' ? 'success' : 'error'}>{status}</StatusLabel>;
  }

  return (
    <ResourceListView
      title={t('Namespaces')}
      headerProps={{
        titleSideActions: [<CreateNamespaceButton />],
        noNamespaceFilter: true,
      }}
      resourceClass={Namespace}
      columns={[
        'name',
        'cluster',
        {
          id: 'status',
          gridTemplate: 'auto',
          label: t('translation|Status'),
          filterVariant: 'multi-select',
          getValue: ns => ns.status.phase,
          render: makeStatusLabel,
        },
        {
          id: 'labels',
          label: t('translation|Labels'),
          gridTemplate: 'auto',
          getValue: ns =>
            Object.entries(ns.metadata.labels || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(', '),
          render: ns =>
            ns.metadata.labels ? <MetadataDictGrid dict={ns.metadata.labels} /> : null,
        },
        'age',
      ]}
    />
  );
}
