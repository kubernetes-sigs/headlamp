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
import { useClustersServingStatus } from '../../lib/k8s/resourceAvailability';
import { TestContext } from '../../test';
import DeviceClassList from './DeviceClassList';

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

vi.mock('../../lib/k8s/deviceClass', () => ({
  default: { kind: 'DeviceClass', apiName: 'deviceclasses' },
}));

vi.mock('../../lib/k8s/resourceAvailability', () => ({
  useClustersServingStatus: vi.fn(),
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
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: ['dra'], isChecking: false });
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
    vi.mocked(useClustersServingStatus).mockReturnValue({
      clusters: ['dra', 'other-dra'],
      isChecking: false,
    });

    expect(renderList().clusters).toEqual(['dra', 'other-dra']);
  });

  it('asks every selected cluster, and offers no create action, until the probe has answered', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: undefined, isChecking: false });
    const props = renderList();

    expect(props.clusters).toBeUndefined();
    expect(props.emptyActions).toBeDefined();
  });

  it('offers no create action while another cluster may still turn out to serve the API', () => {
    // One cluster has answered, so the list shows it, but a later answer could change
    // which cluster Create targets.
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: ['dra'], isChecking: true });
    const props = renderList();

    expect(props.clusters).toEqual(['dra']);
    expect(props.emptyActions).toBeDefined();
  });

  it('leaves the create action to the list once the probe has answered', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: ['dra'], isChecking: false });

    expect(renderList().headerProps).toBeUndefined();
  });

  it('asks no cluster once the probe finds that none serves the API', () => {
    vi.mocked(useClustersServingStatus).mockReturnValue({ clusters: [], isChecking: false });

    expect(renderList().clusters).toEqual([]);
  });
});
