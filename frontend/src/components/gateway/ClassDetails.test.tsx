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
import GatewayClassDetails from './ClassDetails';

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

vi.mock('../../lib/k8s/gatewayClass', () => ({
  default: class GatewayClass {
    static kind = 'GatewayClass';
    static apiName = 'gatewayclasses';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    const dummyGatewayClass = {
      controllerName: 'example.com/gateway-controller',
      jsonData: {
        status: {
          conditions: [{ type: 'Accepted', status: 'True' }],
        },
      },
    };
    const extraInfo = props.extraInfo ? props.extraInfo(dummyGatewayClass) : [];
    const extraSections = props.extraSections ? props.extraSections(dummyGatewayClass) : [];

    return (
      <div data-testid="mock-details-grid">
        <div data-testid="extra-info">
          {extraInfo.map((info: any, idx: number) => (
            <div key={idx} data-testid={`info-${info.name}`}>
              <span className="name">{info.name}</span>
              <span className="value">{info.value}</span>
            </div>
          ))}
        </div>
        <div data-testid="extra-sections">
          {extraSections.map((sec: any) => (
            <div key={sec.id} data-testid={`section-${sec.id}`}>
              {sec.section}
            </div>
          ))}
        </div>
      </div>
    );
  },
  ConditionsTable: () => <div data-testid="mock-conditions-table" />,
}));

describe('GatewayClassDetails', () => {
  it('renders DetailsGrid with extra info and sections', () => {
    render(
      <TestContext routerMap={{ name: 'test-gateway-class' }}>
        <ThemeProvider theme={testTheme as any}>
          <GatewayClassDetails name="test-gateway-class" />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByTestId('mock-details-grid')).toBeInTheDocument();

    const controllerInfo = screen.getByTestId('info-Controller Name');
    expect(controllerInfo.querySelector('.value')).toHaveTextContent(
      'example.com/gateway-controller'
    );

    const conditionsSection = screen.getByTestId('section-headlamp.gatewayclass-conditions');
    expect(conditionsSection).toBeInTheDocument();
    expect(screen.getByTestId('mock-conditions-table')).toBeInTheDocument();
  });
});
