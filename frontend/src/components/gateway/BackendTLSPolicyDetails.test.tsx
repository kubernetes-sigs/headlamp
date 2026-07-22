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
import BackendTLSPolicyDetails from './BackendTLSPolicyDetails';

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

vi.mock('../../lib/k8s/backendTLSPolicy', () => ({
  default: class BackendTLSPolicy {
    static kind = 'BackendTLSPolicy';
    static apiName = 'backendtlspolicies';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

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

describe('BackendTLSPolicyDetails', () => {
  it('renders DetailsGrid and handles extraSections correctly on the happy path', () => {
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-policy' }}>
        <BackendTLSPolicyDetails {...mockProps} />
      </TestContext>
    );

    expect(screen.getByTestId('mock-details-grid')).toBeInTheDocument();
    expect(extraSectionsFn).not.toBeNull();

    const dummyPolicy = {
      targetRefs: [{ kind: 'Service', name: 'my-service', sectionName: 'https' }],
      validation: {
        hostname: 'example.com',
        caCertificateRefs: [{ kind: 'ConfigMap', name: 'my-cert' }],
      },
    };

    const sections = extraSectionsFn!(dummyPolicy);
    expect(sections).toHaveLength(2);

    // Render the targets section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Service (my-service:https)')).toBeInTheDocument();

    // Render the validation section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Hostname: example.com')).toBeInTheDocument();
    expect(screen.getByText('ConfigMap (my-cert)')).toBeInTheDocument();
  });

  it('renders empty content when targets and validation are missing', () => {
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-policy' }}>
        <BackendTLSPolicyDetails {...mockProps} />
      </TestContext>
    );

    const dummyEmptyPolicy = {
      targetRefs: [],
      validation: null,
    };

    const sections = extraSectionsFn!(dummyEmptyPolicy);
    expect(sections).toHaveLength(2);

    // Render targets empty section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No targets defined')).toBeInTheDocument();

    // Render validation empty section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No validation settings')).toBeInTheDocument();
  });
});
