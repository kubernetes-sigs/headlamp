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
import BackendTrafficPolicyDetails from './BackendTrafficPolicyDetails';

vi.mock('../../lib/k8s/backendTrafficPolicy', () => ({
  default: class BackendTrafficPolicy {
    static kind = 'XBackendTrafficPolicy';
    static apiName = 'xbackendtrafficpolicies';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
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

const mockProps = {
  name: 'test-policy',
  namespace: 'default',
};

let extraSectionsFn: ((item: any) => any[]) | null = null;

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    extraSectionsFn = props.extraSections;
    return <div data-testid="mock-details-grid" />;
  },
}));

describe('BackendTrafficPolicyDetails', () => {
  it('renders DetailsGrid and handles extraSections with fully populated policy details', () => {
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-policy' }}>
        <BackendTrafficPolicyDetails {...mockProps} />
      </TestContext>
    );

    expect(screen.getByTestId('mock-details-grid')).toBeInTheDocument();
    expect(extraSectionsFn).not.toBeNull();

    const dummyPolicy = {
      targetRefs: [{ kind: 'Service', name: 'app-service', sectionName: 'http' }],
      retryConstraint: {
        budget: { percent: 10, interval: '30s' },
        minRetryRate: { count: 5, interval: '2s' },
      },
      sessionPersistence: {
        type: 'Cookie',
        cookieName: 'session-id',
      },
    };

    const sections = extraSectionsFn!(dummyPolicy);
    expect(sections).toHaveLength(3);

    // 1. Target section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Service (app-service:http)')).toBeInTheDocument();

    // 2. Retry section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Retry Budget')).toBeInTheDocument();
    expect(screen.getByText('10% over 30s')).toBeInTheDocument();
    expect(screen.getByText('Min Retry Rate')).toBeInTheDocument();
    expect(screen.getByText('5 reqs/2s')).toBeInTheDocument();

    // 3. Session persistence section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[2].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('type: Cookie, cookieName: session-id')).toBeInTheDocument();
  });

  it('renders empty content states when optional specs are omitted', () => {
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-policy' }}>
        <BackendTrafficPolicyDetails {...mockProps} />
      </TestContext>
    );

    const dummyEmptyPolicy = {
      targetRefs: [],
      retryConstraint: null,
      sessionPersistence: null,
    };

    const sections = extraSectionsFn!(dummyEmptyPolicy);
    expect(sections).toHaveLength(3);

    // 1. Empty target section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No targets defined')).toBeInTheDocument();

    // 2. Empty retry section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No retry constraint configured')).toBeInTheDocument();

    // 3. Empty session section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[2].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No session persistence configured')).toBeInTheDocument();
  });
});
