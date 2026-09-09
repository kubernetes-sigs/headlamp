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
import TCPRoute from '../../lib/k8s/tcpRoute';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import L4RouteDetails from './L4RouteDetails';
import L4RouteList from './L4RouteList';

const { mockDetailsGrid, mockResourceListView } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockResourceListView: vi.fn(),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

vi.mock('../common/Resource', () => {
  return {
    DetailsGrid: (props: any) => {
      mockDetailsGrid(props);
      return null;
    },
  };
});

vi.mock('../../lib/k8s/tcpRoute', () => ({
  default: { kind: 'TCPRoute' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

vi.mock('../common/Link', () => ({
  default: (props: any) => {
    const collection = props.routeName === 'gateway' ? 'gateways' : 'services';
    return (
      <a
        href={`/${collection}/${props.params.namespace}/${props.params.name}`}
        data-active-cluster={props.activeCluster}
      >
        {props.children}
      </a>
    );
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('|').pop() ?? key }),
}));

function getDetailsGridProps() {
  return mockDetailsGrid.mock.calls[0][0];
}

function renderSections(route: any) {
  const sections = getDetailsGridProps().extraSections(route);

  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <>
          {sections.map((section: any) => (
            <div key={section.id}>{section.section}</div>
          ))}
        </>
      </ThemeProvider>
    </TestContext>
  );
}

describe('L4RouteDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    render(
      <TestContext routerMap={{ namespace: 'apps', name: 'database' }}>
        <ThemeProvider theme={theme}>
          <L4RouteDetails resourceClass={TCPRoute} cluster="cluster-a" />
        </ThemeProvider>
      </TestContext>
    );
  });

  it('uses DetailsGrid with events and an empty Rules state', () => {
    expect(getDetailsGridProps()).toMatchObject({
      resourceType: TCPRoute,
      name: 'database',
      namespace: 'apps',
      cluster: 'cluster-a',
      withEvents: true,
      noDefaultActions: true,
    });

    renderSections({ rules: [], parentRefs: [], parents: [] });

    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
  });

  it('leaves loading and error rendering to DetailsGrid', () => {
    expect(() => getDetailsGridProps().extraSections(null)).not.toThrow();
    expect(getDetailsGridProps().extraSections(null)).toBeFalsy();
  });

  it('shows every backend-reference column', () => {
    renderSections({
      rules: [
        {
          name: 'database',
          backendRefs: [{ name: 'postgres', port: 5432, weight: 2 }],
        },
      ],
      parentRefs: [],
      parents: [],
    });

    for (const column of ['Name', 'Namespace', 'Kind', 'Group', 'Port', 'Weight']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'postgres' })).toHaveAttribute(
      'href',
      '/services/apps/postgres'
    );
    expect(screen.getByRole('link', { name: 'postgres' })).toHaveAttribute(
      'data-active-cluster',
      'cluster-a'
    );
  });

  it('shows a resolved parent, controller, and all parent condition fields', () => {
    renderSections({
      rules: [],
      parentRefs: [],
      parents: [
        {
          parentRef: { name: 'edge' },
          controllerName: 'example.net/gateway-controller',
          conditions: [
            {
              type: 'Accepted',
              status: 'True',
              reason: 'Accepted',
              message: 'Route accepted by the Gateway',
              lastProbeTime: null,
              lastTransitionTime: null,
            },
          ],
        },
      ],
    });

    expect(screen.getByRole('link', { name: 'edge' })).toHaveAttribute(
      'href',
      '/gateways/apps/edge'
    );
    expect(screen.getByRole('link', { name: 'edge' })).toHaveAttribute(
      'data-active-cluster',
      'cluster-a'
    );
    expect(screen.getByText('example.net/gateway-controller')).toBeInTheDocument();
    expect(screen.getByText('Accepted', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByLabelText('Route accepted by the Gateway')).toBeInTheDocument();
  });

  it('prefers the fetched Route cluster for reference links', () => {
    renderSections({
      cluster: 'cluster-b',
      rules: [{ backendRefs: [{ name: 'postgres' }] }],
      parentRefs: [{ name: 'edge' }],
      parents: [],
    });

    expect(screen.getByRole('link', { name: 'postgres' })).toHaveAttribute(
      'data-active-cluster',
      'cluster-b'
    );
    expect(screen.getByRole('link', { name: 'edge' })).toHaveAttribute(
      'data-active-cluster',
      'cluster-b'
    );
  });
});

describe('L4RouteList', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('shows the requested columns and disables mutation actions', () => {
    render(
      <TestContext>
        <L4RouteList resourceClass={TCPRoute as any} title="TCP Routes" />
      </TestContext>
    );

    const props = mockResourceListView.mock.calls[0][0];
    const ruleColumn = props.columns.find((column: any) => column.id === 'rules');

    expect(props.columns.slice(0, 3)).toEqual(['name', 'namespace', 'cluster']);
    expect(ruleColumn.getValue({ rules: [{}, {}] })).toBe(2);
    expect(props.columns.slice(-2)).toEqual(['labels', 'age']);
    expect(props.headerProps.titleSideActions).toEqual([]);
    expect(props.enableRowActions).toBe(false);
    expect(props.enableRowSelection).toBe(false);
  });
});
