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
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { TestContext } from '../../test';
import ResourceSliceList from './ResourceSliceList';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/resourceAvailability', () => ({
  useClustersServing: () => undefined,
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

function nodeColumn() {
  render(
    <TestContext>
      <ResourceSliceList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0].columns.find((c: any) => c?.id === 'node');
}

describe('ResourceSliceList', () => {
  beforeEach(() => {
    mockListView.mockReset();
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
});
