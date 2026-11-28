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
import { GatewayListener, GatewayListenerStatus } from '../../lib/k8s/gateway';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { GatewayListenerTable } from './GatewayDetails';

const theme = createMuiTheme({ base: 'light', name: 'light' });

describe('GatewayListenerTable', () => {
  const mockListener: GatewayListener = {
    name: 'http-listener',
    hostname: 'example.com',
    port: 80,
    protocol: 'HTTP',
  };

  function renderListenerTable(
    listener: GatewayListener = mockListener,
    status: GatewayListenerStatus | null = null
  ) {
    return render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <GatewayListenerTable listener={listener} status={status} />
        </ThemeProvider>
      </TestContext>
    );
  }

  it('renders listener metadata correctly', () => {
    renderListenerTable();

    expect(screen.getByText('http-listener')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('HTTP')).toBeInTheDocument();
  });

  it('colors standard gateway listener conditions with status="True" as success and "False" as error', () => {
    const status: GatewayListenerStatus = {
      name: 'http-listener',
      supportedKinds: [],
      attachedRoutes: 1,
      conditions: [
        {
          type: 'Programmed',
          status: 'True',
          lastTransitionTime: '2026-01-01T00:00:00Z',
          reason: 'Programmed',
          message: 'Listener is programmed',
          lastProbeTime: null,
        },
        {
          type: 'Accepted',
          status: 'True',
          lastTransitionTime: '2026-01-01T00:00:00Z',
          reason: 'Accepted',
          message: 'Listener is accepted',
          lastProbeTime: null,
        },
        {
          type: 'ResolvedRefs',
          status: 'False',
          lastTransitionTime: '2026-01-01T00:00:00Z',
          reason: 'InvalidCertificateRef',
          message: 'Certificate not found',
          lastProbeTime: null,
        },
      ],
    };

    renderListenerTable(mockListener, status);

    const errorBg = (theme.palette.error as any)[800] ?? theme.palette.error.main;
    const successBg = (theme.palette.success as any)[800] ?? theme.palette.success.main;

    const programmedLabel = screen.getByText('Programmed');
    const acceptedLabel = screen.getByText('Accepted');
    const resolvedRefsLabel = screen.getByText('ResolvedRefs');

    expect(programmedLabel).toHaveStyle({ backgroundColor: successBg });
    expect(acceptedLabel).toHaveStyle({ backgroundColor: successBg });
    expect(resolvedRefsLabel).toHaveStyle({ backgroundColor: errorBg });
  });

  it('inverts status for negative Conflicted condition', () => {
    const status: GatewayListenerStatus = {
      name: 'http-listener',
      supportedKinds: [],
      attachedRoutes: 1,
      conditions: [
        {
          type: 'Conflicted',
          status: 'False',
          lastTransitionTime: '2026-01-01T00:00:00Z',
          reason: 'NoConflicts',
          message: 'No conflicts detected',
          lastProbeTime: null,
        },
      ],
    };

    renderListenerTable(mockListener, status);

    const successBg = (theme.palette.success as any)[800] ?? theme.palette.success.main;
    const conflictedLabel = screen.getByText('Conflicted');
    expect(conflictedLabel).toHaveStyle({ backgroundColor: successBg });
  });

  it('renders neutral label when condition status is not True or False', () => {
    const status: GatewayListenerStatus = {
      name: 'http-listener',
      supportedKinds: [],
      attachedRoutes: 1,
      conditions: [
        {
          type: 'Programmed',
          status: 'Unknown',
          lastTransitionTime: '2026-01-01T00:00:00Z',
          reason: 'Pending',
          message: 'Pending evaluation',
          lastProbeTime: null,
        },
      ],
    };

    renderListenerTable(mockListener, status);

    const label = screen.getByText('Programmed');
    expect(label).toHaveStyle({
      backgroundColor: theme.palette.background.muted,
      color: theme.palette.text.primary,
    });
  });
});
