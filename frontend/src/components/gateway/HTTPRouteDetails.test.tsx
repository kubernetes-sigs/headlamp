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
import { RuleBackendRefs, RuleFilters, RuleMatches } from './HTTPRouteDetails';

vi.mock('../../lib/k8s', () => ({
  KubeObject: class {},
}));

vi.mock('../../lib/k8s/KubeObject', () => ({
  KubeObject: class {},
}));

vi.mock('../../lib/k8s/event', () => ({
  default: vi.fn(),
  __esModule: true,
}));

vi.mock('../../lib/k8s/httpRoute', () => ({
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

vi.mock('../common/Resource', () => ({
  DetailsGrid: () => null,
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

describe('HTTPRouteDetails sub-components', () => {
  describe('RuleMatches', () => {
    it('renders match information correctly', () => {
      const matches = [
        {
          path: { type: 'PathPrefix', value: '/api' },
          headers: [{}],
          method: 'GET',
        },
      ];
      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <RuleMatches matches={matches} />
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByText('PathPrefix')).toBeInTheDocument();
      expect(screen.getByText('/api')).toBeInTheDocument();
      expect(screen.getByText('GET')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Header count
    });
  });

  describe('RuleFilters', () => {
    it('renders filter types', () => {
      const filters = [{ type: 'RequestRedirect' }];
      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <RuleFilters filters={filters} />
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByText('RequestRedirect')).toBeInTheDocument();
    });
  });

  describe('RuleBackendRefs', () => {
    it('renders backend references', () => {
      const backendRefs = [
        {
          name: 'my-service',
          kind: 'Service',
          port: '8080',
          weight: 100,
        },
      ];
      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <RuleBackendRefs backendRefs={backendRefs} />
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByText('my-service')).toBeInTheDocument();
      expect(screen.getByText('Service')).toBeInTheDocument();
      expect(screen.getByText('8080')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });
});
