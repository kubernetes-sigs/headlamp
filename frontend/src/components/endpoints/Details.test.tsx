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
import React from 'react';
import App from '../../App';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import EndpointDetails from './Details';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ base: 'light', name: 'light' });

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/endpoints', () => ({
  default: { kind: 'Endpoints', apiVersion: 'v1', detailsRoute: 'endpoint' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    const { extraSections } = props;
    const sections = typeof extraSections === 'function' ? extraSections(fakeEndpoint) : [];
    return (
      <>
        {sections.map((s: any) => (
          <React.Fragment key={s.id}>{s.section}</React.Fragment>
        ))}
      </>
    );
  },
}));

const fakeEndpoint: any = {
  subsets: [
    {
      addresses: [{ ip: '10.0.0.1', hostname: 'host-1', targetRef: undefined }],
      ports: [],
    },
  ],
};

function renderWithAddresses(addresses: any[]) {
  fakeEndpoint.subsets = [{ addresses, ports: [] }];

  return render(
    <TestContext routerMap={{ namespace: 'default', name: 'my-endpoint' }}>
      <ThemeProvider theme={theme}>
        <EndpointDetails name="my-endpoint" namespace="default" />
      </ThemeProvider>
    </TestContext>
  );
}

describe('EndpointDetails target rendering', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('renders a link when the target kind and apiVersion group match', () => {
    renderWithAddresses([
      {
        ip: '10.0.0.1',
        targetRef: { kind: 'Endpoints', apiVersion: 'v1', name: 'target-1', namespace: 'default' },
      },
    ]);

    expect(screen.getByRole('link', { name: 'target-1' })).toBeInTheDocument();
  });

  it('falls back to plain text when the target kind matches a built-in but the group differs', () => {
    // Reproduces issue #7321: a CRD sharing a kind name with a built-in resource
    // must not resolve to the built-in class.
    renderWithAddresses([
      {
        ip: '10.0.0.2',
        targetRef: {
          kind: 'Endpoints',
          apiVersion: 'kueue.x-k8s.io/v1beta1',
          name: 'target-2',
          namespace: 'default',
        },
      },
    ]);

    expect(screen.queryByRole('link', { name: 'target-2' })).not.toBeInTheDocument();
    expect(screen.getByText('target-2')).toBeInTheDocument();
  });

  it('falls back to plain text when there is no targetRef kind', () => {
    renderWithAddresses([{ ip: '10.0.0.3', targetRef: undefined }]);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
