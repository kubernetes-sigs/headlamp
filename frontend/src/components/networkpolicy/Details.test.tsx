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

// Register the resource classes before importing an individual resource view.
import '../../App';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { NetworkPolicyPeer } from '../../lib/k8s/networkpolicy';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { lightTheme } from '../App/defaultAppThemes';
import { NetworkPolicyDetails } from './Details';
import { NETWORK_POLICY_DETAIL } from './storyHelper';

const server = setupServer(
  http.post(/selfsubjectaccessreviews/, () => HttpResponse.json({ status: { allowed: false } })),
  http.get(/events/, () => HttpResponse.json({ items: [], metadata: {} }))
);
let queryClient: QueryClient;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  server.resetHandlers();
});

function renderPolicy(direction: 'ingress' | 'egress', peers?: NetworkPolicyPeer[]) {
  const ports = [{ protocol: 'TCP', port: 443 }];
  const policy = {
    ...NETWORK_POLICY_DETAIL,
    spec: {
      ...NETWORK_POLICY_DETAIL.spec,
      ingress: direction === 'ingress' ? [{ ports, from: peers }] : [],
      egress: direction === 'egress' ? [{ ports, to: peers }] : [],
    },
  };
  server.use(http.get(/networkpolicies/, () => HttpResponse.json(policy)));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <TestContext>
          <NetworkPolicyDetails name="allow-frontend-traffic" namespace="default" />
        </TestContext>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe.each(['ingress', 'egress'] as const)('%s peer grouping', direction => {
  const namespaceSelector = { matchLabels: { environment: 'production' } };
  const podSelector = { matchLabels: { app: 'backend' } };

  it('shows separate peers as alternatives', async () => {
    renderPolicy(direction, [{ namespaceSelector }, { podSelector }]);

    const first = await screen.findByRole('group', { name: 'Peer 1' });
    const second = screen.getByRole('group', { name: 'Peer 2' });
    expect(within(first).getByText('environment: production')).toBeInTheDocument();
    expect(within(first).queryByText('app: backend')).not.toBeInTheDocument();
    expect(within(second).getByText('app: backend')).toBeInTheDocument();
    expect(within(second).queryByText('environment: production')).not.toBeInTheDocument();
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.queryByText('Both selectors must match (AND).')).not.toBeInTheDocument();
    expect(screen.getByText('TCP:443')).toBeInTheDocument();
  });

  it('keeps combined selectors in one peer and explains their intersection', async () => {
    renderPolicy(direction, [{ namespaceSelector, podSelector }]);

    const peer = await screen.findByRole('group', { name: 'Peer 1' });
    expect(screen.getAllByRole('group', { name: /Peer/ })).toHaveLength(1);
    expect(within(peer).getByText('environment: production')).toBeInTheDocument();
    expect(within(peer).getByText('app: backend')).toBeInTheDocument();
    expect(within(peer).getByText('Both selectors must match (AND).')).toBeInTheDocument();
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
  });

  it('preserves IP exclusions and selector expressions', async () => {
    renderPolicy(direction, [
      { ipBlock: { cidr: '10.0.0.0/24', except: ['10.0.0.10/32'] } },
      { podSelector: { matchExpressions: [{ key: 'role', operator: 'In', values: ['dns'] }] } },
    ]);

    const first = await screen.findByRole('group', { name: 'Peer 1' });
    expect(within(first).getByText('cidr: 10.0.0.0/24, except: 10.0.0.10/32')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Peer 2' })).getByText('role in (dns)')
    ).toBeInTheDocument();
  });

  it('makes empty selectors explicit instead of rendering blank restrictions', async () => {
    renderPolicy(direction, [{ namespaceSelector: {}, podSelector: {} }]);

    const peer = await screen.findByRole('group', { name: 'Peer 1' });
    expect(within(peer).getByText('All namespaces')).toBeInTheDocument();
    expect(within(peer).getByText('All pods')).toBeInTheDocument();
  });

  it.each([
    { name: 'an omitted list', peers: undefined, peerCount: 0 },
    { name: 'an empty list', peers: [], peerCount: 0 },
    { name: 'an empty peer', peers: [{}], peerCount: 1 },
  ])('shows unrestricted peers for $name', async ({ peers, peerCount }) => {
    renderPolicy(direction, peers);

    expect(
      await screen.findByText(direction === 'ingress' ? 'All sources' : 'All destinations')
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('group', { name: /Peer/ })).toHaveLength(peerCount);
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
  });
});
