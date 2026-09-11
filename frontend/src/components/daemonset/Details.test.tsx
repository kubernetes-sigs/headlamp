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
import { vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import DaemonSetDetails from './Details';

const theme = createMuiTheme({ name: 'light', base: 'light' });

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  ContainersSection: () => null,
  LogsButton: () => null,
  MetadataDictGrid: () => null,
  OwnedPodsSection: () => null,
  RevisionHistorySection: () => null,
  RollbackButton: () => null,
}));

vi.mock('../../lib/k8s/daemonSet', () => ({
  default: { kind: 'DaemonSet' },
}));

const fakeDaemonSet: any = {
  spec: {
    template: {
      spec: {
        tolerations: [
          {
            key: 'node.kubernetes.io/unreachable',
            operator: 'Exists',
            effect: 'NoExecute',
            tolerationSeconds: 300,
          },
          {
            key: 'node.kubernetes.io/not-ready',
            operator: 'Exists',
            effect: 'NoExecute',
          },
          {
            key: 'dedicated',
            operator: 'Equal',
            value: 'infra',
            effect: 'NoSchedule',
          },
        ],
      },
    },
  },
};

describe('DaemonSetDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('shows the tolerationSeconds value for NoExecute tolerations', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-daemonset' }}>
        <DaemonSetDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];

    const sections = props.extraSections(fakeDaemonSet);
    const tolerationsSection = sections.find((s: any) => s.id === 'headlamp.daemonset-tolerations');

    expect(tolerationsSection).toBeDefined();

    render(
      <ThemeProvider theme={theme}>
        <TestContext>{tolerationsSection.section}</TestContext>
      </ThemeProvider>
    );

    expect(screen.getByText('NoExecute (300s)')).toBeInTheDocument();
    expect(screen.getByText('NoExecute (forever)')).toBeInTheDocument();
    expect(screen.getByText('NoSchedule')).toBeInTheDocument();
  });
});
