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
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { theme } from '../TestHelpers/theme';
import { GatewayParentRefSection } from './utils';

vi.mock('../../lib/k8s', () => ({
  KubeObject: class {},
}));

vi.mock('../../lib/k8s/gateway', () => ({
  default: vi.fn(),
  __esModule: true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => <span>{children}</span>,
}));

// Fix theme for SimpleTable/SectionHeader
const testTheme = {
  ...theme,
  palette: {
    ...theme.palette,
    tables: {
      head: {
        text: '#000',
      },
    },
  },
};

describe('Gateway utils - GatewayParentRefSection', () => {
  const parentRefs = [
    {
      name: 'my-gateway',
      namespace: 'prod',
      kind: 'Gateway',
      group: 'gateway.networking.k8s.io',
      sectionName: 'https',
      port: 443,
    },
  ];

  it('renders parent reference information', () => {
    render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <GatewayParentRefSection parentRefs={parentRefs} />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('my-gateway')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('gateway.networking.k8s.io')).toBeInTheDocument();
    expect(screen.getByText('https')).toBeInTheDocument();
    expect(screen.getByText('443')).toBeInTheDocument();
  });

  it('handles empty parentRefs', () => {
    render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <GatewayParentRefSection parentRefs={[]} />
        </ThemeProvider>
      </TestContext>
    );
    // Use getAllByText because SimpleTable renders the message twice (once for screen readers)
    expect(screen.getAllByText('No rules data to be shown.')[0]).toBeInTheDocument();
  });
});
