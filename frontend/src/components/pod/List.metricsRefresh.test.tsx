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

/**
 * Renders the pod list through the real table, which List.test.tsx mocks away. The table keeps
 * the values it read from a row until its data changes, so these tests cover metrics that
 * refresh while the pods stay the same.
 */

import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Pod from '../../lib/k8s/pod';
import { PodMetrics } from '../../lib/k8s/PodMetrics';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { PodListRenderer } from './List';

const theme = createMuiTheme({ base: 'light', name: 'light' });
const queryClient = new QueryClient();

const pod = new Pod(
  {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'web',
      namespace: 'default',
      uid: 'web-uid',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    spec: {
      containers: [
        {
          name: 'app',
          image: 'app',
          imagePullPolicy: 'Always',
          resources: { limits: { cpu: '100m', memory: '100Mi' } },
        },
        { name: 'sidecar', image: 'sidecar', imagePullPolicy: 'Always' },
      ],
      nodeName: 'node',
    },
    status: { phase: 'Running', conditions: [], containerStatuses: [], startTime: 0 },
  } as any,
  'test'
);

/** Metrics for the pod, as [cpu, memory] usage of its app and sidecar containers. */
function metrics(app: [string, string], sidecar: [string, string] = ['0', '0']) {
  return [
    new PodMetrics(
      {
        apiVersion: 'metrics.k8s.io/v1beta1',
        kind: 'PodMetrics',
        metadata: { name: 'web', namespace: 'default', uid: 'web-metrics' },
        timestamp: '',
        window: '',
        containers: [
          { name: 'app', usage: { cpu: app[0], memory: app[1] } },
          { name: 'sidecar', usage: { cpu: sidecar[0], memory: sidecar[1] } },
        ],
      } as any,
      'test'
    ),
  ];
}

function podList(pods: Pod[], podMetrics: PodMetrics[]) {
  return (
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <ThemeProvider theme={theme}>
          <PodListRenderer pods={pods} metrics={podMetrics} hideCreateButton />
        </ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );
}

describe('PodListRenderer with refreshed metrics', () => {
  it('updates usage and alerts when only the metrics change', () => {
    // The same array on every render, as the pod list passes it between pod updates.
    const pods = [pod];
    const view = render(podList(pods, metrics(['40m', '40Mi'])));
    expect(screen.getByText('40 m')).toBeInTheDocument();
    expect(screen.queryByLabelText(/CPU Near Limit/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/OOM Risk/)).not.toBeInTheDocument();

    view.rerender(podList(pods, metrics(['96m', '95Mi'])));

    expect(screen.getByText('96 m')).toBeInTheDocument();
    expect(screen.getByLabelText('CPU Near Limit: 96% of limit')).toBeInTheDocument();
    expect(screen.getByLabelText('OOM Risk: 95% of limit')).toBeInTheDocument();
  });

  it('shows alerts when usage moves to the limited container with an unchanged total', () => {
    const pods = [pod];
    const view = render(podList(pods, metrics(['40m', '40Mi'], ['60m', '60Mi'])));
    expect(screen.getByText('100 m')).toBeInTheDocument();
    expect(screen.queryByLabelText(/CPU Near Limit/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/OOM Risk/)).not.toBeInTheDocument();

    view.rerender(podList(pods, metrics(['96m', '95Mi'], ['4m', '5Mi'])));

    expect(screen.getByText('100 m')).toBeInTheDocument();
    expect(screen.getByLabelText('CPU Near Limit: 96% of limit')).toBeInTheDocument();
    expect(screen.getByLabelText('OOM Risk: 95% of limit')).toBeInTheDocument();
  });
});
