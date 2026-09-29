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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import { TestContext } from '../../test';
import DeviceClassList from './DeviceClassList';

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

vi.mock('../../lib/k8s/deviceClass', () => ({
  default: { kind: 'DeviceClass', apiName: 'deviceclasses' },
}));

vi.mock('../../lib/k8s/resourceAvailability', () => ({
  useClustersServing: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function renderList() {
  render(
    <TestContext>
      <DeviceClassList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

describe('DeviceClassList', () => {
  beforeEach(() => {
    mockListView.mockReset();
    vi.mocked(useClustersServing).mockReturnValue(['dra']);
  });

  it('renders the expected columns', () => {
    const columnIds = renderList().columns.map((column: any) =>
      typeof column === 'string' ? column : column.id
    );

    expect(columnIds).toEqual([
      'name',
      'cluster',
      'selectors',
      'drivers',
      'extendedResource',
      'age',
    ]);
  });

  it('asks only the clusters that serve the API, not every selected one', () => {
    vi.mocked(useClustersServing).mockReturnValue(['dra', 'other-dra']);

    expect(renderList().clusters).toEqual(['dra', 'other-dra']);
  });

  it('asks every selected cluster until the probe has answered', () => {
    vi.mocked(useClustersServing).mockReturnValue([]);

    // An empty result means the probe has not answered yet, not that no cluster
    // serves the API, so the list must not be narrowed down to nothing.
    expect(renderList().clusters).toBeUndefined();
  });
});
