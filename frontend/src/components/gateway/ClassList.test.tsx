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
import GatewayClassList, { makeGatewayStatusLabel } from './ClassList';

vi.mock('../../lib/k8s', () => ({
  KubeObject: class {},
}));

vi.mock('../../lib/k8s/gatewayClass', () => ({
  default: class GatewayClass {
    static kind = 'GatewayClass';
    static apiName = 'gatewayclasses';
  },
  __esModule: true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

// Mock Tooltip because it can be problematic in tests
vi.mock('../common/Tooltip/TooltipLight', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

let currentDummyGatewayClass: any = null;

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        {props.columns.map((col: any, idx: number) => {
          if (typeof col === 'object') {
            const val = col.getValue ? col.getValue(currentDummyGatewayClass) : '';
            const node = col.render ? col.render(currentDummyGatewayClass) : null;
            return (
              <div key={idx} data-testid={`col-${col.id}`}>
                <span className="label">{col.label}</span>
                <span className="value">{String(val)}</span>
                <div className="node">{node}</div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  },
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

describe('ClassList - makeGatewayStatusLabel', () => {
  it('returns null when conditions are missing', () => {
    expect(makeGatewayStatusLabel(null)).toBeNull();
  });

  it('returns null when no "Accepted" condition is found', () => {
    const conditions = [{ type: 'Ready', status: 'True' }];
    expect(makeGatewayStatusLabel(conditions)).toBeNull();
  });

  it('renders Accepted label when status is True', () => {
    const conditions = [{ type: 'Accepted', status: 'True' }];
    render(
      <TestContext>
        <ThemeProvider theme={testTheme as any}>{makeGatewayStatusLabel(conditions)}</ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('returns null when Accepted is False', () => {
    const conditions = [{ type: 'Accepted', status: 'False' }];
    expect(makeGatewayStatusLabel(conditions)).toBeNull();
  });
});

describe('GatewayClassList Component', () => {
  it('renders title and columns correctly', () => {
    currentDummyGatewayClass = {
      spec: {
        controllerName: 'my-controller',
      },
      status: {
        conditions: [{ type: 'Accepted', status: 'True' }],
      },
    };

    render(
      <TestContext>
        <GatewayClassList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Gateway Classes');

    const controllerCol = screen.getByTestId('col-controllerName');
    expect(controllerCol.querySelector('.label')).toHaveTextContent('Controller');
    expect(controllerCol.querySelector('.value')).toHaveTextContent('my-controller');

    const condCol = screen.getByTestId('col-conditions');
    expect(condCol.querySelector('.label')).toHaveTextContent('Conditions');
    expect(condCol.querySelector('.value')).toHaveTextContent('Accepted');
    expect(condCol.querySelector('.node')).toHaveTextContent('Accepted');
  });
});
