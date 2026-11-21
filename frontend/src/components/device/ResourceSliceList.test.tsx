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

import '../../i18n/config';
import '../../lib/router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { TestContext } from '../../test';
import ResourceSliceList from './ResourceSliceList';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

const { mockListView, mockPoolStatusClusters } = vi.hoisted(() => ({
  mockListView: vi.fn(),
  mockPoolStatusClusters: vi.fn(),
}));

vi.mock('../../lib/k8s/resourceAvailability', () => ({
  useClustersServing: (resourceClass: { kind: string }) =>
    resourceClass.kind === 'ResourcePoolStatusRequest' ? mockPoolStatusClusters() : undefined,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

const [nodeSlice] = RESOURCE_SLICE_DUMMY_DATA;

const sliceWith = (spec: Partial<(typeof nodeSlice)['spec']>) =>
  new ResourceSlice({ ...nodeSlice, spec: { ...nodeSlice.spec, nodeName: undefined, ...spec } });

function column(id: string) {
  render(
    <TestContext>
      <ResourceSliceList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0].columns.find((c: any) => c?.id === id);
}

const nodeColumn = () => column('node');

describe('ResourceSliceList', () => {
  beforeEach(() => {
    mockListView.mockReset();
    mockPoolStatusClusters.mockReset();
  });

  it('sorts and filters the Node column by the label it shows', () => {
    const node = nodeColumn();

    expect(node.getValue(new ResourceSlice(nodeSlice))).toBe('gpu-worker-0');
    expect(node.getValue(sliceWith({ nodeSelector: { nodeSelectorTerms: [] } }))).toBe(
      'Selected nodes'
    );
    expect(node.getValue(sliceWith({ allNodes: true }))).toBe('All nodes');
    expect(node.getValue(sliceWith({ perDeviceNodeSelection: true }))).toBe('Set per device');
  });

  it('links a pool to its availability when the cluster can count it', () => {
    mockPoolStatusClusters.mockReturnValue(['gpu-cluster']);
    const pool = column('pool');

    render(<TestContext>{pool.render(new ResourceSlice(nodeSlice, 'gpu-cluster'))}</TestContext>);

    expect(screen.getByRole('link', { name: nodeSlice.spec.pool.name })).toHaveAttribute(
      'href',
      `/c/gpu-cluster/poolavailability?driver=${encodeURIComponent(
        nodeSlice.spec.driver
      )}&pool=${encodeURIComponent(nodeSlice.spec.pool.name)}`
    );
  });

  it('shows a pool as text when the cluster cannot count it', () => {
    mockPoolStatusClusters.mockReturnValue([]);
    const pool = column('pool');

    render(<TestContext>{pool.render(new ResourceSlice(nodeSlice, 'gpu-cluster'))}</TestContext>);

    expect(screen.getByText(nodeSlice.spec.pool.name)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
