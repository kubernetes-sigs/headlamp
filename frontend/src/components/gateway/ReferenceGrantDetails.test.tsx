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
import ReferenceGrantDetails from './ReferenceGrantDetails';

vi.mock('../../lib/k8s/referenceGrant', () => ({
  default: class ReferenceGrant {
    static kind = 'ReferenceGrant';
    static apiName = 'referencegrants';
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
  name: 'test-grant',
  namespace: 'default',
};

let extraSectionsFn: ((item: any) => any[]) | null = null;

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    extraSectionsFn = props.extraSections;
    return <div data-testid="mock-details-grid" />;
  },
}));

describe('ReferenceGrantDetails', () => {
  it('registers extraSections with populated reference grant details', () => {
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-grant' }}>
        <ReferenceGrantDetails {...mockProps} />
      </TestContext>
    );

    expect(screen.getByTestId('mock-details-grid')).toBeInTheDocument();
    expect(extraSectionsFn).not.toBeNull();

    const dummyGrant = {
      from: [
        { kind: 'Gateway', namespace: 'infra-ns' },
        { kind: 'HTTPRoute', namespace: 'app-ns' },
      ],
      to: [
        { kind: 'Secret', name: 'my-secret' },
        { kind: 'Service', name: '' },
      ],
    };

    const sections = extraSectionsFn!(dummyGrant);
    expect(sections).toHaveLength(2);

    // 1. From section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('Gateway (infra-ns), HTTPRoute (app-ns)')).toBeInTheDocument();

    // 2. To section
    rerender(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[1].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('Secret (my-secret), Service')).toBeInTheDocument();
  });

  it('renders empty states when from and to specifications are omitted', () => {
    extraSectionsFn = null;
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-grant' }}>
        <ReferenceGrantDetails {...mockProps} />
      </TestContext>
    );

    const dummyEmptyGrant = {
      from: [],
      to: null,
    };

    const sections = extraSectionsFn!(dummyEmptyGrant);
    expect(sections).toHaveLength(2);

    // 1. From section
    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>
          <div>{sections[0].section}</div>
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('No data')).toBeInTheDocument();

    // 2. To section
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
