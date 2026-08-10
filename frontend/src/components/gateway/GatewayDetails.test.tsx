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
import GatewayDetails from './GatewayDetails';

vi.mock('../../lib/k8s/gateway', () => ({
  default: class Gateway {
    static kind = 'Gateway';
    static apiName = 'gateways';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
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

let extraSectionsFn: ((item: any) => any[]) | null = null;
let extraInfoFn: ((item: any) => any[]) | null = null;

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    extraInfoFn = props.extraInfo;
    extraSectionsFn = props.extraSections;
    return <div data-testid="mock-details-grid" />;
  },
  ConditionsTable: () => <div data-testid="mock-conditions-table" />,
}));

describe('GatewayDetails', () => {
  it('registers extraInfo and extraSections with populated gateway details', () => {
    extraInfoFn = null;
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-gateway' }}>
        <GatewayDetails name="test-gateway" namespace="default" />
      </TestContext>
    );

    expect(screen.getByTestId('mock-details-grid')).toBeInTheDocument();
    expect(extraInfoFn).not.toBeNull();
    expect(extraSectionsFn).not.toBeNull();

    const dummyGateway = {
      jsonData: {
        status: {
          conditions: [],
        },
      },
      spec: {
        gatewayClassName: 'external-gateway-class',
      },
      cluster: 'prod-cluster',
      getAddresses: () => [{ type: 'IPAddress', value: '10.0.0.5' }],
      getListeners: () => [
        { name: 'http', hostname: 'web.example.com', port: 80, protocol: 'HTTP' },
      ],
      getListenerStatusByName: () => ({
        conditions: [{ type: 'Available', status: 'True' }],
      }),
    };

    const extraInfo = extraInfoFn!(dummyGateway);
    expect(extraInfo).toHaveLength(1);
    expect(extraInfo[0].name).toBe('Class Name');

    const sections = extraSectionsFn!(dummyGateway);
    expect(sections).toHaveLength(3);

    // 1. Addresses section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Addresses')).toBeInTheDocument();
    expect(screen.getByText('IPAddress')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();

    // 2. Listeners section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Listeners')).toBeInTheDocument();
    expect(screen.getByText('http')).toBeInTheDocument();
    expect(screen.getByText('web.example.com')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('HTTP')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();

    // 3. Conditions section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[2].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Conditions')).toBeInTheDocument();
    expect(screen.getByTestId('mock-conditions-table')).toBeInTheDocument();
  });

  it('renders empty content when gateway is empty', () => {
    extraInfoFn = null;
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-gateway' }}>
        <GatewayDetails name="test-gateway" namespace="default" />
      </TestContext>
    );

    const dummyEmptyGateway = {
      jsonData: {},
      spec: {},
      cluster: 'prod-cluster',
      getAddresses: () => [],
      getListeners: () => [],
      getListenerStatusByName: () => null,
    };

    const sections = extraSectionsFn!(dummyEmptyGateway);

    // 1. Addresses section should show No addresses data
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    // SimpleTable renders the message twice for accessibility
    expect(screen.getAllByText('No addresses data to be shown.')[0]).toBeInTheDocument();

    // 2. Listeners section should show No data
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
