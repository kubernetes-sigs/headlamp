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

import { createTheme } from '@mui/material/styles';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import type React from 'react';
import { KubeObject } from '../../lib/k8s/KubeObject';
import {
  ProjectResourcesTab,
  resourcePaneStyles,
  useResourceCategoriesList,
} from './ProjectResourcesTab';

const { mockActivityLaunch } = vi.hoisted(() => ({ mockActivityLaunch: vi.fn() }));
const categories = new Map<string, { label: string; description: string; icon: string }>();
const mockGetKubeObjectCategory = vi.fn((resource: KubeObject) => {
  const categoryName = (resource as KubeObject & { category?: string }).category ?? resource.kind;
  if (!categories.has(categoryName)) {
    categories.set(categoryName, {
      label: categoryName,
      description: `${categoryName} resources`,
      icon: 'mdi:format-list-bulleted',
    });
  }
  return categories.get(categoryName)!;
});
const mockGetResourcesHealth = vi.fn((resources: KubeObject[]) => {
  void resources;
  return { success: 1, warning: 0, error: 0 };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (text: string) => text }),
}));

vi.mock('../../lib/k8s/ResourceCategory', () => ({
  getKubeObjectCategory: (resource: KubeObject) => mockGetKubeObjectCategory(resource),
}));

vi.mock('./projectUtils', () => ({
  getResourcesHealth: (resources: KubeObject[]) => mockGetResourcesHealth(resources),
}));

vi.mock('../common', () => ({
  StatusLabel: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../resourceMap/nodes/KubeObjectStatus', () => ({
  getStatus: (resource: KubeObject & { healthStatus?: string }) =>
    resource.healthStatus ?? 'success',
}));

vi.mock('../activity/Activity', () => ({
  Activity: { launch: mockActivityLaunch, close: vi.fn() },
}));

vi.mock('./ResourceCategoriesList', () => ({
  ResourceCategoriesList: ({
    categoryList,
    onCategoryClick,
  }: {
    categoryList: Array<{ category: { label: string }; items: KubeObject[] }>;
    onCategoryClick: (name: string) => void;
  }) => (
    <div>
      {categoryList.map(({ category, items }) => (
        <button key={category.label} onClick={() => onCategoryClick(category.label)}>
          {category.label} ({items.length})
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../common/Table', () => ({
  default: ({
    columns,
    data,
    state,
  }: {
    columns: Array<{
      id: string;
      accessorFn?: (resource: KubeObject) => unknown;
      Cell?: React.ComponentType<{ row: { original: KubeObject } }>;
    }>;
    data: KubeObject[];
    state: { columnVisibility: { cluster: boolean } };
  }) => (
    <div>
      <div>Cluster column: {String(state.columnVisibility.cluster)}</div>
      {data.flatMap((resource, resourceIndex) =>
        columns.map(column => {
          const value = column.accessorFn?.(resource);
          const Cell = column.Cell;
          return (
            <div key={`${resourceIndex}-${column.id}`}>
              {Cell ? <Cell row={{ original: resource }} /> : String(value ?? '')}
            </div>
          );
        })
      )}
    </div>
  ),
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../common/Resource/AuthVisible', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../common/Resource/DeleteButton', () => ({ default: () => null }));
vi.mock('../common/Resource/ScaleButton', () => ({ default: () => null }));
vi.mock('../common/ActionButton/ActionButton', () => ({
  default: ({ description, onClick }: { description: string; onClick: () => void }) => (
    <button onClick={onClick}>{description}</button>
  ),
}));
vi.mock('../common/Terminal', () => ({ default: () => null }));
vi.mock('../pod/Details', () => ({ PodLogViewer: () => null }));

function resource(kind: string, name: string, overrides: Record<string, unknown> = {}): KubeObject {
  const metadata = {
    name,
    uid: `${kind}-${name}`,
    namespace: 'default',
    creationTimestamp: '2026-01-01T00:00:00Z',
    ...((overrides.metadata as Record<string, unknown> | undefined) ?? {}),
  };

  return {
    kind,
    cluster: 'test',
    spec: {},
    status: {},
    ...overrides,
    metadata,
  } as unknown as KubeObject;
}

describe('useResourceCategoriesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categories.clear();
  });

  it('groups resources by category and calculates health once per category', () => {
    const resources = [resource('Pod', 'one'), resource('Pod', 'two'), resource('Service', 'api')];

    const { result } = renderHook(() => useResourceCategoriesList(resources));

    expect(result.current.map(({ category, items }) => [category.label, items.length])).toEqual([
      ['Pod', 2],
      ['Service', 1],
    ]);
    expect(mockGetResourcesHealth).toHaveBeenCalledTimes(2);
  });

  it('returns no categories when the project has no resources', () => {
    const { result } = renderHook(() => useResourceCategoriesList([]));

    expect(result.current).toEqual([]);
    expect(mockGetResourcesHealth).not.toHaveBeenCalled();
  });
});

describe('ProjectResourcesTab', () => {
  it('keeps the resource pane from shrinking in the stacked layout', () => {
    const theme = createTheme();
    const styles = resourcePaneStyles(theme);

    expect(styles[theme.breakpoints.down('md')]).toEqual({
      borderLeft: 0,
      borderTop: '1px solid',
      flexShrink: 0,
    });
  });

  it('asks the parent to select a resource category', () => {
    const setSelectedCategoryName = vi.fn();

    render(
      <ProjectResourcesTab
        projectResources={[resource('Pod', 'one')]}
        setSelectedCategoryName={setSelectedCategoryName}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pod (1)' }));
    expect(setSelectedCategoryName).toHaveBeenCalledWith('Pod');
    expect(screen.queryByText(/Cluster column:/)).not.toBeInTheDocument();
  });

  it('shows selected resources and honors cluster-column visibility', () => {
    render(
      <ProjectResourcesTab
        projectResources={[resource('Pod', 'one')]}
        selectedCategoryName="Pod"
        setSelectedCategoryName={() => {}}
        showClusterColumn
      />
    );

    expect(screen.getByText('Cluster column: true')).toBeInTheDocument();
  });

  it('renders health, details, age, and actions for supported resource states', () => {
    const projectResources = [
      resource('Deployment', 'deployment-unhealthy', {
        category: 'Workloads',
        isScalable: true,
        spec: { replicas: 3 },
        status: { readyReplicas: 0 },
        healthStatus: 'error',
      }),
      resource('Deployment', 'deployment-degraded', {
        category: 'Workloads',
        isScalable: true,
        spec: { replicas: 3 },
        status: { readyReplicas: 1 },
        healthStatus: 'warning',
      }),
      resource('Deployment', 'deployment-healthy', {
        category: 'Workloads',
        isScalable: true,
        spec: { replicas: 3 },
        status: { readyReplicas: 3 },
      }),
      resource('StatefulSet', 'stateful-unhealthy', {
        category: 'Workloads',
        isScalable: true,
        spec: { replicas: 2 },
        status: { readyReplicas: 0 },
      }),
      resource('StatefulSet', 'stateful-degraded', {
        category: 'Workloads',
        isScalable: true,
        spec: { replicas: 2 },
        status: { readyReplicas: 1 },
      }),
      resource('DaemonSet', 'daemon-unhealthy', {
        category: 'Workloads',
        status: { numberReady: 0, desiredNumberScheduled: 2 },
      }),
      resource('DaemonSet', 'daemon-degraded', {
        category: 'Workloads',
        status: { numberReady: 1, desiredNumberScheduled: 2 },
      }),
      resource('DaemonSet', 'daemon-healthy', {
        category: 'Workloads',
        status: { numberReady: 2, desiredNumberScheduled: 2 },
      }),
      resource('Pod', 'pod-failed', {
        category: 'Workloads',
        status: { phase: 'Failed', conditions: [] },
      }),
      resource('Pod', 'pod-crash-loop', {
        category: 'Workloads',
        status: { phase: 'CrashLoopBackOff', conditions: [] },
      }),
      resource('Pod', 'pod-pending', {
        category: 'Workloads',
        status: { phase: 'Pending', conditions: [] },
      }),
      resource('Pod', 'pod-not-ready', {
        category: 'Workloads',
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }] },
      }),
      resource('Pod', 'pod-ready', {
        category: 'Workloads',
        status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
      }),
      resource('Pod', 'pod-unknown', {
        category: 'Workloads',
        metadata: { name: 'pod-unknown', uid: 'Pod-pod-unknown' },
        status: { conditions: [] },
      }),
      resource('Service', 'service', { category: 'Workloads' }),
    ];

    render(
      <ProjectResourcesTab
        projectResources={projectResources}
        selectedCategoryName="Workloads"
        setSelectedCategoryName={() => {}}
      />
    );

    expect(screen.getByText('Cluster column: false')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Show Logs' })).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: 'Terminal / Exec' })).toHaveLength(6);

    fireEvent.click(screen.getAllByRole('button', { name: 'Show Logs' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Terminal / Exec' })[0]);
    expect(mockActivityLaunch).toHaveBeenCalledTimes(2);
  });
});
