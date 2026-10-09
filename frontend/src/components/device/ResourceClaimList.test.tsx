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
import App from '../../App';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import { TestContext } from '../../test';
import ResourceClaimList from './ResourceClaimList';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

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
      <ResourceClaimList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

describe('ResourceClaimList', () => {
  beforeEach(() => {
    mockListView.mockReset();
    vi.mocked(useClustersServing).mockReturnValue(['dra']);
  });

  it('asks only the clusters that serve the API, not every selected one', () => {
    vi.mocked(useClustersServing).mockReturnValue(['dra', 'other-dra']);

    expect(renderList().clusters).toEqual(['dra', 'other-dra']);
  });

  it('asks every selected cluster until the probe has answered', () => {
    vi.mocked(useClustersServing).mockReturnValue(undefined);

    expect(renderList().clusters).toBeUndefined();
  });

  it('asks no cluster once the probe finds that none serves the API', () => {
    vi.mocked(useClustersServing).mockReturnValue([]);

    expect(renderList().clusters).toEqual([]);
  });

  it('tells apart devices of the same name from different pools', () => {
    const devices = renderList().columns.find((column: any) => column.id === 'devices');
    const claim = {
      allocatedDevices: [
        { request: 'gpu', driver: 'gpu.example.com', pool: 'worker-0', device: 'gpu-0' },
        { request: 'gpu', driver: 'gpu.example.com', pool: 'worker-1', device: 'gpu-0' },
      ],
    };

    expect(devices.getValue(claim)).toBe(
      'gpu.example.com/worker-0/gpu-0, gpu.example.com/worker-1/gpu-0'
    );
  });
});
