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
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import type { KubeMetrics } from '../../../lib/k8s/cluster';
import type Node from '../../../lib/k8s/node';
import { TestContext } from '../../../test';
import CircularChart from './CircularChart';

function makeNode(name: string, capacityCpu: number): Node {
  return {
    metadata: { name },
    status: { capacity: { cpu: String(capacityCpu) } },
  } as unknown as Node;
}

function makeMetrics(name: string, cpuUsage: number): KubeMetrics {
  return {
    metadata: { name },
    usage: { cpu: String(cpuUsage) },
  } as unknown as KubeMetrics;
}

const usedGetter = (metric: KubeMetrics) => Number(metric.usage.cpu);
const availableGetter = (node: any) => Number(node.status.capacity.cpu);

describe('CircularChart', () => {
  it('shows loading state when itemsMetrics is null without error or noMetrics', () => {
    const getLegend = vi.fn((used, available) => `${used}/${available}`);

    const { container } = render(
      <TestContext>
        <CircularChart
          title="CPU Usage"
          items={[makeNode('node-1', 4)]}
          itemsMetrics={null}
          resourceUsedGetter={usedGetter}
          resourceAvailableGetter={availableGetter}
          getLegend={getLegend}
        />
      </TestContext>
    );

    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(getLegend).toHaveBeenCalledWith(-1, -1);
    expect(screen.getByText('-1/-1')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows loading state when items is null', () => {
    const getLegend = vi.fn((used, available) => `${used}/${available}`);

    render(
      <TestContext>
        <CircularChart
          title="Memory Usage"
          items={null}
          itemsMetrics={[makeMetrics('node-1', 1)]}
          resourceUsedGetter={usedGetter}
          resourceAvailableGetter={availableGetter}
          getLegend={getLegend}
        />
      </TestContext>
    );

    expect(getLegend).toHaveBeenCalledWith(-1, -1);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('aggregates usage across matching items, filters out unmatched metrics, and renders percentage and legend', () => {
    const items = [makeNode('node-1', 4), makeNode('node-2', 4)];
    const itemsMetrics = [
      makeMetrics('node-1', 1),
      makeMetrics('node-2', 1),
      makeMetrics('unrelated-node', 6),
    ];

    const { container } = render(
      <TestContext>
        <CircularChart
          title="Cluster CPU"
          items={items}
          itemsMetrics={itemsMetrics}
          resourceUsedGetter={usedGetter}
          resourceAvailableGetter={availableGetter}
          getLegend={(used, available) => `${used} / ${available} cores`}
        />
      </TestContext>
    );

    expect(screen.getByText('Cluster CPU')).toBeInTheDocument();
    expect(screen.getByText('2 / 8 cores')).toBeInTheDocument();
    expect(screen.getByText('25.0 %')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="false"]')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders ellipsis label without dividing by zero when total available is 0', () => {
    const { container } = render(
      <TestContext>
        <CircularChart
          title="Zero Capacity"
          items={[makeNode('node-1', 0)]}
          itemsMetrics={[makeMetrics('node-1', 0)]}
          resourceUsedGetter={usedGetter}
          resourceAvailableGetter={availableGetter}
          getLegend={(used, available) => `${used} / ${available}`}
        />
      </TestContext>
    );

    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="false"]')).toBeInTheDocument();
  });

  it('hides the chart and shows metrics-server tooltip when noMetrics is true', async () => {
    const { container } = render(
      <TestContext>
        <CircularChart
          title="CPU Usage"
          items={[makeNode('node-1', 4)]}
          itemsMetrics={null}
          noMetrics
          resourceUsedGetter={usedGetter}
          resourceAvailableGetter={availableGetter}
          getLegend={(used, available) => `${used} / ${available}`}
        />
      </TestContext>
    );

    expect(screen.getByText('0 / 4')).toBeInTheDocument();
    expect(
      await screen.findByLabelText('Install the metrics-server to get usage data.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument();
  });

  it('exits loading state and reports 0.0 % when metricsError is set and itemsMetrics is null', () => {
    const error = new Error('metrics unavailable') as unknown as ApiError;

    const { container } = render(
      <TestContext>
        <CircularChart
          title="CPU Usage"
          items={[makeNode('node-1', 4)]}
          itemsMetrics={null}
          metricsError={error}
          resourceUsedGetter={usedGetter}
          resourceAvailableGetter={availableGetter}
          getLegend={(used, available) => `${used} / ${available}`}
        />
      </TestContext>
    );

    expect(screen.getByText('0 / 4')).toBeInTheDocument();
    expect(screen.getByText('0.0 %')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="false"]')).toBeInTheDocument();
  });
});
