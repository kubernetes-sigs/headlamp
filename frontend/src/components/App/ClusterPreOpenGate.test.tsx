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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as testingRender, screen } from '@testing-library/react';
import { ReactNode, useEffect, useState } from 'react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCluster } from '../../lib/k8s';
import { useAllowedNamespacesFromSelector } from '../../lib/k8s/allowedNamespaces';
import {
  completeClusterConnectionPreparation,
  getPreparedClusterConnection,
  resetPreparedClusterConnections,
} from '../../lib/preparedClusterConnection';
import type { UIPanel } from '../../redux/uiSlice';
import ClusterLayout from './ClusterLayout';
import { ClusterPreOpenState, useClusterPreOpen } from './useClusterPreOpen';

vi.mock('../../lib/k8s', () => ({
  useCluster: vi.fn(() => 'test-cluster'),
}));

vi.mock('../../lib/k8s/allowedNamespaces', () => ({
  useAllowedNamespacesFromSelector: vi.fn(() => ({
    namespaces: [],
    isFetching: false,
    isSuccess: false,
    error: null,
  })),
}));

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: any) => any) =>
    selector({ config: { namespaceDiscoveryEnabled: true } }),
}));

vi.mock('./useClusterPreOpen', () => ({
  useClusterPreOpen: vi.fn(),
}));

vi.mock('../common/AlertNotification', () => ({
  default: () => <div>health-poller</div>,
}));

import ClusterPreOpenGate from './ClusterPreOpenGate';
import ClusterPreparingDialog from './ClusterPreparingDialog';

function render(children: ReactNode) {
  const client = new QueryClient();
  return testingRender(children, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/c/test-cluster/pods']}>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
}

function LocationDisplay() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

const readyState: ClusterPreOpenState = {
  enabled: true,
  isSuccess: true,
  isError: false,
  error: null,
  message: undefined,
  retry: vi.fn(),
};
const sidebarClusterRequest = vi.fn();
const topBarUserInfoRequest = vi.fn();
const panelClusterRequest = vi.fn();

const viewMounted = vi.fn();
const viewUnmounted = vi.fn();

function PersistentView({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    viewMounted(name);
    return () => viewUnmounted(name);
  }, [name]);
  return (
    <button onClick={() => setCount(value => value + 1)} data-testid={`${name}-state`}>
      {name}: {count}
    </button>
  );
}

function TopBarWithUserInfoRequest() {
  topBarUserInfoRequest();
  return <div>top-bar</div>;
}

function SidebarWithClusterRequest() {
  sidebarClusterRequest();
  return <div>sidebar</div>;
}

function PanelWithClusterRequest() {
  panelClusterRequest();
  return <div>cluster-panel</div>;
}

const panels = {
  top: [{ id: 'top', side: 'top', component: PanelWithClusterRequest }],
  right: [{ id: 'right', side: 'right', component: PanelWithClusterRequest }],
  bottom: [{ id: 'bottom', side: 'bottom', component: PanelWithClusterRequest }],
  left: [{ id: 'left', side: 'left', component: PanelWithClusterRequest }],
} as Record<UIPanel['side'], UIPanel[]>;

beforeEach(() => {
  resetPreparedClusterConnections();
  sidebarClusterRequest.mockClear();
  topBarUserInfoRequest.mockClear();
  panelClusterRequest.mockClear();
  vi.mocked(useAllowedNamespacesFromSelector).mockClear();
  viewMounted.mockClear();
  viewUnmounted.mockClear();
  vi.mocked(useCluster).mockReturnValue('test-cluster');
  vi.mocked(useClusterPreOpen).mockReturnValue(readyState);
});

it('does not mount plugin UI panels while preparation is pending', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });

  render(
    <ClusterLayout panels={panels}>
      <div>cluster-content</div>
    </ClusterLayout>
  );

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(panelClusterRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('cluster-panel')).not.toBeInTheDocument();
  expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
});

it('names the destination preparation dialog correctly when a cold-open dialog is still mounted', () => {
  render(
    <>
      <ClusterPreparingDialog cluster="previous-cluster" />
      <ClusterPreparingDialog cluster="destination-cluster" />
    </>
  );
  expect(
    screen.getByRole('dialog', { name: 'Connecting to "destination-cluster"' })
  ).toBeInTheDocument();
});
it.each([false, true])(
  'gates shared namespace resolution for routes and panels until preparation succeeds (error: %s)',
  isError => {
    vi.mocked(useClusterPreOpen).mockReturnValue({
      ...readyState,
      isSuccess: false,
      isError,
      error: isError ? new Error('preparation failed') : null,
    });
    const content = () => (
      <ClusterLayout panels={panels} clustersToResolve={['test-cluster']}>
        <div>cluster-content</div>
      </ClusterLayout>
    );

    const result = render(content());
    expect(useAllowedNamespacesFromSelector).not.toHaveBeenCalled();
    expect(panelClusterRequest).not.toHaveBeenCalled();
    vi.mocked(useClusterPreOpen).mockReturnValue(readyState);
    result.rerender(content());
    expect(useAllowedNamespacesFromSelector).toHaveBeenCalledWith('test-cluster', '');
    expect(panelClusterRequest).toHaveBeenCalledTimes(4);
  }
);

it('does not allow a same-name replacement to reuse the new stored connection before success', () => {
  const persistentPanels: Record<UIPanel['side'], UIPanel[]> = {
    ...panels,
    left: [
      {
        id: 'panel',
        side: 'left',
        component: () => <PersistentView name="panel" />,
      },
    ],
  };
  const content = () => (
    <ClusterLayout panels={persistentPanels} clustersToResolve={['test-cluster']}>
      <PersistentView name="activity" />
    </ClusterLayout>
  );
  const result = render(content());
  completeClusterConnectionPreparation('test-cluster', {
    stored: true,
    kubeconfig: 'prepared-kubeconfig',
  });
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });
  result.rerender(content());

  expect(viewUnmounted).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(getPreparedClusterConnection('test-cluster')).toEqual({
    stored: true,
    kubeconfig: 'prepared-kubeconfig',
  });
});

it('releases an abandoned or configuration-only preparation pin once the combined view is ready', () => {
  completeClusterConnectionPreparation('test-cluster', {
    stored: true,
    kubeconfig: 'prepared-kubeconfig',
  });
  vi.mocked(useClusterPreOpen).mockReturnValue(readyState);
  const result = render(
    <ClusterPreOpenGate>
      <PersistentView name="activity" />
    </ClusterPreOpenGate>
  );
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });
  result.rerender(
    <ClusterPreOpenGate>
      <PersistentView name="activity" />
    </ClusterPreOpenGate>
  );

  expect(getPreparedClusterConnection('test-cluster')).toBeDefined();

  vi.mocked(useClusterPreOpen).mockReturnValue(readyState);
  result.rerender(
    <ClusterPreOpenGate>
      <PersistentView name="activity" />
    </ClusterPreOpenGate>
  );

  expect(getPreparedClusterConnection('test-cluster')).toBeUndefined();
});

it.each([false, true])(
  'retains mounted panels and sessions during re-preparation (error: %s)',
  isError => {
    const persistentPanels: Record<UIPanel['side'], UIPanel[]> = {
      top: [],
      bottom: [],
      right: [],
      left: [{ id: 'persistent', side: 'left', component: () => <PersistentView name="panel" /> }],
    };
    const content = () => (
      <ClusterLayout panels={persistentPanels}>
        <PersistentView name="activity" />
      </ClusterLayout>
    );
    const result = render(content());
    fireEvent.click(screen.getByTestId('panel-state'));
    fireEvent.click(screen.getByTestId('activity-state'));
    vi.mocked(useClusterPreOpen).mockReturnValue({
      ...readyState,
      isSuccess: false,
      isError,
      error: isError ? new Error('preparation failed') : null,
    });
    result.rerender(content());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('panel-state')).toHaveTextContent('panel: 1');
    expect(screen.getByTestId('activity-state')).toHaveTextContent('activity: 1');
    expect(viewMounted).toHaveBeenCalledTimes(2);
    expect(viewUnmounted).not.toHaveBeenCalled();

    vi.mocked(useClusterPreOpen).mockReturnValue(readyState);
    result.rerender(content());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('panel-state')).toHaveTextContent('panel: 1');
    expect(screen.getByTestId('activity-state')).toHaveTextContent('activity: 1');
  }
);

it('still replaces the initial gate for a different unprepared cluster', () => {
  const content = () => (
    <ClusterPreOpenGate>
      <PersistentView name="activity" />
    </ClusterPreOpenGate>
  );
  const result = render(content());
  vi.mocked(useCluster).mockReturnValue('another-cluster');
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });
  result.rerender(content());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.queryByTestId('activity-state')).not.toBeInTheDocument();
  expect(viewUnmounted).toHaveBeenCalledWith('activity');
});

it('does not mount cluster polling or namespace resolution while preparation is pending', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({ ...readyState, isSuccess: false });

  render(
    <ClusterPreOpenGate>
      <TopBarWithUserInfoRequest />
      <SidebarWithClusterRequest />
      <div>namespace-selector</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(topBarUserInfoRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('top-bar')).not.toBeInTheDocument();
  expect(sidebarClusterRequest).not.toHaveBeenCalled();
  expect(screen.queryByText('sidebar')).not.toBeInTheDocument();
  expect(screen.queryByText('health-poller')).not.toBeInTheDocument();
  expect(screen.queryByText('namespace-selector')).not.toBeInTheDocument();
});

it('does not mount health polling after cluster preparation rejects', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError: true,
    error: new Error('proxy failed'),
  });

  render(
    <ClusterPreOpenGate>
      <div>cluster-content</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByText('proxy failed')).toBeInTheDocument();
  expect(screen.queryByText('health-poller')).not.toBeInTheDocument();
  expect(screen.queryByText('cluster-content')).not.toBeInTheDocument();
});

it('focuses retry after cluster preparation rejects', () => {
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError: true,
    error: new Error('proxy failed'),
  });

  render(
    <ClusterPreOpenGate>
      <div>cluster-content</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByRole('button', { name: /Retry$/ })).toHaveFocus();
});

it.each([false, true])('can leave preparation for Home (failed: %s)', isError => {
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError,
    error: isError ? new Error('proxy failed') : null,
  });

  render(
    <>
      <Route path="/c/:cluster">
        <ClusterPreOpenGate>
          <div>cluster-content</div>
        </ClusterPreOpenGate>
      </Route>
      <LocationDisplay />
    </>
  );

  const back = screen.getByRole('link', { name: 'Back to clusters' });
  expect(back).toHaveAttribute('href', '/');
  fireEvent.click(back);

  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it('keeps multiline diagnostics and actions outside the error heading', () => {
  const detail = 'Proxy exited with code 1\nstderr: could not connect';
  const retry = vi.fn();
  vi.mocked(useClusterPreOpen).mockReturnValue({
    ...readyState,
    isSuccess: false,
    isError: true,
    error: new Error(detail),
    retry,
  });

  render(
    <ClusterPreOpenGate>
      <div>cluster-content</div>
    </ClusterPreOpenGate>
  );

  const heading = screen.getByRole('heading', { name: 'Could not open cluster' });
  expect(heading.tagName).toBe('H1');
  const diagnostic = screen.getByText((_text, element) => element?.textContent === detail);
  expect(diagnostic).toHaveStyle({ whiteSpace: 'pre-wrap' });
  expect(diagnostic.closest('h1, h2')).toBeNull();
  const retryButton = screen.getByRole('button', { name: 'Retry' });
  expect(retryButton.closest('h1, h2')).toBeNull();
  expect(retryButton).toHaveFocus();
  fireEvent.click(retryButton);
  expect(retry).toHaveBeenCalledOnce();
});

it('mounts only its children after cluster preparation succeeds', () => {
  render(
    <ClusterPreOpenGate>
      <div>namespace-selector</div>
    </ClusterPreOpenGate>
  );

  expect(screen.getByText('namespace-selector')).toBeInTheDocument();
  expect(screen.queryByText('health-poller')).not.toBeInTheDocument();
});
