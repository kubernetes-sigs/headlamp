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

// Registers the app's routes before the k8s classes load. Without it importing a
// resource class from a components/ test hits the router <-> KubeObject import
// cycle. See https://github.com/kubernetes-sigs/headlamp/issues/7102
import '../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { API_BASE, TestContext } from '../../test';
import { lightTheme } from '../App/defaultAppThemes';
import Overview from './Overview';

const { selectedNamespaces } = vi.hoisted(() => ({ selectedNamespaces: [] as string[] }));

vi.mock('../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/filterSlice')>()),
  useNamespaces: () => selectedNamespaces,
}));

const workloads = [
  ['v1', 'pods', 'Pod'],
  ['apps/v1', 'deployments', 'Deployment'],
  ['apps/v1', 'statefulsets', 'StatefulSet'],
  ['apps/v1', 'daemonsets', 'DaemonSet'],
  ['apps/v1', 'replicasets', 'ReplicaSet'],
  ['batch/v1', 'jobs', 'Job'],
  ['batch/v1', 'cronjobs', 'CronJob'],
  ['jobset.x-k8s.io/v1alpha2', 'jobsets', 'JobSet'],
  ['leaderworkerset.x-k8s.io/v1', 'leaderworkersets', 'LeaderWorkerSet'],
] as const;

function workloadListPath(apiVersion: string, resource: string, namespace?: string) {
  const prefix = apiVersion.includes('/') ? '/apis' : '/api';
  const scope = namespace ? `/namespaces/${namespace}` : '';
  return `${prefix}/${apiVersion}${scope}/${resource}`;
}

function emptyList(apiVersion: string, kind: string) {
  return HttpResponse.json({
    apiVersion,
    kind: `${kind}List`,
    metadata: { resourceVersion: '1' },
    items: [],
  });
}

const requestedPaths = new Set<string>();
const unhandledRequests = new Set<string>();
const server = setupServer(
  http.get(`${API_BASE}/api/v1/namespaces`, () => emptyList('v1', 'Namespace')),
  ...workloads.flatMap(([apiVersion, resource, kind]) =>
    [undefined, ':namespace'].map(namespace =>
      http.get(`${API_BASE}${workloadListPath(apiVersion, resource, namespace)}`, ({ request }) => {
        requestedPaths.add(new URL(request.url).pathname);
        return emptyList(apiVersion, kind);
      })
    )
  )
);
let queryClient: QueryClient;

beforeAll(() => {
  server.listen({
    onUnhandledRequest(request, print) {
      unhandledRequests.add(`${request.method} ${new URL(request.url).pathname}`);
      print.error();
    },
  });
});
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
  // MSW handles the HTTP lists. Keep the watches off the network too.
  vi.stubGlobal(
    'WebSocket',
    vi.fn(function () {
      return { addEventListener: vi.fn(), close: vi.fn() };
    })
  );
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  requestedPaths.clear();
  selectedNamespaces.length = 0;
  const unexpectedRequests = [...unhandledRequests];
  unhandledRequests.clear();
  expect(unexpectedRequests).toEqual([]);
});
afterAll(() => server.close());

async function expectWorkloadListPaths(namespace?: string) {
  const expectedPaths = workloads.map(([apiVersion, resource]) =>
    workloadListPath(apiVersion, resource, namespace)
  );
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <TestContext>
          <Overview />
        </TestContext>
      </ThemeProvider>
    </QueryClientProvider>
  );

  await waitFor(() => expect(requestedPaths).toEqual(new Set(expectedPaths)));
}

describe('Workloads Overview', () => {
  // The charts used to always count the whole cluster, so they disagreed with the
  // table below them, and a user without cluster-wide list permission saw nothing.
  // See https://github.com/kubernetes-sigs/headlamp/issues/7343
  it('scopes its lists to the selected namespaces', async () => {
    selectedNamespaces.push('team-a');

    await expectWorkloadListPaths('team-a');
  });

  it('lists cluster-wide when no namespace is selected', async () => {
    await expectWorkloadListPaths();
  });
});
