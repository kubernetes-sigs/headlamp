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

import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Deployment from '../../lib/k8s/deployment';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { WorkloadCircleChart } from './Charts';

const theme = createMuiTheme({ name: 'light', base: 'light' });

function makeDeployment(name: string, readyReplicas: number, replicas: number) {
  return new Deployment(
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name,
        namespace: 'default',
        uid: `${name}-uid`,
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      spec: { replicas, selector: { matchLabels: { app: name } }, template: {} },
      status: { replicas, readyReplicas },
    } as any,
    'test-cluster'
  );
}

function renderChart(deployments: Deployment[]) {
  render(
    <ThemeProvider theme={theme}>
      <TestContext>
        <WorkloadCircleChart
          workloadData={deployments}
          title="Deployments"
          partialLabel="Failed"
          totalLabel="Running"
        />
      </TestContext>
    </ThemeProvider>
  );
}

describe('WorkloadCircleChart legend', () => {
  it('does not count failed workloads as running', () => {
    renderChart([
      makeDeployment('web-1', 1, 1),
      makeDeployment('web-2', 1, 1),
      makeDeployment('web-3', 1, 1),
      makeDeployment('broken', 0, 1),
    ]);

    expect(screen.getByText('1 Failed / 3 Running')).toBeInTheDocument();
  });

  it('shows 0 running when every workload failed', () => {
    renderChart([makeDeployment('broken-1', 0, 1), makeDeployment('broken-2', 0, 2)]);

    expect(screen.getByText('2 Failed / 0 Running')).toBeInTheDocument();
  });

  it('shows only the running count when nothing failed', () => {
    renderChart([makeDeployment('web-1', 2, 2), makeDeployment('web-2', 1, 1)]);

    expect(screen.getByText('2 Running')).toBeInTheDocument();
  });
});
