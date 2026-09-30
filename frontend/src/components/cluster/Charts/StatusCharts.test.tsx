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
import React from 'react';
import { useHistory } from 'react-router-dom';
import { TestContext } from '../../../test';
import { NodesStatusCircleChart, PodsStatusCircleChart } from './StatusCharts';

// Mock createRouteURL so history.push gets a cluster-aware path
vi.mock('../../../lib/router/createRouteURL', () => ({
  createRouteURL: (routeName: string) => `/c/story-cluster/${routeName}`,
}));

// Mock Link to avoid the deep import chain:
// Link → KubeNodeDetails → Deployment → replicaSet → KubeObject (circular)
vi.mock('../../common/Link', () => ({
  default: ({
    children,
    routeName,
  }: {
    children: React.ReactNode;
    routeName?: string;
    [key: string]: any;
  }) => <a href={`/c/story-cluster/${routeName ?? ''}`}>{children}</a>,
}));

// Mock node upgrade detection (has its own async hooks)
vi.mock('../../node/upgradeDetection', () => ({
  hasAKSManagedNodes: () => false,
  useIsUpgradeDetected: () => false,
}));

function LocationChecker({ onUrlChange }: { onUrlChange: (url: string) => void }) {
  const history = useHistory();
  React.useEffect(() => {
    return history.listen(location => {
      onUrlChange(location.pathname + location.search);
    });
  }, [history, onUrlChange]);
  return null;
}

// Plain objects matching what the charts actually read — no KubeObject class needed
const mockPods = [
  { status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } },
  { status: { phase: 'Failed', conditions: [{ type: 'Ready', status: 'False' }] } },
] as any[];

const mockNodes = [
  { status: { conditions: [{ type: 'Ready', status: 'True' }] } },
  { status: { conditions: [{ type: 'Ready', status: 'False' }] } },
] as any[];

describe('StatusCharts', () => {
  it('renders PodsStatusCircleChart and navigates on mouse click and keyboard input (Enter/Space)', () => {
    let currentUrl = '';
    render(
      <TestContext routerMap={{ cluster: 'story-cluster' }}>
        <LocationChecker
          onUrlChange={url => {
            currentUrl = url;
          }}
        />
        <PodsStatusCircleChart items={mockPods} />
      </TestContext>
    );

    const link = screen.getByRole('link', { name: /Pods/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/c/story-cluster/pods');

    const readySlice = screen.getByRole('button', { name: /^Ready/i });
    expect(readySlice).toHaveAttribute('tabindex', '0');

    // Test mouse click
    fireEvent.click(readySlice);
    expect(currentUrl).toBe('/c/story-cluster/pods?podsfilter=Ready');

    // Test keyboard Enter key
    fireEvent.keyDown(readySlice, { key: 'Enter' });
    expect(currentUrl).toBe('/c/story-cluster/pods?podsfilter=Ready');

    const notReadySlice = screen.getByRole('button', { name: /^Not Ready/i });
    expect(notReadySlice).toHaveAttribute('tabindex', '0');

    // Test mouse click
    fireEvent.click(notReadySlice);
    expect(currentUrl).toBe('/c/story-cluster/pods?podsfilter=NotReady');

    // Test keyboard Space key
    fireEvent.keyDown(notReadySlice, { key: ' ' });
    expect(currentUrl).toBe('/c/story-cluster/pods?podsfilter=NotReady');
  });

  it('renders NodesStatusCircleChart and navigates on mouse click and keyboard input (Enter/Space)', () => {
    let currentUrl = '';
    render(
      <TestContext routerMap={{ cluster: 'story-cluster' }}>
        <LocationChecker
          onUrlChange={url => {
            currentUrl = url;
          }}
        />
        <NodesStatusCircleChart items={mockNodes} />
      </TestContext>
    );

    const link = screen.getByRole('link', { name: /Nodes/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/c/story-cluster/nodes');

    const readySlice = screen.getByRole('button', { name: /^Ready/i });
    expect(readySlice).toHaveAttribute('tabindex', '0');

    // Test mouse click
    fireEvent.click(readySlice);
    expect(currentUrl).toBe('/c/story-cluster/nodes?nodesfilter=Ready');

    // Test keyboard Enter key
    fireEvent.keyDown(readySlice, { key: 'Enter' });
    expect(currentUrl).toBe('/c/story-cluster/nodes?nodesfilter=Ready');

    const notReadySlice = screen.getByRole('button', { name: /^Not Ready/i });
    expect(notReadySlice).toHaveAttribute('tabindex', '0');

    // Test mouse click
    fireEvent.click(notReadySlice);
    expect(currentUrl).toBe('/c/story-cluster/nodes?nodesfilter=NotReady');

    // Test keyboard Space key
    fireEvent.keyDown(notReadySlice, { key: ' ' });
    expect(currentUrl).toBe('/c/story-cluster/nodes?nodesfilter=NotReady');
  });
});
