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
import GRPCRouteDetails, {
  GRPCRuleBackendRefs,
  GRPCRuleFilters,
  GRPCRuleMatches,
} from './GRPCRouteDetails';

vi.mock('../../lib/k8s/grpcRoute', () => ({
  default: class GRPCRoute {
    static kind = 'GRPCRoute';
    static apiName = 'grpcroutes';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

vi.mock('../common/Link', () => ({
  default: ({ children, routeName }: any) => (
    <span data-testid="mock-link" data-route={routeName}>
      {children}
    </span>
  ),
}));

// Fix theme for SimpleTable/SectionHeader/InnerTable
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

let extraSectionsFn: ((item: any) => any[]) | null = null;
let extraInfoFn: ((item: any) => any[]) | null = null;

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    extraInfoFn = props.extraInfo;
    extraSectionsFn = props.extraSections;
    return <div data-testid="mock-details-grid" />;
  },
}));

describe('GRPCRouteDetails and sub-components', () => {
  describe('GRPCRuleMatches', () => {
    it('renders matches in InnerTable correctly', () => {
      const matches = [
        {
          method: {
            type: 'Exact',
            service: 'my.service.gRPC',
            method: 'Greet',
          },
          headers: [{ name: 'x-header', value: 'test-value' }],
        },
      ];

      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <GRPCRuleMatches matches={matches} />
          </ThemeProvider>
        </TestContext>
      );

      expect(screen.getByText('Exact')).toBeInTheDocument();
      expect(screen.getByText('my.service.gRPC')).toBeInTheDocument();
      expect(screen.getByText('Greet')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Header count
    });
  });

  describe('GRPCRuleFilters', () => {
    it('renders filter types in InnerTable correctly', () => {
      const filters = [{ type: 'RequestHeaderModifier' }];

      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <GRPCRuleFilters filters={filters} />
          </ThemeProvider>
        </TestContext>
      );

      expect(screen.getByText('RequestHeaderModifier')).toBeInTheDocument();
    });
  });

  describe('GRPCRuleBackendRefs', () => {
    it('renders backend references in InnerTable correctly', () => {
      const backendRefs = [
        {
          name: 'grpc-service',
          namespace: 'prod',
          kind: 'Service',
          group: 'core',
          port: 50051,
          weight: 90,
        },
      ];

      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <GRPCRuleBackendRefs backendRefs={backendRefs} namespace="default" />
          </ThemeProvider>
        </TestContext>
      );

      expect(screen.getByText('grpc-service')).toBeInTheDocument();
      expect(screen.getByText('prod')).toBeInTheDocument();
      expect(screen.getByText('Service')).toBeInTheDocument();
      expect(screen.getByText('core')).toBeInTheDocument();
      expect(screen.getByText('50051')).toBeInTheDocument();
      expect(screen.getByText('90')).toBeInTheDocument();
    });
  });

  describe('GRPCRouteDetails Component', () => {
    it('registers extraInfo and extraSections with populated route details', () => {
      extraInfoFn = null;
      extraSectionsFn = null;
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-route' }}>
          <GRPCRouteDetails name="test-route" namespace="default" />
        </TestContext>
      );

      expect(screen.getByTestId('mock-details-grid')).toBeInTheDocument();
      expect(extraInfoFn).not.toBeNull();
      expect(extraSectionsFn).not.toBeNull();

      const dummyRoute = {
        hostnames: ['api.example.com', 'grpc.example.com'],
        rules: [
          {
            name: 'my-rule',
            matches: [],
            backendRefs: [],
            filters: [],
          },
        ],
        parentRefs: [
          {
            name: 'my-gateway',
            kind: 'Gateway',
            namespace: 'infra',
          },
        ],
      };

      const extraInfo = extraInfoFn!(dummyRoute);
      expect(extraInfo).toHaveLength(1);
      expect(extraInfo[0].name).toBe('Hostnames');

      const sections = extraSectionsFn!(dummyRoute);
      expect(sections).toHaveLength(2);

      // Render the rules section
      const { rerender } = render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <div>{sections[0].section}</div>
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByText('my-rule')).toBeInTheDocument();

      // Render the parent refs section
      rerender(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <div>{sections[1].section}</div>
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByText('my-gateway')).toBeInTheDocument();
      expect(screen.getByText('infra')).toBeInTheDocument();
    });

    it('renders empty content when rules is empty', () => {
      extraInfoFn = null;
      extraSectionsFn = null;
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-route' }}>
          <GRPCRouteDetails name="test-route" namespace="default" />
        </TestContext>
      );

      const dummyRoute = {
        hostnames: [],
        rules: [],
        parentRefs: [],
      };

      const sections = extraSectionsFn!(dummyRoute);
      expect(sections).toHaveLength(2);

      render(
        <TestContext>
          <ThemeProvider theme={testTheme as any}>
            <div>{sections[0].section}</div>
          </ThemeProvider>
        </TestContext>
      );
      expect(screen.getByText('No data')).toBeInTheDocument();
    });
  });
});
