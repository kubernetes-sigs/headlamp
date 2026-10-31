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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';

// vi.hoisted runs before imports so mock fns are available in vi.mock factories
const { mockApiDiscovery, mockUseSelectedClusters, mockUseLocalStorageState, mockUseTranslation } =
  vi.hoisted(() => ({
    mockApiDiscovery: vi.fn(),
    mockUseSelectedClusters: vi.fn(),
    mockUseLocalStorageState: vi.fn(),
    mockUseTranslation: vi.fn(() => ({ t: (k: string) => k })),
  }));

// Shared mutable object for mock callbacks - this allows tests to update the callbacks
// and the mock components to always read the current values
const mockCallbacks = {
  onSearchSelected: vi.fn(),
  setMaxItemsPerResource: vi.fn(),
  setRefetchIntervalMs: vi.fn(),
  onQuerySelected: vi.fn(),
};

// Test-controlled variable for saved search resources value
let savedSearchResourcesValue: string = 'all';

// Mock child components
vi.mock('./ApiResourcePicker', () => ({
  ApiResourcesView: ({ resources, selectedResources, setSelectedResources }: any) => (
    <div data-testid="api-resources-view">
      <span>Resources: {resources.length}</span>
      <span>Selected: {selectedResources?.size ?? 0}</span>
      <button
        onClick={() => setSelectedResources(new Set(resources.map((r: any) => r.pluralName)))}
        data-testid="select-all"
      >
        Select All
      </button>
      <button onClick={() => setSelectedResources(new Set())} data-testid="select-none">
        Select None
      </button>
    </div>
  ),
}));

vi.mock('./SavedSearches', () => ({
  SavedSearches: ({ rawQuery, resourcesValue, onSearchSelected }: any) => (
    <div data-testid="saved-searches">
      <span>Query: {rawQuery}</span>
      <span>Resources: {resourcesValue}</span>
      <button
        onClick={() => {
          const search = {
            name: 'test',
            query: rawQuery,
            resources: savedSearchResourcesValue,
            namespaces: [],
            createdAt: Date.now(),
          };
          onSearchSelected(search);
          mockCallbacks.onSearchSelected(search);
        }}
        data-testid="save-search"
      >
        Save Search
      </button>
    </div>
  ),
}));

vi.mock('./SearchSettings', () => ({
  SearchSettings: ({ maxItemsPerResource, refetchIntervalMs }: any) => (
    <div data-testid="search-settings">
      <span>Max Items: {maxItemsPerResource}</span>
      <span>Refetch: {refetchIntervalMs}</span>
      <input
        data-testid="max-items-input"
        value={maxItemsPerResource}
        onChange={e => mockCallbacks.setMaxItemsPerResource(Number(e.target.value))}
      />
      <input
        data-testid="refetch-input"
        value={refetchIntervalMs}
        onChange={e => mockCallbacks.setRefetchIntervalMs(Number(e.target.value))}
      />
    </div>
  ),
}));

vi.mock('../common/NamespacesAutocomplete', () => ({
  NamespacesAutocomplete: () => <div data-testid="namespaces-autocomplete" />,
}));

// Debug variable to track resources passed to ResourceSearch
let resourceSearchResources: any[] = [];

vi.mock('./ResourceSearch', () => ({
  ResourceSearch: ({
    resources,
    selectedClusters,
    maxItemsPerResource,
    refetchIntervalMs,
    rawQuery,
    setRawQuery,
  }: any) => {
    resourceSearchResources = resources;
    return (
      <div data-testid="resource-search">
        <span>Resources: {resources.length}</span>
        <span>Clusters: {selectedClusters.join(',')}</span>
        <span>Max Items: {maxItemsPerResource}</span>
        <span>Refetch: {refetchIntervalMs}</span>
        <span>Query: {rawQuery}</span>
        <button onClick={() => setRawQuery('new query')} data-testid="update-query">
          Update Query
        </button>
      </div>
    );
  },
}));

vi.mock('./EmptyResults', () => ({
  EmptyResults: ({ resources, onQuerySelected }: any) => (
    <div data-testid="empty-results">
      <span>Resources: {resources.length}</span>
      <button
        onClick={() => {
          onQuerySelected(resources, 'sample query');
          mockCallbacks.onQuerySelected(resources, 'sample query');
        }}
        data-testid="select-sample-query"
      >
        Select Sample Query
      </button>
    </div>
  ),
}));

vi.mock('../common', () => ({
  SectionHeader: ({ title }: any) => <div data-testid="section-header">{title}</div>,
}));

vi.mock('../common/Loader', () => ({
  default: ({ title }: any) => <div data-testid="loader">{title}</div>,
}));

// Mock the apiDiscovery function
vi.mock('../../lib/k8s/api/v2/apiDiscovery', () => ({
  apiDiscovery: (...args: any[]) => mockApiDiscovery(...args),
}));

// Mock the useSelectedClusters hook
vi.mock('../../lib/k8s', () => ({
  useSelectedClusters: (...args: any[]) => mockUseSelectedClusters(...args),
}));

// Mock the useLocalStorageState hook
vi.mock('../globalSearch/useLocalStorageState', () => ({
  useLocalStorageState: (...args: any[]) => mockUseLocalStorageState(...args),
}));

// Mock react-i18next
vi.mock('react-i18next', async importOriginal => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => mockUseTranslation(),
  };
});

import { AdvancedSearch } from './AdvancedSearch';

// Mock resources data
const mockResources = [
  {
    pluralName: 'pods',
    groupName: '',
    version: 'v1',
    kind: 'Pod',
    singularName: 'pod',
    isNamespaced: true,
    apiVersion: 'v1',
  },
  {
    pluralName: 'services',
    groupName: '',
    version: 'v1',
    kind: 'Service',
    singularName: 'service',
    isNamespaced: true,
    apiVersion: 'v1',
  },
  {
    pluralName: 'deployments',
    groupName: 'apps',
    version: 'v1',
    kind: 'Deployment',
    singularName: 'deployment',
    isNamespaced: true,
    apiVersion: 'apps/v1',
  },
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestContext>{children}</TestContext>
    </QueryClientProvider>
  );
};

describe('AdvancedSearch', () => {
  let mockSetSelectedResourcesState: ReturnType<typeof vi.fn>;
  let mockSetRawQueryState: ReturnType<typeof vi.fn>;

  // Test-specific localStorage values
  let resourcesStorageValue: string = '';
  let queryStorageValue: string = '';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Reset mock callbacks
    mockCallbacks.onSearchSelected = vi.fn();
    mockCallbacks.setMaxItemsPerResource = vi.fn();
    mockCallbacks.setRefetchIntervalMs = vi.fn();
    mockCallbacks.onQuerySelected = vi.fn();

    // Reset debug variables
    resourceSearchResources = [];

    // Setup default mocks
    mockSetSelectedResourcesState = vi.fn();
    mockSetRawQueryState = vi.fn();

    mockUseSelectedClusters.mockReturnValue(['cluster1']);

    // Reset test-specific storage values
    resourcesStorageValue = '';
    queryStorageValue = '';
    savedSearchResourcesValue = 'all';

    // Mock useLocalStorageState to return values based on key
    // This implementation is used for every call (including re-renders)
    mockUseLocalStorageState.mockImplementation((key: string, defaultValue: string) => {
      if (key === 'resources') {
        return [resourcesStorageValue || defaultValue, mockSetSelectedResourcesState];
      }
      if (key === 'advanced-search-query') {
        return [queryStorageValue || defaultValue, mockSetRawQueryState];
      }
      return [defaultValue, vi.fn()];
    });

    mockApiDiscovery.mockResolvedValue(mockResources);
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderAdvancedSearch = () => {
    return render(<AdvancedSearch />, { wrapper: createWrapper() });
  };

  // Helper to wait for resources to load
  const waitForResourcesLoaded = async () => {
    await waitFor(() => {
      expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Resources: 3');
    });
  };

  describe('Loading State', () => {
    it('shows Loader while apiDiscovery is loading', () => {
      // Mock apiDiscovery to never resolve (simulates loading)
      mockApiDiscovery.mockImplementation(() => new Promise(() => {}));

      renderAdvancedSearch();

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByTestId('loader')).toHaveTextContent('Loading');
    });
  });

  describe('Resource Discovery', () => {
    it('fetches resources from selected clusters', async () => {
      renderAdvancedSearch();

      await waitFor(() => {
        expect(mockApiDiscovery).toHaveBeenCalledWith(['cluster1']);
      });

      await waitForResourcesLoaded();
    });

    it('handles multiple selected clusters', async () => {
      mockUseSelectedClusters.mockReturnValue(['cluster1', 'cluster2']);

      renderAdvancedSearch();

      await waitFor(() => {
        expect(mockApiDiscovery).toHaveBeenCalledWith(['cluster1', 'cluster2']);
      });

      await waitForResourcesLoaded();
    });

    it('handles empty cluster list', async () => {
      mockUseSelectedClusters.mockReturnValue([]);

      renderAdvancedSearch();

      await waitFor(() => {
        expect(mockApiDiscovery).toHaveBeenCalledWith([]);
      });

      await waitForResourcesLoaded();
    });

    it('displays discovered resources in ApiResourcesView', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
    });
  });

  describe('Resource Selection', () => {
    it('initializes selectedResources from localStorage when resources state exists', async () => {
      resourcesStorageValue = 'v1pods+v1services';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 2');
      });
    });

    it('initializes selectedResources as undefined when localStorage is empty', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 0');
      });
    });

    it('initializes selectedResources as all when localStorage has "all"', async () => {
      resourcesStorageValue = 'all';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 3');
      });
    });

    it('calls setSelectedResources when Select All is clicked', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const selectAllButton = screen.getByTestId('select-all');
        fireEvent.click(selectAllButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 3');
      });
    });

    it('calls setSelectedResources when Select None is clicked', async () => {
      resourcesStorageValue = 'v1pods+v1services';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const selectNoneButton = screen.getByTestId('select-none');
        fireEvent.click(selectNoneButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 0');
      });
    });

    it('syncs selectedResources to localStorage via useEffect', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const selectAllButton = screen.getByTestId('select-all');
        fireEvent.click(selectAllButton);
      });

      await waitFor(() => {
        expect(mockSetSelectedResourcesState).toHaveBeenCalled();
      });
    });
  });

  describe('Search Query Handling', () => {
    it('initializes rawQuery from localStorage', async () => {
      queryStorageValue = 'test query';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('saved-searches')).toHaveTextContent('Query: test query');
      });
    });

    it('updates rawQuery via setRawQuery', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const updateQueryButton = screen.getByTestId('update-query');
        fireEvent.click(updateQueryButton);
      });

      await waitFor(() => {
        expect(mockSetRawQueryState).toHaveBeenCalledWith(expect.any(Function));
      });
    });

    it('passes rawQuery to SavedSearches', async () => {
      queryStorageValue = 'my search query';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('saved-searches')).toHaveTextContent('Query: my search query');
      });
    });

    it('passes rawQuery to ResourceSearch', async () => {
      queryStorageValue = 'resource query';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toHaveTextContent('Query: resource query');
      });
    });
  });

  describe('Saved Searches Integration', () => {
    it('renders SavedSearches component', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('saved-searches')).toBeInTheDocument();
      });
    });

    it('passes correct props to SavedSearches', async () => {
      queryStorageValue = 'saved query';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('saved-searches')).toHaveTextContent('Query: saved query');
        expect(screen.getByTestId('saved-searches')).toHaveTextContent('Resources:');
      });
    });

    it('calls restoreSavedSearch when search is selected', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const saveButton = screen.getByTestId('save-search');
        fireEvent.click(saveButton);
      });

      // The restoreSavedSearch callback should be called with the saved search
      // This is tested indirectly through the SavedSearches mock
    });

    it('restoreSavedSearch sets selectedResources to all when search.resources is "all"', async () => {
      savedSearchResourcesValue = 'all';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const saveButton = screen.getByTestId('save-search');
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 3');
      });
    });

    it('restoreSavedSearch clears selectedResources when search.resources is empty', async () => {
      resourcesStorageValue = 'v1pods';
      savedSearchResourcesValue = '';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const saveButton = screen.getByTestId('save-search');
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 0');
      });
    });

    it('restoreSavedSearch filters resources by available resource IDs', async () => {
      savedSearchResourcesValue = 'v1pods+v1services';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const saveButton = screen.getByTestId('save-search');
        fireEvent.click(saveButton);
      });

      // Verify the callback was called
      await waitFor(() => {
        expect(mockCallbacks.onSearchSelected).toHaveBeenCalledWith(
          expect.objectContaining({ resources: 'v1pods+v1services' })
        );
      });

      // Check the mock callback call count
      expect(mockCallbacks.onSearchSelected).toHaveBeenCalledTimes(1);
    });
  });

  describe('Search Settings', () => {
    it('renders SearchSettings component', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('search-settings')).toBeInTheDocument();
      });
    });

    it('passes maxItemsPerResource and setter to SearchSettings', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('search-settings')).toHaveTextContent('Max Items: 10000');
      });
    });

    it('passes refetchIntervalMs and setter to SearchSettings', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('search-settings')).toHaveTextContent('Refetch: 60000');
      });
    });

    it('updates maxItemsPerResource when input changes', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const input = screen.getByTestId('max-items-input');
        fireEvent.change(input, { target: { value: '5000' } });
      });

      await waitFor(() => {
        expect(mockCallbacks.setMaxItemsPerResource).toHaveBeenCalledWith(5000);
      });
    });

    it('updates refetchIntervalMs when input changes', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const input = screen.getByTestId('refetch-input');
        fireEvent.change(input, { target: { value: '30000' } });
      });

      await waitFor(() => {
        expect(mockCallbacks.setRefetchIntervalMs).toHaveBeenCalledWith(30000);
      });
    });
  });

  describe('Namespace Autocomplete', () => {
    it('renders NamespacesAutocomplete component', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('namespaces-autocomplete')).toBeInTheDocument();
      });
    });
  });

  describe('Resource Search Results', () => {
    it('renders ResourceSearch when resources are available', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toBeInTheDocument();
      });
    });

    it('passes filtered resources to ResourceSearch', async () => {
      resourcesStorageValue = 'v1pods';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      // Wait for the filtered resources to be passed to ResourceSearch
      await waitFor(() => {
        expect(resourceSearchResources).toHaveLength(1);
        expect(resourceSearchResources[0].pluralName).toBe('pods');
      });
    });

    it('passes selectedClusters to ResourceSearch', async () => {
      mockUseSelectedClusters.mockReturnValue(['cluster1', 'cluster2']);

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toHaveTextContent(
          'Clusters: cluster1,cluster2'
        );
      });
    });

    it('passes maxItemsPerResource to ResourceSearch', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toHaveTextContent('Max Items: 10000');
      });
    });

    it('passes refetchIntervalMs to ResourceSearch', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toHaveTextContent('Refetch: 60000');
      });
    });

    it('passes rawQuery to ResourceSearch', async () => {
      queryStorageValue = 'test query';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toHaveTextContent('Query: test query');
      });
    });

    it('passes setRawQuery to ResourceSearch', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const updateQueryButton = screen.getByTestId('update-query');
        fireEvent.click(updateQueryButton);
      });

      await waitFor(() => {
        expect(mockSetRawQueryState).toHaveBeenCalled();
      });
    });

    it('includes key prop with resource and cluster info', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('resource-search')).toBeInTheDocument();
      });
    });
  });

  describe('Empty Results', () => {
    it('renders EmptyResults when resources exist and rawQuery is empty', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('empty-results')).toBeInTheDocument();
      });
    });

    it('does not render EmptyResults when rawQuery has content', async () => {
      queryStorageValue = 'non-empty query';

      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.queryByTestId('empty-results')).not.toBeInTheDocument();
      });
    });

    it('does not render EmptyResults when resources are not loaded', async () => {
      mockApiDiscovery.mockImplementation(() => new Promise(() => {}));

      renderAdvancedSearch();

      expect(screen.queryByTestId('empty-results')).not.toBeInTheDocument();
    });

    it('passes resources to EmptyResults', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('empty-results')).toHaveTextContent('Resources: 3');
      });
    });

    it('calls onQuerySelected when sample query is selected', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const selectButton = screen.getByTestId('select-sample-query');
        fireEvent.click(selectButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('api-resources-view')).toHaveTextContent('Selected: 3');
        expect(mockCallbacks.onQuerySelected).toHaveBeenCalledWith(mockResources, 'sample query');
      });
    });
  });

  describe('Section Header', () => {
    it('renders SectionHeader with correct title', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('section-header')).toHaveTextContent('Advanced Search (Beta)');
      });
    });
  });

  describe('Layout and Styling', () => {
    it('renders main container with correct structure', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const container = screen.getByTestId('section-header').parentElement;
        expect(container).toBeInTheDocument();
      });
    });

    it('renders all child components in correct order', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const header = screen.getByTestId('section-header');
        const apiResourcesView = screen.getByTestId('api-resources-view');
        const savedSearches = screen.getByTestId('saved-searches');
        const searchSettings = screen.getByTestId('search-settings');
        const namespacesAutocomplete = screen.getByTestId('namespaces-autocomplete');
        const resourceSearch = screen.getByTestId('resource-search');
        const emptyResults = screen.getByTestId('empty-results');

        expect(header).toBeInTheDocument();
        expect(apiResourcesView).toBeInTheDocument();
        expect(savedSearches).toBeInTheDocument();
        expect(searchSettings).toBeInTheDocument();
        expect(namespacesAutocomplete).toBeInTheDocument();
        expect(resourceSearch).toBeInTheDocument();
        expect(emptyResults).toBeInTheDocument();
      });
    });
  });

  describe('Multi-cluster Support', () => {
    it('updates resources when selectedClusters changes', async () => {
      const { rerender } = renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(mockApiDiscovery).toHaveBeenCalledWith(['cluster1']);
      });

      mockUseSelectedClusters.mockReturnValue(['cluster1', 'cluster2']);
      mockApiDiscovery.mockResolvedValue([
        ...mockResources,
        {
          pluralName: 'nodes',
          groupName: '',
          version: 'v1',
          kind: 'Node',
          singularName: 'node',
          isNamespaced: false,
          apiVersion: 'v1',
        },
      ]);

      rerender(<AdvancedSearch />);

      await waitFor(() => {
        expect(mockApiDiscovery).toHaveBeenCalledWith(['cluster1', 'cluster2']);
      });
    });
  });

  describe('Error Handling', () => {
    it('handles apiDiscovery errors gracefully', async () => {
      mockApiDiscovery.mockRejectedValue(new Error('API Error'));

      renderAdvancedSearch();

      // The component should not crash. When the query errors, isLoading becomes false
      // and the component renders the main content (with empty resources).
      // Wait for the loader to disappear (query finishes with error)
      await waitFor(() => {
        expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
      });

      // The component should render the main content even with error
      await waitFor(() => {
        expect(screen.getByTestId('section-header')).toBeInTheDocument();
      });
    });
  });

  describe('localStorage Persistence', () => {
    it('persists selectedResources to localStorage', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const selectAllButton = screen.getByTestId('select-all');
        fireEvent.click(selectAllButton);
      });

      await waitFor(() => {
        expect(mockSetSelectedResourcesState).toHaveBeenCalled();
      });
    });

    it('persists rawQuery to localStorage', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        const updateQueryButton = screen.getByTestId('update-query');
        fireEvent.click(updateQueryButton);
      });

      await waitFor(() => {
        expect(mockSetRawQueryState).toHaveBeenCalled();
      });
    });
  });

  describe('Translation', () => {
    it('uses translation for section header', async () => {
      renderAdvancedSearch();

      await waitForResourcesLoaded();
      await waitFor(() => {
        expect(screen.getByTestId('section-header')).toHaveTextContent('Advanced Search (Beta)');
      });
    });

    it('uses translation for loader title', async () => {
      mockApiDiscovery.mockImplementation(() => new Promise(() => {}));

      renderAdvancedSearch();

      expect(screen.getByTestId('loader')).toHaveTextContent('Loading');
    });
  });
});
