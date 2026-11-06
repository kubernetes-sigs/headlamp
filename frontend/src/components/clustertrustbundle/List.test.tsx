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
import ClusterTrustBundleList from './List';

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

vi.mock('../../lib/k8s/clusterTrustBundle', () => ({
  default: { kind: 'ClusterTrustBundle', apiName: 'clustertrustbundles' },
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
      <ClusterTrustBundleList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

describe('ClusterTrustBundleList', () => {
  beforeEach(() => {
    mockListView.mockReset();
    vi.mocked(useClustersServing).mockReturnValue(['ctb']);
  });

  it('renders the expected columns', () => {
    const columnIds = renderList().columns.map((column: any) =>
      typeof column === 'string' ? column : column.id
    );

    expect(columnIds).toEqual(['name', 'cluster', 'signerName', 'certificateCount', 'age']);
  });

  it('shows the signer, and says so when a bundle has none', () => {
    const signer = renderList().columns.find((column: any) => column?.id === 'signerName');

    expect(signer.getValue({ signerName: 'example.com/my-signer' })).toBe('example.com/my-signer');
    expect(signer.render({ signerName: '' })).toContain('None');
  });

  it('sorts the certificate column by the count, not by a rendered string', () => {
    const count = renderList().columns.find((column: any) => column?.id === 'certificateCount');

    expect(count.getValue({ certificateCount: 2 })).toBe(2);
  });

  it('asks only the clusters that serve the API, not every selected one', () => {
    vi.mocked(useClustersServing).mockReturnValue(['ctb', 'other-ctb']);

    expect(renderList().clusters).toEqual(['ctb', 'other-ctb']);
  });

  it('asks every selected cluster, and offers no create action, until the probe has answered', () => {
    vi.mocked(useClustersServing).mockReturnValue(undefined);
    const props = renderList();

    expect(props.clusters).toBeUndefined();
    expect(props.headerProps).toEqual({ titleSideActions: [] });
  });
});
