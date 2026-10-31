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
import { render, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { lightTheme } from '../App/defaultAppThemes';
import Overview from './Overview';

const { selectedNamespaces } = vi.hoisted(() => ({ selectedNamespaces: [] as string[] }));

vi.mock('../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/filterSlice')>()),
  useNamespaces: () => selectedNamespaces,
}));

const server = setupServer();
const requestedPaths: string[] = [];

server.events.on('request:start', ({ request }) => {
  requestedPaths.push(new URL(request.url).pathname);
});

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  requestedPaths.length = 0;
  selectedNamespaces.length = 0;
});
afterAll(() => server.close());

/** Paths of the list requests the page made, ignoring anything else. */
async function listPathsAfterRender() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <TestContext>
          <Overview />
        </TestContext>
      </ThemeProvider>
    </QueryClientProvider>
  );

  await waitFor(() => expect(requestedPaths.some(path => path.endsWith('/pods'))).toBe(true));

  return requestedPaths;
}

describe('Workloads Overview', () => {
  // The charts used to always count the whole cluster, so they disagreed with the
  // table below them, and a user without cluster-wide list permission saw nothing.
  // See https://github.com/kubernetes-sigs/headlamp/issues/7343
  it('scopes its lists to the selected namespaces', async () => {
    selectedNamespaces.push('team-a');

    const paths = await listPathsAfterRender();

    expect(paths).toContain('/api/v1/namespaces/team-a/pods');
    expect(paths).toContain('/apis/apps/v1/namespaces/team-a/deployments');
    expect(paths).not.toContain('/api/v1/pods');
  });

  it('lists cluster-wide when no namespace is selected', async () => {
    const paths = await listPathsAfterRender();

    expect(paths).toContain('/api/v1/pods');
    expect(paths.some(path => path.includes('/namespaces/'))).toBe(false);
  });
});
