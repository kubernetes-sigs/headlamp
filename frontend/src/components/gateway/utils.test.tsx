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
import {
  resolveGatewayBackendReference,
  resolveGatewayParentReference,
} from '../../lib/k8s/gatewayReferences';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { GatewayBackendRefTable, GatewayParentRefSection } from './utils';

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

const theme = createMuiTheme({ base: 'light', name: 'light' });

function renderGatewayComponent(component: React.ReactNode) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>{component}</ThemeProvider>
    </TestContext>
  );
}

describe('Gateway API reference resolution', () => {
  it('defaults an omitted ParentRef group, kind, and namespace', () => {
    expect(resolveGatewayParentReference({ name: 'edge' }, 'apps')).toEqual({
      group: 'gateway.networking.k8s.io',
      kind: 'Gateway',
      namespace: 'apps',
      name: 'edge',
    });
  });

  it('preserves an explicit empty ParentRef group', () => {
    expect(resolveGatewayParentReference({ group: '', name: 'edge' }, 'apps')).toEqual({
      group: '',
      kind: 'Gateway',
      namespace: 'apps',
      name: 'edge',
    });
  });

  it('preserves an explicit ParentRef namespace', () => {
    expect(resolveGatewayParentReference({ name: 'edge', namespace: 'gateways' }, 'apps')).toEqual({
      group: 'gateway.networking.k8s.io',
      kind: 'Gateway',
      namespace: 'gateways',
      name: 'edge',
    });
  });

  it('defaults an omitted BackendRef group, kind, and namespace', () => {
    expect(resolveGatewayBackendReference({ name: 'echo' }, 'apps')).toEqual({
      group: '',
      kind: 'Service',
      namespace: 'apps',
      name: 'echo',
    });
  });

  it('preserves an explicit BackendRef namespace', () => {
    expect(resolveGatewayBackendReference({ name: 'echo', namespace: 'backends' }, 'apps')).toEqual(
      {
        group: '',
        kind: 'Service',
        namespace: 'backends',
        name: 'echo',
      }
    );
  });
});

describe('Gateway API reference presentation', () => {
  it('links a defaulted Gateway parent in the Route namespace', () => {
    renderGatewayComponent(
      <GatewayParentRefSection
        parentRefs={[{ name: 'edge' }]}
        namespace="apps"
        cluster="cluster-a"
      />
    );

    expect(screen.getByRole('link', { name: 'edge' })).toHaveAttribute(
      'href',
      '/gateways/apps/edge'
    );
    expect(screen.getByRole('link', { name: 'edge' })).toHaveAttribute(
      'data-active-cluster',
      'cluster-a'
    );
    expect(screen.getByText('apps')).toBeInTheDocument();
    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('gateway.networking.k8s.io')).toBeInTheDocument();
  });

  it('renders a custom parent as text instead of a misleading link', () => {
    renderGatewayComponent(
      <GatewayParentRefSection
        parentRefs={[{ group: 'example.io', kind: 'ExternalGateway', name: 'edge' }]}
        namespace="apps"
        cluster="cluster-a"
      />
    );

    expect(screen.getByText('edge').closest('a')).toBeNull();
  });

  it('links a defaulted Service backend in the Route namespace', () => {
    renderGatewayComponent(
      <GatewayBackendRefTable
        backendRefs={[{ name: 'echo', port: 8080 }]}
        namespace="apps"
        cluster="cluster-a"
      />
    );

    expect(screen.getByRole('link', { name: 'echo' })).toHaveAttribute(
      'href',
      '/services/apps/echo'
    );
    expect(screen.getByRole('link', { name: 'echo' })).toHaveAttribute(
      'data-active-cluster',
      'cluster-a'
    );
    expect(screen.getByText('apps')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
  });

  it('renders a custom backend as text instead of a misleading link', () => {
    renderGatewayComponent(
      <GatewayBackendRefTable
        backendRefs={[{ group: 'storage.example.io', kind: 'Bucket', name: 'assets' }]}
        namespace="apps"
        cluster="cluster-a"
      />
    );

    expect(screen.getByText('assets').closest('a')).toBeNull();
  });
});
