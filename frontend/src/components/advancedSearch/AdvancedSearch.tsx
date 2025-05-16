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

import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSelectedClusters } from '../../lib/k8s';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import { apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import { NamespacesAutocomplete } from '../common';
import { useQueryParamsState } from '../resourceMap/useQueryParamsState';
import { ApiResourcesView } from './ApiResourcePicker';
import { EmptyResults } from './EmptyResults';
import { ResourceSearch } from './ResourceSearch';
import { SearchSettings } from './SearchSettings';

/**
 * AdvancedSearch component provides an interface for searching Kubernetes resources
 * with advanced filtering capabilities.
 */
export function AdvancedSearch() {
  const selectedClusters = useSelectedClusters();
  const [maxItemsPerResource, setMaxItemsPerResource] = useState(10_000);
  const [refetchIntervalMs, setRefetchIntervalMs] = useState(60_000);

  // Store selected resources in query parameter
  const [selectedResourecQuery, setSelectedResourcesQuery] = useQueryParamsState<string | 'all'>(
    'resources',
    ''
  );

  // Selected Resources is a set of selected API resource ID's
  // undefined means that the selection wasn't initialized yet
  const [selectedResources, setSelectedResources] = useState<Set<string> | undefined>(() =>
    selectedResourecQuery?.length && selectedResourecQuery !== 'all'
      ? new Set(selectedResourecQuery.split('+'))
      : undefined
  );

  const [rawQuery, setRawQuery] = useQueryParamsState<string>('query', '');

  const { data: resources, isLoading } = useQuery({
    queryFn: () => apiDiscovery([...selectedClusters]),
    queryKey: ['api-discovery', ...selectedClusters],
  });

  // Select every resource
  if (selectedResources === undefined && selectedResourecQuery === 'all' && resources) {
    setSelectedResources(new Set(resources.map(resource => apiResourceId(resource))));
  }

  // Sync selected resources query parameter
  useEffect(() => {
    if (!selectedResources) return;

    setSelectedResourcesQuery(
      selectedResources.size === resources?.length
        ? 'all'
        : selectedResources.size === 0
        ? ''
        : [...selectedResources].join('+')
    );
  }, [selectedResources, resources]);

  const resourcesList = useMemo(
    () => resources?.filter(resource => selectedResources?.has(apiResourceId(resource))),
    [resources, selectedResources]
  );

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        maxWidth: '1100px',
        gap: 2,
        padding: 2,
        paddingTop: 4,
        height: 'calc(100vh - 70px)',
        overflow: 'hidden',
        margin: '0 auto',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
        }}
      >
        <ApiResourcesView
          resources={resources ?? []}
          selectedResources={selectedResources}
          setSelectedResources={setSelectedResources}
        />

        <SearchSettings
          maxItemsPerResource={maxItemsPerResource}
          setMaxItemsPerResource={setMaxItemsPerResource}
          refetchIntervalMs={refetchIntervalMs}
          setRefetchIntervalMs={setRefetchIntervalMs}
        />
        <Box sx={{ marginLeft: 'auto' }}>
          <NamespacesAutocomplete />
        </Box>
      </Box>
      {resources && (
        <ResourceSearch
          resources={resourcesList ?? []}
          selectedClusters={selectedClusters}
          maxItemsPerResource={maxItemsPerResource}
          refetchIntervalMs={refetchIntervalMs}
          rawQuery={rawQuery ?? ''}
          setRawQuery={setRawQuery}
          key={
            resourcesList?.map(it => it.pluralName + it.groupName).join(', ') +
            selectedClusters.join(', ')
          }
        />
      )}
      {resources && (rawQuery ?? '').length === 0 && (
        <EmptyResults
          resources={resources}
          onQuerySelected={(resources, query) => {
            setSelectedResources(new Set(resources.map(it => apiResourceId(it))));
            setRawQuery(query);
          }}
        />
      )}
    </Box>
  );
}
