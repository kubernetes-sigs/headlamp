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

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import type { QueryResponse } from '../../lib/k8s/api/v2/hooks';
import CustomResourceDefinition from '../../lib/k8s/crd';
import { TestContext } from '../../test';
import CustomResourceList, { CustomResourceListTable } from './CustomResourceList';
import { mockCRD } from './storyHelper';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return <div data-testid="custom-resource-list">{props.title}</div>;
  },
}));

vi.mock('../common/Link', () => ({
  default: () => null,
}));

vi.mock('../../redux/hooks', () => ({
  useSelectedClusters: () => ['main'],
}));

function renderTable(columns: any[]) {
  const crd = new CustomResourceDefinition({
    ...mockCRD,
    spec: {
      ...mockCRD.spec,
      versions: [
        {
          name: 'v1',
          served: true,
          storage: true,
          additionalPrinterColumns: columns,
        },
      ],
    },
  } as any);

  render(
    <TestContext>
      <CustomResourceListTable crd={crd} />
    </TestContext>
  );

  return mockResourceListView.mock.calls[0][0].columns;
}

describe('CustomResourceListTable additionalPrinterColumns priority', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('shows priority 0 and unset-priority columns and hides priority > 0 and creationTimestamp', () => {
    const columns = renderTable([
      { name: 'DefaultCol', type: 'string', jsonPath: '.spec.defaultCol' },
      { name: 'ZeroPriorityCol', type: 'string', jsonPath: '.spec.zeroCol', priority: 0 },
      { name: 'WideOnlyCol', type: 'string', jsonPath: '.spec.wideCol', priority: 1 },
      { name: 'Age', type: 'date', jsonPath: '.metadata.creationTimestamp', priority: 0 },
    ]);

    const labels = columns.map((col: any) => (typeof col === 'string' ? col : col.label));
    expect(labels).toContain('DefaultCol');
    expect(labels).toContain('ZeroPriorityCol');
    expect(labels).not.toContain('WideOnlyCol');
    expect(labels).not.toContain('Age');
  });
});

function response(
  resource: CustomResourceDefinition | null,
  error: ApiError | null
): [CustomResourceDefinition | null, ApiError | null] &
  QueryResponse<CustomResourceDefinition, ApiError> {
  const tuple: [CustomResourceDefinition | null, ApiError | null] = [resource, error];
  return Object.assign(tuple, {
    data: resource,
    error,
    isError: !!error,
    isLoading: !resource && !error,
    isFetching: false,
    isSuccess: !!resource && !error,
    status: error ? ('error' as const) : ('success' as const),
  });
}

afterEach(() => vi.restoreAllMocks());

it('retains the loaded custom-resource page with a warning until watch recovery succeeds', () => {
  const resource = new CustomResourceDefinition(mockCRD, 'test');
  const warning = new ApiError('Cannot recover the CRD watch', { status: 403 });
  const get = vi
    .spyOn(CustomResourceDefinition, 'useGet')
    .mockReturnValue(response(resource, warning));
  const content = () => (
    <TestContext routerMap={{ crd: resource.getName() }}>
      <CustomResourceList />
    </TestContext>
  );
  const view = render(content());
  expect(screen.getByTestId('custom-resource-list')).toHaveTextContent('MyCustomResource');
  expect(screen.getByRole('alert')).toHaveTextContent(warning.message);

  get.mockReturnValue(response(resource, null));
  view.rerender(content());
  expect(screen.getByTestId('custom-resource-list')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('still renders a fetch error when no CRD data is available', () => {
  vi.spyOn(CustomResourceDefinition, 'useGet').mockReturnValue(
    response(null, new ApiError('CRD forbidden', { status: 403 }))
  );
  render(
    <TestContext routerMap={{ crd: 'mydefinition.phonyresources.io' }}>
      <CustomResourceList />
    </TestContext>
  );
  expect(screen.queryByTestId('custom-resource-list')).not.toBeInTheDocument();
  expect(screen.getByText(/CRD forbidden/)).toBeVisible();
});
