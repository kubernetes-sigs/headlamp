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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import { AdvancedSearch } from './AdvancedSearch';

const pod = {
  apiVersion: 'v1',
  version: 'v1',
  singularName: 'pod',
  kind: 'Pod',
  pluralName: 'pods',
  isNamespaced: true,
};
const deployment = {
  apiVersion: 'apps/v1',
  version: 'v1',
  singularName: 'deployment',
  kind: 'Deployment',
  groupName: 'apps',
  pluralName: 'deployments',
  isNamespaced: true,
};
const configMap = {
  apiVersion: 'v1',
  version: 'v1',
  singularName: 'configmap',
  kind: 'ConfigMap',
  pluralName: 'configmaps',
  isNamespaced: true,
};

const mocks = vi.hoisted(() => ({
  resources: [] as any[],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.resources, isLoading: false }),
}));
vi.mock('../../lib/k8s', () => ({ useSelectedClusters: () => ['cluster-a'] }));
vi.mock('../../lib/k8s/api/v2/apiDiscovery', () => ({ apiDiscovery: vi.fn() }));
vi.mock('../common', () => ({ SectionHeader: () => null }));
vi.mock('../common/Loader', () => ({ default: () => null }));
vi.mock('../common/NamespacesAutocomplete', () => ({ NamespacesAutocomplete: () => null }));
vi.mock('../globalSearch/useLocalStorageState', async () => {
  const React = await import('react');
  return {
    useLocalStorageState: (key: string, defaultValue: unknown) =>
      React.useState(key === 'resources' ? 'all' : defaultValue),
  };
});
vi.mock('./ApiResourcePicker', () => ({ ApiResourcesView: () => null }));
vi.mock('./ClusterScopeSelector', () => ({ ClusterScopeSelector: () => null }));
vi.mock('./EmptyResults', () => ({
  EmptyResults: ({ resources, onQuerySelected }: any) => (
    <button onClick={() => onQuerySelected([resources[0]], 'status.phase === "Running"')}>
      Select pod example
    </button>
  ),
}));
vi.mock('./ResourceSearch', () => ({ ResourceSearch: () => null }));
vi.mock('./SavedSearches', () => ({
  SavedSearches: ({ resourcesValue }: { resourcesValue: string }) => (
    <output data-testid="resources-value">{resourcesValue}</output>
  ),
}));
vi.mock('./SearchSettings', () => ({ SearchSettings: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('AdvancedSearch', () => {
  it('keeps an example resource selection partial when discovery expands', () => {
    mocks.resources = [pod, deployment];
    const { rerender } = render(<AdvancedSearch />);

    expect(screen.getByTestId('resources-value')).toHaveTextContent('all');
    fireEvent.click(screen.getByRole('button', { name: 'Select pod example' }));

    const podId = apiResourceId(pod as any);
    expect(screen.getByTestId('resources-value')).toHaveTextContent(podId);

    mocks.resources = [pod, deployment, configMap];
    rerender(<AdvancedSearch />);

    expect(screen.getByTestId('resources-value')).toHaveTextContent(podId);
  });
});
