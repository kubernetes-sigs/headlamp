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
import { GatewayBackendRefTable, GatewayParentRefSection, RouteFilterConfiguration } from './utils';

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

describe('RouteFilterConfiguration', () => {
  it('renders the configuration of a filter, not just its type', () => {
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{
          type: 'URLRewrite',
          urlRewrite: {
            hostname: 'backend.internal',
            path: { type: 'ReplacePrefixMatch', replacePrefixMatch: '/' },
          },
        }}
      />
    );

    expect(screen.getByText('hostname')).toBeInTheDocument();
    expect(screen.getByText('backend.internal')).toBeInTheDocument();
    // The two path fields only make sense read together.
    expect(screen.getByText('ReplacePrefixMatch \u2192 /')).toBeInTheDocument();
  });

  it('finds the configuration of types whose key is not the type in camelCase', () => {
    // `CORS` is stored under `cors`, so lowercasing only the first letter would
    // look for `cORS` and silently render nothing.
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{ type: 'CORS', cors: { allowMethods: ['GET'], maxAge: 600 } }}
      />
    );

    expect(screen.getByText('allowMethods')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('600')).toBeInTheDocument();
  });

  it('renders named header entries as name and value', () => {
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{
          type: 'RequestHeaderModifier',
          requestHeaderModifier: {
            set: [{ name: 'x-forwarded-prefix', value: '/public' }],
            remove: ['x-internal-debug'],
          },
        }}
      />
    );

    expect(screen.getByText('x-forwarded-prefix: /public')).toBeInTheDocument();
    expect(screen.getByText('x-internal-debug')).toBeInTheDocument();
  });

  it('renders a filter with no configuration without failing', () => {
    renderGatewayComponent(<RouteFilterConfiguration filter={{ type: 'ExtensionRef' }} />);
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('renders a nested object as its own fields, not [object Object]', () => {
    // RequestMirror holds a backendRef, and may hold a fraction, so the
    // configuration of a filter is not always one level deep.
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{
          type: 'RequestMirror',
          requestMirror: {
            backendRef: { group: '', kind: 'Service', name: 'mirror-backend', port: 9000 },
            fraction: { numerator: 1, denominator: 100 },
          },
        }}
      />
    );

    expect(screen.getByText('mirror-backend')).toBeInTheDocument();
    expect(screen.getByText('9000')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it('leaves out a field the API defaulted to empty', () => {
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{
          type: 'RequestMirror',
          requestMirror: { backendRef: { group: '', kind: 'Service', name: 'mirror-backend' } },
        }}
      />
    );

    expect(screen.getByText('kind')).toBeInTheDocument();
    expect(screen.queryByText('group')).not.toBeInTheDocument();
  });

  it('renders an object inside an array as its fields', () => {
    // Entries are usually scalars or {name, value} pairs, but an entry with
    // fields of its own should read as those fields, not as [object Object].
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{
          type: 'Example',
          example: { ports: [{ kind: 'Service', port: 9000 }, 'plain-entry'] },
        }}
      />
    );

    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('9000')).toBeInTheDocument();
    expect(screen.getByText('plain-entry')).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it('shows a dash for a list the API left empty', () => {
    renderGatewayComponent(
      <RouteFilterConfiguration filter={{ type: 'CORS', cors: { allowHeaders: [] } }} />
    );

    expect(screen.getByText('allowHeaders')).toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('labels a configuration that is not a set of fields with its own key', () => {
    renderGatewayComponent(
      <RouteFilterConfiguration filter={{ type: 'Example', example: 'a-scalar' }} />
    );

    expect(screen.getByText('example')).toBeInTheDocument();
    expect(screen.getByText('a-scalar')).toBeInTheDocument();
  });

  it('keeps the other fields of a list entry that only looks like a header', () => {
    // A {name, value} pair abbreviates to "name: value", but an entry carrying
    // more than that would lose the rest, so it renders as its fields.
    renderGatewayComponent(
      <RouteFilterConfiguration
        filter={{
          type: 'Example',
          example: { refs: [{ name: 'mirror', kind: 'Service', port: 9000 }] },
        }}
      />
    );

    expect(screen.getByText('mirror')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('9000')).toBeInTheDocument();
  });
});
