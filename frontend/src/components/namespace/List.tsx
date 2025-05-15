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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { loadClusterSettings } from '../../helpers/clusterSettings';
import { useCluster } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { Link } from '../common';
import { StatusLabel } from '../common/Label';
import ResourceListView from '../common/Resource/ResourceListView';
import {
  ResourceTableFromResourceClassProps,
  ResourceTableProps,
} from '../common/Resource/ResourceTable';
import CreateNamespaceButton from './CreateNamespaceButton';

export default function NamespacesList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const cluster = useCluster();
  // Use the metadata.name field to match the expected format of the ResourceTable component.
  const [allowedNamespaces, setAllowedNamespaces] = React.useState<
    { metadata: { name: string } }[]
  >([]);

  React.useEffect(() => {
    if (cluster) {
      const namespaces = loadClusterSettings(cluster)?.allowedNamespaces || [];
      setAllowedNamespaces(
        namespaces.map(namespace => ({
          metadata: {
            name: namespace,
          },
        }))
      );
    }
  }, [cluster]);

  function makeStatusLabel(namespace: Namespace) {
    const status = namespace.status.phase;
    return <StatusLabel status={status === 'Active' ? 'success' : 'error'}>{status}</StatusLabel>;
  }

  const resourceTableProps:
    | ResourceTableProps<Namespace>
    | ResourceTableFromResourceClassProps<typeof Namespace> = React.useMemo(() => {
    if (allowedNamespaces.length > 0) {
      return {
        columns: [
          {
            id: 'name',
            label: t('translation|Name'),
            getValue: ns => ns.metadata.name,
            render: ({ metadata }) => (
              <Link
                routeName={'namespace'}
                params={{
                  name: metadata.name,
                }}
              >
                {metadata.name}
              </Link>
            ),
          },
          'cluster',
          {
            id: 'status',
            gridTemplate: 'auto',
            label: t('translation|Status'),
            getValue: () => 'Unknown',
          },
          {
            id: 'age',
            label: t('translation|Age'),
            getValue: () => 'Unknown',
          },
        ],
        data: allowedNamespaces as unknown as Namespace[],
      } satisfies ResourceTableProps<Namespace>;
    }
    return {
      resourceClass: Namespace,
      columns: [
        'name',
        'cluster',
        {
          id: 'status',
          gridTemplate: 'auto',
          label: t('translation|Status'),
          getValue: ns => ns.status.phase,
          render: makeStatusLabel,
        },
        'age',
      ],
    } satisfies ResourceTableFromResourceClassProps<typeof Namespace>;
  }, [allowedNamespaces]);

  return (
    <ResourceListView
      title={t('Namespaces')}
      headerProps={{
        titleSideActions: [<CreateNamespaceButton />],
        noNamespaceFilter: true,
      }}
      {...(resourceTableProps as ResourceTableProps<Namespace>)}
    />
  );
}
