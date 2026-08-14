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
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import GRPCRouteDetails from './GRPCRouteDetails';
import HTTPRouteDetails from './HTTPRouteDetails';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

vi.mock('../../lib/k8s/httpRoute', () => ({
  default: { kind: 'HTTPRoute' },
}));

vi.mock('../../lib/k8s/grpcRoute', () => ({
  default: { kind: 'GRPCRoute' },
}));

vi.mock('../common/Link', () => ({
  default: (props: any) => (
    <a
      href={`/gateways/${props.params.namespace}/${props.params.name}`}
      data-active-cluster={props.activeCluster}
    >
      {props.children}
    </a>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').pop() ?? key }),
}));

const routeDetails = [
  ['HTTPRoute', HTTPRouteDetails],
  ['GRPCRoute', GRPCRouteDetails],
] as const;

describe.each(routeDetails)('%s details', (_, RouteDetails) => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <RouteDetails name="route-a" namespace="apps" cluster="requested-cluster" />
        </ThemeProvider>
      </TestContext>
    );
  });

  it('passes the Resource Map cluster to DetailsGrid', () => {
    expect(mockDetailsGrid.mock.calls[0][0]).toMatchObject({
      name: 'route-a',
      namespace: 'apps',
      cluster: 'requested-cluster',
    });
  });

  it('uses the fetched Route cluster for parent Gateway links', () => {
    const sections = mockDetailsGrid.mock.calls[0][0].extraSections({
      cluster: 'fetched-cluster',
      rules: [],
      parentRefs: [{ name: 'edge' }],
    });

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          {sections.map((section: any) => (
            <div key={section.id}>{section.section}</div>
          ))}
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByRole('link', { name: 'edge' })).toHaveAttribute(
      'data-active-cluster',
      'fetched-cluster'
    );
  });
});
