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
import { describe, expect, it } from 'vitest';
import App from '../../App';
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { TestContext } from '../../test';
import ResourceSliceNode from './ResourceSliceNode';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const [nodeSlice, allNodesSlice] = RESOURCE_SLICE_DUMMY_DATA;

const renderNode = (slice: ResourceSlice) =>
  render(
    <TestContext>
      <ResourceSliceNode slice={slice} />
    </TestContext>
  );

describe('ResourceSliceNode', () => {
  it('links a slice published for one node to that node', () => {
    renderNode(new ResourceSlice(nodeSlice, 'gpu-cluster'));

    expect(screen.getByRole('link', { name: 'gpu-worker-0' })).toHaveAttribute(
      'href',
      '/c/gpu-cluster/nodes/gpu-worker-0'
    );
  });

  it('says when the devices can be used from every node', () => {
    renderNode(new ResourceSlice(allNodesSlice, 'gpu-cluster'));

    expect(screen.getByText('All nodes')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says when the nodes are chosen by a selector or per device', () => {
    const { rerender } = renderNode(
      new ResourceSlice({
        ...nodeSlice,
        spec: { ...nodeSlice.spec, nodeName: undefined, nodeSelector: { nodeSelectorTerms: [] } },
      })
    );
    expect(screen.getByText('Selected nodes')).toBeVisible();

    rerender(
      <TestContext>
        <ResourceSliceNode
          slice={
            new ResourceSlice({
              ...nodeSlice,
              spec: { ...nodeSlice.spec, nodeName: undefined, perDeviceNodeSelection: true },
            })
          }
        />
      </TestContext>
    );
    expect(screen.getByText('Set per device')).toBeVisible();
  });
});
