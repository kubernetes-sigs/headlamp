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

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCluster } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import {
  getEffectiveNamespaces,
  getNamespaceDiscoveryAlert,
  useDiscoveredNamespaces,
} from '../../lib/k8s/useDiscoveredNamespaces';
import { StatusLabel } from '../common/Label';
import Link from '../common/Link';
import { MetadataDictGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import {
  ResourceTableFromResourceClassProps,
  ResourceTableProps,
} from '../common/Resource/ResourceTable';
import CreateNamespaceButton from './CreateNamespaceButton';

export default function NamespacesList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const cluster = useCluster();
  const {
    data: discovery,
    isLoading: discoveryLoading,
    isFetching: discoveryFetching,
    isError: discoveryIsError,
  } = useDiscoveredNamespaces(cluster);
  const effectiveNamespaces = React.useMemo(
    () => getEffectiveNamespaces(cluster, discovery),
    [cluster, discovery]
  );
  const useDiscoveredTable = effectiveNamespaces.length > 0;

  const tableNamespaceItems = React.useMemo(
    () =>
      effectiveNamespaces.map(namespace => ({
        metadata: { name: namespace },
      })),
    [effectiveNamespaces]
  );

  function makeStatusLabel(namespace: Namespace) {
    const status = namespace.status.phase;
    return <StatusLabel status={status === 'Active' ? 'success' : 'error'}>{status}</StatusLabel>;
  }

  const resourceTableProps:
    | ResourceTableProps<Namespace>
    | ResourceTableFromResourceClassProps<typeof Namespace> = React.useMemo(() => {
    if (useDiscoveredTable) {
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
        data: tableNamespaceItems as unknown as Namespace[],
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
      ],
    } satisfies ResourceTableFromResourceClassProps<typeof Namespace>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDiscoveredTable, tableNamespaceItems]);

  const discoveryError = getNamespaceDiscoveryAlert({
    effectiveNamespaces,
    discovery,
    isLoading: discoveryLoading,
    isFetching: discoveryFetching,
    isError: discoveryIsError,
    t,
  });

  return (
    <>
      {discoveryError && (
        <Box mb={2}>
          <Alert severity="warning">{discoveryError}</Alert>
        </Box>
      )}
      <ResourceListView
        title={t('Namespaces')}
        headerProps={{
          titleSideActions: [<CreateNamespaceButton />],
          noNamespaceFilter: true,
        }}
        {...(resourceTableProps as ResourceTableProps<Namespace>)}
      />
    </>
  );
}
