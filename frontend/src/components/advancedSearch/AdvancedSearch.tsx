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

import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../lib/k8s';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import { apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import { SectionHeader } from '../common';
import Loader from '../common/Loader';
import { NamespacesAutocomplete } from '../common/NamespacesAutocomplete';
import { useLocalStorageState } from '../globalSearch/useLocalStorageState';
import { ApiResourcesView } from './ApiResourcePicker';
import { ClusterScopeSelector } from './ClusterScopeSelector';
import { EmptyResults } from './EmptyResults';
import { ResourceSearch } from './ResourceSearch';
import type { SavedAdvancedSearch } from './savedAdvancedSearches';
import { SavedSearches } from './SavedSearches';
import { SearchSettings } from './SearchSettings';
import {
  getSelectedResourcesValue,
  reconcileSelectedResources,
  serializeSelectedResources,
} from './selectedResources';

const emptyList: [] = [];

export const ADVANCED_SEARCH_QUERY_KEY = 'advanced-search-query';

/**
 * AdvancedSearch component provides an interface for searching Kubernetes resources
 * with advanced filtering capabilities.
 */
export function AdvancedSearch() {
  const { t } = useTranslation();
  const selectedClusters = useSelectedClusters();
  const [maxItemsPerResource, setMaxItemsPerResource] = useState(10_000);
  const [refetchIntervalMs, setRefetchIntervalMs] = useState(60_000);

  // Store selected resources in query parameter
  const [selectedResourcesState, setSelectedResourcesState] = useLocalStorageState<string | 'all'>(
    'resources',
    ''
  );

  const [rawQuery, setRawQueryState] = useLocalStorageState<string>(ADVANCED_SEARCH_QUERY_KEY, '');

  const setRawQuery = useCallback(
    (query?: string) => {
      setRawQueryState(() => query ?? '');
    },
    [setRawQueryState]
  );

  const { data: resources, isLoading } = useQuery({
    queryFn: () => apiDiscovery([...selectedClusters]),
    queryKey: ['api-discovery', ...selectedClusters],
  });

  const selectedResources = useMemo(() => {
    if (!resources) return undefined;

    const resourceIds = resources.map(resource => apiResourceId(resource));
    const selection =
      selectedResourcesState === 'all'
        ? new Set(resourceIds)
        : new Set(selectedResourcesState ? selectedResourcesState.split('+') : []);

    return reconcileSelectedResources(selection, resourceIds, selectedResourcesState === 'all');
  }, [resources, selectedResourcesState]);

  const updateSelectedResources = useCallback(
    (selection: Set<string>) => {
      setSelectedResourcesState(() => getSelectedResourcesValue(selection, resources?.length));
    },
    [resources?.length, setSelectedResourcesState]
  );

  // Remove resources that are no longer available in the selected cluster scope.
  useEffect(() => {
    if (!selectedResources || selectedResourcesState === 'all') return;

    const reconciledValue = serializeSelectedResources(selectedResources, false);
    if (reconciledValue !== selectedResourcesState) {
      setSelectedResourcesState(() => reconciledValue);
    }
    // setSelectedResourcesState is not stable between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResources, selectedResourcesState]);

  const resourcesList = useMemo(
    () => resources?.filter(resource => selectedResources?.has(apiResourceId(resource))),
    [resources, selectedResources]
  );

  const selectedResourcesValue = useMemo(() => {
    if (!selectedResources) {
      return selectedResourcesState || '';
    }

    return serializeSelectedResources(selectedResources, selectedResourcesState === 'all');
  }, [selectedResources, selectedResourcesState]);

  const restoreSavedSearch = useCallback(
    (search: SavedAdvancedSearch) => {
      const availableResourceIds = new Set(resources?.map(resource => apiResourceId(resource)));

      const restoredResources =
        search.resources === 'all'
          ? 'all'
          : serializeSelectedResources(
              new Set(
                search.resources
                  .split('+')
                  .filter(resourceId => availableResourceIds.has(resourceId))
              ),
              false
            );
      setSelectedResourcesState(() => restoredResources);

      setRawQuery(search.query);
    },
    [resources, setRawQuery, setSelectedResourcesState]
  );

  if (isLoading) {
    return <Loader title={t('Loading')} />;
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
      <SectionHeader title={t('Advanced Search (Beta)')} noPadding />
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <ApiResourcesView
          resources={resources ?? emptyList}
          selectedResources={selectedResources}
          setSelectedResources={updateSelectedResources}
        />

        <SavedSearches
          rawQuery={rawQuery ?? ''}
          resourcesValue={selectedResourcesValue}
          onSearchSelected={restoreSavedSearch}
        />

        <SearchSettings
          maxItemsPerResource={maxItemsPerResource}
          setMaxItemsPerResource={setMaxItemsPerResource}
          refetchIntervalMs={refetchIntervalMs}
          setRefetchIntervalMs={setRefetchIntervalMs}
        />
        <Box sx={{ marginLeft: { md: 'auto' }, width: { xs: '100%', md: 'auto' } }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <ClusterScopeSelector />
            <NamespacesAutocomplete />
          </Box>
        </Box>
      </Box>
      {resources && (
        <ResourceSearch
          resources={resourcesList ?? emptyList}
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
            updateSelectedResources(new Set(resources.map(it => apiResourceId(it))));
            setRawQuery(query);
          }}
        />
      )}
    </Box>
  );
}
